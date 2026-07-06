import type { RealtimeEnvelope, SendMessageInput, TaskStatus } from '@pi-agents/contracts';
import type { EventsRepository } from '../db/repositories/eventsRepository';
import type { TasksRepository } from '../db/repositories/tasksRepository';
import type { PiRuntime } from './piRuntimeService';

export type RuntimeManagerTaskRef = {
  id: string;
  projectId: string;
  chatId?: string | null;
};

export type RuntimeManagerDeps = {
  runtime: PiRuntime;
  events: EventsRepository;
  tasks: TasksRepository;
};

const LOCK_OWNER = 'runtime';

export class RuntimeManager {
  private readonly runtime: PiRuntime;
  private readonly events: EventsRepository;
  private readonly tasks: TasksRepository;

  constructor(deps: RuntimeManagerDeps) {
    this.runtime = deps.runtime;
    this.events = deps.events;
    this.tasks = deps.tasks;
  }

  async runTask(task: RuntimeManagerTaskRef, input: SendMessageInput): Promise<void> {
    if (!this.runtime.acquireLock(task.id, LOCK_OWNER)) {
      throw new Error('Task already running');
    }

    const unsubscribe = this.runtime.subscribe(task.id, (event: RealtimeEnvelope) => {
      this.events.append({
        projectId: task.projectId,
        chatId: task.chatId ?? null,
        taskId: task.id,
        source: event.stream,
        type: event.type,
        payload: event.payload,
      });
    });

    this.tasks.updateStatus(task.id, 'running' satisfies TaskStatus);

    let finalStatus: TaskStatus = 'needs_review';
    try {
      await this.runtime.prompt(task.id, input);
    } catch (err) {
      finalStatus = 'failed';
      this.events.append({
        projectId: task.projectId,
        chatId: task.chatId ?? null,
        taskId: task.id,
        source: 'task',
        type: 'run.error',
        payload: { message: err instanceof Error ? err.message : String(err) },
      });
    } finally {
      unsubscribe();
      this.runtime.releaseLock(task.id, LOCK_OWNER);
      this.tasks.updateStatus(task.id, finalStatus);
    }
  }

  async abort(taskId: string, reason?: string): Promise<void> {
    await this.runtime.abort(taskId, reason);
  }
}
