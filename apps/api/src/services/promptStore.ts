import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PromptTemplateSchema, type PromptTemplate } from '@pi-agents/contracts';
import type { ProjectsRepository } from '../db/repositories/projectsRepository';

const DEFAULT_PROMPTS: PromptTemplate[] = [
  { id: 'discussion', name: 'Discussion', mode: 'discussion', body: 'Help with {request}', variables: ['request'] },
  { id: 'implementation', name: 'Implementation', mode: 'implementation', body: 'Implement {request} and verify the result.', variables: ['request'] },
];

export type PromptStore = { list(projectId: string): PromptTemplate[]; save(projectId: string, template: PromptTemplate): PromptTemplate };

export function createPromptStore(projects: ProjectsRepository): PromptStore {
  const pathFor = (projectId: string) => {
    const project = projects.getById(projectId);
    if (!project) throw new Error('project not found');
    return join(project.runtimeStatePath, 'prompts.json');
  };
  const read = (projectId: string): PromptTemplate[] => {
    const path = pathFor(projectId);
    if (!existsSync(path)) return [...DEFAULT_PROMPTS];
    return PromptTemplateSchema.array().parse(JSON.parse(readFileSync(path, 'utf8')));
  };
  const write = (projectId: string, templates: PromptTemplate[]) => {
    const path = pathFor(projectId);
    mkdirSync(join(path, '..'), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(templates, null, 2), 'utf8');
    renameSync(temporary, path);
  };
  return {
    list: read,
    save(projectId, template) {
      const valid = PromptTemplateSchema.parse(template);
      const templates = read(projectId);
      const index = templates.findIndex((item) => item.id === valid.id);
      if (index >= 0) templates[index] = valid;
      else templates.push(valid);
      write(projectId, templates);
      return valid;
    },
  };
}
