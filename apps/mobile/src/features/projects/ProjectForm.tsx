import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { tokens } from '@/theme/tokens';
import type { CreateProjectInput, ValidateRepoResult } from '@pi-agents/contracts';
import { validateRepoInputLocally } from './validateRepo';

export type ProjectFormValues = {
  name: string;
  repoPath: string;
  defaultBranch: string;
  agentsDir: string;
  ignisUrl: string;
  initGitIfMissing: boolean;
  scanVault: boolean;
};

export const DEFAULT_PROJECT_FORM_VALUES: ProjectFormValues = {
  name: '',
  repoPath: '',
  defaultBranch: 'main',
  agentsDir: '.agents',
  ignisUrl: '',
  initGitIfMissing: false,
  scanVault: false,
};

type ProjectFormProps = {
  initialValues?: Partial<ProjectFormValues>;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (values: CreateProjectInput) => void | Promise<void>;
};

const labelStyle = {
  fontSize: tokens.fontSize.sm,
  fontWeight: '700' as const,
  color: tokens.color.textMuted,
  marginBottom: 4,
  marginTop: 12,
};

const inputStyle = {
  borderWidth: 1,
  borderColor: tokens.color.border,
  borderRadius: tokens.radius.sm,
  paddingVertical: 8,
  paddingHorizontal: 12,
  backgroundColor: tokens.color.surface,
  color: tokens.color.text,
  fontSize: tokens.fontSize.md,
};

const cardStyle = {
  backgroundColor: tokens.color.surface,
  borderRadius: tokens.radius.lg,
  padding: 16,
  marginTop: 12,
};

