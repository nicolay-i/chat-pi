import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { Project } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import type { BackendStore } from './rootStore';

export type ProjectsStatus = 'loading' | 'loaded' | 'empty' | 'error';

type ProjectsStoreDependencies = {
  apiClientFactory: (baseUrl: string, serverId?: string) => ApiClient;
};

export class ProjectsStore {
  readonly items = observable.map<string, Project>();
  readonly unavailableServerIds = observable.set<string>();
  status: ProjectsStatus = 'loading';
  error: string | null = null;

  constructor(
    private readonly backend: BackendStore,
    private readonly dependencies: ProjectsStoreDependencies,
  ) {
    makeAutoObservable<this, 'backend' | 'dependencies'>(
      this,
      { backend: false, dependencies: false },
      { autoBind: true },
    );
  }

  get data(): Project[] {
    return [...this.items.values()];
  }

  getKey(project: Project): string {
    return `${project.serverId ?? this.backend.serverId ?? 'legacy'}:${project.id}`;
  }

  getById(projectId: string, serverId?: string): Project | undefined {
    if (serverId) return this.items.get(`${serverId}:${projectId}`);
    return this.data.find((project) => project.id === projectId);
  }

  async load(): Promise<void> {
    const connections = this.backend.connections;
    if (connections.length === 0 && !this.backend.baseUrl) {
      this.items.clear();
      this.status = 'error';
      this.error = 'Backend URL is not configured';
      return;
    }

    this.status = 'loading';
    this.error = null;
    try {
      const targets = connections.length > 0
        ? connections
        : [{ serverId: this.backend.serverId ?? 'legacy', baseUrl: this.backend.baseUrl! }];
      const results = await Promise.allSettled(
        targets.map(async (connection) => {
          const startedAt = Date.now();
          try {
            const projects = await this.dependencies.apiClientFactory(connection.baseUrl, connection.serverId).getProjects();
            this.backend.markHealthy(connection.serverId, Date.now() - startedAt);
            this.unavailableServerIds.delete(connection.serverId);
            return { serverId: connection.serverId, projects };
          } catch (error) {
            this.backend.markUnavailable(connection.serverId, error);
            this.unavailableServerIds.add(connection.serverId);
            throw error;
          }
        }),
      );
      const successful = results.filter((result): result is PromiseFulfilledResult<{ serverId: string; projects: Project[] }> => result.status === 'fulfilled');
      const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      runInAction(() => {
        const targetIds = new Set(targets.map((connection) => connection.serverId));
        for (const [key, project] of this.items.entries()) {
          if (!targetIds.has(project.serverId ?? 'legacy')) this.items.delete(key);
        }
        // A successful refresh replaces only that node's projection. A failed
        // node keeps its last-known projects so the remaining computers stay
        // usable and the UI can mark stale cards explicitly.
        for (const result of successful) {
          this.clearServer(result.value.serverId);
          for (const project of result.value.projects) this.items.set(this.getKey(project), {
            ...project,
            serverId: project.serverId ?? result.value.serverId,
          });
        }
        if (successful.length === 0 && this.items.size === 0) {
          this.status = 'error';
          this.error = failed.map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason)).join('; ');
        } else {
          this.status = this.items.size === 0 ? 'empty' : 'loaded';
          this.error = failed.length > 0
            ? `${failed.length} server connection${failed.length === 1 ? '' : 's'} unavailable`
            : null;
        }
      });
    } catch (error) {
      runInAction(() => {
        this.items.clear();
        this.status = 'error';
        this.error = error instanceof Error ? error.message : String(error);
      });
    }
  }

  remember(project: Project): void {
    this.items.set(this.getKey(project), project);
    this.status = 'loaded';
    this.error = null;
  }

  clear(): void {
    this.items.clear();
    this.unavailableServerIds.clear();
    this.status = 'loading';
    this.error = null;
  }

  clearServer(serverId: string): void {
    for (const [key, project] of this.items.entries()) {
      if (project.serverId === serverId) this.items.delete(key);
    }
    this.unavailableServerIds.delete(serverId);
  }

  dispose(): void {
    this.clear();
  }
}
