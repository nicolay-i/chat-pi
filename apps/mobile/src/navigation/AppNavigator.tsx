import { NavigationContainer, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { type ComponentType, type ReactNode } from 'react';
import { ProjectWebShell } from '@/components/shell/ProjectWebShell';
import { navigationRef, type RootStackParamList, type ScreenParams } from './index';
import { routeDefinitions } from './routes';

import SetupScreen from '../../app/setup';
import ApprovalsScreen from '../../app/approvals';
import SettingsScreen from '../../app/settings';
import ProjectsScreen from '../../app/projects';
import NewProjectScreen from '../../app/projects/new';
import RootChatScreen from '../../app/chat/[chatId]';
import ProjectDashboardScreen from '../../app/projects/[projectId]';
import ProjectActionsScreen from '../../app/projects/[projectId]/actions';
import ProjectFilesScreen from '../../app/projects/[projectId]/files';
import ProjectFileViewScreen from '../../app/projects/[projectId]/files/view';
import ProjectObsidianScreen from '../../app/projects/[projectId]/obsidian';
import ProjectChatsScreen from '../../app/projects/[projectId]/chats';
import NewProjectChatScreen from '../../app/projects/[projectId]/chats/new';
import ProjectChatScreen from '../../app/projects/[projectId]/chats/[chatId]';
import ProjectChatActionsScreen from '../../app/projects/[projectId]/chats/[chatId]/actions';
import ProjectChatTraceScreen from '../../app/projects/[projectId]/chats/[chatId]/trace';
import ProjectChatTreeScreen from '../../app/projects/[projectId]/chats/[chatId]/tree';
import ProjectMessageScreen from '../../app/projects/[projectId]/chats/[chatId]/messages/[messageId]';
import ProjectToolCallScreen from '../../app/projects/[projectId]/chats/[chatId]/toolcalls/[toolCallId]';
import ProjectTasksScreen from '../../app/projects/[projectId]/tasks';
import TaskDetailScreen from '../../app/projects/[projectId]/tasks/[taskId]';
import TaskCheckpointsScreen from '../../app/projects/[projectId]/tasks/[taskId]/checkpoints';
import TaskConflictsScreen from '../../app/projects/[projectId]/tasks/[taskId]/conflicts';
import TaskDiffScreen from '../../app/projects/[projectId]/tasks/[taskId]/diff';
import TaskMergeScreen from '../../app/projects/[projectId]/tasks/[taskId]/merge';
import TaskVscodeScreen from '../../app/projects/[projectId]/tasks/[taskId]/vscode';
import ProjectSettingsScreen from '../../app/projects/[projectId]/settings/project';
import ProjectProvidersScreen from '../../app/projects/[projectId]/settings/providers';
import ProjectSkillsScreen from '../../app/projects/[projectId]/settings/skills';
import ProjectSkillScreen from '../../app/projects/[projectId]/settings/skills/[skillId]';
import ProjectPromptsScreen from '../../app/projects/[projectId]/settings/prompts';
import ProjectPromptScreen from '../../app/projects/[projectId]/settings/prompts/[templateId]';
import ProjectPackagesScreen from '../../app/projects/[projectId]/settings/packages';
import ProjectPackageInstallScreen from '../../app/projects/[projectId]/settings/packages/install';
import ProjectMcpScreen from '../../app/projects/[projectId]/settings/mcp';
import ProjectThemeScreen from '../../app/projects/[projectId]/settings/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const linking = {
  prefixes: [Linking.createURL('/')],
  config: {
    screens: Object.fromEntries(
      routeDefinitions.map((definition) => [definition.name, definition.path.slice(1)]),
    ),
  },
};

type ScreenComponent = ComponentType;
const screens: Record<string, ScreenComponent> = {
  Setup: SetupScreen,
  Approvals: ApprovalsScreen,
  Settings: SettingsScreen,
  Projects: ProjectsScreen,
  NewProject: NewProjectScreen,
  RootChat: RootChatScreen,
  ProjectDashboard: ProjectDashboardScreen,
  ProjectActions: ProjectActionsScreen,
  ProjectFiles: ProjectFilesScreen,
  ProjectFileView: ProjectFileViewScreen,
  ProjectObsidian: ProjectObsidianScreen,
  ProjectChats: ProjectChatsScreen,
  NewProjectChat: NewProjectChatScreen,
  ProjectChat: ProjectChatScreen,
  ProjectChatActions: ProjectChatActionsScreen,
  ProjectChatTrace: ProjectChatTraceScreen,
  ProjectChatTree: ProjectChatTreeScreen,
  ProjectMessage: ProjectMessageScreen,
  ProjectToolCall: ProjectToolCallScreen,
  ProjectTasks: ProjectTasksScreen,
  TaskDetail: TaskDetailScreen,
  TaskCheckpoints: TaskCheckpointsScreen,
  TaskConflicts: TaskConflictsScreen,
  TaskDiff: TaskDiffScreen,
  TaskMerge: TaskMergeScreen,
  TaskVscode: TaskVscodeScreen,
  ProjectSettings: ProjectSettingsScreen,
  ProjectProviders: ProjectProvidersScreen,
  ProjectSkills: ProjectSkillsScreen,
  ProjectSkill: ProjectSkillScreen,
  ProjectPrompts: ProjectPromptsScreen,
  ProjectPrompt: ProjectPromptScreen,
  ProjectPackages: ProjectPackagesScreen,
  ProjectPackageInstall: ProjectPackageInstallScreen,
  ProjectMcp: ProjectMcpScreen,
  ProjectTheme: ProjectThemeScreen,
};

function ProjectShell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const projectId = (route.params as ScreenParams | undefined)?.projectId;
  return projectId ? <ProjectWebShell projectId={projectId}>{children}</ProjectWebShell> : <>{children}</>;
}

function projectScreen(Component: ScreenComponent) {
  return function ProjectScreen() {
    return <ProjectShell><Component /></ProjectShell>;
  };
}

export function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator initialRouteName="Setup" screenOptions={{ headerBackTitle: 'Back' }}>
        {routeDefinitions.map((definition) => {
          const Component = screens[definition.name];
          const isProjectScreen = definition.path.startsWith('/projects/:projectId');
          return (
            <Stack.Screen
              key={definition.name}
              name={definition.name}
              component={isProjectScreen ? projectScreen(Component) : Component}
              options={{ title: definition.title, headerShown: definition.name !== 'Setup' }}
            />
          );
        })}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
