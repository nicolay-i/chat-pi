import type { DatabaseSync } from 'node:sqlite';
import { config } from '../config';
import { createEventStore } from '../realtime/eventStore';
import { createTasksRepository } from '../db/repositories/tasksRepository';
import { createPiSessionsRepository } from '../db/repositories/piSessionsRepository';
import { createProjectsRepository } from '../db/repositories/projectsRepository';
import { createChatsRepository } from '../db/repositories/chatsRepository';
import { createQueuedMessagesRepository } from '../db/repositories/queuedMessagesRepository';
import { createRuntimeProcessesRepository } from '../db/repositories/runtimeProcessesRepository';
import { createChatRuntime, type ChatRuntime } from '../services/chatRuntime';
import { createChatService } from '../services/chatService';
import { GitWorktreeService } from '../services/gitWorktreeService';
import { createProjectService } from '../services/projectService';
import { createProjectRemoteSyncService } from '../services/projectRemoteSyncService';
import { createIgnisService } from '../services/ignisService';
import { createTaskService } from '../services/taskService';
import { PiRuntimeAdapter, createRuntime, type PiRuntime } from '../services/piRuntimeService';
import { RuntimeManager } from '../services/runtimeManager';
import { createCheckpointService } from '../services/checkpointService';
import { createForkService } from '../services/forkService';
import { createRollbackService } from '../services/rollbackService';
import { createMergeService } from '../services/mergeService';
import { createGitTaskService } from '../services/gitTaskService';
import { createProjectFilesService } from '../services/projectFilesService';
import { createActionEngine } from '../services/actionEngine';
import { createProviderService } from '../services/providerService';
import { createPackageService } from '../services/packageService';
import { createSkillRunner } from '../services/skillRunner';
import { createPromptStore } from '../services/promptStore';
import { createMcpStore } from '../services/mcpStore';
import { createThemeStore } from '../services/themeStore';
import { createTaskCancellationService } from '../services/taskCancellationService';
import { InMemoryProjectOperationMutex } from '../services/projectOperationMutex';

export type CreateAppOptions = { chatRuntime?: ChatRuntime; taskRuntime?: PiRuntime };

export function createServiceContainer(db: DatabaseSync, options: CreateAppOptions = {}) {
  const worktree = new GitWorktreeService();
  const projectService = createProjectService(db, { projectsRoot: config.piProjectsRoot });
  const taskService = createTaskService(db, { worktree });
  const chatService = createChatService(db, { tasks: taskService });
  const eventStore = createEventStore(db);
  const taskRecords = createTasksRepository(db);
  const piSessionRecords = createPiSessionsRepository(db);
  const queuedMessages = createQueuedMessagesRepository(db);
  const runtimeProcesses = createRuntimeProcessesRepository(db);
  const projectRecords = createProjectsRepository(db);
  const checkpointService = createCheckpointService(db, { worktree, events: eventStore, tasks: taskRecords });
  const chatsRepository = createChatsRepository(db);
  const forkService = createForkService(db, { worktree, events: eventStore, tasks: taskRecords });
  const rollbackService = createRollbackService(db, {
    forkService,
    events: eventStore,
    tasks: taskRecords,
    chats: chatsRepository,
    piSessions: piSessionRecords,
  });
  const projectOperations = new InMemoryProjectOperationMutex();
  const projectRemoteSyncService = createProjectRemoteSyncService({
    projects: projectRecords,
    tasks: taskRecords,
    events: eventStore,
    operations: projectOperations,
  });
  const ignisService = createIgnisService({ projects: projectRecords, tasks: taskRecords });
  const mergeService = createMergeService(db, { worktree, events: eventStore, tasks: taskRecords, chats: chatsRepository, operations: projectOperations });
  const taskCancellationService = createTaskCancellationService({
    tasks: taskRecords,
    projects: projectRecords,
    chats: chatsRepository,
    worktree,
    events: eventStore,
    queuedMessages,
  });
  const gitTaskService = createGitTaskService({ tasks: taskRecords, events: eventStore, operations: projectOperations });
  const projectFiles = createProjectFilesService(projectRecords);
  const actionEngine = createActionEngine(db);
  const providerService = createProviderService(db, { eventStore });
  const packageService = createPackageService(db, { eventStore, projects: projectRecords });
  const skillRunner = createSkillRunner(db, { projects: projectRecords });
  const promptStore = createPromptStore(projectRecords);
  const mcpStore = createMcpStore(projectRecords);
  const themeStore = createThemeStore(projectRecords);
  const taskRuntime = options.taskRuntime ?? (config.agentRuntime === 'pi'
    ? new PiRuntimeAdapter({
      piBin: config.piBin,
      nodeBin: config.piNode,
      provider: config.piProvider,
      model: config.piModel,
      agentDir: config.piAgentDir,
      defaultCwd: config.agentCwd,
      sandbox: { mode: config.piSandboxMode, binary: config.piSandboxBin, allowedEnv: config.piSandboxEnvAllowlist },
    })
    : createRuntime('fake'));
  const runtimeManager = new RuntimeManager({
    runtime: taskRuntime,
    eventStore,
    tasks: taskRecords,
    chats: chatsRepository,
    piSessions: piSessionRecords,
    queuedMessages,
    runtimeProcesses,
    projects: projectRecords,
    checkpoints: checkpointService,
    runTimeoutMs: config.piRunTimeoutMs,
  });
  // A crashed backend cannot observe its child exit. Mark its audit rows
  // terminal before recovering the durable Task/session state.
  runtimeProcesses.finishAllRunning('aborted', 'backend_restarted');
  void runtimeManager.recoverInterruptedRuns();
  const chatRuntime = options.chatRuntime ?? createChatRuntime(config.agentRuntime, {
    cwd: config.agentCwd,
    piBin: config.piBin,
    nodeBin: config.piNode,
    provider: config.piProvider,
    model: config.piModel,
    agentDir: config.piAgentDir,
  });

  const dispose = async (): Promise<void> => {
    const results = await Promise.allSettled([runtimeManager.dispose(), chatRuntime.dispose?.()]);
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failure) throw failure.reason;
  };

  return { projectService, projectRemoteSyncService, ignisService, taskService, chatService, eventStore, chatRuntime, runtimeManager, taskRecords, projectRecords, piSessionRecords, queuedMessages, runtimeProcesses, checkpointService, forkService, rollbackService, mergeService, taskCancellationService, gitTaskService, projectFiles, actionEngine, providerService, packageService, skillRunner, promptStore, mcpStore, themeStore, dispose };
}

export type ServiceContainer = ReturnType<typeof createServiceContainer>;
