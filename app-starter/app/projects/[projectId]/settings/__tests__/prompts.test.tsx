import { fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ projectId: 'project-demo' })),
}));

const editorParams = { projectId: 'project-demo', templateId: 'tpl-greet' };

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import { router } from 'expo-router';
import PromptsScreen from '../prompts';
import PromptEditorScreen from '../prompts/[templateId]';

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

function setEditorParams(templateId: string): void {
  const mock = require('expo-router').useLocalSearchParams as ReturnType<typeof jest.fn>;
  mock.mockImplementation(() => ({ projectId: 'project-demo', templateId }));
}

describe('PromptsScreen (list)', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('renders prompt templates grouped by mode', async () => {
    configureBackend('https://backend.example');
    setFetch(
      jest.fn(async () =>
        jsonRes([
          {
            id: 'tpl-greet',
            name: 'Greeting',
            mode: 'discussion',
            body: 'Hello {name}',
            variables: ['name'],
          },
        ]),
      ),
    );

    const { findByTestId, getByText } = await render(<PromptsScreen />);
    expect(await findByTestId('prompts.list')).toBeTruthy();
    expect(await findByTestId('prompts.item.tpl-greet')).toBeTruthy();
    expect(getByText('Greeting')).toBeTruthy();
    expect(getByText('1 vars')).toBeTruthy();
  });

  it('tapping a prompt opens the editor', async () => {
    configureBackend('https://backend.example');
    setFetch(
      jest.fn(async () =>
        jsonRes([
          { id: 'tpl-greet', name: 'Greeting', mode: 'discussion', body: 'Hi', variables: [] },
        ]),
      ),
    );

    const { findByTestId } = await render(<PromptsScreen />);
    const row = await findByTestId('prompts.item.tpl-greet');
    fireEvent.press(row);
    expect(router.push).toHaveBeenCalledWith('./prompts/tpl-greet');
  });
});

describe('PromptEditorScreen (preview)', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
    setEditorParams('tpl-greet');
  });

  it('substitutes {variable} with <variable> in the preview', async () => {
    setEditorParams('tpl-greet');
    configureBackend('https://backend.example');
    setFetch(
      jest.fn(async () =>
        jsonRes([
          {
            id: 'tpl-greet',
            name: 'Greeting',
            mode: 'discussion',
            body: 'Hello {name}, welcome.',
            variables: ['name'],
          },
        ]),
      ),
    );

    const { findByTestId, getByText } = await render(<PromptEditorScreen />);
    expect(await findByTestId('promptEditor.preview')).toBeTruthy();
    expect(getByText('Hello <name>, welcome.')).toBeTruthy();
  });
});

// keep editorParams referenced for clarity of intent
void editorParams;
