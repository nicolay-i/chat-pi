import { z, type ZodType } from 'zod';
import {
  ActionRunSchema,
  ActionSchema,
  CapabilitiesSchema,
  ChatSchema,
  CheckpointSchema,
  DiffEntrySchema,
  DiffFileContentSchema,
  FileContentSchema,
  FileNodeSchema,
  HealthResponseSchema,
  IgnisAccessSchema,
  McpServerSchema,
  ManagedImplementationSchema,
  QueuedMessageSchema,
  ProjectSchema,
  ProjectRemoteSyncInputSchema,
  ProjectRemoteSyncSchema,
  PromptTemplateSchema,
  ProviderSchema,
  ProviderTestResultSchema,
  SearchResultSchema,
  SkillSchema,
  TaskSchema,
  TaskCancelInputSchema,
} from './schemas';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type ApiOperation = {
  id: string;
  method: HttpMethod;
  path: string;
  requestSchema?: ZodType;
  responseSchema: ZodType;
  implemented: boolean;
};

const OkSchema = z.object({ ok: z.literal(true) });
const UrlSchema = z.object({ url: z.string() });
const EmptySchema = z.undefined();
const TraceSchema = z.array(z.unknown());

function operation(
  id: string,
  method: HttpMethod,
  path: string,
  responseSchema: ZodType,
  implemented: boolean,
  requestSchema?: ZodType,
): ApiOperation {
  return { id, method, path, requestSchema, responseSchema, implemented };
}

