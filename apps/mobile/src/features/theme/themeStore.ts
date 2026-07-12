import { useRootStore } from '@/providers/RootStoreProvider';
import { selectMergedTokens, type MergedTokens } from '@/stores/themeStore';
import { useMobxSnapshot } from '@/stores/useMobxSnapshot';

export {
  selectMergedTokens,
  type MergedTokens,
  type ThemeOverrides,
} from '@/stores/themeStore';

export type ThemeView = MergedTokens & {
  overrides: import('@/stores/themeStore').ThemeOverrides;
  setOverride: import('@/stores/themeStore').ThemeStore['setOverride'];
  loadFrom: import('@/stores/themeStore').ThemeStore['loadFrom'];
  reset: import('@/stores/themeStore').ThemeStore['reset'];
};

export function useTheme(): ThemeView {
  const store = useRootStore();
  return useMobxSnapshot(() => ({
    ...selectMergedTokens(store.theme.overrides),
    overrides: store.theme.overrides,
    setOverride: store.theme.setOverride,
    loadFrom: store.theme.loadFrom,
    reset: store.theme.reset,
  }));
}
