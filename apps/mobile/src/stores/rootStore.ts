import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { Capabilities, Chat, Project, SendMessageInput, TaskStatus } from '@pi-agents/contracts';
import {
  ApiClient,
  ApiClientError,
  clearRegisteredApiCredential,
  getApiAuthHeaders,
  registerApiCredential,
} from '@/api/client';
import {
  clearBackendConnections,
  clearBackendUrl,
  loadBackendConnections,
  loadBackendUrl,
  loadBackendProjectsSnapshot,
  saveBackendConnections,
  saveBackendUrl,
  saveBackendProjectsSnapshot,
  clearBackendProjectsSnapshot,
  clearBackendCredential,
  loadBackendCredential,
  saveBackendCredential,
  type StoredBackendConnection,
} from '@/state/backendStorage';
import {
  eventReducer,
  initialEventReducerState,
  type EventReducerState,
  type MessageView,
  type ToolCallView,
} from '@/state/eventReducer';
import {
  RealtimeManager,
  type RealtimeManagerOptions,
  type RealtimeState,
} from '@/state/RealtimeManager';
import { RealtimeHub, type RealtimeHubSubscription } from '@/state/RealtimeHub';
import { TasksStore } from './taskStore';
import { ProjectsStore } from './projectsStore';
import { ThemeStore } from './themeStore';

export type BackendStatus = 'idle' | 'checking' | 'connected' | 'offline' | 'auth_required' | 'error';

export type BackendStorage = {
  load(): Promise<string | null>;
  save(url: string): Promise<void>;
  clear(): Promise<void>;
  loadConnections?(): Promise<StoredBackendConnection[]>;
  saveConnections?(connections: StoredBackendConnection[]): Promise<void>;
  clearConnections?(): Promise<void>;
  loadProjectsSnapshot?(serverId: string): Promise<Project[]>;
  saveProjectsSnapshot?(serverId: string, projects: Project[]): Promise<void>;
  clearProjectsSnapshot?(serverId: string): Promise<void>;
  loadCredential?(serverId: string): Promise<string | null>;
  saveCredential?(serverId: string, token: string): Promise<void>;
  clearCredential?(serverId: string): Promise<void>;
};

export type RealtimeConnection = Pick<RealtimeManager, 'start' | 'stop'>;

function errorCode(error: unknown): string | undefined {
  return error instanceof ApiClientError ? error.code : undefined;
}

function statusForError(error: unknown): BackendStatus {
  const code = errorCode(error);
  if (code === 'unauthorized' || code === 'forbidden') return 'auth_required';
  if (error instanceof ApiClientError && error.retryable) return 'offline';
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (/offline|network|fetch|timeout|unavailable|connect/.test(message)) return 'offline';
  return 'error';
}

const BACKEND_RESTORE_TIMEOUT_MS = 3_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export type RootStoreDependencies = {
  apiClientFactory: (baseUrl: string, serverId?: string, token?: string) => ApiClient;
  realtimeFactory: (options: RealtimeManagerOptions) => RealtimeConnection;
  storage: BackendStorage;
  clock: () => number;
};

const defaultDependencies: RootStoreDependencies = {
  apiClientFactory: (baseUrl, serverId, token) => new ApiClient(baseUrl, serverId, token),
  realtimeFactory: (options) => new RealtimeManager(options),
  storage: {
    load: loadBackendUrl,
    save: saveBackendUrl,
    clear: clearBackendUrl,
    loadConnections: loadBackendConnections,
    saveConnections: saveBackendConnections,
    clearConnections: clearBackendConnections,
    loadProjectsSnapshot: loadBackendProjectsSnapshot,
    saveProjectsSnapshot: saveBackendProjectsSnapshot,
    clearProjectsSnapshot: clearBackendProjectsSnapshot,
    loadCredential: loadBackendCredential,
    saveCredential: saveBackendCredential,
    clearCredential: clearBackendCredential,
  },
  clock: Date.now,
};

