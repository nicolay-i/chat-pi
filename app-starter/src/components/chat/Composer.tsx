import { useState } from 'react';
import { ArrowUp, ChevronUp, Paperclip } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TaskStatus } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';
import {
  BEHAVIOR_OPTIONS,
  type BehaviorOption,
  type SendMessageBehavior,
  isBehaviorEnabled,
} from './composerRules';

export type ComposerProps = {
  value?: string;
  onValueChange?: (text: string) => void;
  onSend?: () => void;
  disabled?: boolean;
  behavior?: SendMessageBehavior;
  onBehaviorChange?: (behavior: SendMessageBehavior) => void;
  taskStatus?: TaskStatus | null;
};

const NO_TASK_HINT = 'нет активной задачи';

export function Composer({
  value,
  onValueChange,
  onSend,
  disabled,
  behavior,
  onBehaviorChange,
  taskStatus,
}: ComposerProps) {
  const [internal, setInternal] = useState('');
  const [modeOpen, setModeOpen] = useState(false);
  const controlled = onValueChange !== undefined;
  const current = controlled ? (value ?? '') : internal;

  // behavior is controlled when onBehaviorChange is provided; otherwise uncontrolled.
  const [internalBehavior, setInternalBehavior] = useState<SendMessageBehavior>('send');
  const behaviorControlled = behavior !== undefined && onBehaviorChange !== undefined;
  const activeBehavior: SendMessageBehavior = behaviorControlled ? behavior! : internalBehavior;

  const handleChange = (text: string) => {
    if (controlled) {
      onValueChange!(text);
    } else {
      setInternal(text);
    }
  };

  const selectBehavior = (next: SendMessageBehavior) => {
    if (behaviorControlled) {
      onBehaviorChange!(next);
    } else {
      setInternalBehavior(next);
    }
    setModeOpen(false);
  };

  const handleSend = () => {
    if (disabled) return;
    if (onSend) {
      onSend();
    } else {
      setInternal('');
    }
  };

  const behaviorEnabled = isBehaviorEnabled(activeBehavior, taskStatus ?? null);
  const canSend = !disabled && current.trim().length > 0 && behaviorEnabled;
  const activeOption: BehaviorOption =
    BEHAVIOR_OPTIONS.find((o) => o.behavior === activeBehavior) ?? BEHAVIOR_OPTIONS[0];

  return (
    <View style={{ flexDirection: 'column', gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10 }}>
        <Pressable accessibilityLabel="Прикрепить файл" style={{ padding: 8 }}>
          <Paperclip size={20} color={tokens.color.textMuted} />
        </Pressable>
        <TextInput
          accessibilityLabel="Сообщение"
          placeholder="Сообщение..."
          placeholderTextColor={tokens.color.textMuted}
          value={current}
          onChangeText={handleChange}
          style={{
            flex: 1,
            backgroundColor: tokens.color.surfaceMuted,
            borderRadius: tokens.radius.pill,
            paddingHorizontal: 18,
            paddingVertical: 12,
          }}
        />
        <Pressable
          accessibilityLabel="Выбрать режим отправки"
          accessibilityRole="button"
          testID="chat.composer.modeToggle"
          onPress={() => setModeOpen((v) => !v)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: tokens.color.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronUp size={20} color={tokens.color.text} />
        </Pressable>
        <Pressable
          accessibilityLabel={activeOption.accessibilityLabel}
          accessibilityRole="button"
          testID="chat.composer.send"
          onPress={handleSend}
          disabled={!canSend}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: canSend ? tokens.color.primary : tokens.color.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowUp size={22} color="#fff" />
        </Pressable>
      </View>

      <Modal
        visible={modeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModeOpen(false)}
      >
        <Pressable
          accessibilityLabel="Закрыть меню режимов"
          testID="chat.composer.modeBackdrop"
          onPress={() => setModeOpen(false)}
          style={styles.backdrop}
        >
          <Pressable
            accessibilityRole="menu"
            testID="chat.composer.modeSheet"
            style={styles.sheet}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.sheetTitle}>Режим отправки</Text>
            {BEHAVIOR_OPTIONS.map((option) => {
              const enabled = isBehaviorEnabled(option.behavior, taskStatus ?? null);
              const selected = option.behavior === activeBehavior;
              const showNoTaskHint = !enabled && (taskStatus === null || taskStatus === undefined);
              return (
                <Pressable
                  key={option.behavior}
                  accessibilityRole="menuitem"
                  accessibilityLabel={option.accessibilityLabel}
                  accessibilityState={{ selected, disabled: !enabled }}
                  testID={`chat.composer.mode.${option.behavior}`}
                  disabled={!enabled}
                  onPress={() => selectBehavior(option.behavior)}
                  style={[styles.option, selected ? styles.optionSelected : null]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionLabel, !enabled ? styles.optionMuted : null]}>
                      {option.label}
                    </Text>
                    <Text style={styles.optionHint}>
                      {showNoTaskHint ? NO_TASK_HINT : option.hint}
                    </Text>
                  </View>
                  {selected ? <Text style={styles.checkMark}>✓</Text> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    padding: 16,
    paddingBottom: 24,
  },
  sheetTitle: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionSelected: {
    backgroundColor: tokens.color.surfaceMuted,
  },
  optionLabel: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    fontWeight: '600',
  },
  optionMuted: {
    color: tokens.color.textMuted,
  },
  optionHint: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.xs,
    marginTop: 2,
  },
  checkMark: {
    color: tokens.color.primary,
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
    marginLeft: 8,
  },
});
