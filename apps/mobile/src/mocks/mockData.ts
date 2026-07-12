import type { Chat, Project, Task } from '@pi-agents/contracts';

export const mockProjects: Project[] = [
  {
    id: 'project-demo',
    name: 'pi.dev workspace',
    repoPath: '/var/lib/agents/projects/pi-dev/repo',
    defaultBranch: 'main',
  agentsDir: '.agents',
  ignisUrl: null,
    activeTaskCount: 3,
    updatedAt: new Date().toISOString(),
  },
];

export const mockChats: Chat[] = [
  {
    id: 'chat-demo',
    projectId: 'project-demo',
    title: 'Debounce implementation',
    mode: 'implementation',
    activeTaskId: 'task-demo',
  piSessionId: 'session-demo',
  parentChatId: null,
  activeLeafEntryId: null,
    lastMessagePreview: 'Сейчас добавлю debounce в проект',
    updatedAt: new Date().toISOString(),
  },
];

export const mockTasks: Task[] = [
  {
    id: 'task-demo',
    projectId: 'project-demo',
    sourceChatId: 'chat-demo',
    title: 'Написать debounce на TypeScript',
    mode: 'implementation',
    status: 'needs_review',
    piSessionId: 'session-demo',
    branchName: 'agents/task/task-demo',
    worktreePath: '/var/lib/agents/projects/pi-dev/worktrees/task-demo',
    baseSha: '0123456789abcdef',
    currentHeadSha: 'fedcba9876543210',
    startPiEntryId: 'entry-1',
    endPiEntryId: 'entry-2',
    changedFiles: 1,
    updatedAt: new Date().toISOString(),
  },
];
