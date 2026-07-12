import type { SendMessageInput, TaskStatus } from '@pi-agents/contracts';
import type { EventStore, RealtimeEventDraft } from '../realtime/eventStore';
import type { TasksRepository, TaskRecord } from '../db/repositories/tasksRepository';
import type { ChatsRepository, ChatRecord } from '../db/repositories/chatsRepository';
import type { PiSessionsRepository, PiSessionRecord } from '../db/repositories/piSessionsRepository';
import type { QueuedMessagesRepository } from '../db/repositories/queuedMessagesRepository';
import type { RuntimeProcessesRepository, RuntimeProcessStatus } from '../db/repositories/runtimeProcessesRepository';
import type { ProjectsRepository } from '../db/repositories/projectsRepository';
import type { PiRuntime } from './piRuntimeService';
import type { CheckpointService } from './checkpointService';
import { runGit } from './gitExec';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { parseJsonl } from './piJsonl';

export type RuntimeManagerTaskRef = {
  id: string;
  projectId: string;
  chatId?: string | null;
};

export type RuntimeManagerChatRef = {
  id: string;
  projectId: string;
};

export type RuntimeManagerDeps = {
  runtime: PiRuntime;
  eventStore: EventStore;
  tasks: TasksRepository;
  chats?: ChatsRepository;
  piSessions: PiSessionsRepository;
  queuedMessages?: QueuedMessagesRepository;
  runtimeProcesses?: RuntimeProcessesRepository;
  projects?: ProjectsRepository;
  checkpoints?: CheckpointService;
  lockOwner?: string;
  lockHeartbeatMs?: number;
  runTimeoutMs?: number;
};

const DEFAULT_LOCK_HEARTBEAT_MS = 15_000;
const DEFAULT_RUN_TIMEOUT_MS = 20 * 60 * 1_000;
const READ_ONLY_TOOLS = ['read', 'grep', 'find', 'ls'];
const PAUSED_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'paused_clean',
  'paused_dirty',
  'paused_after_restart',
]);
const RECOVERY_CONTEXT = [
  'The previous agent run was interrupted. Before acting on the new request:',
  '- run git status;',
  '- inspect the diff from the last checkpoint;',
  '- verify current HEAD and unfinished work;',
  '- re-read relevant project files, AGENTS.md, and .agents;',
  'Only then continue with the user request below.',
].join('\n');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withRuntimeContext(event: RealtimeEventDraft, context: RuntimeContext): RealtimeEventDraft {
  const payload: Record<string, unknown> = isRecord(event.payload)
    ? { ...event.payload }
    : { value: event.payload };
  payload.chatId ??= context.chat?.id;
  payload.taskId ??= context.task?.id;
  if (event.type === 'message.created') {
    payload.id ??= payload.messageId;
    payload.createdAt ??= event.createdAt;
  }
  return { ...event, payload };
}

type RuntimeContext = {
  chat?: ChatRecord;
  task?: TaskRecord;
  session: PiSessionRecord;
  projectId: string;
};

type ActiveRun = {
  key: string;
  context: RuntimeContext;
  abortRequested: boolean;
  promise: Promise<void>;
};

class RunTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`agent run exceeded timeout of ${timeoutMs}ms`);
    this.name = 'RunTimeoutError';
  }
}

class RunAbortedError extends Error {
  constructor() {
    super('agent run aborted');
    this.name = 'RunAbortedError';
  }
}

