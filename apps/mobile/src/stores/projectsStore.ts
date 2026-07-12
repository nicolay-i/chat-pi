import { makeAutoObservable, observable, runInAction } from 'mobx';
import type { Project } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import type { BackendStore } from './rootStore';

export type ProjectsStatus = 'loading' | 'loaded' | 'empty' | 'error';

type ProjectsStoreDependencies = {
  apiClientFactory: (baseUrl: string) => ApiClient;
};

export class ProjectsStore {
  readonly items = observable.map<string, Project>();
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

  async load(): Promise<void> {
    if (!this.backend.baseUrl) {
      this.items.clear();
      this.status = 'error';
      this.error = 'Backend URL is not configured';
      return;
    }

    this.status = 'loading';
    this.error = null;
    try {
      const projects = await this.dependencies.apiClientFactory(this.backend.baseUrl).getProjects();
      runInAction(() => {
        this.items.clear();
        for (const project of projects) this.items.set(project.id, project);
        this.status = projects.length === 0 ? 'empty' : 'loaded';
      });
    } catch (error) {
      runInAction(() => {
        this.items.clear();
        this.status = 'error';
        this.error = error instanceof Error ? error.message : String(error);
      });
    }
  }

  clear(): void {
    this.items.clear();
    this.status = 'loading';
    this.error = null;
  }

  dispose(): void {
    this.clear();
  }
}
