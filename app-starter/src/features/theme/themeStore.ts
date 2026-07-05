import { create } from 'zustand';
import { tokens } from '@/theme/tokens';

type ColorTokens = { [K in keyof typeof tokens.color]: string };
type RadiusTokens = { [K in keyof typeof tokens.radius]: number };
type SpacingTokens = { [K in keyof typeof tokens.spacing]: number };
type FontSizeTokens = { [K in keyof typeof tokens.fontSize]: number };

export type ThemeOverrides = {
  color?: Partial<ColorTokens>;
  radius?: Partial<RadiusTokens>;
  spacing?: Partial<SpacingTokens>;
  fontSize?: Partial<FontSizeTokens>;
};

type TokenGroup = keyof ThemeOverrides;

type MergedTokens = {
  color: ColorTokens;
  radius: RadiusTokens;
  spacing: SpacingTokens;
  fontSize: FontSizeTokens;
};

type ThemeState = {
  overrides: ThemeOverrides;
  setOverride: <G extends TokenGroup, K extends keyof NonNullable<ThemeOverrides[G]>>(
    group: G,
    key: K,
    value: NonNullable<ThemeOverrides[G]>[K],
  ) => void;
  reset: () => void;
  loadFrom: (persisted: ThemeOverrides) => void;
};

export function selectMergedTokens(overrides: ThemeOverrides): MergedTokens {
  return {
    color: { ...tokens.color, ...overrides.color } as ColorTokens,
    radius: { ...tokens.radius, ...overrides.radius } as RadiusTokens,
    spacing: { ...tokens.spacing, ...overrides.spacing } as SpacingTokens,
    fontSize: { ...tokens.fontSize, ...overrides.fontSize } as FontSizeTokens,
  };
}

export const useThemeStore = create<ThemeState>((set) => ({
  overrides: {},
  setOverride: (group, key, value) =>
    set((state) => ({
      overrides: {
        ...state.overrides,
        [group]: { ...state.overrides[group], [key]: value },
      },
    })),
  reset: () => set({ overrides: {} }),
  loadFrom: (persisted) => set({ overrides: persisted }),
}));

export function useTheme(): MergedTokens {
  return selectMergedTokens(useThemeStore((s) => s.overrides));
}
