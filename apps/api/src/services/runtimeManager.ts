import type { SendMessageInput, TaskStatus } from '@pi-agents/contracts';
import type { EventStore, RealtimeEventDraft } from '../realtime/eventStore';
import type { TasksRepository } from '../db/repositories/tasksRepository';
import type { PiSessionsRepository } from '../db/repositories/piSessionsRepository';
import type { ProjectsRepository } from '../db/repositories/projectsRepository';
import type { PiRuntime } from './piRuntimeService';
import type { CheckpointService } from './checkpointService';

export type RuntimeManagerTaskRef = {
  id: string;
  projectId: string;
  chatId?: string | null;
};

export type RuntimeManagerDeps = {
  runtime: PiRuntime;
  eventStore: EventStore;
  tasks: TasksRepository;
  piSessions: PiSessionsRepository;
  projects?: ProjectsRepository;
  checkpoints?: CheckpointService;
  lockOwner?: string;
  lockHeartbeatMs?: number;
};

const DEFAULT_LOCK_HEARTBEAT_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withRuntimeContext(event: RealtimeEventDraft, task: RuntimeManagerTaskRef): RealtimeEventDraft {
  const payload: Record<string, unknown> = isRecord(event.payload)
    ? { ...event.payload }
    : { value: event.payload };
  payload.taskId ??= task.id;
  if (task.chatId) payload.chatId ??= task.chatId;
  if (event.type === 'message.created') {
    payload.id ??= payload.messageId;
    payload.createdAt ??= event.createdAt;
  }
  return { ...event, payload };
}

type ActiveRun = {
  task: RuntimeManagerTaskRef;
  abortRequested: boolean;
  promise: Promise<void>;
};

export class RuntimeManager {
  private readonly runtime: PiRuntime;
  private readonly eventStore: EventStore;
  private readonly tasks: TasksRepository;
  private readonly piSessions: PiSessionsRepository;
  private readonly projects?: ProjectsRepository;
  private readonly checkpoints?: CheckpointService;
  private readonly lockOwner: string;
  private readonly lockHeartbeatMs: number;
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(deps: RuntimeManagerDeps) {
    this.runtime = deps.runtime;
    this.eventStore = deps.eventStore;
    this.tasks = deps.tasks;
    this.piSessions = deps.piSessions;
    this.projects = deps.projects;
    this.checkpoints = deps.checkpoints;
    this.lockOwner = deps.lockOwner ?? `runtime-${crypto.randomUUID()}`;
    this.lockHeartbeatMs = deps.lockHeartbeatMs ?? DEFAULT_LOCK_HEARTBEAT_MS;
  }

  private publishTaskStatus(task: RuntimeManagerTaskRef, status: TaskStatus): void {
    void this.eventStore.append({
      stream: 'task',
      streamId: task.id,
      projectId: task.projectId,
      chatId: task.chatId ?? undefined,
      taskId: task.id,
      type: 'task.status.changed',
      payload: { taskId: task.id, chatId: task.chatId, status },
    });
  }

  async recoverInterruptedRuns(): Promise<number> {
    this.piSessions.releaseExpiredLocks();
    const interrupted: TaskStatus[] = ['queued', 'running', 'aborting'];
    let recovered = 0;
    for (const status of interrupted) {
      for (const task of this.tasks.listByStatus(status)) {
        this.tasks.updateStatus(task.id, 'failed');
        const session = this.piSessions.getByTaskId(task.id);
        if (session) this.piSessions.clearLock(session.id);
        await this.eventStore.append({
          stream: 'task', streamId: task.id, projectId: task.projectId, chatId: task.sourceChatId ?? undefined, taskId: task.id,
          type: 'run.error', payload: { taskId: task.id, chatId: task.sourceChatId, message: 'Backend restarted before the active run completed', recovered: true },
        });
        await this.eventStore.append({
          stream: 'task', streamId: task.id, projectId: task.projectId, chatId: task.sourceChatId ?? undefined, taskId: task.id,
          type: 'task.status.changed', payload: { taskId: task.id, chatId: task.sourceChatId, status: 'failed', recovered: true },
        });
        recovered += 1;
      }
    }
    return recovered;
  }