export function ProjectForm({ initialValues, submitLabel, busy, onSubmit }: ProjectFormProps) {
  const [values, setValues] = useState<ProjectFormValues>({
    ...DEFAULT_PROJECT_FORM_VALUES,
    ...initialValues,
  });
  const [validation, setValidation] = useState<ValidateRepoResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canSave = validation?.valid === true && !submitting && !busy;

  const updateRepoPath = (repoPath: string) => {
    setValues((current) => ({ ...current, repoPath }));
    setValidation(null);
  };

  const updateDefaultBranch = (defaultBranch: string) => {
    setValues((current) => ({ ...current, defaultBranch }));
    setValidation(null);
  };

  const handleValidate = () => {
    setFormError(null);
    setValidating(true);
    try {
      const result = validateRepoInputLocally({
        repoPath: values.repoPath,
        defaultBranch: values.defaultBranch,
      });
      setValidation(result);
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const payload: CreateProjectInput = {
        name: values.name.trim(),
        repoPath: values.repoPath.trim(),
        defaultBranch: values.defaultBranch.trim(),
        agentsDir: values.agentsDir.trim() || undefined,
        ignisUrl: values.ignisUrl.trim() || undefined,
        initGitIfMissing: values.initGitIfMissing,
        scanVault: values.scanVault,
      };
      await onSubmit(payload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      testID="project.form"
      style={{ flex: 1, backgroundColor: tokens.color.background }}
      contentContainerStyle={{ padding: 16 }}
    >
      <View style={cardStyle}>
        <Text style={labelStyle}>Project name</Text>
        <TextInput
          testID="project.name"
          accessibilityLabel="Project name"
          style={inputStyle}
          value={values.name}
          onChangeText={(v) => setValues((s) => ({ ...s, name: v }))}
          placeholder="My workspace"
          placeholderTextColor={tokens.color.textMuted}
        />

        <Text style={labelStyle}>Repo path on VPS</Text>
        <TextInput
          testID="project.repoPath"
          accessibilityLabel="Repository path"
          style={inputStyle}
          value={values.repoPath}
          onChangeText={updateRepoPath}
          placeholder="/var/lib/agents/projects/my/repo"
          placeholderTextColor={tokens.color.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={labelStyle}>Default branch</Text>
        <TextInput
          testID="project.defaultBranch"
          accessibilityLabel="Default branch"
          style={inputStyle}
          value={values.defaultBranch}
          onChangeText={updateDefaultBranch}
          placeholder="main"
          placeholderTextColor={tokens.color.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={labelStyle}>.agents directory</Text>
        <TextInput
          testID="project.agentsDir"
          accessibilityLabel="Agents directory"
          style={inputStyle}
          value={values.agentsDir}
          onChangeText={(v) => setValues((s) => ({ ...s, agentsDir: v }))}
          placeholder=".agents"
          placeholderTextColor={tokens.color.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={labelStyle}>Ignis URL on Tailnet</Text>
        <TextInput
          testID="project.ignisUrl"
          accessibilityLabel="Ignis URL"
          style={inputStyle}
          value={values.ignisUrl}
          onChangeText={(v) => setValues((s) => ({ ...s, ignisUrl: v }))}
          placeholder="https://ignis.example.ts.net"
          placeholderTextColor={tokens.color.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }]}>
          <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.md }}>Initialize git if missing</Text>
          <Switch
            testID="project.initGitIfMissing"
            accessibilityLabel="Initialize git if missing"
            value={values.initGitIfMissing}
            onValueChange={(v) => setValues((s) => ({ ...s, initGitIfMissing: v }))}
          />
        </View>

        <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }]}>
          <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.md }}>Scan Markdown vault</Text>
          <Switch
            testID="project.scanVault"
            accessibilityLabel="Scan Markdown vault"
            value={values.scanVault}
            onValueChange={(v) => setValues((s) => ({ ...s, scanVault: v }))}
          />
        </View>
      </View>

      <Pressable
        testID="project.validate"
        accessibilityLabel="Validate repository"
        onPress={handleValidate}
        style={{
          marginTop: 12,
          paddingVertical: 12,
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: tokens.color.primary,
          alignItems: 'center',
          backgroundColor: tokens.color.surface,
        }}
      >
        {validating ? (
          <ActivityIndicator color={tokens.color.primary} />
        ) : (
          <Text style={{ color: tokens.color.primary, fontWeight: '700' }}>Validate repo</Text>
        )}
      </Pressable>

      {validation ? (
        <View
          testID="project.validationResult"
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: tokens.radius.md,
            backgroundColor: validation.valid ? tokens.color.successBg : tokens.color.surfaceMuted,
          }}
        >
          <Text style={{ color: validation.valid ? tokens.color.successText : tokens.color.danger, fontWeight: '700' }}>
            {validation.valid ? 'Repository is valid' : 'Repository is invalid'}
          </Text>
          {validation.branch ? (
            <Text style={{ color: tokens.color.textMuted, marginTop: 4 }}>Branch: {validation.branch}</Text>
          ) : null}
          {validation.error ? (
            <Text style={{ color: tokens.color.danger, marginTop: 4 }}>{validation.error}</Text>
          ) : null}
        </View>
      ) : null}

      {formError ? (
        <Text testID="project.formError" style={{ color: tokens.color.danger, marginTop: 12 }}>
          {formError}
        </Text>
      ) : null}

      <Pressable
        testID="project.save"
        accessibilityLabel={submitLabel}
        disabled={!canSave}
        onPress={handleSave}
        style={{
          marginTop: 16,
          paddingVertical: 14,
          borderRadius: tokens.radius.md,
          alignItems: 'center',
          backgroundColor: canSave ? tokens.color.primary : tokens.color.surfaceMuted,
          opacity: canSave ? 1 : 0.6,
        }}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={{ color: canSave ? '#FFFFFF' : tokens.color.textMuted, fontWeight: '700' }}>{submitLabel}</Text>
        )}
      </Pressable>

      {!validation?.valid ? (
        <Text style={{ color: tokens.color.textMuted, marginTop: 8, textAlign: 'center', fontSize: tokens.fontSize.sm }}>
          Validate the repository before saving.
        </Text>
      ) : null}
    </ScrollView>
  );
}