export class BackendStore {
  readonly servers = observable.map<string, ServerConnection>();
  private readonly credentials = new Map<string, string>();
  activeServerId: string | null = null;
  baseUrl: string | null = null;
  capabilities: Capabilities | null = null;
  status: BackendStatus = 'idle';
  latencyMs: number | null = null;
  error: string | null = null;
  lastSuccessfulBaseUrl: string | null = null;
  lastSuccessfulAt: string | null = null;
  restored = false;

  constructor(
    private readonly dependencies: RootStoreDependencies,
    private readonly onReset: () => void,
    private readonly onActivate: (serverId: string | null) => void = () => undefined,
    private readonly onRemove: (serverId: string) => void = () => undefined,
  ) {
    makeAutoObservable<this, 'dependencies' | 'credentials'>(this, { dependencies: false, credentials: false }, { autoBind: true });
  }

  get serverId(): string | null {
    return this.activeServerId;
  }

  get connections(): ServerConnection[] {
    return [...this.servers.values()];
  }

  get activeConnection(): ServerConnection | null {
    return this.activeServerId ? this.servers.get(this.activeServerId) ?? null : null;
  }

  getBaseUrl(serverId?: string): string | null {
    if (serverId) return this.servers.get(serverId)?.baseUrl ?? null;
    return this.baseUrl;
  }

  getCapabilities(serverId?: string): Capabilities | null {
    if (serverId) return this.servers.get(serverId)?.capabilities ?? null;
    return this.capabilities;
  }

  getAuthHeaders(serverId?: string): Record<string, string> | undefined {
    const connection = serverId ? this.servers.get(serverId) : this.activeConnection;
    if (!connection) return undefined;
    return getApiAuthHeaders(connection.baseUrl, connection.serverId);
  }

  private async loadCredentialFor(serverId: string): Promise<string | undefined> {
    const existing = this.credentials.get(serverId);
    if (existing) return existing;
    if (!this.dependencies.storage.loadCredential) return undefined;
    const token = (await this.dependencies.storage.loadCredential(serverId))?.trim() || undefined;
    if (token) {
      this.credentials.set(serverId, token);
      const connection = this.servers.get(serverId);
      if (connection) registerApiCredential(connection.baseUrl, serverId, token);
    }
    return token;
  }

  private async saveCredentialFor(serverId: string, baseUrl: string, token: string | undefined): Promise<void> {
    const normalized = token?.trim();
    if (!normalized) {
      this.credentials.delete(serverId);
      clearRegisteredApiCredential(baseUrl, serverId);
      return;
    }
    this.credentials.set(serverId, normalized);
    registerApiCredential(baseUrl, serverId, normalized);
    await this.dependencies.storage.saveCredential?.(serverId, normalized);
  }

  private connectionKey(baseUrl: string): string {
    const existing = [...this.servers.values()].find((connection) => connection.baseUrl === baseUrl);
    if (existing) return existing.serverId;
    // Older nodes do not return serverId. Keep a deterministic local key until
    // the node is upgraded, while current nodes replace it with their UUID.
    let hash = 2166136261;
    for (const char of baseUrl) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return `legacy-${(hash >>> 0).toString(16)}`;
  }

  private displayName(baseUrl: string): string {
    try {
      return new URL(baseUrl).hostname || baseUrl;
    } catch {
      return baseUrl;
    }
  }

  private setActive(serverId: string | null): void {
    this.activeServerId = serverId;
    this.onActivate(serverId);
    const connection = serverId ? this.servers.get(serverId) : undefined;
    this.baseUrl = connection?.baseUrl ?? null;
    this.capabilities = connection?.capabilities ?? null;
    this.status = connection?.status ?? 'idle';
    this.latencyMs = connection?.latencyMs ?? null;
    this.error = connection?.error ?? null;
    this.lastSuccessfulBaseUrl = connection?.lastSuccessfulAt ? connection.baseUrl : null;
    this.lastSuccessfulAt = connection?.lastSuccessfulAt ?? null;
  }

