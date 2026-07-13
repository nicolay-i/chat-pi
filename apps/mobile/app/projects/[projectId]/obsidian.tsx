import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { IgnisAccess } from '@pi-agents/contracts';
import { useLocalSearchParams } from '@/navigation';
import { ApiClient } from '@/api/client';
import { IgnisFrame } from '@/features/ignis/IgnisFrame';
import { useBackend } from '@/stores/useBackend';
import { tokens } from '@/theme/tokens';

export default function IgnisScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { baseUrl } = useBackend();
  const [access, setAccess] = useState<IgnisAccess | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!baseUrl || !projectId) {
      setAccess(null);
      setError('Backend URL is not configured');
      return;
    }
    let active = true;
    setAccess(null);
    setError(null);
    void new ApiClient(baseUrl).getIgnisAccess(projectId)
      .then((next) => { if (active) setAccess(next); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [baseUrl, projectId]);

  if (error) {
    return <View style={{ flex: 1, justifyContent: 'center', padding: 16, backgroundColor: tokens.color.background }}><Text style={{ color: tokens.color.danger }}>{error}</Text></View>;
  }
  if (!access) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: tokens.color.background }}><ActivityIndicator color={tokens.color.primary} /></View>;
  }
  if (!access.url) {
    return <View style={{ flex: 1, justifyContent: 'center', padding: 16, backgroundColor: tokens.color.background }}><Text style={{ color: tokens.color.textMuted }}>Ignis URL is not configured for this project.</Text></View>;
  }
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.background }}>
      {access.activeTaskCount > 0 ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: tokens.color.border }}>
          <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs }}>Active tasks: {access.activeTaskCount}</Text>
        </View>
      ) : null}
      <IgnisFrame url={access.url} />
    </View>
  );
}
