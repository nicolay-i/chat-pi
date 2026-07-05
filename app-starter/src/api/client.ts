import {
  ActionRunSchema,
  ActionSchema,
  ApiErrorSchema,
  CapabilitiesSchema,
  ChatSchema,
  CheckpointSchema,
  CreateChatInputSchema,
  CreateProjectInputSchema,
  DiffEntrySchema,
  DiffFileContentSchema,
  FileContentSchema,
  FileNodeSchema,
  HealthResponseSchema,
  PackageInstallResultSchema,
  PackageManifestSchema,
  PromptTemplateSchema,
  ProjectSchema,
  ProviderSchema,
  ProviderTestResultSchema,
  SearchResultSchema,
  SendMessageInputSchema,
  SkillSchema,
  TaskSchema,
  UpdateProjectInputSchema,
  ValidateRepoInputSchema,
  ValidateRepoResultSchema,
  McpServerSchema,
  type Action,
  type ActionRun,
  type Capabilities,
  type Chat,
  type Checkpoint,
  type CreateChatInput,
  type CreateProjectInput,
  type DiffEntry,
  type DiffFileContent,
  type FileContent,
  type FileNode,
  type HealthResponse,
  type PackageInstallResult,
  type PackageManifest,
  type PromptTemplate,
  type Project,
  type Provider,
  type ProviderTestResult,
  type SearchResult,
  type SendMessageInput,
  type Skill,
  type Task,
  type UpdateProjectInput,
  type ValidateRepoInput,
  type ValidateRepoResult,
  type McpServer,
} from '@pi-agents/contracts';
import type { ApiError } from '@pi-agents/contracts';
import { z } from 'zod';

