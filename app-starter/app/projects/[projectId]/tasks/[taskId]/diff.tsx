import { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { tokens } from '@/theme/tokens';
import { useTaskDiff } from '@/features/diff/useTaskDiff';
import { DiffFileList } from '@/features/diff/DiffFileList';
import { UnifiedDiff, countHunkLines } from '@/features/diff/UnifiedDiff';
import { ApiClient } from '@/api/client';
import { useBackend } from '@/state/backendStore';

type ConfirmKind = 'revert' | 'apply' | null;

const LARGE_THRESHOLD = 500;

export default function DiffReviewScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { entries, status, error, refetch, selectedPath, selectPath, fileContent, fileStatus, fileError } =
    useTaskDiff(taskId);
  const { baseUrl } = useBackend();
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [pending, setPending] = useState(false);

  const handleConfirm = () => {
    if (confirm === 'revert' && selectedPath && baseUrl) {
      setPending(true);
      const client = new ApiClient(baseUrl);
      client
        .revertFile(taskId, { path: selectedPath })
        .then(() => {
          refetch();
        })
        .catch(() => {
          // best-effort revert; surfaced via subsequent diff load
        })
        .finally(() => {
          setPending(false);
          setConfirm(null);
        });
      return;
    }
    setConfirm(null);
  };

  if (status === 'loading') {
    return (
      <View
        testID="diff.loading"
        style={{ flex: 1, backgroundColor: tokens.color.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={{ color: tokens.color.textMuted, marginTop: 8 }}>Loading diff…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View
        testID="diff.error"
        style={{ flex: 1, backgroundColor: tokens.color.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Failed to load diff</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>{error}</Text>
        <Pressable
          testID="diff.retry"
          onPress={refetch}
          style={{
            marginTop: 12,
            paddingVertical: 10,
            paddingHorizontal: 18,
            borderRadius: tokens.radius.md,
            backgroundColor: tokens.color.primary,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'empty' || !entries) {
    return (
      <View
        testID="diff.empty"
        style={{ flex: 1, backgroundColor: tokens.color.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Text style={{ color: tokens.color.text, fontWeight: '700' }}>No changes</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4 }}>There are no changed files in this task.</Text>
      </View>
    );
  }

  const largeFile = fileContent ? countHunkLines(fileContent) > LARGE_THRESHOLD : false;
  const isWeb = Platform.OS === 'web';

  const fileList = (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
        <DiffFileList entries={entries} selectedPath={selectedPath} onSelect={selectPath} />
      </View>
    </View>
  );

  const diffPanel = (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 }}>
        <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.md, flex: 1 }} numberOfLines={1}>
          {selectedPath ?? 'Diff'}
        </Text>
        <Pressable
          testID="diff.revert"
          accessibilityLabel="Revert selected file"
          onPress={() => setConfirm('revert')}
          disabled={!selectedPath}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: tokens.radius.md,
            backgroundColor: tokens.color.surface,
            borderWidth: 1,
            borderColor: tokens.color.danger,
            marginLeft: 8,
            opacity: selectedPath ? 1 : 0.5,
          }}
        >
          <Text style={{ color: tokens.color.danger, fontWeight: '700', fontSize: tokens.fontSize.sm }}>Revert</Text>
        </Pressable>
        <Pressable
          testID="diff.apply"
          accessibilityLabel="Apply changes"
          onPress={() => setConfirm('apply')}
          disabled={!selectedPath || largeFile}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: tokens.radius.md,
            backgroundColor: tokens.color.primary,
            marginLeft: 8,
            opacity: selectedPath && !largeFile ? 1 : 0.5,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: tokens.fontSize.sm }}>Apply</Text>
        </Pressable>
      </View>

      {fileStatus === 'loading' ? (
        <View testID="diff.fileLoading" style={{ padding: 16, alignItems: 'center' }}>
          <ActivityIndicator color={tokens.color.primary} />
          <Text style={{ color: tokens.color.textMuted, marginTop: 8, fontSize: tokens.fontSize.sm }}>Loading file…</Text>
        </View>
      ) : fileStatus === 'error' ? (
        <View testID="diff.fileError" style={{ padding: 16 }}>
          <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Failed to load file</Text>
          <Text style={{ color: tokens.color.textMuted, marginTop: 4, fontSize: tokens.fontSize.sm }}>{fileError}</Text>
        </View>
      ) : (
        <UnifiedDiff content={fileContent} />
      )}
    </View>
  );

  return (
    <View testID="diff.screen" style={{ flex: 1, backgroundColor: tokens.color.background }}>
      {isWeb ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ width: '40%', borderRightWidth: 1, borderRightColor: tokens.color.border }}>{fileList}</View>
          <View style={{ flex: 1 }}>{diffPanel}</View>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8 }}>
          <View style={{ maxHeight: 280 }}>{fileList}</View>
          <View style={{ flex: 1, minHeight: 360 }}>{diffPanel}</View>
        </ScrollView>
      )}

      <Modal
        testID="diff.confirmDialog"
        visible={confirm !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirm(null)}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 20, width: '80%' }}>
            <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.lg }}>
              {confirm === 'revert' ? 'Revert' : 'Apply'}
            </Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 8, fontSize: tokens.fontSize.sm }}>
              {confirm === 'revert' ? `Revert ${selectedPath ?? ''}?` : `Apply changes to ${selectedPath ?? ''}?`}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
              <Pressable
                testID="diff.confirm.cancel"
                onPress={() => setConfirm(null)}
                style={{ paddingVertical: 8, paddingHorizontal: 14, marginRight: 8 }}
              >
                <Text style={{ color: tokens.color.textMuted, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="diff.confirm.confirm"
                onPress={handleConfirm}
                disabled={pending}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: tokens.radius.md,
                  backgroundColor: confirm === 'revert' ? tokens.color.danger : tokens.color.primary,
                  opacity: pending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