export class RuntimeManager {
  private readonly runtime: PiRuntime;
  private readonly eventStore: EventStore;
  private readonly tasks: TasksRepository;
  private readonly chats?: ChatsRepository;
  private readonly piSessions: PiSessionsRepository;
  private readonly queuedMessages?: QueuedMessagesRepository;
  private readonly runtimeProcesses?: RuntimeProcessesRepository;
  private readonly projects?: ProjectsRepository;
  private readonly checkpoints?: CheckpointService;
  private readonly lockOwner: string;
  private readonly lockHeartbeatMs: number;
  private readonly runTimeoutMs: number;
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(deps: RuntimeManagerDeps) {
    this.runtime = deps.runtime;
    this.eventStore = deps.eventStore;
    this.tasks = deps.tasks;
    this.chats = deps.chats;
    this.piSessions = deps.piSessions;
    this.queuedMessages = deps.queuedMessages;
    this.runtimeProcesses = deps.runtimeProcesses;
    this.projects = deps.projects;
    this.checkpoints = deps.checkpoints;
    this.lockOwner = deps.lockOwner ?? `runtime-${crypto.randomUUID()}`;
    this.lockHeartbeatMs = deps.lockHeartbeatMs ?? DEFAULT_LOCK_HEARTBEAT_MS;
    this.runTimeoutMs = deps.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
  }

  private async publish(context: RuntimeContext, event: RealtimeEventDraft): Promise<void> {
    const contextual = withRuntimeContext(event, context);
    if (context.task) {
      await this.eventStore.append({
        ...contextual,
        stream: 'task',
        streamId: context.task.id,
        projectId: context.projectId,
        chatId: context.chat?.id,
        taskId: context.task.id,
        piSessionId: context.session.id,
      });
    }
    if (context.chat) {
      await this.eventStore.append({
        ...contextual,
        stream: 'chat',
        streamId: context.chat.id,
        projectId: context.projectId,
        chatId: context.chat.id,
        taskId: context.task?.id,
        piSessionId: context.session.id,
      });
    }
  }

  private publishTaskStatus(context: RuntimeContext, status: TaskStatus): void {
    if (!context.task) return;
    void this.publish(context, {
      id: crypto.randomUUID(),
      stream: 'task',
      streamId: context.task.id,
      type: 'task.status.changed',
      payload: { taskId: context.task.id, chatId: context.chat?.id, status },
      createdAt: new Date().toISOString(),
    });
  }

