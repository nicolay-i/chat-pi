import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { tokens } from '@/theme/tokens';
import { mockApprovals, type Approval, type ApprovalKind } from '@/features/approvals/mockApprovals';

const KIND_LABEL: Record<ApprovalKind, string> = {
  merge: 'merge',
  shell_command: 'shell',
  package_trust: 'package',
  patch_apply: 'patch',
  mcp_access: 'mcp',
};

const KIND_BG: Record<ApprovalKind, string> = {
  merge: '#6258F4',
  shell_command: '#0EA5E9',
  package_trust: '#F97316',
  patch_apply: '#10B981',
  mcp_access: '#EC4899',
};

function ApprovalRow({
  approval,
  onApprove,
  onReject,
}: {
  approval: Approval;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <View
      testID={`approvals.item.${approval.id}`}
      style={{
        marginBottom: tokens.spacing.md,
        padding: tokens.spacing.lg,
        borderRadius: tokens.radius.md,
        backgroundColor: tokens.color.surface,
        borderWidth: 1,
        borderColor: tokens.color.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.xs }}>
        <View
          style={{
            backgroundColor: KIND_BG[approval.kind],
            borderRadius: tokens.radius.pill,
            paddingHorizontal: tokens.spacing.sm,
            paddingVertical: 2,
            marginRight: tokens.spacing.sm,
          }}
        >
          <Text style={{ color: '#fff', fontSize: tokens.fontSize.xs, fontWeight: '700' }}>
            {KIND_LABEL[approval.kind]}
          </Text>
        </View>
        <Text style={{ flex: 1, fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.color.text }}>
          {approval.title}
        </Text>
      </View>
      <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.md }}>
        {approval.detail}
      </Text>
      <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 4 }}>
        {approval.createdAt}
      </Text>
      <View style={{ flexDirection: 'row', marginTop: tokens.spacing.md }}>
        <Pressable
          testID={`approvals.approve.${approval.id}`}
          accessibilityRole="button"
          accessibilityLabel="Одобрить"
          onPress={onApprove}
          style={{
            flex: 1,
            marginRight: tokens.spacing.sm,
            paddingVertical: tokens.spacing.sm,
            borderRadius: tokens.radius.sm,
            backgroundColor: tokens.color.primary,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>✓ Одобрить</Text>
        </Pressable>
        <Pressable
          testID={`approvals.reject.${approval.id}`}
          accessibilityRole="button"
          accessibilityLabel="Отклонить"
          onPress={onReject}
          style={{
            flex: 1,
            paddingVertical: tokens.spacing.sm,
            borderRadius: tokens.radius.sm,
            backgroundColor: tokens.color.surfaceMuted,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>✗ Отклонить</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ApprovalsScreen() {
  const [pending, setPending] = useState<Approval[]>(() => [...mockApprovals]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (id: string, decision: 'approved' | 'rejected') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(`#${id} ${decision === 'approved' ? 'одобрено' : 'отклонено'}`);
    toastTimer.current = setTimeout(() => setToast(null), 1500);
  };

  const resolve = (id: string, decision: 'approved' | 'rejected') => {
    setPending((cur) => cur.filter((a) => a.id !== id));
    showToast(id, decision);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tokens.color.background }}
      contentContainerStyle={{ padding: tokens.spacing.lg }}
    >
      <Text style={{ fontSize: 24, fontWeight: '700', color: tokens.color.text, marginBottom: tokens.spacing.md }}>
        Согласования
      </Text>

      {pending.length === 0 ? (
        <View testID="approvals.empty" style={{ alignItems: 'center', marginTop: tokens.spacing.xl }}>
          <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.md }}>
            Нет ожидающих согласований
          </Text>
        </View>
      ) : (
        <View testID="approvals.list">
          {pending.map((a) => (
            <ApprovalRow
              key={a.id}
              approval={a}
              onApprove={() => resolve(a.id, 'approved')}
              onReject={() => resolve(a.id, 'rejected')}
            />
          ))}
        </View>
      )}

      {toast ? (
        <Text style={{ marginTop: tokens.spacing.md, textAlign: 'center', color: tokens.color.textMuted }}>
          {toast}
        </Text>
      ) : null}
    </ScrollView>
  );
}
