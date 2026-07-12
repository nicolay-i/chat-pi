import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { RealtimeEnvelope, Task, TaskStatus } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { RealtimeHub, type RealtimeHubSubscription } from '@/state/RealtimeHub';
import type { BackendStore } from './rootStore';

export type RunStatus = 'idle' | 'running' | 'completed' | 'aborted' | 'failed';

export type QueueView = {
  pending: number;
};

export type ToolCallView = {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  output?: string;
};

export type TaskStoreDependencies = {
  apiClientFactory: (baseUrl: string) => ApiClient;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const RUNNING_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'creating_worktree', 'queued', 'running', 'aborting', 'checks_running', 'merge_running',
]);

const ATTENTION_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'stale', 'checks_failed', 'merge_conflict', 'failed',
]);

const MERGEABLE_STATUSES: ReadonlySet<TaskStatus> = new Set(['idle', 'needs_review']);

export class TaskStore {
  projectId: string;
  title: string;
  mode: Task['mode'];
  status: TaskStatus;
  branchName: string;
  worktreePath: string;
  changedFiles: number;
  updatedAt: string;
  behindMain = 0;
  runStatus: RunStatus = 'idle';
  activeTool: ToolCallView | null = null;
  queue: QueueView = { pending: 0 };
  lastEventSequence = 0;

  constructor(readonly id: string, task: Task) {
    this.projectId = task.projectId;
    this.title = task.title;
    this.mode = task.mode;
    this.status = task.status;
    this.branchName = task.branchName;
    this.worktreePath = task.worktreePath;
    this.changedFiles = task.changedFiles;
    this.updatedAt = task.updatedAt;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isRunning(): boolean {
    return RUNNING_STATUSES.has(this.status) || this.runStatus === 'running';
  }

  get canAbort(): boolean {
    return this.status === 'queued' || this.status === 'running' || this.status === 'checks_running';
  }

  get canMerge(): boolean {
    return MERGEABLE_STATUSES.has(this.status);
  }

  get canRebase(): boolean {
    return this.status === 'stale';
  }

  get needsAttention(): boolean {
    return ATTENTION_STATUSES.has(this.status) || this.runStatus === 'failed';
  }

  applyTask(task: Task): void {
    this.projectId = task.projectId;
    this.title = task.title;
    this.mode = task.mode;
    this.status = task.status;
    this.branchName = task.branchName;
    this.worktreePath = task.worktreePath;
    this.changedFiles = task.changedFiles;
    this.updatedAt = task.updatedAt;
  }

  applyEvent(event: RealtimeEnvelope): boolean {
    if (event.sequence <= this.lastEventSequence) return false;
    this.lastEventSequence = event.sequence;
    if (!isRecord(event.payload)) return true;
    const payload = event.payload;

    switch (event.type) {
      case 'task.status.changed': {
        const status = asString(payload.status);
        if (status) this.status = status as TaskStatus;
        break;
      }
      case 'run.started':
        this.runStatus = 'running';
        this.queue = { pending: 0 };
        break;
      case 'run.completed':
        this.runStatus = 'completed';
        this.queue = { pending: 0 };
        break;
      case 'run.aborted':
        this.runStatus = 'aborted';
        this.queue = { pending: 0 };
        break;
      case 'run.error':
        this.runStatus = 'failed';
        break;
      case 'queue.updated':
        this.queue = {
          pending: typeof payload.pending === 'number' && Number.isInteger(payload.pending) && payload.pending >= 0
            ? payload.pending
            : this.queue.pending + 1,
        };
        break;
      case 'tool.started':
        this.activeTool = {
          id: event.id,
          name: asString(payload.tool) ?? asString(payload.name) ?? 'tool',
          status: 'running',
        };
        break;
      case 'tool.output':
        if (this.activeTool) this.activeTool = { ...this.activeTool, output: asString(payload.output) ?? this.activeTool.output };
        break;
      case 'tool.completed':
        if (this.activeTool) {
          this.activeTool = {
            ...this.activeTool,
            status: 'completed',
            output: asString(payload.output) ?? this.activeTool.output,
          };
        }
        break;
      case 'diff.updated': {
        const changedFiles = asNumber(payload.changedFiles);
        if (changedFiles !== undefined) this.changedFiles = changedFiles;
        const behindMain = asNumber(payload.behindMain);
        if (behindMain !== undefined) this.behindMain = behindMain;
        break;
      }
      case 'merge.conflict':
        this.status = 'merge_conflict';
        break;
      case 'merge.completed':
        this.status = 'merged';
        break;
      default:
        break;
    }
    return true;
  }
}

export class TasksStore {
  readonly items = observable.map<string, TaskStore>();
  private readonly subscriptions = new Map<string, RealtimeHubSubscription>();

  constructor(
    private readonly backend: BackendStore,
    private readonly realtimeHub: RealtimeHub,
    private readonly dependencies: TaskStoreDependencies,
  ) {
    makeAutoObservable<this, 'backend' | 'realtimeHub' | 'dependencies' | 'subscriptions'>(
      this,
      { backend: false, realtimeHub: false, dependencies: false, subscriptions: false },
      { autoBind: true },
    );
  }

  getOrCreate(task: Task): TaskStore {
    const existing = this.items.get(task.id);
    if (existing) {
      existing.applyTask(task);
      return existing;
    }
    const store = new TaskStore(task.id, task);
    this.items.set(task.id, store);
    return store;
  }

  get(taskId: string): TaskStore | undefined {
    return this.items.get(taskId);
  }

  byProject(projectId: string): TaskStore[] {
    return [...this.items.values()]
      .filter((task) => task.projectId === projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  activeCount(projectId: string): number {
    return this.byProject(projectId).filter((task) => task.isRunning).length;
  }

  async hydrateProject(projectId: string): Promise<TaskStore[]> {
    if (!this.backend.baseUrl) throw new Error('Backend URL is not configured');
    const tasks = await this.dependencies.apiClientFactory(this.backend.baseUrl).getTasks(projectId);
    return runInAction(() => {
      const stores = tasks.map((task) => this.getOrCreate(task));
      for (const task of stores) {
        if (task.isRunning) this.watch(task.id);
      }
      return stores;
    });
  }

  async hydrate(taskId: string): Promise<TaskStore> {
    if (!this.backend.baseUrl) throw new Error('Backend URL is not configured');
    const task = await this.dependencies.apiClientFactory(this.backend.baseUrl).getTask(taskId);
    return runInAction(() => {
      const store = this.getOrCreate(task);
      if (store.isRunning) this.watch(taskId);
      else this.unwatch(taskId);
      return store;
    });
  }

  watch(taskId: string): void {
    if (!this.backend.baseUrl || this.subscriptions.has(taskId)) return;
    const task = this.items.get(taskId);
    if (!task || !task.isRunning) return;
    const baseUrl = this.backend.baseUrl.replace(/\/$/, '');
    const subscription = this.realtimeHub.subscribeTask(taskId, {
      url: `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/events`,
      initialAfterSequence: task.lastEventSequence || null,
    }, {
      onEvent: (event) => {
        runInAction(() => {
          const current = this.items.get(taskId);
          if (!current?.applyEvent(event)) return;
          if (!current.isRunning) this.unwatch(taskId);
        });
      },
    });
    this.subscriptions.set(taskId, subscription);
  }

  unwatch(taskId: string): void {
    this.subscriptions.get(taskId)?.unsubscribe();
    this.subscriptions.delete(taskId);
  }

  dispose(): void {
    for (const taskId of this.subscriptions.keys()) this.unwatch(taskId);
    this.items.clear();
  }
}
