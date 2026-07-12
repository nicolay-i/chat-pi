import { os } from '@orpc/server';
import { ProviderSchema, ProviderTestResultSchema } from '@pi-agents/contracts';
import { z } from 'zod';
import type { ProviderService } from '../services/providerService';

export type ProviderRpcContext = {
  providerService: ProviderService;
};

const ProjectInputSchema = z.object({ projectId: z.string() });
const ProviderIdInputSchema = z.object({ providerId: z.string() });
const CreateProviderInputSchema = ProjectInputSchema.extend({
  provider: ProviderSchema.omit({ id: true }),
});

const rpc = os.$context<ProviderRpcContext>();

// This small, non-streaming domain is intentionally isolated from the raw
// Hono API while the oRPC transport is evaluated for mobile compatibility.
export const providerRpcRouter = {
  providers: {
    list: rpc
      .input(ProjectInputSchema)
      .output(ProviderSchema.array())
      .handler(({ input, context }) => context.providerService.list(input.projectId)),
    create: rpc
      .input(CreateProviderInputSchema)
      .output(ProviderSchema)
      .handler(({ input, context }) => context.providerService.create(input.projectId, {
        name: input.provider.type,
        type: input.provider.type,
        baseUrl: input.provider.baseUrl,
        secretRef: input.provider.hasSecret ? 'pending-secret-configuration' : undefined,
        models: input.provider.models,
      })),
    test: rpc
      .input(ProviderIdInputSchema)
      .output(ProviderTestResultSchema)
      .handler(({ input, context }) => context.providerService.test(input.providerId)),
  },
};