  private startLockHeartbeat(sessionId: string, taskId: string): () => void {
    const timer = setInterval(() => {
      if (this.piSessions.heartbeatLock(sessionId, this.lockOwner)) return;
      void this.runtime.abort(taskId, 'persistent_lock_lost').catch(() => undefined);
    }, this.lockHeartbeatMs);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  private async executeRun(
    task: RuntimeManagerTaskRef,
    input: SendMessageInput,
    activeRun: ActiveRun,
  ): Promise<void> {
    const persistedTask = this.tasks.getById(task.id);
    if (!persistedTask) throw new Error(`task not found: ${task.id}`);
    const session = this.piSessions.getByTaskId(task.id) ?? this.piSessions.create({
      projectId: task.projectId,
      chatId: task.chatId ?? null,
      taskId: task.id,
      path: persistedTask.piSessionPath,
      cwd: persistedTask.worktreePath,
    });
    if (!this.piSessions.acquireLock(session.id, this.lockOwner)) {
      throw new Error('Task already running');
    }
    if (!this.runtime.acquireLock(task.id, this.lockOwner)) {
      this.piSessions.releaseLock(session.id, this.lockOwner);
      throw new Error('Task already running');
    }
    const stopLockHeartbeat = this.startLockHeartbeat(session.id, task.id);

    const append = (event: RealtimeEventDraft): void => {
      const contextualEvent = withRuntimeContext(event, task);
      void this.eventStore.append({
        ...contextualEvent,
        projectId: task.projectId,
        chatId: task.chatId ?? undefined,
        taskId: task.id,
      });
      if (task.chatId) {
        void this.eventStore.append({
          ...contextualEvent,
          stream: 'chat',
          streamId: task.chatId,
          projectId: task.projectId,
          chatId: task.chatId,
          taskId: task.id,
        });
      }
    };
    const unsubscribe = this.runtime.subscribe(task.id, append);

    this.tasks.updateStatus(task.id, 'running' satisfies TaskStatus);
    this.publishTaskStatus(task, 'running');

    let finalStatus: TaskStatus = 'needs_review';
    try {
      const project = this.projects?.getById(task.projectId);
      await this.runtime.prepare({
        sessionId: task.id,
        cwd: persistedTask.worktreePath,
        sessionPath: session.path,
        resourceRoot: project?.repoPath,
        agentsDir: project?.agentsDir,
      });
      await this.runtime.prompt(task.id, input);
    } catch (err) {
      finalStatus = activeRun.abortRequested ? 'idle' : 'failed';
      if (!activeRun.abortRequested) {
        append({
          id: crypto.randomUUID(),
          stream: 'task',
          streamId: task.id,
          type: 'run.error',
          payload: { message: err instanceof Error ? err.message : String(err) },
          createdAt: new Date().toISOString(),
        });
      }
    } finally {
      unsubscribe();
      stopLockHeartbeat();
      this.runtime.releaseLock(task.id, this.lockOwner);
      this.piSessions.releaseLock(session.id, this.lockOwner);
      if (activeRun.abortRequested) finalStatus = 'idle';

      if (finalStatus === 'needs_review' && this.checkpoints && this.projects) {
        try {
          const project = this.projects.getById(task.projectId);
          if (!project) throw new Error(`project not found: ${task.projectId}`);
          const checkpoint = await this.checkpoints.createCheckpoint({
            taskId: task.id,
            message: `Agent turn: ${input.text.slice(0, 120)}`,
            repoPath: project.repoPath,
            worktreePath: persistedTask.worktreePath,
            runtimeStatePath: project.runtimeStatePath,
            piSessionId: session.id,
          });
          if (task.chatId) {
            await this.eventStore.append({
              stream: 'chat',
              streamId: task.chatId,
              projectId: task.projectId,
              chatId: task.chatId,
              taskId: task.id,
              type: 'checkpoint.created',
              payload: checkpoint,
            });
          }
        } catch (error) {
          finalStatus = 'failed';
          append({
            id: crypto.randomUUID(),
            stream: 'task',
            streamId: task.id,
            type: 'run.error',
            payload: {
              message: `Automatic checkpoint failed: ${error instanceof Error ? error.message : String(error)}`,
            },
            createdAt: new Date().toISOString(),
          });
        }
      }
      this.tasks.updateStatus(task.id, finalStatus);
      this.publishTaskStatus(task, finalStatus);
    }
  }

  runTask(task: RuntimeManagerTaskRef, input: SendMessageInput): Promise<void> {
    if (this.activeRuns.has(task.id)) return Promise.reject(new Error('Task already running'));

    const activeRun = {} as ActiveRun;
    const promise = this.executeRun(task, input, activeRun);
    activeRun.task = task;
    activeRun.abortRequested = false;
    activeRun.promise = promise;
    this.activeRuns.set(task.id, activeRun);
    void promise.finally(() => {
      if (this.activeRuns.get(task.id) === activeRun) this.activeRuns.delete(task.id);
    }).catch(() => undefined);
    return promise;
  }

  async abort(taskId: string, reason?: string): Promise<void> {
    const activeRun = this.activeRuns.get(taskId);
    if (!activeRun) throw new Error('Task is not running');
    activeRun.abortRequested = true;
    this.tasks.updateStatus(taskId, 'aborting');
    this.publishTaskStatus(activeRun.task, 'aborting');
    await this.runtime.abort(taskId, reason);
  }

  async abortAndReplace(task: RuntimeManagerTaskRef, input: SendMessageInput): Promise<void> {
    const activeRun = this.activeRuns.get(task.id);
    if (activeRun) {
      await this.abort(task.id, 'replaced');
      await activeRun.promise;
    }
    await this.runTask(task, { ...input, behavior: 'send' });
  }

  async steer(taskId: string, text: string): Promise<void> {
    if (!this.activeRuns.has(taskId)) throw new Error('Task is not running');
    await this.runtime.steer(taskId, text);
  }

  async followUp(taskId: string, text: string): Promise<void> {
    if (!this.activeRuns.has(taskId)) throw new Error('Task is not running');
    await this.runtime.followUp(taskId, text);
  }

  async dispose(): Promise<void> {
    const activeRuns = [...this.activeRuns.values()];
    await Promise.allSettled(activeRuns.map((run) => this.runtime.abort(run.task.id, 'backend_shutdown')));
    await this.runtime.dispose?.();
  }
}
