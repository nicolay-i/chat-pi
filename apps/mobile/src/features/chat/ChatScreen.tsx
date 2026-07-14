import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ArrowRight, Plus, RotateCcw, Square } from 'lucide-react-native';
import type { Chat, ManagedImplementation, SendMessageInput } from '@pi-agents/contracts';
import { Composer } from '@/components/chat/Composer';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { QueuePanel } from '@/components/chat/QueuePanel';
import { ToolCard } from '@/components/chat/ToolCard';
import { observer } from '@/lib/observer';
import { useRootStore } from '@/providers/RootStoreProvider';
import { tokens } from '@/theme/tokens';
import { ApiClient } from '@/api/client';
import { router } from '@/navigation';
import { useBackend } from '@/stores/useBackend';

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function connectionLabel(status: string): string {
  if (status === 'open') return 'В сети';
  if (status === 'connecting') return 'Подключение';
  if (status === 'reconnecting') return 'Переподключение';
  if (status === 'error') return 'Ошибка соединения';
  return 'Ожидание';
}

export const ChatScreen = observer(function ChatScreen({ chatId }: { chatId: string }) {
  const [draft, setDraft] = useState('');
  const [behavior, setBehavior] = useState<SendMessageInput['behavior']>('send');
  const [needsRunChoice, setNeedsRunChoice] = useState(false);
  const [metadata, setMetadata] = useState<Chat | null>(null);
  const [managed, setManaged] = useState<ManagedImplementation[]>([]);
  const [implementationTitle, setImplementationTitle] = useState('');
  const [creatingImplementation, setCreatingImplementation] = useState(false);
  const [orchestrationError, setOrchestrationError] = useState<string | null>(null);
  const [nextTaskTitle, setNextTaskTitle] = useState('');
  const [creatingNextTask, setCreatingNextTask] = useState(false);
  const [nextTaskError, setNextTaskError] = useState<string | null>(null);
  const { chats } = useRootStore();
  const { baseUrl } = useBackend();
  const chat = useMemo(() => chats.getOrCreate(chatId), [chatId, chats]);

  const loadOrchestration = useCallback(async () => {
    if (!baseUrl) return;
    const client = new ApiClient(baseUrl);
    const next = await client.getChat(chatId);
    setMetadata(next);
    chat.applyChat(next);
    if (next.mode === 'orchestration') setManaged(await client.getManagedImplementations(chatId));
  }, [baseUrl, chat, chatId]);

  useEffect(() => {
    if (!baseUrl) return;
    const session = chats.open(chatId);
    void chats.hydrate(chatId).catch((error: unknown) => {
      session.setError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      session.close();
    };
  }, [baseUrl, chatId, chats]);

  useEffect(() => {
    void loadOrchestration().catch((error: unknown) => {
      setOrchestrationError(error instanceof Error ? error.message : String(error));
    });
  }, [loadOrchestration]);

  const createImplementation = (): void => {
    const title = implementationTitle.trim();
    if (!baseUrl || !title || creatingImplementation) return;
    setCreatingImplementation(true);
    setOrchestrationError(null);
    void new ApiClient(baseUrl).createImplementationTask(chatId, title)
      .then((created) => {
        setManaged((items) => [...items, created]);
        setImplementationTitle('');
      })
      .catch((error: unknown) => setOrchestrationError(error instanceof Error ? error.message : String(error)))
      .finally(() => setCreatingImplementation(false));
  };

  const createNextTask = (): void => {
    const title = nextTaskTitle.trim();
    if (!baseUrl || !title || creatingNextTask) return;
    setCreatingNextTask(true);
    setNextTaskError(null);
    const client = new ApiClient(baseUrl);
    void client.createTaskForChat(chatId, { title, mode: 'implementation' })
      .then(async () => {
        setNextTaskTitle('');
        const next = await client.getChat(chatId);
        setMetadata(next);
        chat.applyChat(next);
      })
      .catch((error: unknown) => setNextTaskError(error instanceof Error ? error.message : String(error)))
      .finally(() => setCreatingNextTask(false));
  };

  const send = (): void => {
    if (!draft.trim()) return;
    if (chat.isRunning && behavior === 'send') {
      setNeedsRunChoice(true);
      return;
    }
    const text = draft;
    setDraft('');
    setNeedsRunChoice(false);
    void chat.send(text, behavior);
  };

  const chooseRunBehavior = (next: 'follow_up' | 'steer'): void => {
    setBehavior(next);
    setNeedsRunChoice(false);
  };

  const lastMessage = chat.messages[chat.messages.length - 1];
  const showStreamingCursor = chat.connectionStatus === 'open'
    && lastMessage?.role === 'assistant'
    && lastMessage.complete !== true;
  const showRunChoice = chat.isRunning && behavior === 'send' && (needsRunChoice || draft.trim().length > 0);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: tokens.color.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: tokens.color.border, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text testID="chat.screen.title" numberOfLines={1} style={{ color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '700' }}>
            {metadata?.title ?? chatId}
          </Text>
          <Text testID="chat.screen.connection" style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs }}>
            {connectionLabel(chat.connectionStatus)} · запуск: {chat.runStatus} · очередь: {chat.queue.pending}
          </Text>
          <Text testID="chat.screen.activeTask" style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs }}>
            Задача: {chat.activeTaskId ?? 'нет активной'}
          </Text>
        </View>
        {chat.isRunning ? (
          <Pressable
            testID="chat.screen.abort"
            accessibilityRole="button"
            accessibilityLabel="Прервать запуск"
            disabled={chat.aborting}
            onPress={() => { void chat.abort(); }}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: chat.aborting ? 0.5 : 1 }}
          >
            <Square size={20} color={tokens.color.danger} fill={tokens.color.danger} />
          </Pressable>
        ) : null}
      </View>

      <QueuePanel key={`${baseUrl ?? 'none'}:${chatId}`} baseUrl={baseUrl} chatId={chatId} pendingCount={chat.queue.pending} />

      {chat.isOffline ? (
        <View testID="chat.screen.offlineBanner" style={{ backgroundColor: tokens.color.danger, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: '#FFFFFF', fontSize: tokens.fontSize.sm }}>Нет соединения. Переподключение…</Text>
        </View>
      ) : null}

      {metadata?.mode === 'implementation' && !chat.activeTaskId ? (
        <View testID="chat.screen.nextTask" style={{ borderBottomWidth: 1, borderBottomColor: tokens.color.border, padding: 12, gap: 8 }}>
          <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.sm }}>
            Нет активной задачи
          </Text>
          <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs }}>
            Обсуждение остаётся доступным. Для следующего изменения создайте новую Task в этом же Chat.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              testID="chat.screen.nextTaskTitle"
              accessibilityLabel="Next task title"
              value={nextTaskTitle}
              onChangeText={setNextTaskTitle}
              placeholder="Название следующей Task"
              placeholderTextColor={tokens.color.textMuted}
              style={{ flex: 1, borderWidth: 1, borderColor: tokens.color.border, borderRadius: tokens.radius.sm, color: tokens.color.text, paddingHorizontal: 10, paddingVertical: 8 }}
            />
            <Pressable
              testID="chat.screen.createNextTask"
              accessibilityRole="button"
              accessibilityLabel="Create next task in this chat"
              disabled={!nextTaskTitle.trim() || creatingNextTask}
              onPress={createNextTask}
              style={{ width: 40, borderRadius: tokens.radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.primary, opacity: !nextTaskTitle.trim() || creatingNextTask ? 0.5 : 1 }}
            >
              <Plus size={18} color="#FFFFFF" />
            </Pressable>
          </View>
          {nextTaskError ? <Text testID="chat.screen.nextTaskError" style={{ color: tokens.color.danger, fontSize: tokens.fontSize.xs }}>{nextTaskError}</Text> : null}
        </View>
      ) : null}

      {metadata?.mode === 'orchestration' ? (
        <View testID="chat.screen.orchestration" style={{ borderBottomWidth: 1, borderBottomColor: tokens.color.border, padding: 12, gap: 8 }}>
          <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.sm }}>Implementation tasks</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              testID="chat.screen.implementationTitle"
              accessibilityLabel="Implementation task title"
              value={implementationTitle}
              onChangeText={setImplementationTitle}
              placeholder="Task title"
              placeholderTextColor={tokens.color.textMuted}
              style={{ flex: 1, borderWidth: 1, borderColor: tokens.color.border, borderRadius: tokens.radius.sm, color: tokens.color.text, paddingHorizontal: 10, paddingVertical: 8 }}
            />
            <Pressable
              testID="chat.screen.createImplementation"
              accessibilityRole="button"
              accessibilityLabel="Create implementation task"
              disabled={!implementationTitle.trim() || creatingImplementation}
              onPress={createImplementation}
              style={{ width: 40, borderRadius: tokens.radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.primary, opacity: !implementationTitle.trim() || creatingImplementation ? 0.5 : 1 }}
            >
              <Plus size={18} color="#FFFFFF" />
            </Pressable>
          </View>
          {managed.map((item) => (
            <Pressable
              key={item.task.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.chat.title}`}
              onPress={() => router.push(`/projects/${item.chat.projectId}/chats/${item.chat.id}`)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 }}
            >
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: tokens.color.text, fontSize: tokens.fontSize.sm }}>{item.chat.title}</Text>
                <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs }}>{item.task.status}</Text>
              </View>
              <ArrowRight size={16} color={tokens.color.textMuted} />
            </Pressable>
          ))}
          {orchestrationError ? <Text style={{ color: tokens.color.danger, fontSize: tokens.fontSize.xs }}>{orchestrationError}</Text> : null}
        </View>
      ) : null}

      <ScrollView testID="chat.screen.messages" style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {chat.messages.length === 0 ? (
          <Text style={{ color: tokens.color.textMuted, textAlign: 'center', paddingVertical: 32 }}>Сообщений пока нет.</Text>
        ) : null}
        {chat.messages.map((message) => (
          <View key={message.id}>
            <MessageBubble
              role={message.status === 'failed' ? 'error' : message.role}
              text={message.status === 'failed' ? message.error ?? message.text : message.text}
              time={formatTime(message.createdAt)}
            />
            {message.status === 'sending' ? (
              <Text testID={`chat.screen.sending.${message.id}`} style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, textAlign: 'right' }}>Отправляется…</Text>
            ) : null}
            {message.status === 'failed' ? (
              <Pressable
                testID={`chat.screen.retry.${message.id}`}
                accessibilityRole="button"
                accessibilityLabel="Повторить отправку"
                onPress={() => { void chat.retryMessage(message.id); }}
                style={{ alignSelf: 'flex-end', flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 6 }}
              >
                <RotateCcw size={14} color={tokens.color.danger} />
                <Text style={{ color: tokens.color.danger, fontSize: tokens.fontSize.sm }}>Повторить</Text>
              </Pressable>
            ) : null}
            {message.id === lastMessage?.id && showStreamingCursor ? (
              <Text testID="chat.screen.streamingCursor" style={{ color: tokens.color.primary, fontSize: tokens.fontSize.md }}>▍</Text>
            ) : null}
          </View>
        ))}
        {chat.toolCalls.map((call) => (
          <ToolCard
            key={call.id}
            toolName={call.name}
            status={call.status}
            diff={call.output ? call.output.split('\n') : []}
          />
        ))}
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: tokens.color.border, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
        {chat.error ? <Text testID="chat.screen.error" style={{ color: tokens.color.danger, fontSize: tokens.fontSize.sm }}>{chat.error}</Text> : null}
        {showRunChoice ? (
          <View testID="chat.screen.runChoice" style={{ flexDirection: 'row', gap: 8, paddingBottom: 8 }}>
            <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.sm, alignSelf: 'center', flex: 1 }}>Запуск уже выполняется</Text>
            <Pressable accessibilityRole="button" testID="chat.screen.chooseFollowUp" onPress={() => chooseRunBehavior('follow_up')} style={{ paddingHorizontal: 10, paddingVertical: 7, backgroundColor: tokens.color.surfaceMuted, borderRadius: tokens.radius.md }}>
              <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.sm }}>Дополнить</Text>
            </Pressable>
            <Pressable accessibilityRole="button" testID="chat.screen.chooseSteer" onPress={() => chooseRunBehavior('steer')} style={{ paddingHorizontal: 10, paddingVertical: 7, backgroundColor: tokens.color.surfaceMuted, borderRadius: tokens.radius.md }}>
              <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.sm }}>Направить</Text>
            </Pressable>
          </View>
        ) : null}
        <Composer
          value={draft}
          onValueChange={setDraft}
          onSend={send}
          disabled={chat.sending}
          behavior={behavior}
          onBehaviorChange={setBehavior}
          taskStatus={chat.taskStatus}
          hasActiveRun={chat.isRunning}
        />
      </View>
    </KeyboardAvoidingView>
  );
});
