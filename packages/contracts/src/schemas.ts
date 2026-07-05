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
  stream: z.enum(['project', 'chat', 'task']),
  streamId: z.string(),
  type: EventTypeSchema,
  payload: z.unknown(),
  createdAt: z.string(),
});
export type RealtimeEnvelope = z.infer<typeof RealtimeEnvelopeSchema>;

export const SendMessageInputSchema = z.object({
  text: z.string().min(1),
  behavior: z.enum(['send', 'follow_up', 'steer', 'abort_and_replace']),
  mode: RunModeSchema.optional(),
  modelId: z.string().optional(),
  toolProfileId: z.string().optional(),
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  retryable: z.boolean().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
