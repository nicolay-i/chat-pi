import type { ThemeOverrides } from './themeStore';

export const PRESET_DEFAULT: ThemeOverrides = {};

export const PRESET_WARM: ThemeOverrides = {
  color: {
    background: '#FBF4EC',
    surface: '#FFFFFF',
    primary: '#E07A3C',
    primaryPressed: '#C8651F',
    text: '#3A2A1A',
    danger: '#D64545',
  },
};

export const PRESET_DARK: ThemeOverrides = {
  color: {
    background: '#101317',
    surface: '#1B2127',
    surfaceMuted: '#222A31',
    text: '#E6ECF2',
    textMuted: '#8A95A1',
    primary: '#7B8CFF',
    primaryPressed: '#6477E6',
    border: '#2D3540',
    danger: '#FF6B6B',
  },
};

export const THEME_PRESETS: Array<{ id: string; label: string; overrides: ThemeOverrides }> = [
  { id: 'default', label: 'Default', overrides: PRESET_DEFAULT },
  { id: 'warm', label: 'Warm', overrides: PRESET_WARM },
  { id: 'dark', label: 'Dark', overrides: PRESET_DARK },
];
