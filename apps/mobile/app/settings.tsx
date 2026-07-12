import { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { router } from '@/navigation';
import { tokens } from '@/theme/tokens';
import { useBackend } from '@/stores/useBackend';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        marginTop: tokens.spacing.md,
        padding: tokens.spacing.lg,
        borderRadius: tokens.radius.md,
        backgroundColor: tokens.color.surface,
        borderWidth: 1,
        borderColor: tokens.color.border,
      }}
    >
      <Text style={{ fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.color.text, marginBottom: tokens.spacing.sm }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: tokens.spacing.xs }}>
      <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.md }}>{label}</Text>
      <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.md }}>{value ?? '—'}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { baseUrl, capabilities, reset } = useBackend();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cacheToast, setCacheToast] = useState<string | null>(null);
  const [notifyApprovals, setNotifyApprovals] = useState(true);
  const [notifyStream, setNotifyStream] = useState(false);

  const handleChangeConnection = () => {
    router.replace('/setup');
  };

  const handleClearCache = () => {
    setCacheToast('Кэш очищен');
  };

  const handleConfirmReset = async () => {
    await reset();
    setConfirmOpen(false);
    router.replace('/setup');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tokens.color.background }}
      contentContainerStyle={{ padding: tokens.spacing.lg }}
    >
      <Text style={{ fontSize: 24, fontWeight: '700', color: tokens.color.text, marginBottom: tokens.spacing.sm }}>
        Настройки
      </Text>

      <Section title="Подключение к backend">
        <View testID="settings.connection">
          <Row label="Адрес" value={baseUrl} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Изменить подключение"
            onPress={handleChangeConnection}
            style={{
              marginTop: tokens.spacing.md,
              paddingVertical: tokens.spacing.sm,
              borderRadius: tokens.radius.sm,
              backgroundColor: tokens.color.primary,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Изменить подключение</Text>
          </Pressable>
          <Pressable
            testID="settings.resetConnection"
            accessibilityRole="button"
            accessibilityLabel="Сбросить подключение"
            onPress={() => setConfirmOpen(true)}
            style={{
              marginTop: tokens.spacing.sm,
              paddingVertical: tokens.spacing.sm,
              borderRadius: tokens.radius.sm,
              backgroundColor: tokens.color.surfaceMuted,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Сбросить подключение</Text>
          </Pressable>
        </View>
      </Section>

      <Section title="Устройство">
        <Row label="Идентификатор" value="pi-device" />
        <Row label="Платформа" value="mobile" />
      </Section>

      <Section title="Уведомления">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: tokens.spacing.xs }}>
          <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.md }}>Согласования</Text>
          <Switch value={notifyApprovals} onValueChange={setNotifyApprovals} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: tokens.spacing.sm }}>
          <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.md }}>События потока</Text>
          <Switch value={notifyStream} onValueChange={setNotifyStream} />
        </View>
      </Section>

      <Section title="Кэш и сброс">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Очистить кэш"
          onPress={handleClearCache}
          style={{
            marginTop: tokens.spacing.xs,
            paddingVertical: tokens.spacing.sm,
            borderRadius: tokens.radius.sm,
            backgroundColor: tokens.color.surfaceMuted,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: tokens.color.text }}>Очистить кэш</Text>
        </Pressable>
        {cacheToast ? (
          <Text style={{ marginTop: tokens.spacing.sm, textAlign: 'center', color: tokens.color.textMuted }}>
            {cacheToast}
          </Text>
        ) : null}
      </Section>

      <Section title="О приложении">
        <View testID="settings.version">
          <Row label="Приложение" value="Pi Agents 0.0.0" />
          <Row label="API" value={capabilities?.apiVersion ?? null} />
        </View>
      </Section>

      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ width: '85%', padding: tokens.spacing.lg, borderRadius: tokens.radius.lg, backgroundColor: tokens.color.surface }}>
            <Text style={{ fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.color.text }}>
              Сбросить подключение?
            </Text>
            <Text style={{ marginTop: tokens.spacing.sm, color: tokens.color.textMuted }}>
              Сохранённый адрес backend будет удалён, потребуется настроить подключение заново.
            </Text>
            <View style={{ flexDirection: 'row', marginTop: tokens.spacing.lg }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Отмена"
                onPress={() => setConfirmOpen(false)}
                style={{ flex: 1, marginRight: tokens.spacing.sm, paddingVertical: tokens.spacing.sm, borderRadius: tokens.radius.sm, backgroundColor: tokens.color.surfaceMuted, alignItems: 'center' }}
              >
                <Text style={{ color: tokens.color.text }}>Отмена</Text>
              </Pressable>
              <Pressable
                testID="settings.resetConfirm"
                accessibilityRole="button"
                accessibilityLabel="Подтвердить сброс"
                onPress={handleConfirmReset}
                style={{ flex: 1, paddingVertical: tokens.spacing.sm, borderRadius: tokens.radius.sm, backgroundColor: tokens.color.danger, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Сбросить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