  private startLockHeartbeat(sessionId: string): () => void {
    const timer = setInterval(() => {
      if (this.piSessions.heartbeatLock(sessionId, this.lockOwner)) return;
      void this.runtime.abort(sessionId, 'persistent_lock_lost').catch(() => undefined);
    }, this.lockHeartbeatMs);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  private resolveTaskContext(taskRef: RuntimeManagerTaskRef): RuntimeContext {
    const task = this.tasks.getById(taskRef.id);
    if (!task) throw new Error(`task not found: ${taskRef.id}`);
    const chatId = task.sourceChatId ?? taskRef.chatId ?? undefined;
    const chat = chatId ? this.chats?.getById(chatId) : undefined;
    let session = (chat ? this.piSessions.getByChatId(chat.id) : undefined)
      ?? (task.piSessionId ? this.piSessions.getById(task.piSessionId) : undefined)
      ?? this.piSessions.getByTaskId(task.id);
    // Existing development databases may contain task-owned sessions from the
    // pre-Chat-session model. Keep them runnable while all newly-created tasks
    // are bound to the Chat session by TaskService.
    if (!session) {
      session = this.piSessions.create({
        projectId: task.projectId,
        chatId: chat?.id ?? null,
        taskId: chat ? null : task.id,
        path: task.piSessionPath,
        cwd: task.worktreePath,
      });
      this.tasks.update(task.id, { piSessionId: session.id });
    }
    return { task, chat, session, projectId: task.projectId };
  }

  private resolveChatContext(chatRef: RuntimeManagerChatRef): RuntimeContext {
    if (!this.chats) throw new Error('chat repository is required for discussion runtime');
    const chat = this.chats.getById(chatRef.id);
    if (!chat || chat.projectId !== chatRef.projectId) throw new Error(`chat not found: ${chatRef.id}`);
    let session = this.piSessions.getByChatId(chat.id)
      ?? (chat.piSessionId ? this.piSessions.getById(chat.piSessionId) : undefined);
    if (!session) {
      const project = this.projects?.getById(chat.projectId);
      if (!project) throw new Error(`PiSession not found for chat: ${chat.id}`);
      session = this.piSessions.create({
        projectId: chat.projectId,
        chatId: chat.id,
        path: join(project.runtimeStatePath, 'sessions', `${chat.id}.jsonl`),
        cwd: project.repoPath,
      });
      this.chats.update(chat.id, { piSessionId: session.id, activePiSessionId: session.id });
    }
    const task = chat.activeTaskId ? this.tasks.getById(chat.activeTaskId) : undefined;
    if (task && task.sourceChatId !== chat.id) throw new Error(`active task belongs to another chat: ${task.id}`);
    return { chat, task, session, projectId: chat.projectId };
  }

  private contextKey(context: RuntimeContext): string {
    return context.chat?.id ?? context.task?.id ?? context.session.id;
  }

  private contextCwd(context: RuntimeContext): { cwd: string; allowedTools?: string[]; reason: string } {
    if (context.task) {
      return { cwd: context.task.worktreePath, reason: 'task_started_or_resumed' };
    }
    const project = this.projects?.getById(context.projectId);
    if (!project) throw new Error(`project not found: ${context.projectId}`);
    return { cwd: project.repoPath, allowedTools: READ_ONLY_TOOLS, reason: 'discussion_or_planning' };
  }

  private transitionTaskToRunning(context: RuntimeContext): void {
    if (!context.task) return;
    const task = this.tasks.getById(context.task.id);
    if (!task) throw new Error(`task not found: ${context.task.id}`);

    const transitions: Partial<Record<TaskStatus, TaskStatus[]>> = {
      created: ['idle', 'queued', 'running'],
      idle: ['queued', 'running'],
      needs_review: ['idle', 'queued', 'running'],
      paused_clean: ['queued', 'running'],
      paused_dirty: ['queued', 'running'],
      paused_after_restart: ['queued', 'running'],
    };
    const steps = transitions[task.status];
    if (!steps) throw new Error(`Task cannot start a new run from status ${task.status}`);
    for (const status of steps) {
      this.tasks.updateStatus(task.id, status);
      context.task.status = status;
    }
  }

  private async pauseAfterAbort(context: RuntimeContext): Promise<TaskStatus> {
    if (!context.task) return 'paused_clean';
    try {
      const dirty = runGit(['status', '--porcelain'], { cwd: context.task.worktreePath }).stdout.length > 0;
      return dirty ? 'paused_dirty' : 'paused_clean';
    } catch {
      // When Git cannot inspect a crashed/removed worktree, preserve it as
      // potentially dirty rather than advertising a clean recovery state.
      return 'paused_dirty';
    }
  }

  private syncSessionLeaf(context: RuntimeContext): void {
    const session = this.piSessions.getById(context.session.id) ?? context.session;
    if (!existsSync(session.path)) return;
    const entries = parseJsonl(readFileSync(session.path, 'utf8'));
    const entryId = entries.at(-1)?.id ?? null;
    if (!entryId) return;
    this.piSessions.update(session.id, { lastEntryId: entryId, activeLeafEntryId: entryId });
    if (context.chat) this.chats?.update(context.chat.id, { activeLeafEntryId: entryId });
    if (context.task) this.tasks.update(context.task.id, { endPiEntryId: entryId });
  }

  private async executeRun(context: RuntimeContext, input: SendMessageInput, activeRun: ActiveRun): Promise<void> {
    const key = this.contextKey(context);
    const { cwd, allowedTools, reason } = this.contextCwd(context);
    const requiresRecovery = Boolean(context.task && PAUSED_STATUSES.has(context.task.status));
    if (!this.piSessions.acquireLock(context.session.id, this.lockOwner)) {
      throw new Error('PiSession already has a writer runtime');
    }
    if (!this.runtime.acquireLock(context.session.id, this.lockOwner)) {
      this.piSessions.releaseLock(context.session.id, this.lockOwner);
      throw new Error('PiSession already has a writer runtime');
    }
    const stopLockHeartbeat = this.startLockHeartbeat(context.session.id);
    const previousCwd = context.session.cwd;
    const runId = crypto.randomUUID();
    let runtimeProcessId: string | undefined;
    let runtimeProcessStatus: Exclude<RuntimeProcessStatus, 'running'> = 'completed';
    let runtimeProcessReason: string | undefined;
    let taskCompletedSuccessfully = false;

    const unsubscribe = this.runtime.subscribe(context.session.id, (event) => {
      void this.publish(context, event);
    });

    if (context.task) {
      this.transitionTaskToRunning(context);
      this.tasks.update(context.task.id, {
        startPiEntryId: context.session.lastEntryId,
        lastRunId: runId,
      });
      this.publishTaskStatus(context, 'running');
    }

    try {
      const project = this.projects?.getById(context.projectId);
      this.piSessions.update(context.session.id, { cwd });
      if (previousCwd !== cwd) {
        const previousTaskId = this.tasks.listByProject(context.projectId)
          .find((task) => task.worktreePath === previousCwd)?.id ?? null;
        let lastMergeCommit: string | null = null;
        if (project) {
          try {
            lastMergeCommit = runGit(['rev-parse', 'HEAD'], { cwd: project.repoPath }).stdout;
          } catch {
            // A project may be temporarily unavailable during recovery. The
            // marker still records the context transition without a HEAD.
          }
        }
        await this.publish(context, {
          id: crypto.randomUUID(),
          stream: 'chat',
          streamId: context.chat?.id ?? key,
          type: 'workspace_context_changed',
          payload: {
            previousTaskId,
            newTaskId: context.task?.id ?? null,
            previousCwd,
            newCwd: cwd,
            baseSha: context.task?.baseSha ?? null,
            targetBranch: context.task?.mergeTarget ?? null,
            lastMergeCommit,
            reason,
          },
          createdAt: new Date().toISOString(),
        });
      }
      await this.runtime.prepare({
        sessionId: context.session.id,
        cwd,
        sessionPath: context.session.path,
        resourceRoot: project?.repoPath,
        agentsDir: project?.agentsDir,
        allowedTools,
      });
      const process = this.runtime.getProcessInfo?.(context.session.id);
      if (process && this.runtimeProcesses) {
        runtimeProcessId = this.runtimeProcesses.start({
          projectId: context.projectId,
          chatId: context.chat?.id ?? null,
          taskId: context.task?.id ?? null,
          piSessionId: context.session.id,
          runId,
          pid: process.pid,
          command: process.command,
          cwd: process.cwd,
          sandboxMode: process.sandboxed ? 'bwrap' : 'none',
        }).id;
      }
      let stepInput: SendMessageInput = requiresRecovery
        ? { ...input, text: `${RECOVERY_CONTEXT}\n\nUser request:\n${input.text}` }
        : input;
      let stepRunId = runId;
      let deliveredQueueItemId: string | undefined;
      for (;;) {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            this.runtime.prompt(context.session.id, stepInput),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new RunTimeoutError(this.runTimeoutMs)), this.runTimeoutMs);
            }),
          ]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
        // Pi may acknowledge abort by ending the current RPC turn normally.
        // Do not turn that acknowledgement into a successful checkpoint.
        if (activeRun.abortRequested) throw new RunAbortedError();
        this.syncSessionLeaf(context);

        if (context.task && this.checkpoints && project) {
          const session = this.piSessions.getById(context.session.id) ?? context.session;
          const checkpoint = await this.checkpoints.createCheckpoint({
            taskId: context.task.id,
            chatId: context.chat?.id,
            runId: stepRunId,
            piSessionId: session.id,
            piEntryId: session.lastEntryId,
            message: `Agent turn: ${stepInput.text.slice(0, 120)}`,
            repoPath: project.repoPath,
            worktreePath: context.task.worktreePath,
            runtimeStatePath: project.runtimeStatePath,
          });
          if (context.chat) {
            await this.eventStore.append({
              stream: 'chat', streamId: context.chat.id, projectId: context.projectId,
              chatId: context.chat.id, taskId: context.task.id, piSessionId: session.id,
              type: 'checkpoint.created', payload: checkpoint,
            });
          }
        }
        if (deliveredQueueItemId) this.queuedMessages?.markDelivered(deliveredQueueItemId);
        const next = context.chat ? this.queuedMessages?.listPending(context.chat.id)[0] : undefined;
        if (!next) break;
        deliveredQueueItemId = next.id;
        stepRunId = crypto.randomUUID();
        stepInput = { text: next.text, behavior: 'send' };
      }
      taskCompletedSuccessfully = Boolean(context.task);
    } catch (error) {
      if (error instanceof RunTimeoutError) {
        runtimeProcessStatus = 'timed_out';
        runtimeProcessReason = error.message;
        activeRun.abortRequested = true;
        await this.runtime.abort(context.session.id, 'timeout');
        await this.publish(context, {
          id: crypto.randomUUID(),
          stream: 'chat',
          streamId: context.chat?.id ?? key,
          type: 'run.error',
          payload: { message: error.message, timeout: true },
          createdAt: new Date().toISOString(),
        });
      }
      if (activeRun.abortRequested) {
        if (runtimeProcessStatus !== 'timed_out') {
          runtimeProcessStatus = 'aborted';
          runtimeProcessReason = error instanceof Error ? error.message : String(error);
        }
        if (context.task) {
          const status = await this.pauseAfterAbort(context);
          this.tasks.updateStatus(context.task.id, status);
          this.publishTaskStatus(context, status);
        }
      } else {
        runtimeProcessStatus = 'failed';
        runtimeProcessReason = error instanceof Error ? error.message : String(error);
        if (context.task) {
          this.tasks.updateStatus(context.task.id, 'failed');
          this.publishTaskStatus(context, 'failed');
        }
        await this.publish(context, {
          id: crypto.randomUUID(),
          stream: 'chat',
          streamId: context.chat?.id ?? key,
          type: 'run.error',
          payload: { message: error instanceof Error ? error.message : String(error) },
          createdAt: new Date().toISOString(),
        });
      }
      if (!activeRun.abortRequested) throw error;
    } finally {
      unsubscribe();
      stopLockHeartbeat();
      this.runtime.releaseLock(context.session.id, this.lockOwner);
      this.piSessions.releaseLock(context.session.id, this.lockOwner);
      if (runtimeProcessId) {
        this.runtimeProcesses?.finish(runtimeProcessId, runtimeProcessStatus, runtimeProcessReason);
      }
      // Expose a terminal Task state only after its writer lock and child have
      // been released. A user can then send the next step without racing the
      // previous runtime cleanup.
      if (taskCompletedSuccessfully && context.task) {
        this.tasks.updateStatus(context.task.id, 'needs_review');
        this.publishTaskStatus(context, 'needs_review');
      }
    }
  }

  private start(context: RuntimeContext, input: SendMessageInput): Promise<void> {
    const key = this.contextKey(context);
    if (this.activeRuns.has(key)) return Promise.reject(new Error('PiSession already has an active writer runtime'));
    const activeRun = {} as ActiveRun;
    const promise = this.executeRun(context, input, activeRun);
    activeRun.key = key;
    activeRun.context = context;
    activeRun.abortRequested = false;
    activeRun.promise = promise;
    this.activeRuns.set(key, activeRun);
    void promise.finally(() => {
      if (this.activeRuns.get(key) === activeRun) this.activeRuns.delete(key);
    }).catch(() => undefined);
    return promise;
  }

  runTask(task: RuntimeManagerTaskRef, input: SendMessageInput): Promise<void> {
    return this.start(this.resolveTaskContext(task), input);
  }

  runChat(chat: RuntimeManagerChatRef, input: SendMessageInput): Promise<void> {
    return this.start(this.resolveChatContext(chat), input);
  }

  private activeRunForTask(taskId: string): ActiveRun | undefined {
    return [...this.activeRuns.values()].find((run) => run.context.task?.id === taskId);
  }

  private activeRunForChat(chatId: string): ActiveRun | undefined {
    return this.activeRuns.get(chatId);
  }

  async abort(taskOrChatId: string, reason?: string): Promise<void> {
    const activeRun = this.activeRunForTask(taskOrChatId) ?? this.activeRunForChat(taskOrChatId);
    if (!activeRun) throw new Error('Task is not running');
    activeRun.abortRequested = true;
    if (activeRun.context.task) {
      this.tasks.updateStatus(activeRun.context.task.id, 'aborting');
      this.publishTaskStatus(activeRun.context, 'aborting');
    }
    await this.runtime.abort(activeRun.context.session.id, reason);
  }

  async abortAndReplace(task: RuntimeManagerTaskRef, input: SendMessageInput): Promise<void> {
    const activeRun = this.activeRunForTask(task.id);
    if (activeRun) {
      await this.abort(task.id, 'replaced');
      await activeRun.promise;
    }
    await this.runTask(task, { ...input, behavior: 'send' });
  }

  async steer(taskId: string, text: string): Promise<void> {
    const activeRun = this.activeRunForTask(taskId);
    if (!activeRun) throw new Error('Task is not running');
    await this.runtime.steer(activeRun.context.session.id, text);
  }

  async followUp(taskId: string, text: string): Promise<void> {
    const activeRun = this.activeRunForTask(taskId);
    if (!activeRun) throw new Error('Task is not running');
    if (activeRun.context.chat) this.queuedMessages?.enqueue({
      chatId: activeRun.context.chat.id,
      taskId,
      text,
    });
    await this.publish(activeRun.context, {
      id: crypto.randomUUID(), stream: 'chat', streamId: activeRun.context.chat?.id ?? activeRun.context.task?.id ?? taskId,
      type: 'queue.updated', payload: { type: 'follow_up', text, pending: this.queuedMessages?.listPending(activeRun.context.chat?.id ?? '').length ?? 0 },
      createdAt: new Date().toISOString(),
    });
  }

  async recoverInterruptedRuns(): Promise<number> {
    this.piSessions.releaseExpiredLocks();
    const interrupted: TaskStatus[] = ['queued', 'running', 'aborting'];
    let recovered = 0;
    for (const status of interrupted) {
      for (const task of this.tasks.listByStatus(status)) {
        this.tasks.updateStatus(task.id, 'paused_after_restart');
        const session = (task.piSessionId ? this.piSessions.getById(task.piSessionId) : undefined)
          ?? this.piSessions.getByTaskId(task.id);
        if (session) this.piSessions.clearLock(session.id);
        const chat = task.sourceChatId ? this.chats?.getById(task.sourceChatId) : undefined;
        if (!session) continue;
        await this.publish({ task, chat, session, projectId: task.projectId }, {
          id: crypto.randomUUID(),
          stream: 'task',
          streamId: task.id,
          type: 'run.aborted',
          payload: { taskId: task.id, chatId: task.sourceChatId, reason: 'backend_restarted', recovered: true },
          createdAt: new Date().toISOString(),
        });
        await this.publish({ task, chat, session, projectId: task.projectId }, {
          id: crypto.randomUUID(),
          stream: 'task',
          streamId: task.id,
          type: 'task.status.changed',
          payload: { taskId: task.id, chatId: task.sourceChatId, status: 'paused_after_restart', recovered: true },
          createdAt: new Date().toISOString(),
        });
        recovered += 1;
      }
    }
    return recovered;
  }

  async dispose(): Promise<void> {
    const activeRuns = [...this.activeRuns.values()];
    await Promise.allSettled(activeRuns.map((run) => this.runtime.abort(run.context.session.id, 'backend_shutdown')));
    await this.runtime.dispose?.();
  }
}
