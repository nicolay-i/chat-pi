import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { OfflineBanner } from '@/components/shell/OfflineBanner';

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 999,
            elevation: 999,
          }}
        >
          <OfflineBanner />
        </View>
        <Stack screenOptions={{ headerShown: true }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
        </Stack>
      </View>
    </QueryClientProvider>
  );
}