  private async persistConnections(): Promise<void> {
    const connections: StoredBackendConnection[] = this.connections.map((connection) => ({
      serverId: connection.serverId,
      name: connection.name,
      baseUrl: connection.baseUrl,
    }));
    if (this.dependencies.storage.saveConnections) {
      await this.dependencies.storage.saveConnections(connections);
    } else if (this.baseUrl) {
      await this.dependencies.storage.save(this.baseUrl);
    }
  }

  async connect(value: string, credential?: string): Promise<ServerConnection | null> {
    const baseUrl = value.trim().replace(/\/$/, '');
    const previous = [...this.servers.values()].find((item) => item.baseUrl === baseUrl);
    const targetId = previous?.serverId ?? this.connectionKey(baseUrl);
    const suppliedToken = credential?.trim() || undefined;
    runInAction(() => {
      if (previous) this.servers.set(targetId, { ...previous, status: 'checking', error: null });
      if (this.activeServerId === targetId || this.activeServerId === null) {
        this.status = 'checking';
        this.error = null;
        this.latencyMs = previous?.latencyMs ?? null;
      }
    });
    const token = suppliedToken ?? await this.loadCredentialFor(targetId);
    let discoveredCapabilities: Capabilities | null = null;
    try {
      const client = this.dependencies.apiClientFactory(baseUrl, targetId, token);
      const startedAt = this.dependencies.clock();
      await client.getHealth();
      const capabilities = await client.getCapabilities();
      discoveredCapabilities = capabilities;
      const serverId = capabilities.serverId ?? targetId;
      const existing = this.servers.get(serverId) ?? previous;
      if (capabilities.authRequired && !token) {
        const connection: ServerConnection = {
          serverId,
          name: existing?.name ?? this.displayName(baseUrl),
          baseUrl,
          capabilities,
          authRequired: true,
          credentialSet: false,
          status: 'auth_required',
          latencyMs: this.dependencies.clock() - startedAt,
          error: 'Для этого компьютера нужен bearer-токен',
          lastSuccessfulAt: existing?.lastSuccessfulAt ?? null,
        };
        runInAction(() => {
          if (previous && previous.serverId !== serverId) this.servers.delete(previous.serverId);
          this.servers.set(serverId, connection);
          if (this.activeServerId === null || this.activeServerId === targetId) this.setActive(serverId);
        });
        await this.persistConnections();
        return connection;
      }
      if (capabilities.authRequired) await client.checkAuth();
      const connection: ServerConnection = {
        serverId,
        name: existing?.name ?? this.displayName(baseUrl),
        baseUrl,
        capabilities,
        authRequired: Boolean(capabilities.authRequired),
        credentialSet: Boolean(token),
        status: 'connected',
        latencyMs: this.dependencies.clock() - startedAt,
        error: null,
        lastSuccessfulAt: new Date(this.dependencies.clock()).toISOString(),
      };
      runInAction(() => {
        if (previous && previous.serverId !== serverId) this.servers.delete(previous.serverId);
        this.servers.set(serverId, connection);
        this.setActive(serverId);
      });
      if (previous && previous.serverId !== serverId) {
        await this.dependencies.storage.clearCredential?.(previous.serverId);
        clearRegisteredApiCredential(previous.baseUrl, previous.serverId);
      }
      await this.saveCredentialFor(serverId, baseUrl, token);
      await this.persistConnections();
      return connection;
    } catch (error) {
      const status = statusForError(error);
      if (status === 'auth_required') {
        this.credentials.delete(targetId);
        await this.dependencies.storage.clearCredential?.(targetId);
        clearRegisteredApiCredential(baseUrl, targetId);
      }
      runInAction(() => {
        const message = error instanceof Error ? error.message : String(error);
        const existing = this.servers.get(targetId) ?? previous;
        if (existing) {
          this.servers.set(existing.serverId, {
            ...existing,
            capabilities: discoveredCapabilities ?? existing.capabilities,
            authRequired: Boolean(discoveredCapabilities?.authRequired ?? existing.authRequired),
            credentialSet: status === 'auth_required' ? false : existing.credentialSet,
            status,
            error: message,
          });
        } else {
          this.servers.set(targetId, {
            serverId: targetId,
            name: this.displayName(baseUrl),
            baseUrl,
            capabilities: discoveredCapabilities,
            authRequired: Boolean(discoveredCapabilities?.authRequired),
            credentialSet: false,
            status,
            latencyMs: null,
            error: message,
            lastSuccessfulAt: null,
          });
        }
        if (this.activeServerId === null) this.setActive(targetId);
        else if (this.activeServerId === targetId) this.setActive(targetId);
      });
      await this.persistConnections();
      return this.servers.get(discoveredCapabilities?.serverId ?? targetId) ?? null;
    }
  }

