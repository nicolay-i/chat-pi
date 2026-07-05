import type { ComponentType } from 'react';
import { Pressable, Text, View } from 'react-native';
import { tokens } from '@/theme/tokens';

export type QuickActionChipProps = {
  label: string;
  onPress?: () => void;
  icon?: ComponentType<{ size?: number; color?: string }>;
  disabled?: boolean;
};

export function QuickActionChip({ label, onPress, icon, disabled = false }: QuickActionChipProps) {
  const Icon = icon;
  const color = disabled ? tokens.color.textMuted : tokens.color.primary;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: tokens.color.surface,
        borderRadius: tokens.radius.pill,
        paddingHorizontal: 14,
        paddingVertical: 9,
        marginRight: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: disabled ? 0.5 : 1,
        borderWidth: 1,
        borderColor: tokens.color.border,
      }}
    >
      {Icon ? <Icon size={14} color={color} /> : null}
      <View accessible={false}>
        <Text style={{ color, fontSize: 12 }}>{label}</Text>
      </View>
    </Pressable>
  );
}
