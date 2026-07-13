import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { observer } from 'mobx-react-lite';
import type { Capabilities, RealtimeEnvelope, Task } from '@pi-agents/contracts';
import { RootStoreProvider, useRootStore } from '@/providers/RootStoreProvider';
import { ChatScreen } from '@/features/chat/ChatScreen';
import { createRootStore } from '../rootStore';
import { TaskStore } from '../taskStore';

const capabilities: Capabilities = {
  apiVersion: '1.0.0',
  piAvailable: true,
  gitAvailable: true,
  supportsWorktrees: true,
  supportsSse: true,
  supportsWebSocket: false,
  supportsVscodeWeb: false,
  supportsIgnis: false,
};

function task(status: Task['status'] = 'queued'): Task {
  return {
    id: 'task-1',
    projectId: 'project-1',
    title: 'Review changes',
    mode: 'coding',
    status,
    branchName: 'task/task-1',
    worktreePath: 'C:/repo/.worktrees/task-1',
    changedFiles: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function envelope(sequence: number, text: string): RealtimeEnvelope {
  return {
    id: `event-${sequence}`,
    sequence,
    stream: 'chat',
    streamId: 'chat-1',
    type: 'message.created',
    payload: {
      chatId: 'chat-1',
      id: `message-${sequence}`,
      role: 'assistant',
      text,
      createdAt: '2026-01-01T00:00:00.000Z',
      complete: true,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const BackendStatusProbe = observer(function BackendStatusProbe() {
  const { backend } = useRootStore();
  return <Text testID="mobx.backendStatus">{backend.status}</Text>;
});

const MergeStateProbe = observer(function MergeStateProbe({ store }: { store: TaskStore }) {
  return <Text testID="mobx.canMerge">{store.canMerge ? 'merge' : 'wait'}</Text>;
});

describe('real MobX integration', () => {
  it('rerenders observer components and recalculates computed task permissions', async () => {
    const root = createRootStore();
    const taskStore = new TaskStore('task-1', task('queued'));
    const screen = await render(
      <RootStoreProvider store={root}>
        <BackendStatusProbe />
        <MergeStateProbe store={taskStore} />
      </RootStoreProvider>,
    );

    expect(screen.getByTestId('mobx.backendStatus').props.children).toBe('idle');
    expect(screen.getByTestId('mobx.canMerge').props.children).toBe('wait');

    await act(async () => {
      root.backend.setStatus('connected');
      taskStore.applyTask(task('needs_review'));
    });

    expect(screen.getByTestId('mobx.backendStatus').props.children).toBe('connected');
    expect(screen.getByTestId('mobx.canMerge').props.children).toBe('merge');
  });

  it('commits asynchronous backend state through the MobX action boundary', async () => {
    let finishHealth!: () => void;
    const health = new Promise<void>((resolve) => { finishHealth = resolve; });
    const root = createRootStore({
      apiClientFactory: (() => ({
        getHealth: () => health,
        getCapabilities: async () => capabilities,
      })) as never,
      storage: { load: async () => null, save: async () => undefined, clear: async () => undefined },
    });

    const connection = root.backend.connect('https://backend.example');
    expect(root.backend.status).toBe('checking');
    finishHealth();
    await connection;

    expect(root.backend.status).toBe('connected');
    expect(root.backend.capabilities).toEqual(capabilities);
  });

  it('applies SSE events to an observer and stops accepting them after unmount', async () => {
    let realtimeOptions: { onEvent: (event: RealtimeEnvelope) => void } | null = null;
    const stop = jest.fn();
    const root = createRootStore({
      realtimeFactory: (options) => {
        realtimeOptions = options;
        return { start: jest.fn(), stop };
      },
      storage: { load: async () => 'https://backend.example', save: async () => undefined, clear: async () => undefined },
    });
    root.backend.setBaseUrl('https://backend.example');
    const chat = root.chats.getOrCreate('chat-1');
    const screen = await render(
      <RootStoreProvider store={root}>
        <ChatScreen chatId="chat-1" />
      </RootStoreProvider>,
    );

    await waitFor(() => expect(realtimeOptions).not.toBeNull());
    await act(async () => realtimeOptions?.onEvent(envelope(1, 'SSE update')));
    expect(screen.getByText('SSE update')).toBeTruthy();

    await act(async () => screen.unmount());
    expect(stop).toHaveBeenCalledTimes(1);
    await act(async () => realtimeOptions?.onEvent(envelope(2, 'Ignored after close')));
    expect(chat.messages).toHaveLength(1);
  });
});
