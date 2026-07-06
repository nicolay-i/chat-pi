import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ApiClient } from '@/api/client';
import { tokens } from '@/theme/tokens';
import { useBackend } from '@/state/backendStore';
import { isValidHex, normalizeHex } from '@/features/theme/colorValidation';
import {
  selectMergedTokens,
  useThemeStore,
  type ThemeOverrides,
} from '@/features/theme/themeStore';
import { THEME_PRESETS } from '@/features/theme/presets';

const COLOR_KEYS: Array<keyof typeof tokens.color> = [
  'background',
  'surface',
  'primary',
  'primaryPressed',
  'text',
  'textMuted',
  'border',
  'danger',
];

const RADIUS_KEYS: Array<keyof typeof tokens.radius> = ['sm', 'md', 'lg', 'pill'];
const SPACING_KEYS: Array<keyof typeof tokens.spacing> = ['md', 'lg', 'xl'];
const FONTSIZE_KEYS: Array<keyof typeof tokens.fontSize> = ['sm', 'md', 'lg'];

export default function ThemeScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { baseUrl } = useBackend();
  const overrides = useThemeStore((s) => s.overrides);
  const setOverride = useThemeStore((s) => s.setOverride);
  const loadFrom = useThemeStore((s) => s.loadFrom);
  const reset = useThemeStore((s) => s.reset);

  const merged = selectMergedTokens(overrides);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [importDraft, setImportDraft] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const setDraft = (key: string, value: string): void => {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const commitColor = (key: keyof typeof tokens.color, raw: string): void => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`color.${String(key)}`];
        return next;
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[`color.${String(key)}`];
        return next;
      });
      return;
    }
    if (!isValidHex(trimmed)) {
      setErrors((prev) => ({ ...prev, [`color.${String(key)}`]: true }));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`color.${String(key)}`];
      return next;
    });
    setOverride('color', key, normalizeHex(trimmed));
  };

  const commitNumber = (
    group: 'radius' | 'spacing' | 'fontSize',
    key: string,
    raw: string,
  ): void => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setOverride(group, key as never, n as never);
  };

  const handleSave = (): void => {
    if (!baseUrl || !projectId) {
      setImportError(!projectId ? 'Missing project id' : 'Backend URL is not configured');
      return;
    }
    setImportError(null);
    const client = new ApiClient(baseUrl);
    client
      .saveTheme(projectId, overrides)
      .then(() => {
        setSaved(true);
      })
      .catch((err: unknown) => {
        setImportError(err instanceof Error ? err.message : String(err));
      });
  };

  const handleImport = (): void => {
    try {
      const parsed = JSON.parse(importDraft) as ThemeOverrides;
      loadFrom(parsed);
      setImportError(null);
      setImportDraft('');
    } catch (err: unknown) {
      setImportError(err instanceof Error ? `Invalid JSON: ${err.message}` : 'Invalid JSON');
    }
  };

  return (
    <ScrollView
      testID="theme.screen"
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <Text style={styles.title}>Theme Editor</Text>
      <Text style={styles.subtitle}>
        Accent changes update the live preview. Invalid colors are rejected.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Presets</Text>
        <View style={styles.row}>
          {THEME_PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              testID={`theme.preset.${preset.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Preset ${preset.label}`}
              style={styles.presetBtn}
              onPress={() => {
                if (preset.id === 'default') {
                  reset();
                } else {
                  loadFrom(preset.overrides);
                }
              }}
            >
              <Text style={styles.presetText}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Live Preview</Text>
        <View
          testID="theme.preview"
          style={[
            styles.preview,
            {
              backgroundColor: merged.color.background,
              borderRadius: merged.radius.lg,
              padding: merged.spacing.lg,
            },
          ]}
        >
          <View style={styles.previewBubbleRow}>
            <View
              testID="theme.preview.assistantBubble"
              style={[
                styles.bubbleAssistant,
                {
                  backgroundColor: merged.color.surface,
                  borderRadius: merged.radius.lg,
                  padding: merged.spacing.md,
                },
              ]}
            >
              <Text style={{ color: merged.color.text, fontSize: merged.fontSize.md }}>
                Assistant message
              </Text>
            </View>
          </View>
          <View style={styles.previewBubbleRowRight}>
            <View
              testID="theme.preview.userBubble"
              style={[
                styles.bubbleUser,
                {
                  backgroundColor: merged.color.primary,
                  borderRadius: merged.radius.pill,
                  padding: merged.spacing.md,
                },
              ]}
            >
              <Text style={{ color: '#FFFFFF', fontSize: merged.fontSize.md }}>
                User message
              </Text>
            </View>
          </View>
          <View style={styles.previewFooter}>
            <View
              testID="theme.preview.chip"
              style={[
                styles.chip,
                {
                  backgroundColor: merged.color.surfaceMuted,
                  borderRadius: merged.radius.pill,
                  paddingVertical: merged.spacing.xs,
                  paddingHorizontal: merged.spacing.md,
                },
              ]}
            >
              <Text style={{ color: merged.color.textMuted, fontSize: merged.fontSize.sm }}>
                chip
              </Text>
            </View>
            <View
              testID="theme.preview.sendButton"
              style={[
                styles.sendButton,
                {
                  backgroundColor: merged.color.primary,
                  borderRadius: merged.radius.pill,
                },
              ]}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Colors</Text>
        {COLOR_KEYS.map((key) => {
          const fieldKey = `color.${String(key)}`;
          const draftValue = drafts[fieldKey] ?? merged.color[key];
          const hasError = errors[fieldKey] === true;
          return (
            <View key={fieldKey} style={styles.fieldRow}>
              <View style={styles.fieldLabel}>
                <Text style={styles.fieldLabelText}>{String(key)}</Text>
                {hasError ? (
                  <Text testID={`theme.${fieldKey}.error`} style={styles.errorText}>
                    invalid hex
                  </Text>
                ) : null}
              </View>
              <View style={styles.fieldInputWrap}>
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: merged.color[key],
                      borderColor: merged.color.border,
                    },
                  ]}
                />
                <TextInput
                  testID={`theme.color.${String(key)}`}
                  style={[styles.input, hasError ? styles.inputError : null]}
                  value={draftValue}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onChangeText={(v) => {
                    setDraft(fieldKey, v);
                    commitColor(key, v);
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Radius</Text>
        {RADIUS_KEYS.map((key) => {
          const fieldKey = `radius.${String(key)}`;
          return (
            <View key={fieldKey} style={styles.fieldRow}>
              <Text style={styles.fieldLabelText}>{String(key)}</Text>
              <TextInput
                testID={`theme.radius.${String(key)}`}
                style={styles.input}
                keyboardType="numeric"
                value={String(merged.radius[key])}
                onChangeText={(v) => commitNumber('radius', String(key), v)}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Spacing</Text>
        {SPACING_KEYS.map((key) => {
          const fieldKey = `spacing.${String(key)}`;
          return (
            <View key={fieldKey} style={styles.fieldRow}>
              <Text style={styles.fieldLabelText}>{String(key)}</Text>
              <TextInput
                testID={`theme.spacing.${String(key)}`}
                style={styles.input}
                keyboardType="numeric"
                value={String(merged.spacing[key])}
                onChangeText={(v) => commitNumber('spacing', String(key), v)}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Font size</Text>
        {FONTSIZE_KEYS.map((key) => {
          const fieldKey = `fontSize.${String(key)}`;
          return (
            <View key={fieldKey} style={styles.fieldRow}>
              <Text style={styles.fieldLabelText}>{String(key)}</Text>
              <TextInput
                testID={`theme.fontSize.${String(key)}`}
                style={styles.input}
                keyboardType="numeric"
                value={String(merged.fontSize[key])}
                onChangeText={(v) => commitNumber('fontSize', String(key), v)}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Export / Import</Text>
        <View style={styles.row}>
          <Pressable
            testID="theme.export"
            accessibilityRole="button"
            accessibilityLabel="Export JSON"
            style={[styles.btn, styles.btnSecondary]}
            onPress={() => setExportOpen(true)}
          >
            <Text style={styles.btnSecondaryText}>Export JSON</Text>
          </Pressable>
        </View>
        <TextInput
          testID="theme.import.input"
          style={styles.importInput}
          placeholder='{"color":{"primary":"#E07A3C"}}'
          value={importDraft}
          multiline
          onChangeText={setImportDraft}
        />
        <Pressable
          testID="theme.import.apply"
          accessibilityRole="button"
          accessibilityLabel="Apply import"
          style={[styles.btn, styles.btnSecondary, { marginTop: 8 }]}
          onPress={handleImport}
        >
          <Text style={styles.btnSecondaryText}>Apply import</Text>
        </Pressable>
        {importError ? <Text style={styles.errorText}>{importError}</Text> : null}
      </View>

      <View style={styles.section}>
        <Pressable
          testID="theme.save"
          accessibilityRole="button"
          accessibilityLabel="Save theme"
          style={[styles.btn, styles.btnPrimary]}
          onPress={handleSave}
        >
          <Text style={styles.btnPrimaryText}>Save theme</Text>
        </Pressable>
        {saved ? (
          <Text testID="theme.saved" style={styles.savedText}>
            Сохранено
          </Text>
        ) : null}
      </View>

      <Modal
        visible={exportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExportOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionLabel}>Overrides JSON</Text>
            <Text testID="theme.export.json" style={styles.exportJson} selectable>
              {JSON.stringify(overrides, null, 2)}
            </Text>
            <Pressable
              testID="theme.export.close"
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={[styles.btn, styles.btnPrimary, { marginTop: 12 }]}
              onPress={() => setExportOpen(false)}
            >
              <Text style={styles.btnPrimaryText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: tokens.color.text,
  },
  subtitle: {
    marginTop: 8,
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
  },
  section: {
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: tokens.color.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  presetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    marginRight: 8,
  },
  presetText: {
    color: tokens.color.text,
    fontWeight: '700',
    fontSize: tokens.fontSize.sm,
  },
  preview: {
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  previewBubbleRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  previewBubbleRowRight: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  bubbleAssistant: {
    maxWidth: '80%',
  },
  bubbleUser: {
    maxWidth: '80%',
  },
  previewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  chip: {
    alignSelf: 'flex-start',
  },
  sendButton: {
    width: 36,
    height: 36,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  fieldLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldLabelText: {
    color: tokens.color.text,
    fontWeight: '600',
    fontSize: tokens.fontSize.sm,
  },
  fieldInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    marginRight: 8,
  },
  input: {
    minWidth: 90,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    color: tokens.color.text,
    fontSize: tokens.fontSize.sm,
  },
  inputError: {
    borderColor: tokens.color.danger,
  },
  errorText: {
    color: tokens.color.danger,
    fontSize: tokens.fontSize.xs,
    marginLeft: 8,
    fontWeight: '700',
  },
  importInput: {
    marginTop: 8,
    minHeight: 64,
    padding: 8,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    color: tokens.color.text,
    fontSize: tokens.fontSize.sm,
    textAlignVertical: 'top',
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.md,
    marginRight: 8,
  },
  btnPrimary: {
    backgroundColor: tokens.color.primary,
  },
  btnSecondary: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  btnSecondaryText: {
    color: tokens.color.text,
    fontWeight: '700',
  },
  savedText: {
    marginTop: 8,
    color: tokens.color.successText,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 16,
    width: '100%',
  },
  exportJson: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.xs,
    fontFamily: 'monospace',
  },
});
