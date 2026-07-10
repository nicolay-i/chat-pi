export type ApprovalKind =
  | 'merge'
  | 'shell_command'
  | 'package_trust'
  | 'patch_apply'
  | 'mcp_access';

export type Approval = {
  id: string;
  kind: ApprovalKind;
  title: string;
  detail: string;
  createdAt: string;
};

export const mockApprovals: Approval[] = [
  {
    id: 'ap-1',
    kind: 'merge',
    title: 'Слить ветку feature/auth в main',
    detail: 'fast-forward, 12 коммитов, конфликтов не обнаружено',
    createdAt: '2026-07-06T09:12:00.000Z',
  },
  {
    id: 'ap-2',
    kind: 'shell_command',
    title: 'Выполнить команду сборки',
    detail: 'pnpm --filter mobile build',
    createdAt: '2026-07-06T09:30:00.000Z',
  },
  {
    id: 'ap-3',
    kind: 'package_trust',
    title: 'Доверять пакету expo-secure-store',
    detail: 'Версия 6.1.1, 2 известных уязвимости устранены',
    createdAt: '2026-07-06T10:01:00.000Z',
  },
  {
    id: 'ap-4',
    kind: 'patch_apply',
    title: 'Применить патч auth.ts',
    detail: 'src/features/auth/auth.ts · +24 -7',
    createdAt: '2026-07-06T10:15:00.000Z',
  },
  {
    id: 'ap-5',
    kind: 'mcp_access',
    title: 'Доступ к MCP серверу filesystem',
    detail: 'Запрос доступа к /workspaces/pi',
    createdAt: '2026-07-06T10:42:00.000Z',
  },
];
