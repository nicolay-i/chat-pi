import { randomUUID } from 'node:crypto';
import type { EventType, SendMessageInput } from '@pi-agents/contracts';
import { PiRpcClient, type PiEventListener } from './piRpcClient';
import { piResourceArgs } from './piResources';

export type ChatRuntimeEmit = (type: EventType, payload: unknown) => void;

export interface ChatRuntime {
  send(chatId: string, input: SendMessageInput, emit: ChatRuntimeEmit): Promise<void>;
  abort(chatId: string, emit: ChatRuntimeEmit): Promise<void>;
  dispose?(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export class FakeChatRuntime implements ChatRuntime {
  async send(chatId: string, input: SendMessageInput, emit: ChatRuntimeEmit): Promise<void> {
    emit('run.started', { chatId, behavior: input.behavior });
    const messageId = randomUUID();
    const createdAt = new Date().toISOString();
    emit('message.created', {
      chatId,
      id: messageId,
      role: 'assistant',
      text: '',
      createdAt,
    });
    await delay();
    emit('message.delta', {
      chatId,
      messageId,
      delta: `Принял задачу: ${input.text}`,
    });
    emit('message.completed', { chatId, messageId });
    emit('run.completed', { chatId });
  }

  async abort(chatId: string, emit: ChatRuntimeEmit): Promise<void> {
    emit('run.aborted', { chatId, reason: 'user' });
  }

}

type PiChatSession = {
  client: PiRpcClient;
  started: Promise<void>;
  assistantMessageId: string | null;
  hasTextDelta: boolean;
};

export type PiChatRuntimeOptions = {
  cwd?: string;
  piBin?: string;
  nodeBin?: string;
  provider?: string;
  model?: string;
  agentDir?: string;
};

export class PiChatRuntime implements ChatRuntime {
  private readonly sessions = new Map<string, PiChatSession>();

  constructor(private readonly options: PiChatRuntimeOptions = {}) {}

  private createSession(chatId: string, emit: ChatRuntimeEmit): PiChatSession {
    const client = new PiRpcClient({
      cwd: this.options.cwd,
      piBin: this.options.piBin,
      nodeBin: this.options.nodeBin,
      provider: this.options.provider,
      model: this.options.model,
      agentDir: this.options.agentDir,
      args: piResourceArgs(this.options.cwd),
    });
    const session: PiChatSession = {
      client,
      started: client.start(),
      assistantMessageId: null,
      hasTextDelta: false,
    };
    const onEvent: PiEventListener = (event) => this.handleEvent(chatId, session, event, emit);
    client.onEvent(onEvent);
    this.sessions.set(chatId, session);
    return session;
  }

  private getSession(chatId: string, emit: ChatRuntimeEmit): PiChatSession {
    return this.sessions.get(chatId) ?? this.createSession(chatId, emit);
  }

  private ensureAssistantMessage(chatId: string, session: PiChatSession, emit: ChatRuntimeEmit): string {
    if (session.assistantMessageId) return session.assistantMessageId;
    const messageId = randomUUID();
    session.assistantMessageId = messageId;
    session.hasTextDelta = false;
    emit('message.created', {
      chatId,
      id: messageId,
      role: 'assistant',
      text: '',
      createdAt: new Date().toISOString(),
    });
    return messageId;
  }

  private handleEvent(
    chatId: string,
    session: PiChatSession,
    event: Record<string, unknown>,
    emit: ChatRuntimeEmit,
  ): void {
    switch (event.type) {
      case 'agent_start':
        emit('run.started', { chatId });
        return;
      case 'message_start': {
        const message = event.message;
        if (isRecord(message) && message.role === 'assistant') {
          this.ensureAssistantMessage(chatId, session, emit);
        }
        return;
      }
      case 'message_update': {
        const update = event.assistantMessageEvent;
        if (!isRecord(update)) return;
        const updateType = asString(update.type);
        const messageId = this.ensureAssistantMessage(chatId, session, emit);
        if (updateType === 'text_delta') {
          session.hasTextDelta = true;
          emit('message.delta', { chatId, messageId, delta: asString(update.delta) ?? '' });
        }
        if (updateType === 'text_end' && !session.hasTextDelta) {
          emit('message.delta', { chatId, messageId, delta: asString(update.content) ?? '' });
        }
        return;
      }
      case 'message_end': {
        if (session.assistantMessageId) {
          emit('message.completed', { chatId, messageId: session.assistantMessageId });
        }
        return;
      }
      case 'agent_end':
        emit('run.completed', { chatId });
        session.assistantMessageId = null;
        return;
      default:
        return;
    }
  }

  async send(chatId: string, input: SendMessageInput, emit: ChatRuntimeEmit): Promise<void> {
    const session = this.getSession(chatId, emit);
    await session.started;
    if (input.behavior === 'steer') {
      await session.client.steer(input.text);
      return;
    }
    if (input.behavior === 'follow_up') {
      await session.client.followUp(input.text);
      return;
    }
    if (input.behavior === 'abort_and_replace') {
      await session.client.abort();
    }
    await session.client.prompt(input.text);
  }

  async abort(chatId: string, emit: ChatRuntimeEmit): Promise<void> {
    const session = this.sessions.get(chatId);
    if (session) {
      await session.started;
      await session.client.abort();
    }
    emit('run.aborted', { chatId, reason: 'user' });
  }

  async dispose(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.allSettled(sessions.map(async (session) => {
      await session.started.catch(() => undefined);
      await session.client.stop();
    }));
  }
}

export function createChatRuntime(mode: 'fake' | 'pi', options?: PiChatRuntimeOptions): ChatRuntime {
  return mode === 'pi' ? new PiChatRuntime(options) : new FakeChatRuntime();
}
