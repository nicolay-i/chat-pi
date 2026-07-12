import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View } from 'react-native';
import { OfflineBanner } from '@/components/shell/OfflineBanner';
import { AppNavigator } from '@/navigation/AppNavigator';
import { RootStoreProvider } from '@/providers/RootStoreProvider';

const queryClient = new QueryClient();

export default function App() {
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
            <AppNavigator />
          </View>
        </QueryClientProvider>
      </RootStoreProvider>
    </GestureHandlerRootView>
  );
}
