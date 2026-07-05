import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { CreateChatInput, RunMode } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';
import { ApiClient } from '@/api/client';
import { useBackend } from '@/state/backendStore';

type ModeCard = {
  key: RunMode;
  label: string;
  description: string;
};

const MODE_CARDS: ReadonlyArray<ModeCard> = [
  { key: 'discussion', label: 'Discussion', description: 'Free-flow conversation. No writes to the repo.' },
  { key: 'planning', label: 'Planning', description: 'Plan only. Produces a plan, no write actions.' },
  { key: 'implementation', label: 'Implementation', description: 'Writable task with its own worktree branch.' },
  { key: 'orchestration', label: 'Orchestration', description: 'Multi-agent orchestration across subtasks.' },
];

const inputStyle = {
  borderWidth: 1,
  borderColor: tokens.color.border,
  borderRadius: tokens.radius.md,
  paddingVertical: 8,
  paddingHorizontal: 12,
  backgroundColor: tokens.color.surface,
  color: tokens.color.text,
};

const labelStyle = {
  fontSize: tokens.fontSize.sm,
  fontWeight: '700' as const,
  color: tokens.color.textMuted,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
  marginBottom: 6,
};

export default function NewChatScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { baseUrl } = useBackend();

  const [mode, setMode] = useState<RunMode | null>(null);
  const [modelId, setModelId] = useState('');
  const [promptTemplateId, setPromptTemplateId] = useState('');
  const [toolProfileId, setToolProfileId] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [createTask, setCreateTask] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = mode !== null && !submitting;
  const showCreateTaskToggle = mode === 'implementation';

  const handleCreate = async () => {
    if (!mode) return;
    if (!baseUrl) {
      setError('Backend URL is not configured');
      return;
    }
    const payload: CreateChatInput = {
      mode,
      ...(initialPrompt.trim() ? { title: initialPrompt.trim() } : {}),
      ...(modelId.trim() ? { modelId: modelId.trim() } : {}),
      ...(promptTemplateId.trim() ? { promptTemplateId: promptTemplateId.trim() } : {}),
      ...(toolProfileId.trim() ? { toolProfileId: toolProfileId.trim() } : {}),
      ...(showCreateTaskToggle && createTask ? { createTask: true } : {}),
    };
    setSubmitting(true);
    setError(null);
    try {
      const client = new ApiClient(baseUrl);
      const created = await client.createChat(projectId, payload);
      router.replace(`/projects/${projectId}/chats/${created.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setSubmitting(false);
    }
  };

  const switchCreateTask = () => setCreateTask((v) => !v);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: tokens.color.background }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: tokens.color.text }}>New chat</Text>
      <Text style={{ color: tokens.color.textMuted, marginTop: 4 }}>Pick a run mode and configure the session.</Text>

      <Text style={{ ...labelStyle, marginTop: 16 }}>Mode</Text>
      <View>
        {MODE_CARDS.map((card) => {
          const selected = card.key === mode;
          return (
            <Pressable
              key={card.key}
              testID={`newchat.mode.${card.key}`}
              accessibilityLabel={`Select mode ${card.label}`}
              onPress={() => {
                setMode(card.key);
                if (card.key !== 'implementation') setCreateTask(false);
              }}
              style={{
                marginBottom: 8,
                padding: 14,
                borderRadius: tokens.radius.lg,
                borderWidth: 2,
                borderColor: selected ? tokens.color.primary : tokens.color.border,
                backgroundColor: selected ? tokens.color.surfaceMuted : tokens.color.surface,
              }}
            >
              <Text style={{ fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.color.text }}>{card.label}</Text>
              <Text style={{ color: tokens.color.textMuted, marginTop: 2 }}>{card.description}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ ...labelStyle, marginTop: 12 }}>Model</Text>
      <TextInput
        testID="newchat.model"
        accessibilityLabel="Model id"
        value={modelId}
        onChangeText={setModelId}
        placeholder="default"
        placeholderTextColor={tokens.color.textMuted}
        style={inputStyle}
      />

      <Text style={{ ...labelStyle, marginTop: 12 }}>Prompt template (optional)</Text>
      <TextInput
        testID="newchat.promptTemplate"
        accessibilityLabel="Prompt template id"
        value={promptTemplateId}
        onChangeText={setPromptTemplateId}
        placeholder="template id"
        placeholderTextColor={tokens.color.textMuted}
        style={inputStyle}
      />

      <Text style={{ ...labelStyle, marginTop: 12 }}>Tool profile (optional)</Text>
      <TextInput
        testID="newchat.toolProfile"
        accessibilityLabel="Tool profile id"
        value={toolProfileId}
        onChangeText={setToolProfileId}
        placeholder="profile id"
        placeholderTextColor={tokens.color.textMuted}
        style={inputStyle}
      />

      <Text style={{ ...labelStyle, marginTop: 12 }}>Initial prompt (optional, becomes title)</Text>
      <TextInput
        testID="newchat.initialPrompt"
        accessibilityLabel="Initial prompt"
        value={initialPrompt}
        onChangeText={setInitialPrompt}
        placeholder="Describe what you want to do…"
        placeholderTextColor={tokens.color.textMuted}
        multiline
        style={{ ...inputStyle, minHeight: 64 }}
      />

      {showCreateTaskToggle ? (
        <Pressable
          testID="newchat.createTaskToggle"
          accessibilityLabel="Create writable task now"
          accessibilityRole="switch"
          onPress={switchCreateTask}
          style={{
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 14,
            borderRadius: tokens.radius.md,
            borderWidth: 1,
            borderColor: createTask ? tokens.color.successText : tokens.color.border,
            backgroundColor: createTask ? tokens.color.successBg : tokens.color.surface,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: tokens.color.text }}>Create writable task now</Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 2, fontSize: tokens.fontSize.sm }}>
              Spin up a task + worktree branch immediately.
            </Text>
          </View>
          <View
            style={{
              width: 44,
              height: 26,
              borderRadius: tokens.radius.pill,
              padding: 3,
              backgroundColor: createTask ? tokens.color.successText : tokens.color.border,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: '#FFFFFF',
                transform: [{ translateX: createTask ? 18 : 0 }],
              }}
            />
          </View>
        </Pressable>
      ) : null}

      {error ? (
        <Text style={{ color: tokens.color.danger, marginTop: 12, fontWeight: '700' }}>{error}</Text>
      ) : null}

      <Pressable
        testID="newchat.create"
        accessibilityLabel="Create chat"
        onPress={handleCreate}
        disabled={!canSubmit}
        style={{
          marginTop: 16,
          paddingVertical: 14,
          borderRadius: tokens.radius.md,
          backgroundColor: canSubmit ? tokens.color.primary : tokens.color.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Create</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}
