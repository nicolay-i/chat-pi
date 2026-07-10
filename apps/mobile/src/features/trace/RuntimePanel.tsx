import { Text, View } from 'react-native';
import type { RealtimeEnvelope } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function latestByPrefix(events: RealtimeEnvelope[], prefix: string): RealtimeEnvelope | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (!e) continue;
    if (e.type.startsWith(prefix)) return e;
  }
  return null;
}

const RUN_LABEL: Record<string, string> = {
  'run.started': 'running',
  'run.completed': 'completed',
  'run.aborted': 'aborted',
  'run.error': 'error',
};

function deriveRuntime(events: RealtimeEnvelope[]): {
  runStatus: string | null;
  activeTool: string | null;
  queueLength: number | null;
} {
  const latestRun = latestByPrefix(events, 'run.');
  let runStatus: string | null = null;
  if (latestRun) {
    runStatus = RUN_LABEL[latestRun.type] ?? latestRun.type;
  }

  let activeTool: string | null = null;
  const toolStarted = latestByPrefix(events, 'tool.started');
  if (toolStarted) {
    const completed = events.some(
      (e, i) => i > events.indexOf(toolStarted) && e.type === 'tool.completed',
    );
    if (!completed) {
      const payload = toolStarted.payload;
      if (isRecord(payload)) {
        const name = asString(payload.name) ?? asString(payload.toolName);
        activeTool = name ?? 'tool';
      } else {
        activeTool = 'tool';
      }
    }
  }

  let queueLength: number | null = null;
  const queueEvent = latestByPrefix(events, 'queue.updated');
  if (queueEvent) {
    const payload = queueEvent.payload;
    if (isRecord(payload)) {
      const len = asNumber(payload.length) ?? asNumber(payload.size);
      if (len !== undefined) queueLength = len;
    }
  }

  return { runStatus, activeTool, queueLength };
}

export function RuntimePanel({ events }: { events: RealtimeEnvelope[] }) {
  const { runStatus, activeTool, queueLength } = deriveRuntime(events);
  const hasAny = runStatus !== null || activeTool !== null || queueLength !== null;

  if (!hasAny) {
    return (
      <View testID="trace.runtimePanel" style={styles.wrap}>
        <Text style={styles.title}>Runtime</Text>
        <Text style={styles.empty}>Нет событий выполнения</Text>
      </View>
    );
  }

  const runColor =
    runStatus === 'error'
      ? tokens.color.danger
      : runStatus === 'completed'
        ? tokens.color.successText
        : tokens.color.primary;

  return (
    <View testID="trace.runtimePanel" style={styles.wrap}>
      <Text style={styles.title}>Runtime</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Run</Text>
        <Text style={[styles.value, { color: runColor }]}>{runStatus ?? '—'}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Tool</Text>
        <Text style={styles.value}>{activeTool ?? '—'}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Queue</Text>
        <Text style={styles.value}>{queueLength !== null ? String(queueLength) : '—'}</Text>
      </View>
    </View>
  );
}

const styles = {
  wrap: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    marginBottom: tokens.spacing.sm,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  title: {
    color: tokens.color.text,
    fontWeight: '700' as const,
    fontSize: tokens.fontSize.md,
    marginBottom: tokens.spacing.xs,
  },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 2,
  },
  label: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
  },
  value: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.sm,
    fontWeight: '600' as const,
  },
  empty: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
  },
};
