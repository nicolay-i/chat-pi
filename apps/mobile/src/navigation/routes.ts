export type RouteDefinition = {
  name: string;
  path: string;
  relativeBase: (params: Record<string, string>) => string;
  title?: string;
};

const project = (params: Record<string, string>) => `/projects/${params.projectId}`;
const task = (params: Record<string, string>) => `${project(params)}/tasks/${params.taskId}`;
const chat = (params: Record<string, string>) => `${project(params)}/chats/${params.chatId}`;
const projectSettings = (params: Record<string, string>) => `${project(params)}/settings`;

export const routeDefinitions: readonly RouteDefinition[] = [
  { name: 'Setup', path: '/setup', relativeBase: () => '/' },
  { name: 'Approvals', path: '/approvals', relativeBase: () => '/', title: 'Approvals' },
  { name: 'Settings', path: '/settings', relativeBase: () => '/', title: 'Settings' },
  { name: 'Projects', path: '/projects', relativeBase: () => '/', title: 'Projects' },
  { name: 'NewProject', path: '/projects/new', relativeBase: () => '/projects', title: 'New project' },
  { name: 'RootChat', path: '/chat/:chatId', relativeBase: () => '/chat', title: 'Chat' },
  { name: 'ProjectDashboard', path: '/projects/:projectId', relativeBase: project, title: 'Project' },
  { name: 'ProjectActions', path: '/projects/:projectId/actions', relativeBase: project, title: 'Actions' },
  { name: 'ProjectFiles', path: '/projects/:projectId/files', relativeBase: project, title: 'Files' },
  { name: 'ProjectFileView', path: '/projects/:projectId/files/view', relativeBase: project, title: 'File' },
  { name: 'ProjectObsidian', path: '/projects/:projectId/obsidian', relativeBase: project, title: 'Obsidian' },
  { name: 'ProjectChats', path: '/projects/:projectId/chats', relativeBase: project, title: 'Chats' },
  { name: 'NewProjectChat', path: '/projects/:projectId/chats/new', relativeBase: chat, title: 'New chat' },
  { name: 'ProjectChat', path: '/projects/:projectId/chats/:chatId', relativeBase: chat, title: 'Chat' },
  { name: 'ProjectChatActions', path: '/projects/:projectId/chats/:chatId/actions', relativeBase: chat, title: 'Actions' },
  { name: 'ProjectChatTrace', path: '/projects/:projectId/chats/:chatId/trace', relativeBase: chat, title: 'Trace' },
  { name: 'ProjectChatTree', path: '/projects/:projectId/chats/:chatId/tree', relativeBase: chat, title: 'Conversation tree' },
  { name: 'ProjectMessage', path: '/projects/:projectId/chats/:chatId/messages/:messageId', relativeBase: chat, title: 'Message' },
  { name: 'ProjectToolCall', path: '/projects/:projectId/chats/:chatId/toolcalls/:toolCallId', relativeBase: chat, title: 'Tool call' },
  { name: 'ProjectTasks', path: '/projects/:projectId/tasks', relativeBase: project, title: 'Tasks' },
  { name: 'TaskDetail', path: '/projects/:projectId/tasks/:taskId', relativeBase: task, title: 'Task' },
  { name: 'TaskCheckpoints', path: '/projects/:projectId/tasks/:taskId/checkpoints', relativeBase: task, title: 'Checkpoints' },
  { name: 'TaskConflicts', path: '/projects/:projectId/tasks/:taskId/conflicts', relativeBase: task, title: 'Conflicts' },
  { name: 'TaskDiff', path: '/projects/:projectId/tasks/:taskId/diff', relativeBase: task, title: 'Diff' },
  { name: 'TaskMerge', path: '/projects/:projectId/tasks/:taskId/merge', relativeBase: task, title: 'Merge' },
  { name: 'TaskVscode', path: '/projects/:projectId/tasks/:taskId/vscode', relativeBase: task, title: 'VSCode' },
  { name: 'ProjectSettings', path: '/projects/:projectId/settings/project', relativeBase: project, title: 'Project settings' },
  { name: 'ProjectProviders', path: '/projects/:projectId/settings/providers', relativeBase: projectSettings, title: 'Providers' },
  { name: 'ProjectSkills', path: '/projects/:projectId/settings/skills', relativeBase: projectSettings, title: 'Skills' },
  { name: 'ProjectSkill', path: '/projects/:projectId/settings/skills/:skillId', relativeBase: projectSettings, title: 'Skill' },
  { name: 'ProjectPrompts', path: '/projects/:projectId/settings/prompts', relativeBase: projectSettings, title: 'Prompts' },
  { name: 'ProjectPrompt', path: '/projects/:projectId/settings/prompts/:templateId', relativeBase: projectSettings, title: 'Prompt' },
  { name: 'ProjectPackages', path: '/projects/:projectId/settings/packages', relativeBase: projectSettings, title: 'Packages' },
  { name: 'ProjectPackageInstall', path: '/projects/:projectId/settings/packages/install', relativeBase: projectSettings, title: 'Install package' },
  { name: 'ProjectMcp', path: '/projects/:projectId/settings/mcp', relativeBase: projectSettings, title: 'MCP' },
  { name: 'ProjectTheme', path: '/projects/:projectId/settings/theme', relativeBase: projectSettings, title: 'Theme' },
];

function toMatcher(path: string): RegExp {
  const pattern = path.replace(/:[a-zA-Z0-9_]+/g, '([^/]+)');
  return new RegExp(`^${pattern}$`);
}

function parameterNames(path: string): string[] {
  return [...path.matchAll(/:([a-zA-Z0-9_]+)/g)].map((match) => match[1]);
}

export type MatchedRoute = {
  definition: RouteDefinition;
  params: Record<string, string>;
};

export function matchPath(pathname: string): MatchedRoute | null {
  for (const definition of routeDefinitions) {
    const match = pathname.match(toMatcher(definition.path));
    if (!match) continue;

    const params = Object.fromEntries(
      parameterNames(definition.path).map((name, index) => [name, decodeURIComponent(match[index + 1])]),
    );
    return { definition, params };
  }
  return null;
}
