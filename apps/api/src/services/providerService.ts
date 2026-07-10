import type { DatabaseSync } from 'node:sqlite';
import type { Provider, ProviderTestResult } from '@pi-agents/contracts';
import {
  createProvidersRepository,
  type ProviderInput,
  type ProviderRecord,
  type ProvidersRepository,
} from '../db';
import type { EventStore } from '../realtime/eventStore';

export type ProviderModel = { id: string; label: string };

export type CreateProviderInput = {
  name: string;
  type: Provider['type'];
  baseUrl?: string;
  secretRef?: string;
  config?: Record<string, unknown>;
  models?: ProviderModel[];
};

/**
 * Pure mapper: drops `secretRef` and exposes only the boolean `hasSecret`
 * flag. The raw secret ref MUST NEVER appear in API responses or exports
 * (docs/08 §7: provider secret never visible raw).
 */
export function redactProvider(row: ProviderRecord): Provider {
  return {
    id: row.id,
    type: row.type as Provider['type'],
    baseUrl: row.baseUrl ?? undefined,
    hasSecret: !!row.secretRef,
    models: Array.isArray((row.config.models as unknown) as ProviderModel[])
      ? ((row.config.models as unknown) as ProviderModel[])
      : [],
  };
}

export interface ProviderService {
  create(projectId: string, input: CreateProviderInput): Promise<Provider>;
  list(projectId: string): Promise<Provider[]>;
  test(providerId: string): Promise<ProviderTestResult>;
  setEnabled(providerId: string, enabled: boolean): Promise<void>;
  remove(providerId: string): Promise<void>;
}

export type ProviderServiceDeps = {
  eventStore: EventStore;
  providers?: ProvidersRepository;
};

function toInput(
  projectId: string,
  input: CreateProviderInput,
): ProviderInput {
  return {
    projectId,
    name: input.name,
    type: input.type,
    baseUrl: input.baseUrl ?? null,
    secretRef: input.secretRef ?? null,
    config: { ...(input.config ?? {}), models: input.models ?? [] },
    enabled: true,
  };
}

export function createProviderService(
  db: DatabaseSync,
  deps: ProviderServiceDeps,
): ProviderService {
  const providers: ProvidersRepository =
    deps.providers ?? createProvidersRepository(db);
  const eventStore = deps.eventStore;

  return {
    async create(projectId, input) {
      const rec = providers.create(toInput(projectId, input));
      await eventStore.append({
        stream: 'project',
        streamId: projectId,
        projectId,
        type: 'provider.updated',
        payload: {
          providerId: rec.id,
          name: rec.name,
          type: rec.type,
          hasSecret: !!rec.secretRef,
        },
      });
      return redactProvider(rec);
    },

    async list(projectId) {
      return providers.listByProject(projectId).map(redactProvider);
    },

    async test(providerId) {
      const rec = providers.getById(providerId);
      if (!rec) throw new Error(`provider not found: ${providerId}`);
      const models = (rec.config.models as unknown) as ProviderModel[] | undefined;
      const modelsFound = Array.isArray(models)
        ? models.map((m) => m.id)
        : [];
      return {
        ok: true,
        modelsFound,
        error: undefined,
      };
    },

    async setEnabled(providerId, enabled) {
      const rec = providers.getById(providerId);
      if (!rec) throw new Error(`provider not found: ${providerId}`);
      providers.update(providerId, { enabled });
    },

    async remove(providerId) {
      providers.delete(providerId);
    },
  };
}
