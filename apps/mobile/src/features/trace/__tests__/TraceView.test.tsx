import { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { EventType, RealtimeEnvelope } from '@pi-agents/contracts';
import { TraceView } from '../TraceView';

function env(
  id: string,
  type: EventType,
  payload: unknown,
): RealtimeEnvelope {
  return {
    id,
    stream: 'chat',
    streamId: 'c1',
    type,
    payload,
    createdAt: '2026-01-01T10:00:00.000Z',
  };
}

const EVENTS: RealtimeEnvelope[] = [
  env('m1', 'message.created', { role: 'user' }),
  env('t1', 'tool.started', { name: 'edit_file' }),
  env('r1', 'run.started'),
];

describe('TraceView', () => {
  it('renders all filter chips', async () => {
    const { getByTestId } = await render(<TraceView events={EVENTS} />);
    expect(getByTestId('trace.filter.all')).toBeTruthy();
    expect(getByTestId('trace.filter.messages')).toBeTruthy();
    expect(getByTestId('trace.filter.tools')).toBeTruthy();
    expect(getByTestId('trace.filter.runs')).toBeTruthy();
    expect(getByTestId('trace.filter.checkpoints')).toBeTruthy();
    expect(getByTestId('trace.filter.diffs')).toBeTruthy();
    expect(getByTestId('trace.filter.errors')).toBeTruthy();
    expect(getByTestId('trace.filter.queue')).toBeTruthy();
  });

  it('shows message and tool rows by default (all filter)', async () => {
    const { getByTestId } = await render(<TraceView events={EVENTS} />);
    expect(getByTestId('trace.row.m1')).toBeTruthy();
    expect(getByTestId('trace.row.t1')).toBeTruthy();
    expect(getByTestId('trace.row.r1')).toBeTruthy();
  });

  it('hides message rows when Tools filter is selected', async () => {
    const { getByTestId, queryByTestId } = await render(<TraceView events={EVENTS} />);
    await act(async () => {
      fireEvent.press(getByTestId('trace.filter.tools'));
    });
    expect(queryByTestId('trace.row.m1')).toBeNull();
    expect(getByTestId('trace.row.t1')).toBeTruthy();
  });

  it('toggles raw JSON mode', async () => {
    const { getByTestId, queryByTestId } = await render(<TraceView events={EVENTS} />);
    expect(queryByTestId('trace.rawJson')).toBeNull();
    await act(async () => {
      fireEvent.press(getByTestId('trace.rawToggle'));
    });
    expect(getByTestId('trace.rawJson')).toBeTruthy();
  });

  it('shows a redacted secret in the expanded row JSON', async () => {
    const events: RealtimeEnvelope[] = [
      env('t2', 'tool.started', { name: 'edit_file', api_key: 'sk-xxx' }),
    ];
    const { getByTestId } = await render(<TraceView events={events} />);
    await act(async () => {
      fireEvent.press(getByTestId('trace.row.t2'));
    });
    const json = getByTestId('trace.expandedJson');
    const text = (json.props as { children?: string }).children ?? '';
    expect(text).toContain('<redacted>');
    expect(text).not.toContain('sk-xxx');
  });

  it('renders an empty hint when filter matches nothing', async () => {
    const { getByTestId, findByText } = await render(<TraceView events={EVENTS} />);
    await act(async () => {
      fireEvent.press(getByTestId('trace.filter.checkpoints'));
    });
    await findByText(/Нет событий/);
  });
});
