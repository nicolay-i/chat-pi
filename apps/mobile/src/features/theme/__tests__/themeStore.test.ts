import { tokens } from '@/theme/tokens';
import {
  selectMergedTokens,
  useThemeStore,
  type ThemeOverrides,
} from '../themeStore';

describe('themeStore', () => {
  afterEach(() => {
    useThemeStore.getState().reset();
  });

  it('selectMergedTokens returns base tokens when overrides are empty', () => {
    const merged = selectMergedTokens({});
    expect(merged.color.primary).toBe(tokens.color.primary);
    expect(merged.radius.md).toBe(tokens.radius.md);
  });

  it('selectMergedTokens deep-merges: overriding primary keeps other colors', () => {
    const overrides: ThemeOverrides = { color: { primary: '#FF0000' } };
    const merged = selectMergedTokens(overrides);
    expect(merged.color.primary).toBe('#FF0000');
    expect(merged.color.background).toBe(tokens.color.background);
    expect(merged.color.surface).toBe(tokens.color.surface);
    expect(merged.color.danger).toBe(tokens.color.danger);
  });

  it('selectMergedTokens merges radius/spacing/fontSize groups independently', () => {
    const merged = selectMergedTokens({
      radius: { md: 24 },
      spacing: { lg: 32 },
      fontSize: { md: 18 },
    });
    expect(merged.radius.md).toBe(24);
    expect(merged.radius.sm).toBe(tokens.radius.sm);
    expect(merged.spacing.lg).toBe(32);
    expect(merged.fontSize.md).toBe(18);
  });

  it('setOverride updates a single key within a group', () => {
    const { setOverride } = useThemeStore.getState();
    setOverride('color', 'primary', '#00FF00');
    const state = useThemeStore.getState();
    expect(state.overrides.color?.primary).toBe('#00FF00');
    expect(selectMergedTokens(state.overrides).color.primary).toBe('#00FF00');
  });

  it('loadFrom replaces overrides wholesale and reset clears them', () => {
    useThemeStore.getState().loadFrom({ color: { danger: '#112233' } });
    expect(useThemeStore.getState().overrides.color?.danger).toBe('#112233');
    useThemeStore.getState().reset();
    expect(useThemeStore.getState().overrides).toEqual({});
  });
});
