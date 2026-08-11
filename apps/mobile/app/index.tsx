import { ActivityIndicator, Text, View } from 'react-native';
import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { observer } from '@/lib/observer';
import { useRootStore } from '@/providers/RootStoreProvider';
import { tokens } from '@/theme/tokens';

export default observer(function HomeScreen() {
  const { backend } = useRootStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    if (!backend.restored) return;
    navigation.replace(backend.baseUrl ? 'Projects' : 'Setup');
  }, [backend.baseUrl, backend.restored, navigation]);

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
