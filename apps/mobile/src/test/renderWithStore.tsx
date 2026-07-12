import { render as renderNative, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { RootStoreProvider } from '@/providers/RootStoreProvider';
import type { RootStore } from '@/stores/rootStore';
import { getTestRootStore } from './rootStoreHarness';

type RenderWithStoreOptions = RenderOptions & {
  store?: RootStore;
};

export function renderWithStore(
  ui: ReactElement,
  { store = getTestRootStore(), wrapper: OuterWrapper, ...options }: RenderWithStoreOptions = {},
) {
  const wrapper = ({ children }: { children: ReactNode }) => {
    const content = <RootStoreProvider store={store}>{children}</RootStoreProvider>;
    return OuterWrapper ? <OuterWrapper>{content}</OuterWrapper> : content;
  };
  return renderNative(ui, { ...options, wrapper });
}
