import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ApiErrorSchema } from '@pi-agents/contracts';

export function sendApiError(
  context: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
) {
  return context.json(ApiErrorSchema.parse({ code, message, retryable: false }), status);
}