export class ApiClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: unknown;
  readonly apiError: ApiError;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = 'ApiClientError';
    this.apiError = apiError;
    this.code = apiError.code;
    this.retryable = apiError.retryable ?? false;
    this.details = apiError.details;
  }
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  // --- Health / capabilities ---
  async getHealth(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw await this.toError(res);
    return HealthResponseSchema.parse(await res.json());
  }

  async getCapabilities(): Promise<Capabilities> {
    const res = await fetch(`${this.baseUrl}/api/capabilities`);
    if (!res.ok) throw await this.toError(res);
    return CapabilitiesSchema.parse(await res.json());
  }

  // --- Projects ---
  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${this.baseUrl}/api/projects`);
    if (!res.ok) throw await this.toError(res);
    const json = await res.json();
    return ProjectSchema.array().parse(json);
  }

  async getProject(projectId: string): Promise<Project> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}`);
    if (!res.ok) throw await this.toError(res);
    return ProjectSchema.parse(await res.json());
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const res = await fetch(`${this.baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(CreateProjectInputSchema.parse(input)),
    });
    if (!res.ok) throw await this.toError(res);
    return ProjectSchema.parse(await res.json());
  }

  async updateProject(projectId: string, input: UpdateProjectInput): Promise<Project> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(UpdateProjectInputSchema.parse(input)),
    });
    if (!res.ok) throw await this.toError(res);
    return ProjectSchema.parse(await res.json());
  }

  async deleteProject(projectId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw await this.toError(res);
  }

  async validateRepo(projectId: string, input: ValidateRepoInput): Promise<ValidateRepoResult> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/validate-repo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ValidateRepoInputSchema.parse(input)),
    });
    if (!res.ok) throw await this.toError(res);
    return ValidateRepoResultSchema.parse(await res.json());
  }

  // --- Chats ---
  async getChats(projectId: string): Promise<Chat[]> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/chats`);
    if (!res.ok) throw await this.toError(res);
    return ChatSchema.array().parse(await res.json());
  }

  async getChat(chatId: string): Promise<Chat> {
    const res = await fetch(`${this.baseUrl}/api/chats/${encodeURIComponent(chatId)}`);
    if (!res.ok) throw await this.toError(res);
    return ChatSchema.parse(await res.json());
  }

  async createChat(projectId: string, input: CreateChatInput): Promise<Chat> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/chats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(CreateChatInputSchema.parse(input)),
    });
    if (!res.ok) throw await this.toError(res);
    return ChatSchema.parse(await res.json());
  }

  async updateChat(chatId: string, patch: Partial<Chat>): Promise<Chat> {
    const res = await fetch(`${this.baseUrl}/api/chats/${encodeURIComponent(chatId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw await this.toError(res);
    return ChatSchema.parse(await res.json());
  }

  async archiveChat(chatId: string): Promise<Chat> {
    const res = await fetch(`${this.baseUrl}/api/chats/${encodeURIComponent(chatId)}/archive`, {
      method: 'POST',
    });
    if (!res.ok) throw await this.toError(res);
    return ChatSchema.parse(await res.json());
  }

  async exportChat(chatId: string): Promise<{ url: string }> {
    const res = await fetch(`${this.baseUrl}/api/chats/${encodeURIComponent(chatId)}/export`, {
      method: 'POST',
    });
    if (!res.ok) throw await this.toError(res);
    return UrlResultSchema.parse(await res.json());
  }

  async getChatTree(chatId: string): Promise<Task[]> {
    const res = await fetch(`${this.baseUrl}/api/chats/${encodeURIComponent(chatId)}/tree`);
    if (!res.ok) throw await this.toError(res);
    return TaskSchema.array().parse(await res.json());
  }

  async getChatTrace(chatId: string): Promise<unknown[]> {
    const res = await fetch(`${this.baseUrl}/api/chats/${encodeURIComponent(chatId)}/trace`);
    if (!res.ok) throw await this.toError(res);
    return TraceResultSchema.parse(await res.json());
  }

  // --- Messages / queue ---
  async sendMessage(chatId: string, input: SendMessageInput): Promise<{ ok: true }> {
    const res = await fetch(`${this.baseUrl}/api/chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(SendMessageInputSchema.parse(input)),
    });
    if (!res.ok) throw await this.toError(res);
    return { ok: true };
  }

  async steer(taskId: string, input: SendMessageInput): Promise<{ ok: true }> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/steer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(SendMessageInputSchema.parse(input)),
    });
    if (!res.ok) throw await this.toError(res);
    return { ok: true };
  }

  async followUp(taskId: string, input: SendMessageInput): Promise<{ ok: true }> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/follow-up`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(SendMessageInputSchema.parse(input)),
    });
    if (!res.ok) throw await this.toError(res);
    return { ok: true };
  }

  async abort(taskId: string): Promise<{ ok: true }> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/abort`, {
      method: 'POST',
    });
    if (!res.ok) throw await this.toError(res);
    return { ok: true };
  }

  async abortAndReplace(taskId: string, input: SendMessageInput): Promise<{ ok: true }> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/abort-and-replace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(SendMessageInputSchema.parse(input)),
    });
    if (!res.ok) throw await this.toError(res);
    return { ok: true };
  }

  // --- Tasks ---
  async getTasks(projectId: string): Promise<Task[]> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/tasks`);
    if (!res.ok) throw await this.toError(res);
    return TaskSchema.array().parse(await res.json());
  }

  async getTask(taskId: string): Promise<Task> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}`);
    if (!res.ok) throw await this.toError(res);
    return TaskSchema.parse(await res.json());
  }

  async forkTask(taskId: string): Promise<Task> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/fork`, {
      method: 'POST',
    });
    if (!res.ok) throw await this.toError(res);
    return TaskSchema.parse(await res.json());
  }

  async rollbackTask(taskId: string, options: { checkpointId?: string } = {}): Promise<Task> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/rollback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw await this.toError(res);
    return TaskSchema.parse(await res.json());
  }

  async rebaseTask(taskId: string): Promise<Task> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/rebase`, {
      method: 'POST',
    });
    if (!res.ok) throw await this.toError(res);
    return TaskSchema.parse(await res.json());
  }

  async mergeTask(
    taskId: string,
    options: { strategy: 'squash' | 'merge' | 'rebase' | 'patch'; commitMessage?: string },
  ): Promise<Task> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/merge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw await this.toError(res);
    return TaskSchema.parse(await res.json());
  }

  async archiveTask(taskId: string): Promise<Task> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/archive`, {
      method: 'POST',
    });
    if (!res.ok) throw await this.toError(res);
    return TaskSchema.parse(await res.json());
  }

  // --- Diff / files ---
  async getTaskDiff(taskId: string): Promise<DiffEntry[]> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/diff`);
    if (!res.ok) throw await this.toError(res);
    return DiffEntrySchema.array().parse(await res.json());
  }

  async getTaskDiffFile(taskId: string, encodedPath: string): Promise<DiffFileContent> {
    const res = await fetch(
      `${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/diff/files/${encodeURIComponent(encodedPath)}`,
    );
    if (!res.ok) throw await this.toError(res);
    return DiffFileContentSchema.parse(await res.json());
  }

  async revertFile(taskId: string, options: { path: string }): Promise<Task> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/revert-file`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw await this.toError(res);
    return TaskSchema.parse(await res.json());
  }

  async getProjectFiles(projectId: string): Promise<FileNode[]> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/files`);
    if (!res.ok) throw await this.toError(res);
    return FileNodeSchema.array().parse(await res.json());
  }

  async getFileContent(projectId: string, path: string): Promise<FileContent> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(path)}`,
    );
    if (!res.ok) throw await this.toError(res);
    return FileContentSchema.parse(await res.json());
  }

  async putFileContent(projectId: string, input: FileContent): Promise<FileContent> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/files/content`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(FileContentSchema.parse(input)),
    });
    if (!res.ok) throw await this.toError(res);
    return FileContentSchema.parse(await res.json());
  }

  async searchFiles(projectId: string, options: { query: string }): Promise<SearchResult[]> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/files/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw await this.toError(res);
    return SearchResultSchema.array().parse(await res.json());
  }

  // --- Checkpoints ---
  async getCheckpoints(taskId: string): Promise<Checkpoint[]> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/checkpoints`);
    if (!res.ok) throw await this.toError(res);
    return CheckpointSchema.array().parse(await res.json());
  }

  async createCheckpoint(taskId: string, options: { message: string }): Promise<Checkpoint> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/checkpoints`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw await this.toError(res);
    return CheckpointSchema.parse(await res.json());
  }

  async getCheckpointDiff(taskId: string, checkpointId: string): Promise<DiffEntry[]> {
    const res = await fetch(
      `${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/checkpoints/${encodeURIComponent(checkpointId)}/diff`,
    );
    if (!res.ok) throw await this.toError(res);
    return DiffEntrySchema.array().parse(await res.json());
  }

  async forkCheckpoint(taskId: string, checkpointId: string): Promise<Task> {
    const res = await fetch(
      `${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/checkpoints/${encodeURIComponent(checkpointId)}/fork`,
      { method: 'POST' },
    );
    if (!res.ok) throw await this.toError(res);
    return TaskSchema.parse(await res.json());
  }

  async rollbackCheckpoint(taskId: string, checkpointId: string): Promise<Task> {
    const res = await fetch(
      `${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/checkpoints/${encodeURIComponent(checkpointId)}/rollback`,
      { method: 'POST' },
    );
    if (!res.ok) throw await this.toError(res);
    return TaskSchema.parse(await res.json());
  }

  // --- Actions ---
  async getActions(projectId: string, options: { context?: string } = {}): Promise<Action[]> {
    const url = new URL(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/actions`);
    if (options.context) url.searchParams.set('context', options.context);
    const res = await fetch(url.toString());
    if (!res.ok) throw await this.toError(res);
    return ActionSchema.array().parse(await res.json());
  }

  async runAction(actionId: string, options: { input?: Record<string, unknown> } = {}): Promise<ActionRun> {
    const res = await fetch(`${this.baseUrl}/api/actions/${encodeURIComponent(actionId)}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw await this.toError(res);
    return ActionRunSchema.parse(await res.json());
  }

  async getActionRun(actionRunId: string): Promise<ActionRun> {
    const res = await fetch(`${this.baseUrl}/api/action-runs/${encodeURIComponent(actionRunId)}`);
    if (!res.ok) throw await this.toError(res);
    return ActionRunSchema.parse(await res.json());
  }

  // --- Settings: skills ---
  async getSkills(projectId: string): Promise<Skill[]> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/skills`);
    if (!res.ok) throw await this.toError(res);
    return SkillSchema.array().parse(await res.json());
  }

  async getSkill(projectId: string, skillId: string): Promise<Skill> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/skills/${encodeURIComponent(skillId)}`,
    );
    if (!res.ok) throw await this.toError(res);
    return SkillSchema.parse(await res.json());
  }

  async saveSkill(projectId: string, skillId: string, input: Partial<Skill>): Promise<Skill> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/skills/${encodeURIComponent(skillId)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    if (!res.ok) throw await this.toError(res);
    return SkillSchema.parse(await res.json());
  }

  async testSkill(projectId: string, skillId: string): Promise<{ ok: boolean }> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/skills/${encodeURIComponent(skillId)}/test`,
      { method: 'POST' },
    );
    if (!res.ok) throw await this.toError(res);
    return OkBooleanResultSchema.parse(await res.json());
  }

  // --- Settings: prompts ---
  async getPrompts(projectId: string): Promise<PromptTemplate[]> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/prompts`);
    if (!res.ok) throw await this.toError(res);
    return PromptTemplateSchema.array().parse(await res.json());
  }

  async savePrompt(projectId: string, templateId: string, input: PromptTemplate): Promise<PromptTemplate> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/prompts/${encodeURIComponent(templateId)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(PromptTemplateSchema.parse(input)),
      },
    );
    if (!res.ok) throw await this.toError(res);
    return PromptTemplateSchema.parse(await res.json());
  }

  // --- Settings: packages ---
  async getPackages(projectId: string): Promise<PackageManifest[]> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/packages`);
    if (!res.ok) throw await this.toError(res);
    return PackageManifestSchema.array().parse(await res.json());
  }

  async resolvePackage(projectId: string, input: { name: string; version?: string }): Promise<PackageInstallResult> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/packages/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await this.toError(res);
    return PackageInstallResultSchema.parse(await res.json());
  }

  async installPackage(projectId: string, input: { name: string; version?: string }): Promise<PackageInstallResult> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/packages/install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await this.toError(res);
    return PackageInstallResultSchema.parse(await res.json());
  }

  async trustPackage(projectId: string, installId: string): Promise<PackageInstallResult> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/packages/${encodeURIComponent(installId)}/trust`,
      { method: 'POST' },
    );
    if (!res.ok) throw await this.toError(res);
    return PackageInstallResultSchema.parse(await res.json());
  }

  async removePackage(projectId: string, installId: string): Promise<{ ok: boolean }> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/packages/${encodeURIComponent(installId)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) throw await this.toError(res);
    return OkBooleanResultSchema.parse(await res.json());
  }

  // --- Settings: providers ---
  async getProviders(projectId: string): Promise<Provider[]> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/providers`);
    if (!res.ok) throw await this.toError(res);
    return ProviderSchema.array().parse(await res.json());
  }

  async createProvider(
    projectId: string,
    input: Omit<Provider, 'id'>,
  ): Promise<Provider> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await this.toError(res);
    return ProviderSchema.parse(await res.json());
  }

  async testProvider(projectId: string, providerId: string): Promise<ProviderTestResult> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/providers/${encodeURIComponent(providerId)}/test`,
      { method: 'POST' },
    );
    if (!res.ok) throw await this.toError(res);
    return ProviderTestResultSchema.parse(await res.json());
  }

  // --- Settings: mcp ---
  async getMcp(projectId: string): Promise<McpServer[]> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/mcp`);
    if (!res.ok) throw await this.toError(res);
    return McpServerSchema.array().parse(await res.json());
  }

  async saveMcp(projectId: string, input: McpServer): Promise<McpServer[]> {
    const res = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/mcp`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(McpServerSchema.parse(input)),
    });
    if (!res.ok) throw await this.toError(res);
    return McpServerSchema.array().parse(await res.json());
  }

  async testMcp(projectId: string, serverId: string): Promise<{ ok: boolean }> {
    const res = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/mcp/${encodeURIComponent(serverId)}/test`,
      { method: 'POST' },
    );
    if (!res.ok) throw await this.toError(res);
    return OkBooleanResultSchema.parse(await res.json());
  }

  private async toError(res: Response): Promise<ApiClientError> {
    const json = await res.json().catch(() => ({ code: 'HTTP_ERROR', message: res.statusText }));
    return new ApiClientError(ApiErrorSchema.parse(json));
  }
}

const UrlResultSchema = z.object({ url: z.string() });
const OkBooleanResultSchema = z.object({ ok: z.boolean() });
const TraceResultSchema = z.array(z.unknown());