  async restore(): Promise<void> {
    if (this.restored) return;
    try {
      const storedConnections = this.dependencies.storage.loadConnections
        ? await withTimeout(
          this.dependencies.storage.loadConnections(),
          BACKEND_RESTORE_TIMEOUT_MS,
          'Saved backend connections did not respond in time',
        )
        : [];
      const legacyBaseUrl = storedConnections.length === 0
        ? await withTimeout(
          this.dependencies.storage.load(),
          BACKEND_RESTORE_TIMEOUT_MS,
          'Saved backend connection did not respond in time',
        )
        : null;
      runInAction(() => {
        for (const stored of storedConnections) {
          this.servers.set(stored.serverId, {
            serverId: stored.serverId,
            name: stored.name,
            baseUrl: stored.baseUrl.replace(/\/$/, ''),
            capabilities: null,
            authRequired: false,
            credentialSet: false,
            status: 'idle',
            latencyMs: null,
            error: null,
            lastSuccessfulAt: null,
          });
        }
        if (legacyBaseUrl) {
          const normalized = legacyBaseUrl.replace(/\/$/, '');
          const serverId = this.connectionKey(normalized);
          this.servers.set(serverId, {
            serverId,
            name: this.displayName(normalized),
            baseUrl: normalized,
            capabilities: null,
            authRequired: false,
            credentialSet: false,
            status: 'idle',
            latencyMs: null,
            error: null,
            lastSuccessfulAt: null,
          });
        }
        this.setActive(this.connections[0]?.serverId ?? null);
        this.restored = true;
      });
      await Promise.all(this.connections.map(async (connection) => {
        await this.loadCredentialFor(connection.serverId);
        const current = this.servers.get(connection.serverId);
        if (current && this.credentials.has(connection.serverId)) {
          this.servers.set(connection.serverId, { ...current, credentialSet: true });
        }
      }));
      if (legacyBaseUrl && this.dependencies.storage.saveConnections) {
        await this.persistConnections();
      }
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
        this.restored = true;
      });
    }
  }

  async reset(): Promise<void> {
    this.onReset();
    await Promise.all(this.connections.map(async (connection) => {
      this.credentials.delete(connection.serverId);
      clearRegisteredApiCredential(connection.baseUrl, connection.serverId);
      await this.dependencies.storage.clearCredential?.(connection.serverId);
    }));
    if (this.dependencies.storage.clearConnections) await this.dependencies.storage.clearConnections();
    await this.dependencies.storage.clear();
    runInAction(() => {
      this.servers.clear();
      this.activeServerId = null;
      this.baseUrl = null;
      this.capabilities = null;
      this.status = 'idle';
      this.latencyMs = null;
      this.error = null;
      this.lastSuccessfulBaseUrl = null;
      this.lastSuccessfulAt = null;
    });
  }

  setBaseUrl(baseUrl: string | null): void {
    if (!baseUrl) {
      this.setActive(null);
      return;
    }
    const normalized = baseUrl.replace(/\/$/, '');
    const serverId = this.connectionKey(normalized);
    const current = this.servers.get(serverId) ?? {
      serverId,
      name: this.displayName(normalized),
      baseUrl: normalized,
      capabilities: null,
      authRequired: false,
      credentialSet: false,
      status: 'idle' as BackendStatus,
      latencyMs: null,
      error: null,
      lastSuccessfulAt: null,
    };
    this.servers.set(serverId, { ...current, baseUrl: normalized });
    this.setActive(serverId);
  }

  activate(serverId: string): boolean {
    if (!this.servers.has(serverId)) return false;
    this.setActive(serverId);
    return true;
  }

  async rename(serverId: string, name: string): Promise<void> {
    const connection = this.servers.get(serverId);
    if (!connection) return;
    this.servers.set(serverId, { ...connection, name: name.trim() || connection.name });
    await this.persistConnections();
  }

  async remove(serverId: string): Promise<void> {
    const connection = this.servers.get(serverId);
    if (!connection) return;
    const wasActive = this.activeServerId === serverId;
    this.onRemove(serverId);
    this.credentials.delete(serverId);
    clearRegisteredApiCredential(connection.baseUrl, serverId);
    await this.dependencies.storage.clearCredential?.(serverId);
    this.servers.delete(serverId);
    if (wasActive) this.setActive(this.connections[0]?.serverId ?? null);
    await this.persistConnections();
  }

  setCapabilities(capabilities: Capabilities | null): void {
    this.capabilities = capabilities;
    if (this.activeServerId) {
      const current = this.servers.get(this.activeServerId);
      if (current) this.servers.set(this.activeServerId, { ...current, capabilities, authRequired: Boolean(capabilities?.authRequired) });
    }
  }

  setStatus(status: BackendStatus): void {
    this.status = status;
    if (this.activeServerId) {
      const current = this.servers.get(this.activeServerId);
      if (current) this.servers.set(this.activeServerId, { ...current, status });
    }
  }

  markHealthy(serverId: string, latencyMs?: number): void {
    const current = this.servers.get(serverId);
    if (!current) return;
    this.servers.set(serverId, { ...current, status: 'connected', error: null, latencyMs: latencyMs ?? current.latencyMs });
    if (this.activeServerId === serverId) this.setActive(serverId);
  }

  markUnavailable(serverId: string, error: unknown): void {
    const current = this.servers.get(serverId);
    if (!current) return;
    const message = error instanceof Error ? error.message : String(error);
    this.servers.set(serverId, { ...current, status: statusForError(error), error: message });
    if (this.activeServerId === serverId) this.setActive(serverId);
  }
}

