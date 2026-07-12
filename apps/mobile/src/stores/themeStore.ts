import { makeAutoObservable } from 'mobx';
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

export type MergedTokens = {
  color: ColorTokens;
  radius: RadiusTokens;
  spacing: SpacingTokens;
  fontSize: FontSizeTokens;
};

export function selectMergedTokens(overrides: ThemeOverrides): MergedTokens {
  return {
    color: { ...tokens.color, ...overrides.color } as ColorTokens,
    radius: { ...tokens.radius, ...overrides.radius } as RadiusTokens,
    spacing: { ...tokens.spacing, ...overrides.spacing } as SpacingTokens,
    fontSize: { ...tokens.fontSize, ...overrides.fontSize } as FontSizeTokens,
  };
}

export class ThemeStore {
  overrides: ThemeOverrides = {};

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setOverride<G extends TokenGroup, K extends keyof NonNullable<ThemeOverrides[G]>>(
    group: G,
    key: K,
    value: NonNullable<ThemeOverrides[G]>[K],
  ): void {
    this.overrides = {
      ...this.overrides,
      [group]: { ...this.overrides[group], [key]: value },
    };
  }

  reset(): void {
    this.overrides = {};
  }

  loadFrom(persisted: ThemeOverrides): void {
    this.overrides = persisted;
  }
}
