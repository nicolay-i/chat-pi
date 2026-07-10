import { makeAutoObservable, runInAction } from 'mobx';
import type { Capabilities, Chat } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { clearBackendUrl, saveBackendUrl } from '@/state/backendStorage';
import {
  eventReducer,
  initialEventReducerState,
  type EventReducerState,
  type MessageView,
} from '@/state/eventReducer';
import { RealtimeManager, type RealtimeState } from '@/state/RealtimeManager';

export type BackendStatus = 'idle' | 'checking' | 'connected' | 'error';

export class BackendStore {
  baseUrl: string | null = null;
  capabilities: Capabilities | null = null;
  status: BackendStatus = 'idle';
  latencyMs: number | null = null;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  async connect(value: string): Promise<void> {
    const baseUrl = value.trim().replace(/\/$/, '');
    this.status = 'checking';
    this.error = null;
    this.latencyMs = null;
    try {
      const client = new ApiClient(baseUrl);
      const startedAt = Date.now();
      await client.getHealth();
      const capabilities = await client.getCapabilities();
      runInAction(() => {
        this.baseUrl = baseUrl;
        this.capabilities = capabilities;
        this.latencyMs = Date.now() - startedAt;
        this.status = 'connected';
      });
      await saveBackendUrl(baseUrl);
    } catch (error) {
      runInAction(() => {
        this.status = 'error';
        this.error = error instanceof Error ? error.message : String(error);
      });
    }
  }

  async reset(): Promise<void> {
    await clearBackendUrl();
    runInAction(() => {
      this.baseUrl = null;
      this.capabilities = null;
      this.status = 'idle';
      this.latencyMs = null;
      this.error = null;
    });
  }
}

export class ChatStore {
  chatId: string | null = null;
  state: EventReducerState = initialEventReducerState;
  connectionStatus: RealtimeState = 'idle';
  sending = false;
  error: string | null = null;
  private realtime: RealtimeManager | null = null;

  constructor(private readonly backend: BackendStore) {
    makeAutoObservable(this, { backend: false, realtime: false }, { autoBind: true });
  }

  get messages(): MessageView[] {
    if (!this.chatId) return [];
    return this.state.messagesByChat[this.chatId] ?? [];
  }

  get isOffline(): boolean {
    return this.connectionStatus === 'error' || this.connectionStatus === 'reconnecting';
  }

  async bootstrap(): Promise<Chat> {
    if (!this.backend.baseUrl) throw new Error('Backend URL is not configured');
    const chat = await new ApiClient(this.backend.baseUrl).bootstrapChat();
    this.open(chat.id);
    return chat;
  }

  open(chatId: string): void {
    if (!this.backend.baseUrl) return;
    if (this.chatId === chatId && this.realtime) return;
    this.close();
    this.chatId = chatId;
    this.state = initialEventReducerState;
    const baseUrl = this.backend.baseUrl.endsWith('/')
      ? this.backend.baseUrl.slice(0, -1)
      : this.backend.baseUrl;
    const realtime = new RealtimeManager({
      url: `${baseUrl}/api/chats/${encodeURIComponent(chatId)}/events`,
      onEvent: (event) => {
        runInAction(() => {
          this.state = eventReducer(this.state, event);
        });
      },
      onState: (status) => {
        runInAction(() => {
          this.connectionStatus = status;
        });
      },
    });
    this.realtime = realtime;
    realtime.start();
  }

  close(): void {
    this.realtime?.stop();
    this.realtime = null;
    this.connectionStatus = 'idle';
  }

  async send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !this.chatId || !this.backend.baseUrl) return;
    this.sending = true;
    this.error = null;
    try {
      await new ApiClient(this.backend.baseUrl).sendMessage(this.chatId, {
        text: trimmed,
        behavior: 'send',
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
    } finally {
      runInAction(() => {
        this.sending = false;
      });
    }
  }
}

export class RootStore {
  readonly backend = new BackendStore();
  readonly chat = new ChatStore(this.backend);
}

export const rootStore = new RootStore();
