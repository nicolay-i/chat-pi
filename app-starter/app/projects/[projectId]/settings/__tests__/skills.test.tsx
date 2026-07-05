import { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ projectId: 'project-demo' })),
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import { router } from 'expo-router';
import SkillsScreen from '../skills';

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const originalFetch = globalThis.fetch;

const setFetch = (fn: FetchImpl): void => {
  (globalThis as { fetch: FetchImpl }).fetch = fn;
};

const restoreFetch = (): void => {
  (globalThis as { fetch: FetchImpl }).fetch = originalFetch;
};

const jsonRes = (body: unknown): Response =>
  ({ ok: true, json: async () => body }) as unknown as Response;

function configureBackend(url: string): void {
  const mod = require('@/state/backendStore') as typeof import('@/state/backendStore');
  mod.backendActions.setBaseUrl(url);
}

describe('SkillsScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('falls back to local .agents skills when fetch fails', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(() => Promise.reject(new Error('network down'))));

    const { findByTestId } = await render(<SkillsScreen />);
    expect(await findByTestId('skills.list')).toBeTruthy();
    expect(await findByTestId('skills.item.update-implementation-state')).toBeTruthy();
    expect(await findByTestId('skills.item.verify-subagent-output')).toBeTruthy();
  });

  it('toggling a skill updates its enabled state', async () => {
    configureBackend('https://backend.example');
    setFetch(
      jest.fn(async () =>
        jsonRes([
          {
            id: 'verify-subagent-output',
            name: 'Verify Subagent Output',
            description: 'desc',
            source: 'project',
            enabled: true,
            path: '.agents/skills/verify-subagent-output/SKILL.md',
          },
        ]),
      ),
    );

    const { findByTestId } = await render(<SkillsScreen />);
    const toggle = await findByTestId('skills.toggle.verify-subagent-output');
    expect(toggle.props.value).toBe(true);

    await act(async () => {
      fireEvent(toggle, 'valueChange', false);
    });

    const updated = await findByTestId('skills.toggle.verify-subagent-output');
    expect(updated.props.value).toBe(false);
  });

  it('tapping a skill name opens the editor', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(() => Promise.reject(new Error('offline'))));

    const { findByTestId } = await render(<SkillsScreen />);
    const row = await findByTestId('skills.item.update-implementation-state');

    await act(async () => {
      fireEvent.press(row);
    });

    expect(router.push).toHaveBeenCalledWith('./skills/update-implementation-state');
  });
});
