import type { EventType, RealtimeEnvelope } from '@pi-agents/contracts';
import type { RealtimeEventDraft } from '../realtime/eventStore';

export type PiJsonlEntryKind =
  | 'message'
  | 'tool_call'
  | 'tool_result'
  | 'run'
  | 'checkpoint'
  | 'error';

/**
 * A Pi session file is one JSON object per line (JSONL). Assumed shape:
 *
 *   { id, ts, kind, role?, text?, tool?, args?, output?, status?, parent? }
 *
 * Lines may be appended over time; a tailer reads new lines past
 * last_imported_offset. `args` and `output` are intentionally `unknown`.
 */
export type PiJsonlEntry = {
  id: string;
  ts: string;
  kind: PiJsonlEntryKind;
  role?: 'user' | 'assistant' | 'system';
  text?: string;
  tool?: string;
  args?: unknown;
  output?: unknown;
  status?: string;
  parent?: string;
};

export type MapEntryContext = {
  projectId: string;
  chatId?: string | null;
  taskId?: string | null;
};

/**
 * Parse a Pi session JSONL string into entries.
 *
 * Resilient by design: malformed, empty, or non-object lines are silently
 * skipped so an append-only log with a single bad line (e.g. a partially
 * flushed write) never breaks the whole import. Entries missing the required
 * id/ts/kind string fields are also dropped.
 */
export function parseJsonl(text: string): PiJsonlEntry[] {
  const entries: PiJsonlEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const obj = parsed as Partial<PiJsonlEntry>;
    if (
      typeof obj.id !== 'string' ||
      typeof obj.ts !== 'string' ||
      typeof obj.kind !== 'string'
    ) {
      continue;
    }
    entries.push(obj as PiJsonlEntry);
  }
  return entries;
}

function newEnvelopeId(): string {
  return crypto.randomUUID();
}

function makeEnvelope(
  stream: RealtimeEnvelope['stream'],
  streamId: string,
  createdAt: string,
  type: EventType,
  payload: unknown,
): RealtimeEventDraft {
  return {
    id: newEnvelopeId(),
    stream,
    streamId,
    type,
    payload,
    createdAt,
  };
}

/**
 * Pure mapper from a Pi JSONL entry to a RealtimeEnvelope.
 *
 * A fresh envelope id is generated on purpose: `entry.id` is the importer's
 * dedup key (idempotent re-import), so it must NOT be reused as the event id.
 *
 * Mapping (kind -> event type); assistant message maps to `message.created`
 * (chosen over `message.completed` since Pi JSONL records a finalized message
 * and the app treats imported messages as already-complete):
 *  - message role user/assistant -> message.created { role, text, id }
 *  - tool_call                   -> tool.started { tool, args }
 *  - tool_result                 -> tool.completed { tool, output, status }
 *  - run status started/completed/aborted -> run.started/completed/aborted
 *  - error                       -> run.error { message: text }
 *  - checkpoint                  -> checkpoint.created { id, summary: text }
 *  - fallback (unknown kind/run  status) -> message.created { raw: entry }
 *
 * Stream selection: prefer 'task' when a taskId is present, else 'chat'.
 * streamId = taskId ?? chatId ?? projectId.
 */
export function mapEntryToEvent(
  entry: PiJsonlEntry,
  ctx: MapEntryContext,
): RealtimeEventDraft {
  const stream: RealtimeEnvelope['stream'] = ctx.taskId ? 'task' : 'chat';
  const streamId = ctx.taskId ?? ctx.chatId ?? ctx.projectId;
  const createdAt = entry.ts;

  switch (entry.kind) {
    case 'message':
      return makeEnvelope(stream, streamId, createdAt, 'message.created', {
        role: entry.role ?? 'assistant',
        text: entry.text ?? '',
        id: entry.id,
      });
    case 'tool_call':
      return makeEnvelope(stream, streamId, createdAt, 'tool.started', {
        tool: entry.tool ?? 'unknown',
        args: entry.args,
      });
    case 'tool_result':
      return makeEnvelope(stream, streamId, createdAt, 'tool.completed', {
        tool: entry.tool ?? 'unknown',
        output: entry.output,
        status: entry.status,
      });
    case 'run': {
      const status = entry.status ?? '';
      if (status === 'started') return makeEnvelope(stream, streamId, createdAt, 'run.started', {});
      if (status === 'completed') return makeEnvelope(stream, streamId, createdAt, 'run.completed', {});
      if (status === 'aborted') return makeEnvelope(stream, streamId, createdAt, 'run.aborted', {});
      return makeEnvelope(stream, streamId, createdAt, 'message.created', { raw: entry });
    }
    case 'error':
      return makeEnvelope(stream, streamId, createdAt, 'run.error', {
        message: entry.text ?? '',
      });
    case 'checkpoint':
      return makeEnvelope(stream, streamId, createdAt, 'checkpoint.created', {
        id: entry.id,
        summary: entry.text ?? '',
      });
    default:
      return makeEnvelope(stream, streamId, createdAt, 'message.created', { raw: entry });
  }
}
