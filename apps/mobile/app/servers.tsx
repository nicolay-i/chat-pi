import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from '@/navigation';
import { observer } from '@/lib/observer';
import { tokens } from '@/theme/tokens';
import { useRootStore } from '@/providers/RootStoreProvider';
import { useBackend } from '@/stores/useBackend';

function validUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default observer(function ServersScreen() {
  const store = useRootStore();
  const { servers, activeServerId } = useBackend();
  const { tasks } = store;
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addServer = async (): Promise<void> => {
    const trimmed = url.trim();
    if (!validUrl(trimmed)) {
      setError('Укажите URL вида https://компьютер.example');
      return;
    }
    setBusy(true);
    setError(null);
    const connection = await store.backend.connect(trimmed, token);
    if (connection?.status !== 'connected') {
      setError(connection?.error ?? 'Не удалось подключиться');
      setBusy(false);
      return;
    }
    const id = store.backend.activeServerId;
    if (id && name.trim()) await store.backend.rename(id, name);
    setUrl('');
    setName('');
    setToken('');
    setBusy(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: tokens.color.background }} contentContainerStyle={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 28, fontWeight: '700', color: tokens.color.text }}>Серверы</Text>
          <Text style={{ marginTop: 4, color: tokens.color.textMuted }}>Компьютеры, на которых выполняются проекты и агенты</Text>
        </View>
        <Pressable onPress={() => router.back()} accessibilityLabel="Назад" style={{ padding: 8 }}>
          <Text style={{ color: tokens.color.primary, fontWeight: '700' }}>Назад</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 16, padding: 16, borderRadius: tokens.radius.lg, backgroundColor: tokens.color.surface }}>
        <Text style={{ fontWeight: '700', color: tokens.color.text }}>Добавить компьютер</Text>
        <TextInput
          testID="servers.url"
          accessibilityLabel="URL сервера"
          value={url}
          onChangeText={setUrl}
          placeholder="https://computer.example.ts.net"
          placeholderTextColor={tokens.color.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={{ marginTop: 10, borderWidth: 1, borderColor: tokens.color.border, borderRadius: tokens.radius.md, padding: 12, color: tokens.color.text }}
        />
        <TextInput
          testID="servers.token"
          accessibilityLabel="Токен сервера"
          value={token}
          onChangeText={setToken}
          placeholder="Bearer-токен (если требуется)"
          placeholderTextColor={tokens.color.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={{ marginTop: 10, borderWidth: 1, borderColor: tokens.color.border, borderRadius: tokens.radius.md, padding: 12, color: tokens.color.text }}
        />
        <Text style={{ marginTop: 6, color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>
          На телефоне токен хранится в SecureStore. В Web он остаётся только в памяти текущей вкладки.
        </Text>
        <TextInput
          testID="servers.name"
          accessibilityLabel="Название сервера"
          value={name}
          onChangeText={setName}
          placeholder="Например, рабочий ПК"
          placeholderTextColor={tokens.color.textMuted}
          style={{ marginTop: 10, borderWidth: 1, borderColor: tokens.color.border, borderRadius: tokens.radius.md, padding: 12, color: tokens.color.text }}
        />
        {error ? <Text testID="servers.error" style={{ marginTop: 10, color: tokens.color.danger }}>{error}</Text> : null}
        <Pressable
          testID="servers.add"
          accessibilityLabel="Добавить сервер"
          onPress={() => { void addServer(); }}
          disabled={busy}
          style={{ marginTop: 12, padding: 13, borderRadius: tokens.radius.md, alignItems: 'center', backgroundColor: tokens.color.primary, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Проверить и добавить</Text>}
        </Pressable>
      </View>

      <View style={{ marginTop: 16, gap: 10 }}>
        {servers.length === 0 ? <Text style={{ color: tokens.color.textMuted }}>Подключения ещё не добавлены.</Text> : null}
        {servers.map((server) => {
          const active = server.serverId === activeServerId;
          return (
            <View key={server.serverId} testID={`servers.item.${server.serverId}`} style={{ padding: 16, borderRadius: tokens.radius.lg, backgroundColor: tokens.color.surface, borderWidth: active ? 2 : 1, borderColor: active ? tokens.color.primary : tokens.color.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '700' }}>{server.name}</Text>
                  <Text selectable style={{ marginTop: 4, color: tokens.color.textMuted }}>{server.baseUrl}</Text>
                  <Text style={{ marginTop: 6, color: server.status === 'connected' ? tokens.color.successText : server.status === 'auth_required' || server.status === 'offline' || server.status === 'error' ? tokens.color.danger : tokens.color.textMuted }}>
                    {server.status === 'connected' ? 'Подключён' : server.status === 'checking' ? 'Проверка…' : server.status === 'auth_required' ? `Нужен токен: ${server.error ?? 'требуется авторизация'}` : server.status === 'offline' ? `Компьютер недоступен: ${server.error ?? 'нет соединения'}` : server.status === 'error' ? `Ошибка: ${server.error ?? 'не удалось проверить'}` : 'Не проверен'}
                  </Text>
                  <Text style={{ marginTop: 3, color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>
                    API {server.capabilities?.apiVersion ?? '—'} · {server.latencyMs === null ? 'задержка —' : `${server.latencyMs} мс`} · активных задач: {tasks.activeCountForServer(server.serverId)}
                  </Text>
                  {server.authRequired ? (
                    <Text style={{ marginTop: 3, color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>
                      {server.credentialSet ? 'Токен сохранён защищённо' : 'Токен не задан'}
                    </Text>
                  ) : null}
                  <Text style={{ marginTop: 3, color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>ID: {server.serverId}</Text>
                </View>
                <View style={{ gap: 8, alignItems: 'flex-end' }}>
                  <Pressable accessibilityLabel={`Выбрать ${server.name}`} onPress={() => store.backend.activate(server.serverId)} style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: tokens.radius.md, backgroundColor: active ? tokens.color.primary : tokens.color.surfaceMuted }}>
                    <Text style={{ color: active ? '#fff' : tokens.color.text, fontWeight: '700' }}>{active ? 'Выбран' : 'Выбрать'}</Text>
                  </Pressable>
                  <Pressable accessibilityLabel={`Проверить ${server.name}`} onPress={() => { void store.backend.connect(server.baseUrl); }} style={{ padding: 6 }}>
                    <Text style={{ color: tokens.color.primary }}>Проверить</Text>
                  </Pressable>
                  <Pressable accessibilityLabel={`Удалить ${server.name}`} onPress={() => { void store.backend.remove(server.serverId); }} style={{ padding: 6 }}>
                    <Text style={{ color: tokens.color.danger }}>Забыть</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
});