export const apiOperations = [
  operation('health.get', 'GET', '/health', HealthResponseSchema, true),
  operation('capabilities.get', 'GET', '/api/capabilities', CapabilitiesSchema, true),
  operation('projects.list', 'GET', '/api/projects', ProjectSchema.array(), true),
  operation('projects.create', 'POST', '/api/projects', ProjectSchema, true),
  operation('projects.get', 'GET', '/api/projects/:projectId', ProjectSchema, true),
  operation('projects.update', 'PATCH', '/api/projects/:projectId', ProjectSchema, true),
  operation('projects.delete', 'DELETE', '/api/projects/:projectId', EmptySchema, true),
  operation('projects.validate', 'POST', '/api/projects/:projectId/validate-repo', z.object({ valid: z.boolean(), agentsDirExists: z.boolean() }).passthrough(), true),
  operation('projects.remoteSync', 'POST', '/api/projects/:projectId/remote-sync', ProjectRemoteSyncSchema, true, ProjectRemoteSyncInputSchema),
  operation('projects.ignis', 'GET', '/api/projects/:projectId/ignis', IgnisAccessSchema, true),

  operation('chats.list', 'GET', '/api/projects/:projectId/chats', ChatSchema.array(), true),
  operation('chats.create', 'POST', '/api/projects/:projectId/chats', ChatSchema, true),
  operation('chats.bootstrap', 'POST', '/api/chats/bootstrap', ChatSchema, true),
  operation('chats.get', 'GET', '/api/chats/:chatId', ChatSchema, true),
  operation('chats.update', 'PATCH', '/api/chats/:chatId', ChatSchema, true),
  operation('chats.archive', 'POST', '/api/chats/:chatId/archive', ChatSchema, true),
  operation('chats.export', 'POST', '/api/chats/:chatId/export', UrlSchema, true),
  operation('chats.tree', 'GET', '/api/chats/:chatId/tree', TaskSchema.array(), true),
  operation('chats.trace', 'GET', '/api/chats/:chatId/trace', TraceSchema, true),
  operation('orchestration.listManaged', 'GET', '/api/chats/:chatId/managed-implementations', ManagedImplementationSchema.array(), true),
  operation('orchestration.createTask', 'POST', '/api/chats/:chatId/implementation-tasks', ManagedImplementationSchema, true),
  operation('tasks.createForChat', 'POST', '/api/chats/:chatId/tasks', TaskSchema, true),
  operation('messages.send', 'POST', '/api/chats/:chatId/messages', OkSchema, true),
  operation('chats.abort', 'POST', '/api/chats/:chatId/abort', OkSchema, true),
  operation('queue.list', 'GET', '/api/chats/:chatId/queue', QueuedMessageSchema.array(), true),
  operation('queue.reorder', 'PATCH', '/api/chats/:chatId/queue', QueuedMessageSchema.array(), true),
  operation('queue.remove', 'DELETE', '/api/chats/:chatId/queue/:itemId', OkSchema, true),
  operation('queue.clear', 'POST', '/api/chats/:chatId/queue/clear', OkSchema, true),

  operation('tasks.steer', 'POST', '/api/tasks/:taskId/steer', OkSchema, true),
  operation('tasks.followUp', 'POST', '/api/tasks/:taskId/follow-up', OkSchema, true),
  operation('tasks.abort', 'POST', '/api/tasks/:taskId/abort', OkSchema, true),
  operation('tasks.abortAndReplace', 'POST', '/api/tasks/:taskId/abort-and-replace', OkSchema, true),
  operation('tasks.list', 'GET', '/api/projects/:projectId/tasks', TaskSchema.array(), true),
  operation('tasks.get', 'GET', '/api/tasks/:taskId', TaskSchema, true),
  operation('tasks.trace', 'GET', '/api/tasks/:taskId/trace', TraceSchema, true),
  operation('tasks.fork', 'POST', '/api/tasks/:taskId/fork', TaskSchema, true),
  operation('tasks.rollback', 'POST', '/api/tasks/:taskId/rollback', TaskSchema, true),
  operation('tasks.rebase', 'POST', '/api/tasks/:taskId/rebase', TaskSchema, true),
  operation('tasks.fetch', 'POST', '/api/tasks/:taskId/fetch', TaskSchema, true),
  operation('tasks.push', 'POST', '/api/tasks/:taskId/push', TaskSchema, true),
  operation('tasks.merge', 'POST', '/api/tasks/:taskId/merge', TaskSchema, true),
  operation('tasks.archive', 'POST', '/api/tasks/:taskId/archive', TaskSchema, true),
  operation('tasks.cancel', 'POST', '/api/tasks/:taskId/cancel', TaskSchema, true, TaskCancelInputSchema),

  operation('diff.list', 'GET', '/api/tasks/:taskId/diff', DiffEntrySchema.array(), true),
  operation('diff.file', 'GET', '/api/tasks/:taskId/diff/files/:path', DiffFileContentSchema, true),
  operation('diff.revertFile', 'POST', '/api/tasks/:taskId/revert-file', TaskSchema, true),
  operation('files.list', 'GET', '/api/projects/:projectId/files', FileNodeSchema.array(), true),
  operation('files.content.get', 'GET', '/api/projects/:projectId/files/content', FileContentSchema, true),
  operation('files.content.put', 'PUT', '/api/projects/:projectId/files/content', FileContentSchema, true),
  operation('files.search', 'POST', '/api/projects/:projectId/files/search', SearchResultSchema.array(), true),

  operation('checkpoints.list', 'GET', '/api/tasks/:taskId/checkpoints', CheckpointSchema.array(), true),
  operation('checkpoints.create', 'POST', '/api/tasks/:taskId/checkpoints', CheckpointSchema, true),
  operation('checkpoints.diff', 'GET', '/api/tasks/:taskId/checkpoints/:checkpointId/diff', DiffEntrySchema.array(), true),
  operation('checkpoints.fork', 'POST', '/api/tasks/:taskId/checkpoints/:checkpointId/fork', TaskSchema, true),
  operation('checkpoints.rollback', 'POST', '/api/tasks/:taskId/checkpoints/:checkpointId/rollback', TaskSchema, true),

  operation('actions.list', 'GET', '/api/projects/:projectId/actions', ActionSchema.array(), true),
  operation('actions.run', 'POST', '/api/actions/:actionId/run', ActionRunSchema, true),
  operation('actions.run.get', 'GET', '/api/action-runs/:actionRunId', ActionRunSchema, true),
  operation('skills.list', 'GET', '/api/projects/:projectId/skills', SkillSchema.array(), true),
  operation('skills.get', 'GET', '/api/projects/:projectId/skills/:skillId', SkillSchema, true),
  operation('skills.save', 'PUT', '/api/projects/:projectId/skills/:skillId', SkillSchema, true),
  operation('skills.test', 'POST', '/api/projects/:projectId/skills/:skillId/test', z.object({ ok: z.boolean() }), true),
  operation('prompts.list', 'GET', '/api/projects/:projectId/prompts', PromptTemplateSchema.array(), true),
  operation('prompts.save', 'PUT', '/api/projects/:projectId/prompts/:templateId', PromptTemplateSchema, true),
  operation('providers.list', 'GET', '/api/projects/:projectId/providers', ProviderSchema.array(), true),
  operation('providers.create', 'POST', '/api/projects/:projectId/providers', ProviderSchema, true),
  operation('providers.test', 'POST', '/api/projects/:projectId/providers/:providerId/test', ProviderTestResultSchema, true),
  operation('mcp.list', 'GET', '/api/projects/:projectId/mcp', McpServerSchema.array(), true),
  operation('mcp.save', 'PUT', '/api/projects/:projectId/mcp', McpServerSchema.array(), true),
  operation('mcp.test', 'POST', '/api/projects/:projectId/mcp/:serverId/test', z.object({ ok: z.boolean() }), true),
  operation('theme.save', 'POST', '/api/projects/:projectId/theme', OkSchema, true),

  operation('events.chat', 'GET', '/api/chats/:chatId/events', z.unknown(), true),
  operation('events.task', 'GET', '/api/tasks/:taskId/events', z.unknown(), true),
  operation('events.project', 'GET', '/api/projects/:projectId/events', z.unknown(), true),
] as const satisfies readonly ApiOperation[];

