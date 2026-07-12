import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectsRepository } from '../db/repositories/projectsRepository';

export type ThemeStore = { save(projectId: string, overrides: unknown): void };

export function createThemeStore(projects: ProjectsRepository): ThemeStore {
  return {
    save(projectId, overrides) {
      const project = projects.getById(projectId);
      if (!project) throw new Error('project not found');
      const path = join(project.runtimeStatePath, 'theme.json');
      mkdirSync(join(path, '..'), { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify(overrides, null, 2), 'utf8');
      renameSync(temporary, path);
    },
  };
}
