import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { RealtimeEnvelope } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';
import { redactSecrets } from './redaction';
import { filterEvents, TRACE_FILTERS, type TraceFilter } from './traceFilters';

type Category = 'message' | 'tool' | 'run' | 'checkpoint' | 'diff' | 'queue' | 'task' | 'merge' | 'package' | 'provider' | 'other';

function categoryOf(type: string): Category {
  if (type.startsWith('message.')) return 'message';
  if (type.startsWith('tool.')) return 'tool';
  if (type.startsWith('run.')) return 'run';
  if (type.startsWith('checkpoint.')) return 'checkpoint';
  if (type.startsWith('diff.')) return 'diff';
  if (type.startsWith('queue.')) return 'queue';
  if (type.startsWith('task.')) return 'task';
  if (type.startsWith('merge.')) return 'merge';
  if (type.startsWith('package.')) return 'package';
  if (type.startsWith('provider.')) return 'provider';
  return 'other';
}

const CATEGORY_COLOR: Record<Category, string> = {
  message: '#2563EB',
  tool: '#7C3AED',
  run: '#0891B2',
  checkpoint: '#16A34A',
  diff: '#DB2777',
  queue: '#EA580C',
  task: '#9333EA',
  merge: '#0EA5E9',
  package: '#65A30D',
  provider: '#475569',
  other: tokens.color.textMuted,
};

const FILTER_LABEL: Record<TraceFilter, string> = {
  all: 'All',
  messages: 'Messages',
  tools: 'Tools',
  runs: 'Runs',
  checkpoints: 'Checkpoints',
  diffs: 'Diffs',
  errors: 'Errors',
  queue: 'Queue',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function shortTime(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(iso);
  return m ? m[2] ?? iso : iso;
}

function summarize(event: RealtimeEnvelope): string {
  const payload = event.payload;
  switch (event.type) {
    case 'tool.started':
    case 'tool.output':
    case 'tool.completed': {
      if (isRecord(payload)) {
        const name = asString(payload.name) ?? asString(payload.toolName);
        if (name) return name;
      }
      return event.type;
    }
    case 'message.created': {
      if (isRecord(payload)) {
        const role = asString(payload.role);
        if (role) return `role: ${role}`;
      }
      return event.type;
    }
    case 'message.delta':
      return 'delta';
    case 'message.completed':
      return 'completed';
    case 'run.started':
    case 'run.completed':
    case 'run.aborted':
    case 'run.error':
      return event.type.replace('run.', '');
    case 'queue.updated':
      return 'queue';
    default:
      return event.type;
  }
}

function FilterChip({
  filter,
  active,
  onPress,
}: {
  filter: TraceFilter;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={`trace.filter.${filter}`}
      accessibilityRole="button"
      accessibilityLabel={`Filter ${FILTER_LABEL[filter]}`}
      onPress={onPress}
      style={{
        backgroundColor: active ? tokens.color.primary : tokens.color.surface,
        borderWidth: 1,
        borderColor: active ? tokens.color.primary : tokens.color.border,
        borderRadius: tokens.radius.pill,
        paddingVertical: 4,
        paddingHorizontal: 10,
        marginRight: 6,
      }}
    >
      <Text
        style={{
          color: active ? '#fff' : tokens.color.text,
          fontSize: tokens.fontSize.xs,
          fontWeight: '600',
        }}
      >
        {FILTER_LABEL[filter]}
      </Text>
    </Pressable>
  );
}

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: RealtimeEnvelope;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cat = categoryOf(event.type);
  const color = CATEGORY_COLOR[cat];
  const redacted = useMemo(() => redactSecrets(event.payload), [event.payload]);
  const json = useMemo(() => {
    try {
      return JSON.stringify(redacted, null, 2);
    } catch {
      return String(redacted);
    }
  }, [redacted]);

  return (
    <Pressable
      testID={`trace.row.${event.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Trace event ${event.type}`}
      onPress={onToggle}
      style={{
        backgroundColor: tokens.color.surface,
        borderWidth: 1,
        borderColor: tokens.color.border,
        borderRadius: tokens.radius.sm,
        padding: tokens.spacing.sm,
        marginBottom: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, fontFamily: 'monospace' }}>
          {shortTime(event.createdAt)}
        </Text>
        <View
          style={{
            backgroundColor: `${color}22`,
            borderRadius: tokens.radius.pill,
            paddingVertical: 2,
            paddingHorizontal: 8,
            marginLeft: 8,
          }}
        >
          <Text style={{ color, fontSize: tokens.fontSize.xs, fontWeight: '700' }}>{event.type}</Text>
        </View>
        <Text
          numberOfLines={1}
          style={{
            color: tokens.color.text,
            fontSize: tokens.fontSize.sm,
            marginLeft: 8,
            flexShrink: 1,
          }}
        >
          {summarize(event)}
        </Text>
      </View>
      {expanded ? (
        <Text
          testID="trace.expandedJson"
          style={{
            color: tokens.color.text,
            fontSize: tokens.fontSize.xs,
            fontFamily: 'monospace',
            marginTop: 6,
            backgroundColor: tokens.color.surfaceMuted,
            borderRadius: 6,
            padding: 8,
          }}
        >
          {json}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function TraceView({ events }: { events: RealtimeEnvelope[] }) {
  const [filter, setFilter] = useState<TraceFilter>('all');
  const [rawMode, setRawMode] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => filterEvents(events, filter), [events, filter]);
  const rawJson = useMemo(() => {
    const redacted = events.map((e) => ({ ...e, payload: redactSecrets(e.payload) }));
    try {
      return JSON.stringify(redacted, null, 2);
    } catch {
      return String(redacted);
    }
  }, [events]);

  return (
    <View testID="trace.list" style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
        {TRACE_FILTERS.map((f) => (
          <FilterChip
            key={f}
            filter={f}
            active={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      <Pressable
        testID="trace.rawToggle"
        accessibilityRole="button"
        accessibilityLabel={`Raw JSON ${rawMode ? 'on' : 'off'}`}
        onPress={() => setRawMode((v) => !v)}
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: rawMode ? tokens.color.primary : tokens.color.surface,
          borderWidth: 1,
          borderColor: rawMode ? tokens.color.primary : tokens.color.border,
          borderRadius: tokens.radius.pill,
          paddingVertical: 4,
          paddingHorizontal: 10,
          marginBottom: 8,
        }}
      >
        <Text style={{ color: rawMode ? '#fff' : tokens.color.text, fontSize: tokens.fontSize.xs, fontWeight: '600' }}>
          Raw JSON {rawMode ? 'ON' : 'OFF'}
        </Text>
      </Pressable>

      {rawMode ? (
        <ScrollView style={{ flex: 1 }}>
          <Text
            testID="trace.rawJson"
            style={{
              color: tokens.color.text,
              fontSize: tokens.fontSize.xs,
              fontFamily: 'monospace',
              backgroundColor: tokens.color.surfaceMuted,
              borderRadius: 6,
              padding: 8,
            }}
          >
            {rawJson}
          </Text>
        </ScrollView>
      ) : filtered.length === 0 ? (
        <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, padding: 8 }}>
          Нет событий для этого фильтра.
        </Text>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {filtered.map((e) => (
            <EventRow
              key={e.id}
              event={e}
              expanded={expandedId === e.id}
              onToggle={() => setExpandedId((cur) => (cur === e.id ? null : e.id))}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
