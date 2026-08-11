import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform, Pressable, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { OfflineBanner } from '@/components/shell/OfflineBanner';
import { AppNavigator } from '@/navigation/AppNavigator';
import { RootStoreProvider } from '@/providers/RootStoreProvider';

const queryClient = new QueryClient();

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

async function registerPwa(onUpdate: () => void): Promise<ServiceWorkerRegistration | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const documentRef = window.document;
  if (!documentRef.querySelector('link[rel="manifest"]')) {
    const manifest = documentRef.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = '/manifest.webmanifest';
    documentRef.head.appendChild(manifest);
  }
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const checkForUpdate = (): void => {
    if (registration.waiting) onUpdate();
  };
  checkForUpdate();
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) onUpdate();
    });
  });
  return registration;
}

export default function App() {
  const [pwaUpdate, setPwaUpdate] = useState(false);
  const [pwaRegistration, setPwaRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [pwaInstallPrompt, setPwaInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    void registerPwa(() => setPwaUpdate(true)).then(setPwaRegistration).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault();
      setPwaInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = (): void => setPwaInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  const applyPwaUpdate = (): void => {
    if (typeof window === 'undefined') return;
    const waiting = pwaRegistration?.waiting;
    if (!waiting || !('serviceWorker' in navigator)) {
      window.location.reload();
      return;
    }

    let reloaded = false;
    const reload = (): void => {
      if (reloaded) return;
      reloaded = true;
      navigator.serviceWorker.removeEventListener('controllerchange', reload);
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', reload);
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // A browser may not emit controllerchange when the tab has no active
    // controller yet. Keep the action bounded instead of leaving the banner
    // in a permanently waiting state.
    window.setTimeout(reload, 5_000);
  };
  const installPwa = async (): Promise<void> => {
    const prompt = pwaInstallPrompt;
    if (!prompt) return;
    setPwaInstallPrompt(null);
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
  };
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootStoreProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <View style={{ flex: 1 }}>
            <View
              pointerEvents="box-none"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999, elevation: 999 }}
            >
              <OfflineBanner />
            </View>
            {Platform.OS === 'web' && pwaUpdate ? (
              <View style={{ position: 'absolute', top: 44, left: 12, right: 12, zIndex: 998, elevation: 998, padding: 10, borderRadius: 10, backgroundColor: '#243047', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ color: '#FFFFFF', flex: 1 }}>Доступна новая версия приложения.</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Обновить приложение" onPress={applyPwaUpdate} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 7, backgroundColor: '#6258F4' }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Обновить</Text>
                </Pressable>
              </View>
            ) : null}
            {Platform.OS === 'web' && pwaInstallPrompt ? (
              <View style={{ position: 'absolute', top: pwaUpdate ? 92 : 12, left: 12, right: 12, zIndex: 997, elevation: 997, padding: 10, borderRadius: 10, backgroundColor: '#243047', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ color: '#FFFFFF', flex: 1 }}>Установить Pi Agents как приложение?</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Установить приложение" onPress={() => { void installPwa(); }} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 7, backgroundColor: '#6258F4' }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Установить</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Скрыть установку приложения" onPress={() => setPwaInstallPrompt(null)} style={{ paddingVertical: 6, paddingHorizontal: 6 }}>
                  <Text style={{ color: '#CBD5E1' }}>Позже</Text>
                </Pressable>
              </View>
            ) : null}
            <AppNavigator />
          </View>
        </QueryClientProvider>
      </RootStoreProvider>
    </GestureHandlerRootView>
  );
}
