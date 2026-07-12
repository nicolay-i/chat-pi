import { z } from 'zod';

export const RunModeSchema = z.enum(['discussion', 'planning', 'implementation', 'orchestration']);
export type RunMode = z.infer<typeof RunModeSchema>;

export const TaskStatusSchema = z.enum([
  'created',
  'creating_worktree',
  'idle',
  'queued',
  'running',
  'aborting',
  'needs_review',
  'stale',
  'checks_running',
  'checks_failed',
  'merge_running',
  'merge_conflict',
  'merged',
  'failed',
  'archived',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  repoPath: z.string(),
  defaultBranch: z.string(),
  agentsDir: z.string().default('.agents'),
  activeTaskCount: z.number().int().nonnegative().default(0),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ChatSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  mode: RunModeSchema,
  activeTaskId: z.string().optional(),
  lastMessagePreview: z.string().optional(),
  updatedAt: z.string(),
});
export type Chat = z.infer<typeof ChatSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sourceChatId: z.string().optional(),
  title: z.string(),
  mode: RunModeSchema,
  status: TaskStatusSchema,
  branchName: z.string(),
  worktreePath: z.string(),
  changedFiles: z.number().int().nonnegative().default(0),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;

export const EventTypeSchema = z.enum([
  'message.created',
  'message.delta',
  'message.completed',
  'run.started',
  'run.completed',
  'run.aborted',
  'run.error',
  'tool.started',
  'tool.output',
  'tool.completed',
  'queue.updated',
  'checkpoint.created',
  'diff.updated',
  'task.status.changed',
  'merge.started',
  'merge.completed',
  'merge.conflict',
  'package.installed',
  'provider.updated',
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const RealtimeEnvelopeSchema = z.object({
  id: z.string(),
  sequence: z.number().int().nonnegative(),
  stream: z.enum(['project', 'chat', 'task']),
  streamId: z.string(),
  type: EventTypeSchema,
  payload: z.unknown(),
  createdAt: z.string(),
});
export type RealtimeEnvelope = z.infer<typeof RealtimeEnvelopeSchema>;

export const AttachmentRefSchema = z.object({
  id: z.string(),
  kind: z.enum(['image', 'file', 'path']),
  uri: z.string(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type AttachmentRef = z.infer<typeof AttachmentRefSchema>;

export const SendMessageInputSchema = z.object({
  text: z.string().min(1),
  behavior: z.enum(['send', 'follow_up', 'steer', 'abort_and_replace']),
  // Lets a client reconcile its optimistic message with the realtime event.
  clientMessageId: z.string().min(1).max(128).optional(),
  mode: RunModeSchema.optional(),
  modelId: z.string().optional(),
  toolProfileId: z.string().optional(),
  attachments: z.array(AttachmentRefSchema).optional(),
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  retryable: z.boolean().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const CapabilitiesSchema = z.object({
  apiVersion: z.string(),
  piAvailable: z.boolean(),
  gitAvailable: z.boolean(),
  supportsWorktrees: z.boolean(),
  supportsSse: z.boolean(),
  supportsWebSocket: z.boolean(),
  supportsPackageInstall: z.boolean(),
  supportsVscodeWeb: z.boolean(),
  supportsIgnis: z.boolean(),
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// --- Project inputs ---
export const CreateProjectInputSchema = z.object({
  name: z.string().min(1),
  repoPath: z.string().min(1),
  defaultBranch: z.string().min(1),
  agentsDir: z.string().optional(),
  initGitIfMissing: z.boolean().optional(),
  scanVault: z.boolean().optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = CreateProjectInputSchema.partial();
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

// --- Repo validation ---
export const ValidateRepoInputSchema = z.object({
  repoPath: z.string().min(1),
  defaultBranch: z.string().min(1),
});
export type ValidateRepoInput = z.infer<typeof ValidateRepoInputSchema>;

export const ValidateRepoResultSchema = z.object({
  valid: z.boolean(),
  branch: z.string().optional(),
  agentsDirExists: z.boolean(),
  error: z.string().optional(),
});
export type ValidateRepoResult = z.infer<typeof ValidateRepoResultSchema>;

// --- Chat input ---
export const CreateChatInputSchema = z.object({
  title: z.string().optional(),
  mode: RunModeSchema,
  createTask: z.boolean().optional(),
  modelId: z.string().optional(),
  toolProfileId: z.string().optional(),
  promptTemplateId: z.string().optional(),
});
export type CreateChatInput = z.infer<typeof CreateChatInputSchema>;

// --- Checkpoints ---
export const CheckpointSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  message: z.string(),
  sha: z.string().optional(),
  changedFiles: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;

// --- Diff ---
export const DiffEntrySchema = z.object({
  path: z.string(),
  status: z.enum(['added', 'modified', 'deleted', 'renamed']),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
export type DiffEntry = z.infer<typeof DiffEntrySchema>;

export const DiffFileContentSchema = z.object({
  path: z.string(),
  hunks: z.array(
    z.object({
      header: z.string(),
      lines: z.array(z.string()),
    }),
  ),
});
export type DiffFileContent = z.infer<typeof DiffFileContentSchema>;

// --- Files ---
export interface FileNode {
  path: string;
  type: 'file' | 'dir';
  size?: number;
  childrenCount?: number;
  children?: FileNode[];
}

export const FileNodeSchema: z.ZodType<FileNode> = z.lazy(() =>
  z.object({
    path: z.string(),
    type: z.enum(['file', 'dir']),
    size: z.number().optional(),
    childrenCount: z.number().optional(),
    children: z.lazy(() => z.array(FileNodeSchema)).optional(),
  }),
);

export const FileContentSchema = z.object({
  path: z.string(),
  content: z.string(),
  size: z.number().int().nonnegative(),
  encoding: z.enum(['utf8', 'base64']),
});
export type FileContent = z.infer<typeof FileContentSchema>;

// --- Search ---
export const SearchResultSchema = z.object({
  path: z.string(),
  line: z.number().int().positive(),
  preview: z.string(),
  matchCount: z.number().int().positive(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

// --- Actions ---
export const ActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().optional(),
  visibleWhen: z.string().optional(),
  enabledWhen: z.string().optional(),
  hasSideEffect: z.boolean(),
  confirmMessage: z.string().optional(),
});
export type Action = z.infer<typeof ActionSchema>;

export const ActionRunSchema = z.object({
  id: z.string(),
  actionId: z.string(),
  status: z.enum(['running', 'completed', 'failed']),
  result: z.unknown().optional(),
  createdAt: z.string(),
});
export type ActionRun = z.infer<typeof ActionRunSchema>;

// --- Skills ---
export const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  source: z.enum(['project', 'package']),
  enabled: z.boolean(),
  path: z.string(),
});
export type Skill = z.infer<typeof SkillSchema>;

// --- Prompt templates ---
export const PromptTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  mode: RunModeSchema.optional(),
  body: z.string(),
  variables: z.array(z.string()),
});
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

// --- Packages ---
export const PackageManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  resources: z.object({
    extensions: z.array(z.string()),
    skills: z.array(z.string()),
    prompts: z.array(z.string()),
    themes: z.array(z.string()),
    providers: z.array(z.string()),
  }),
  trusted: z.boolean(),
});
export type PackageManifest = z.infer<typeof PackageManifestSchema>;

export const PackageInstallResultSchema = z.object({
  installId: z.string(),
  status: z.enum(['pending_trust', 'installed', 'failed']),
  manifest: PackageManifestSchema.optional(),
  error: z.string().optional(),
});
export type PackageInstallResult = z.infer<typeof PackageInstallResultSchema>;

// --- Providers ---
export const ProviderSchema = z.object({
  id: z.string(),
  type: z.enum(['builtin', 'openai', 'anthropic', 'google', 'custom']),
  baseUrl: z.string().optional(),
  hasSecret: z.boolean(),
  models: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
    }),
  ),
});
export type Provider = z.infer<typeof ProviderSchema>;

export const ProviderTestResultSchema = z.object({
  ok: z.boolean(),
  modelsFound: z.array(z.string()),
  error: z.string().optional(),
});
export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>;

// --- MCP ---
export const McpServerSchema = z.object({
  id: z.string(),
  command: z.string(),
  transport: z.enum(['stdio', 'sse', 'ws']),
  env: z.record(z.string(), z.string()),
  enabledPerMode: z.array(z.string()),
});
export type McpServer = z.infer<typeof McpServerSchema>;
