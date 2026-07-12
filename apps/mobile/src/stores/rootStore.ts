import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { Capabilities, Chat, SendMessageInput, TaskStatus } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { clearBackendUrl, loadBackendUrl, saveBackendUrl } from '@/state/backendStorage';
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

export type BackendStatus = 'idle' | 'checking' | 'connected' | 'error';

export type BackendStorage = {
  load(): Promise<string | null>;
  save(url: string): Promise<void>;
  clear(): Promise<void>;
};

export type RealtimeConnection = Pick<RealtimeManager, 'start' | 'stop'>;

export type RootStoreDependencies = {
  apiClientFactory: (baseUrl: string) => ApiClient;
  realtimeFactory: (options: RealtimeManagerOptions) => RealtimeConnection;
  storage: BackendStorage;
  clock: () => number;
};

const defaultDependencies: RootStoreDependencies = {
  apiClientFactory: (baseUrl) => new ApiClient(baseUrl),
  realtimeFactory: (options) => new RealtimeManager(options),
  storage: {
    load: loadBackendUrl,
    save: saveBackendUrl,
    clear: clearBackendUrl,
  },
  clock: Date.now,
};

export class BackendStore {
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
  ) {
    makeAutoObservable<this, 'dependencies'>(this, { dependencies: false }, { autoBind: true });
  }

  async connect(value: string): Promise<void> {
    const baseUrl = value.trim().replace(/\/$/, '');
    this.status = 'checking';
    this.error = null;
    this.latencyMs = null;
    try {
      const client = this.dependencies.apiClientFactory(baseUrl);
      const startedAt = this.dependencies.clock();
      await client.getHealth();
      const capabilities = await client.getCapabilities();
      runInAction(() => {
        this.baseUrl = baseUrl;
        this.capabilities = capabilities;
        this.latencyMs = this.dependencies.clock() - startedAt;
        this.status = 'connected';
        this.lastSuccessfulBaseUrl = baseUrl;
        this.lastSuccessfulAt = new Date(this.dependencies.clock()).toISOString();
      });
      await this.dependencies.storage.save(baseUrl);
    } catch (error) {
      runInAction(() => {
        this.status = 'error';
        this.error = error instanceof Error ? error.message : String(error);
      });
    }
  }

  async restore(): Promise<void> {
    if (this.restored) return;
    try {
      const baseUrl = await this.dependencies.storage.load();
      runInAction(() => {
        this.baseUrl = baseUrl;
        this.restored = true;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
        this.restored = true;
      });
    }
  }

  async reset(): Promise<void> {
    this.onReset();
    await this.dependencies.storage.clear();
    runInAction(() => {
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
    this.baseUrl = baseUrl;
  }

  setCapabilities(capabilities: Capabilities | null): void {
    this.capabilities = capabilities;
  }

  setStatus(status: BackendStatus): void {
    this.status = status;
  }
}

export class ConnectionStore {
  status: RealtimeState = 'idle';
  lastSequence: number | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setStatus(status: RealtimeState): void {
    this.status = status;
  }

  acceptSequence(sequence: number): void {
    if (this.lastSequence === null || sequence > this.lastSequence) {
      this.lastSequence = sequence;
    }
  }

  reset(): void {
    this.status = 'idle';
    this.lastSequence = null;
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
    readonly backend: BackendStore,
    readonly connection: ConnectionStore,
    readonly realtimeHub: RealtimeHub,
    private readonly onActiveTask: (taskId: string) => void,
    private readonly dependencies: RootStoreDependencies,
  ) {
    makeAutoObservable<this, 'dependencies' | 'subscription'>(
      this,
      { dependencies: false, subscription: false, projection: observable.ref },
      { autoBind: true },
    );
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
    if (this.activeTaskId) this.onActiveTask(this.activeTaskId);
  }

  setError(error: string | null): void {
    this.error = error;
  }

  open(): void {
    if (!this.backend.baseUrl) return;
    if (this.subscription) return;
    const baseUrl = this.backend.baseUrl.endsWith('/')
      ? this.backend.baseUrl.slice(0, -1)
      : this.backend.baseUrl;
    const lastSequence = this.projection.lastSequenceByStream[`chat:${this.chatId}`];
    this.subscription = this.realtimeHub.subscribeChat(this.chatId, {
      url: `${baseUrl}/api/chats/${encodeURIComponent(this.chatId)}/events`,
      initialAfterSequence: lastSequence,
    }, {
      onEvent: (event) => {
        runInAction(() => {
          this.applyEvent(event);
          this.connection.acceptSequence(event.sequence);
        });
      },
      onState: (status) => {
        runInAction(() => {
          this.connectionStatus = status;
          this.connection.setStatus(status);
        });
      },
    });
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
    if (!trimmed || !this.backend.baseUrl) return false;
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
    if (!message || message.status !== 'failed' || !this.backend.baseUrl) return false;
    this.optimisticMessages.set(messageId, { ...message, status: 'sending', error: undefined });
    return this.dispatchMessage({ ...message, status: 'sending', error: undefined });
  }

  private async dispatchMessage(message: OptimisticMessage): Promise<boolean> {
    if (!this.backend.baseUrl) return false;
    this.pendingCommandCount += 1;
    this.error = null;
    try {
      await this.dependencies.apiClientFactory(this.backend.baseUrl).sendMessage(this.chatId, {
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
    if (!this.backend.baseUrl || this.aborting) return false;
    this.aborting = true;
    this.error = null;
    try {
      await this.dependencies.apiClientFactory(this.backend.baseUrl).abortChat(this.chatId);
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
    private readonly onActiveTask: (taskId: string) => void,
    private readonly dependencies: RootStoreDependencies,
  ) {
    makeAutoObservable<this, 'dependencies'>(this, { dependencies: false }, { autoBind: true });
  }

  getOrCreate(chatId: string): ChatSessionStore {
    const existing = this.items.get(chatId);
    if (existing) return existing;
    const session = new ChatSessionStore(
      chatId,
      this.backend,
      this.connection,
      this.realtimeHub,
      this.onActiveTask,
      this.dependencies,
    );
    this.items.set(chatId, session);
    return session;
  }

  open(chatId: string): ChatSessionStore {
    const session = this.getOrCreate(chatId);
    this.activeChatId = chatId;
    session.open();
    return session;
  }

  async bootstrap(): Promise<Chat> {
    if (!this.backend.baseUrl) throw new Error('Backend URL is not configured');
    const chat = await this.dependencies.apiClientFactory(this.backend.baseUrl).bootstrapChat();
    const session = this.open(chat.id);
    session.applyChat(chat);
    return chat;
  }

  async hydrate(chatId: string): Promise<ChatSessionStore> {
    if (!this.backend.baseUrl) throw new Error('Backend URL is not configured');
    const chat = await this.dependencies.apiClientFactory(this.backend.baseUrl).getChat(chatId);
    const session = this.open(chat.id);
    session.applyChat(chat);
    return session;
  }

  closeAll(): void {
    for (const session of this.items.values()) session.close();
    this.activeChatId = null;
    this.connection.reset();
  }

  evict(chatId: string): void {
    const session = this.items.get(chatId);
    session?.dispose();
    this.items.delete(chatId);
    if (this.activeChatId === chatId) this.activeChatId = null;
  }

  dispose(): void {
    this.closeAll();
    this.items.clear();
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
    this.backend = new BackendStore(dependencies, () => closeRealtime());
    this.projects = new ProjectsStore(this.backend, dependencies);
    this.tasks = new TasksStore(this.backend, this.realtimeHub, dependencies);
    this.chats = new ChatsStore(
      this.backend,
      this.connection,
      this.realtimeHub,
      (taskId) => { void this.tasks.hydrate(taskId).catch(() => undefined); },
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