export type ServerConnection = {
  serverId: string;
  name: string;
  baseUrl: string;
  capabilities: Capabilities | null;
  authRequired: boolean;
  credentialSet: boolean;
  status: BackendStatus;
  latencyMs: number | null;
  error: string | null;
  lastSuccessfulAt: string | null;
};

export class ConnectionStore {
  readonly statusByServer = observable.map<string, RealtimeState>();
  readonly sequenceByServer = observable.map<string, number>();
  private activeScope: string | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get status(): RealtimeState {
    return this.activeScope ? this.statusByServer.get(this.activeScope) ?? 'idle' : 'idle';
  }

  get lastSequence(): number | null {
    if (!this.activeScope) return null;
    return this.sequenceByServer.get(this.activeScope) ?? null;
  }

  setScope(serverId?: string | null): void {
    this.activeScope = serverId ?? 'legacy';
  }

  setStatus(status: RealtimeState, serverId?: string | null): void {
    const scope = serverId ?? this.activeScope ?? 'legacy';
    this.statusByServer.set(scope, status);
    this.activeScope = scope;
  }

  acceptSequence(sequence: number, serverId?: string | null): void {
    const scope = serverId ?? this.activeScope ?? 'legacy';
    const previous = this.sequenceByServer.get(scope);
    if (previous === undefined || sequence > previous) {
      this.sequenceByServer.set(scope, sequence);
    }
    this.activeScope = scope;
  }

  reset(serverId?: string | null): void {
    if (serverId) {
      this.statusByServer.delete(serverId);
      this.sequenceByServer.delete(serverId);
      if (this.activeScope === serverId) this.activeScope = null;
      return;
    }
    this.statusByServer.clear();
    this.sequenceByServer.clear();
    this.activeScope = null;
  }

