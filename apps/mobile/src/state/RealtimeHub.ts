import type { RealtimeEnvelope } from '@pi-agents/contracts';
import { RealtimeManager, type RealtimeManagerOptions, type RealtimeState } from './RealtimeManager';

export type HubStream = 'chat' | 'task' | 'project';
export type RealtimeFactory = (options: RealtimeManagerOptions) => Pick<RealtimeManager, 'start' | 'stop'>;

export type RealtimeHubSubscription = {
  unsubscribe(): void;
};

type Subscriber = {
  onEvent: (event: RealtimeEnvelope) => void;
  onState?: (state: RealtimeState) => void;
};

type HubEntry = {
  manager: Pick<RealtimeManager, 'start' | 'stop'>;
  subscribers: Map<number, Subscriber>;
  backgroundRefs: number;
  lastSequence: number | null;
  seenIds: Set<string>;
  state: RealtimeState;
};

export class RealtimeHub {
  private readonly entries = new Map<string, HubEntry>();
  private nextSubscriberId = 0;

  constructor(private readonly createRealtime: RealtimeFactory) {}

  subscribeChat(
    chatId: string,
    options: Omit<RealtimeManagerOptions, 'onEvent' | 'onState'>,
    subscriber: Subscriber,
    scopeId?: string | null,
  ): RealtimeHubSubscription {
    return this.subscribe('chat', chatId, options, subscriber, scopeId);
  }

  subscribeTask(
    taskId: string,
    options: Omit<RealtimeManagerOptions, 'onEvent' | 'onState'>,
    subscriber: Subscriber,
    scopeId?: string | null,
  ): RealtimeHubSubscription {
    return this.subscribe('task', taskId, options, subscriber, scopeId);
  }

  subscribeProject(
    projectId: string,
    options: Omit<RealtimeManagerOptions, 'onEvent' | 'onState'>,
    subscriber: Subscriber,
    scopeId?: string | null,
  ): RealtimeHubSubscription {
    return this.subscribe('project', projectId, options, subscriber, scopeId);
  }

  retainTask(
    taskId: string,
    options: Omit<RealtimeManagerOptions, 'onEvent' | 'onState'>,
    scopeId?: string | null,
  ): () => void {
    const key = this.key('task', taskId, scopeId);
    const entry = this.getOrCreate(key, options);
    entry.backgroundRefs += 1;
    return () => {
      const current = this.entries.get(key);
      if (!current) return;
      current.backgroundRefs = Math.max(0, current.backgroundRefs - 1);
      this.closeIfUnused(key, current);
    };
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.manager.stop();
    this.entries.clear();
  }

  private subscribe(
    stream: HubStream,
    streamId: string,
    options: Omit<RealtimeManagerOptions, 'onEvent' | 'onState'>,
    subscriber: Subscriber,
    scopeId?: string | null,
  ): RealtimeHubSubscription {
    const key = this.key(stream, streamId, scopeId);
    const entry = this.getOrCreate(key, options);
    const id = ++this.nextSubscriberId;
    entry.subscribers.set(id, subscriber);
    subscriber.onState?.(entry.state);
    return {
      unsubscribe: () => {
        const current = this.entries.get(key);
        if (!current) return;
        current.subscribers.delete(id);
        this.closeIfUnused(key, current);
      },
    };
  }

  private getOrCreate(
    key: string,
    options: Omit<RealtimeManagerOptions, 'onEvent' | 'onState'>,
  ): HubEntry {
    const existing = this.entries.get(key);
    if (existing) return existing;

    const entry: HubEntry = {
      manager: null as never,
      subscribers: new Map(),
      backgroundRefs: 0,
      lastSequence: options.initialAfterSequence ?? null,
      seenIds: new Set(),
      state: 'idle',
    };
    entry.manager = this.createRealtime({
      ...options,
      initialAfterSequence: entry.lastSequence,
      onEvent: (event) => {
        if (entry.seenIds.has(event.id)) return;
        if (entry.lastSequence !== null && event.sequence < entry.lastSequence) return;
        entry.seenIds.add(event.id);
        if (entry.lastSequence === null || event.sequence > entry.lastSequence) {
          entry.lastSequence = event.sequence;
        }
        for (const listener of entry.subscribers.values()) listener.onEvent(event);
      },
      onState: (state) => {
        entry.state = state;
        for (const listener of entry.subscribers.values()) listener.onState?.(state);
      },
    });
    this.entries.set(key, entry);
    entry.manager.start();
    return entry;
  }

  private closeIfUnused(key: string, entry: HubEntry): void {
    if (entry.subscribers.size > 0 || entry.backgroundRefs > 0) return;
    entry.manager.stop();
    this.entries.delete(key);
  }

  private key(stream: HubStream, streamId: string, scopeId?: string | null): string {
    return scopeId ? `${scopeId}:${stream}:${streamId}` : `${stream}:${streamId}`;
  }
}
