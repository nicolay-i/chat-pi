import { ActivityIndicator, Text, View } from 'react-native';
import { useEffect } from 'react';
import { router } from '@/navigation';
import { observer } from '@/lib/observer';
import { useRootStore } from '@/providers/RootStoreProvider';
import { tokens } from '@/theme/tokens';

export default observer(function HomeScreen() {
  const { backend } = useRootStore();

  useEffect(() => {
    if (!backend.restored) return;
    router.replace(backend.baseUrl ? '/projects' : '/setup');
  }, [backend.baseUrl, backend.restored]);

  return (
    <View
      testID="home.loading"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: tokens.spacing.xl,
        backgroundColor: tokens.color.background,
      }}
    >
      <ActivityIndicator color={tokens.color.primary} />
      <Text style={{ marginTop: tokens.spacing.sm, color: tokens.color.textMuted }}>
        Открываем приложение…
      </Text>
    </View>
  );
});
