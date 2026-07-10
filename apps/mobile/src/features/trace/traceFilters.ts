import type { EventType, RealtimeEnvelope } from '@pi-agents/contracts';

export type TraceFilter =
  | 'all'
  | 'messages'
  | 'tools'
  | 'runs'
  | 'checkpoints'
  | 'diffs'
  | 'errors'
  | 'queue';

export const TRACE_FILTERS: TraceFilter[] = [
  'all',
  'messages',
  'tools',
  'runs',
  'checkpoints',
  'diffs',
  'errors',
  'queue',
];

const FILTER_PREFIX: Record<Exclude<TraceFilter, 'all' | 'errors'>, string> = {
  messages: 'message.',
  tools: 'tool.',
  runs: 'run.',
  checkpoints: 'checkpoint.',
  diffs: 'diff.',
  queue: 'queue.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isErrorEvent(event: RealtimeEnvelope): boolean {
  if (event.type === 'run.error' || event.type === 'merge.conflict') {
    return true;
  }
  if (event.type === 'task.status.changed') {
    const payload = event.payload;
    if (isRecord(payload)) {
      const status = asString(payload.status);
      return status === 'failed';
    }
  }
  return false;
}

export function filterEvents(
  events: RealtimeEnvelope[],
  filter: TraceFilter,
): RealtimeEnvelope[] {
  if (filter === 'all') {
    return events;
  }
  if (filter === 'errors') {
    return events.filter(isErrorEvent);
  }
  const prefix = FILTER_PREFIX[filter];
  return events.filter((e) => (e.type as EventType).startsWith(prefix));
}
