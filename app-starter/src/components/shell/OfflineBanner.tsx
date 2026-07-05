import { Pressable, Text, View } from 'react-native';
import { selectIsOffline, useConnection } from '@/state/connectionStore';
import { tokens } from '@/theme/tokens';

export type OfflineBannerProps = {
  onRetry?: () => void;
};

const AMBER = '#E8A33D';

export function OfflineBanner({ onRetry }: OfflineBannerProps) {
  const { status, lastEventId } = useConnection();

  if (!selectIsOffline(status)) {
    return null;
  }

  const isReconnecting = status === 'reconnecting';
  const bg = isReconnecting ? AMBER : tokens.color.danger;
  const message = isReconnecting
    ? 'Нет соединения. Переподключение…'
    : 'Соединение потеряно';

  return (
    <View
      testID="offline.banner"
      style={{
        backgroundColor: bg,
        paddingHorizontal: tokens.spacing.lg,
        paddingVertical: tokens.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flex: 1, flexDirection: 'column' }}>
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: tokens.fontSize.md }}>
          {message}
        </Text>
        {isReconnecting ? (
          <Text
            testID="offline.lastEventId"
            style={{ color: '#fff', fontSize: tokens.fontSize.sm, marginTop: 2 }}
          >
            {lastEventId ?? '—'}
          </Text>
        ) : null}
      </View>
      <Pressable
        testID="offline.retry"
        accessibilityRole="button"
        accessibilityLabel="Повторить подключение"
        onPress={() => onRetry?.()}
        style={{
          marginLeft: tokens.spacing.md,
          paddingHorizontal: tokens.spacing.md,
          paddingVertical: tokens.spacing.xs,
          borderRadius: tokens.radius.sm,
          backgroundColor: 'rgba(255,255,255,0.25)',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Повторить</Text>
      </Pressable>
    </View>
  );
}