  get isOffline(): boolean {
    return this.status === 'error' || this.status === 'reconnecting';
  }
}

export type QueueView = {
  pending: number;
};

type OptimisticMessage = MessageView & {
  behavior: SendMessageInput['behavior'];
  status: 'sending' | 'failed';
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optimisticMessageId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return randomUuid ?? `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class ChatSessionStore {
  projection: EventReducerState = initialEventReducerState;
  connectionStatus: RealtimeState = 'idle';
  activeTaskId: string | null = null;
  pendingCommandCount = 0;
  aborting = false;
  error: string | null = null;
  readonly optimisticMessages = observable.map<string, OptimisticMessage>();
  private subscription: RealtimeHubSubscription | null = null;

  constructor(
    readonly chatId: string,
    readonly serverId: string | null,
    readonly backend: BackendStore,
    readonly connection: ConnectionStore,
    readonly realtimeHub: RealtimeHub,
    private readonly onActiveTask: (taskId: string, serverId: string | null) => void,
    private readonly dependencies: RootStoreDependencies,
  ) {
    makeAutoObservable<this, 'dependencies' | 'subscription'>(
      this,
      { dependencies: false, subscription: false, projection: observable.ref },
      { autoBind: true },
    );
  }

  private get connectionBaseUrl(): string | null {
    return this.backend.getBaseUrl(this.serverId ?? undefined);
  }

  private get client(): ApiClient | null {
    const baseUrl = this.connectionBaseUrl;
    return baseUrl ? this.dependencies.apiClientFactory(baseUrl, this.serverId ?? undefined) : null;
  }

  get messages(): MessageView[] {
    const realtimeMessages = this.projection.messagesByChat[this.chatId] ?? [];
    return [...realtimeMessages, ...this.optimisticMessages.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  get isOffline(): boolean {
    return this.connectionStatus === 'error' || this.connectionStatus === 'reconnecting';
  }

  get sending(): boolean {
    return this.pendingCommandCount > 0;
  }

  get queue(): QueueView {
    return { pending: this.projection.queueByChat[this.chatId] ?? 0 };
  }

  get runStatus(): 'idle' | 'running' | 'completed' | 'aborted' | 'failed' {
    return this.projection.runsByChat[this.chatId] ?? 'idle';
  }

  get isRunning(): boolean {
    return this.runStatus === 'running';
  }

  get taskStatus(): TaskStatus | null {
    if (!this.activeTaskId) return null;
    return (this.projection.taskStatuses[this.activeTaskId] as TaskStatus | undefined) ?? null;
  }

  get toolCalls(): ToolCallView[] {
    return this.projection.toolCallsByChat[this.chatId] ?? [];
  }

  applyChat(chat: Chat): void {
    this.activeTaskId = chat.activeTaskId ?? null;
    if (this.activeTaskId) this.onActiveTask(this.activeTaskId, this.serverId);
  }

  setError(error: string | null): void {
    this.error = error;
  }

  open(): void {
    const baseUrl = this.connectionBaseUrl;
    if (!baseUrl) return;
    if (this.subscription) return;
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const lastSequence = this.projection.lastSequenceByStream[`chat:${this.chatId}`];
    this.subscription = this.realtimeHub.subscribeChat(this.chatId, {
      url: `${normalizedBaseUrl}/api/chats/${encodeURIComponent(this.chatId)}/events`,
      initialAfterSequence: lastSequence,
      headers: this.backend.getAuthHeaders(this.serverId ?? undefined),
    }, {
      onEvent: (event) => {
        runInAction(() => {
          this.applyEvent(event);
          this.connection.acceptSequence(event.sequence, this.serverId);
        });
      },
      onState: (status) => {
        runInAction(() => {
          this.connectionStatus = status;
          this.connection.setStatus(status, this.serverId);
        });
      },
    }, this.serverId);
  }

  close(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.connectionStatus = 'idle';
  }

  private applyEvent(event: Parameters<typeof eventReducer>[1]): void {
    if (event.type === 'message.created' && isRecord(event.payload)) {
      const id = event.payload.id;
      if (typeof id === 'string') this.optimisticMessages.delete(id);
    }
    this.projection = eventReducer(this.projection, event);
    if (event.type === 'run.error' && isRecord(event.payload) && typeof event.payload.message === 'string') {
      this.error = event.payload.message;
    }
  }

  async send(
    text: string,
    behavior: SendMessageInput['behavior'] = 'send',
  ): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed || !this.connectionBaseUrl) return false;
    const optimistic: OptimisticMessage = {
      id: optimisticMessageId(),
      role: 'user',
      text: trimmed,
      createdAt: new Date(this.dependencies.clock()).toISOString(),
      behavior,
      status: 'sending',
    };
    this.optimisticMessages.set(optimistic.id, optimistic);
    return this.dispatchMessage(optimistic);
  }

  async retryMessage(messageId: string): Promise<boolean> {
    const message = this.optimisticMessages.get(messageId);
    if (!message || message.status !== 'failed' || !this.connectionBaseUrl) return false;
    this.optimisticMessages.set(messageId, { ...message, status: 'sending', error: undefined });
    return this.dispatchMessage({ ...message, status: 'sending', error: undefined });
  }

  private async dispatchMessage(message: OptimisticMessage): Promise<boolean> {
    const client = this.client;
    if (!client) return false;
    this.pendingCommandCount += 1;
    this.error = null;
    try {
      await client.sendMessage(this.chatId, {
        text: message.text,
        behavior: message.behavior,
        clientMessageId: message.id,
      });
      return true;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      runInAction(() => {
        this.error = messageText;
        const current = this.optimisticMessages.get(message.id);
        if (current) this.optimisticMessages.set(message.id, { ...current, status: 'failed', error: messageText });
      });
      return false;
    } finally {
      runInAction(() => {
        this.pendingCommandCount -= 1;
      });
    }
  }

  async abort(): Promise<boolean> {
    const client = this.client;
    if (!client || this.aborting) return false;
    this.aborting = true;
    this.error = null;
    try {
      await client.abortChat(this.chatId);
      return true;
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
      return false;
    } finally {
      runInAction(() => {
        this.aborting = false;
      });
    }
  }

  dispose(): void {
    this.close();
  }
}

export class ChatsStore {
  readonly items = observable.map<string, ChatSessionStore>();
  activeChatId: string | null = null;

  constructor(
    readonly backend: BackendStore,
    readonly connection: ConnectionStore,
    readonly realtimeHub: RealtimeHub,
    private readonly onActiveTask: (taskId: string, serverId: string | null) => void,
    private readonly dependencies: RootStoreDependencies,
  ) {
    makeAutoObservable<this, 'dependencies'>(this, { dependencies: false }, { autoBind: true });
  }

  getOrCreate(chatId: string, serverId?: string): ChatSessionStore {
    const resolvedServerId = serverId ?? this.backend.serverId;
    const key = this.sessionKey(chatId, resolvedServerId);
    const existing = this.items.get(key);
    if (existing) return existing;
    // A legacy single-URL session may exist while restore discovers the same
    // node's persistent server id. Reuse it instead of dropping its projection.
    const targetBaseUrl = this.backend.getBaseUrl(resolvedServerId ?? undefined);
    const migrated = [...this.items.entries()].find(([, session]) => (
      session.chatId === chatId
      && session.serverId !== resolvedServerId
      && targetBaseUrl !== null
      && session.backend.getBaseUrl(session.serverId ?? undefined) === targetBaseUrl
    ));
    if (migrated) {
      return migrated[1];
    }
    const session = new ChatSessionStore(
      chatId,
      resolvedServerId,
      this.backend,
      this.connection,
      this.realtimeHub,
      this.onActiveTask,
      this.dependencies,
    );
    this.items.set(key, session);
    return session;
  }

  open(chatId: string, serverId?: string): ChatSessionStore {
    const session = this.getOrCreate(chatId, serverId);
    this.activeChatId = chatId;
    session.open();
    return session;
  }

  async bootstrap(): Promise<Chat> {
    if (!this.backend.baseUrl) throw new Error('Backend URL is not configured');
    const serverId = this.backend.serverId ?? undefined;
    const chat = await this.dependencies.apiClientFactory(this.backend.baseUrl, serverId).bootstrapChat();
    const session = this.open(chat.id, chat.serverId ?? serverId);
    session.applyChat(chat);
    return chat;
  }

  async hydrate(chatId: string, serverId?: string): Promise<ChatSessionStore> {
    const baseUrl = this.backend.getBaseUrl(serverId);
    if (!baseUrl) throw new Error('Backend URL is not configured');
    const resolvedServerId = serverId ?? this.backend.serverId ?? undefined;
    const chat = await this.dependencies.apiClientFactory(baseUrl, resolvedServerId).getChat(chatId);
    const session = this.open(chat.id, chat.serverId ?? resolvedServerId);
    session.applyChat(chat);
    return session;
  }

  closeAll(): void {
    for (const session of this.items.values()) session.close();
    this.activeChatId = null;
    this.connection.reset();
  }

  evict(chatId: string): void {
    const key = [...this.items.entries()].find(([, session]) => session.chatId === chatId)?.[0];
    const session = key ? this.items.get(key) : undefined;
    session?.dispose();
    if (key) this.items.delete(key);
    if (this.activeChatId === chatId) this.activeChatId = null;
  }

  dispose(): void {
    this.closeAll();
    this.items.clear();
  }

  closeServer(serverId: string): void {
    for (const [key, session] of this.items.entries()) {
      if (session.serverId !== serverId) continue;
      session.dispose();
      this.items.delete(key);
      if (this.activeChatId === session.chatId) this.activeChatId = null;
    }
    this.connection.reset(serverId);
  }

  private sessionKey(chatId: string, serverId?: string | null): string {
    return serverId ? `${serverId}:${chatId}` : chatId;
  }
}

export class RootStore {
  readonly backend: BackendStore;
  readonly connection: ConnectionStore;
  readonly realtimeHub: RealtimeHub;
  readonly projects: ProjectsStore;
  readonly chats: ChatsStore;
  readonly tasks: TasksStore;
  readonly theme: ThemeStore;

  constructor(dependencies: RootStoreDependencies) {
    this.connection = new ConnectionStore();
    this.realtimeHub = new RealtimeHub(dependencies.realtimeFactory);
    let closeRealtime = (): void => undefined;
    this.backend = new BackendStore(
      dependencies,
      () => closeRealtime(),
      (serverId) => this.connection.setScope(serverId),
      (serverId) => {
        this.chats?.closeServer(serverId);
        this.tasks?.disposeServer(serverId);
        this.projects?.forgetServer(serverId);
      },
    );
    this.projects = new ProjectsStore(this.backend, {
      apiClientFactory: dependencies.apiClientFactory,
      snapshotStorage: dependencies.storage,
    });
    this.tasks = new TasksStore(this.backend, this.realtimeHub, dependencies);
    this.chats = new ChatsStore(
      this.backend,
      this.connection,
      this.realtimeHub,
      (taskId, serverId) => { void this.tasks.hydrate(taskId, serverId ?? undefined).catch(() => undefined); },
      dependencies,
    );
    this.theme = new ThemeStore();
    closeRealtime = () => {
      this.chats.closeAll();
      this.tasks.dispose();
      this.projects.clear();
    };
  }

  dispose(): void {
    this.chats.dispose();
    this.tasks.dispose();
    this.realtimeHub.dispose();
  }

  reset = async (): Promise<void> => {
    await this.backend.reset();
  };
}

export function createRootStore(
  overrides: Partial<RootStoreDependencies> = {},
): RootStore {
  const dependencies: RootStoreDependencies = {
    ...defaultDependencies,
    ...overrides,
  };
  return new RootStore(dependencies);
}