export type ApiOperationId = (typeof apiOperations)[number]['id'];

export const apiOperationById = new Map(apiOperations.map((item) => [item.id, item]));
export const implementedApiOperationIds = apiOperations.filter((item) => item.implemented).map((item) => item.id);

export const apiClientOperationIds = [
  'health.get', 'capabilities.get',
  'projects.list', 'projects.get', 'projects.create', 'projects.update', 'projects.delete', 'projects.validate', 'projects.remoteSync', 'projects.ignis',
  'chats.list', 'chats.get', 'chats.create', 'chats.bootstrap', 'chats.update', 'chats.archive', 'chats.export', 'chats.tree', 'chats.trace', 'orchestration.listManaged', 'orchestration.createTask',
  'messages.send', 'chats.abort', 'tasks.createForChat', 'queue.list', 'queue.reorder', 'queue.remove', 'queue.clear',
  'tasks.steer', 'tasks.followUp', 'tasks.abort', 'tasks.abortAndReplace', 'tasks.list', 'tasks.get', 'tasks.trace', 'tasks.fork', 'tasks.rollback', 'tasks.rebase', 'tasks.fetch', 'tasks.push', 'tasks.merge', 'tasks.archive', 'tasks.cancel',
  'diff.list', 'diff.file', 'diff.revertFile',
  'files.list', 'files.content.get', 'files.content.put', 'files.search',
  'checkpoints.list', 'checkpoints.create', 'checkpoints.diff', 'checkpoints.fork', 'checkpoints.rollback',
  'actions.list', 'actions.run', 'actions.run.get',
  'skills.list', 'skills.get', 'skills.save', 'skills.test',
  'prompts.list', 'prompts.save',
  'providers.list', 'providers.create', 'providers.test',
  'mcp.list', 'mcp.save', 'mcp.test', 'theme.save',
] as const satisfies readonly ApiOperationId[];
