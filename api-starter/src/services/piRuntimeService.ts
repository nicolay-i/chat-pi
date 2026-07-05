import type { RealtimeEnvelope, SendMessageInput } from '@pi-agents/contracts';

export type RuntimeEventHandler = (event: RealtimeEnvelope) => void;

export interface PiRuntime {
  prompt(input: SendMessageInput): Promise<void>;
  steer(text: string): Promise<void>;
  followUp(text: string): Promise<void>;
  abort(reason?: string): Promise<void>;
  subscribe(handler: RuntimeEventHandler): () => void;
}

export class FakePiRuntime implements PiRuntime {
  private handlers = new Set<RuntimeEventHandler>();

  subscribe(handler: RuntimeEventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async prompt(input: SendMessageInput) {
    this.emit('run.started', { behavior: input.behavior });
    this.emit('message.completed', { role: 'assistant', text: `Accepted: ${input.text}` });
    this.emit('run.completed', {});
  }

  async steer(text: string) {
    this.emit('queue.updated', { type: 'steer', text });
  }

  async followUp(text: string) {
    this.emit('queue.updated', { type: 'follow_up', text });
  }

  async abort(reason?: string) {
    this.emit('run.aborted', { reason });
  }

  private emit(type: RealtimeEnvelope['type'], payload: unknown) {
    for (const handler of this.handlers) {
      handler({
        id: crypto.randomUUID(),
        stream: 'task',
        streamId: 'fake-task',
        type,
        payload,
        createdAt: new Date().toISOString(),
      });
    }
  }
}
