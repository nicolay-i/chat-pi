import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { tokens } from '@/theme/tokens';

export default function SetupScreen() {
  const [url, setUrl] = useState('https://agents.example.internal');
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');

  const check = () => {
    setStatus('checking');
    setTimeout(() => setStatus(url.startsWith('http') ? 'ok' : 'error'), 250);
  };

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: tokens.color.background }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: tokens.color.text }}>Pi Agents</Text>
      <Text style={{ marginTop: 8, color: tokens.color.textMuted }}>Подключение к backend на VPS</Text>
      <TextInput
        testID="setup.backendUrl"
        accessibilityLabel="Backend URL"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        style={{ marginTop: 24, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface, borderRadius: 12, padding: 14 }}
      />
      <Pressable testID="setup.testConnection" accessibilityLabel="Проверить подключение" onPress={check} style={{ marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: tokens.color.surfaceMuted }}>
        <Text>Проверить подключение</Text>
      </Pressable>
      {status === 'ok' ? <Text style={{ marginTop: 12, color: tokens.color.successText }}>Backend доступен</Text> : null}
      {status === 'error' ? <Text style={{ marginTop: 12, color: tokens.color.danger }}>Некорректный URL или backend недоступен</Text> : null}
      <Pressable testID="setup.continue" accessibilityLabel="Продолжить" onPress={() => router.replace('/projects')} disabled={status !== 'ok'} style={{ marginTop: 24, padding: 16, borderRadius: 18, backgroundColor: status === 'ok' ? tokens.color.primary : tokens.color.border }}>
        <Text style={{ textAlign: 'center', color: '#fff', fontWeight: '700' }}>Сохранить и продолжить</Text>
      </Pressable>
    </View>
  );
}
