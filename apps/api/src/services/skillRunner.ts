import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Skill } from '@pi-agents/contracts';
import type { ProjectsRepository } from '../db/repositories/projectsRepository';

const DEFAULT_SKILLS: Skill[] = [
  {
    id: 'update-implementation-state',
    name: 'update-implementation-state',
    description: 'Update implementation state tracking',
    source: 'project',
    enabled: true,
    path: '.agents/skills/update-implementation-state/SKILL.md',
  },
  {
    id: 'verify-subagent-output',
    name: 'verify-subagent-output',
    description: 'Verify subagent output against task spec',
    source: 'project',
    enabled: true,
    path: '.agents/skills/verify-subagent-output/SKILL.md',
  },
];

export type RunSkillResult = {
  ok: boolean;
  output: string;
};

export interface SkillRunner {
  listSkills(projectId: string): Promise<Skill[]>;
  getSkill(projectId: string, skillId: string): Promise<Skill | undefined>;
  saveSkill(projectId: string, skillId: string, input: Partial<Skill>): Promise<Skill>;
  runSkill(
    skillId: string,
    input?: Record<string, unknown>,
  ): Promise<RunSkillResult>;
}

export type SkillRunnerDeps = { projects: ProjectsRepository };

/**
 * Catalog-backed skill listing. Default project skills mirror the repo's
 * own `.agents/skills`.
 */
export function createSkillRunner(
  _db: DatabaseSync,
  deps: SkillRunnerDeps,
): SkillRunner {
  const projects = deps.projects;

  const projectRoot = (projectId: string) => {
    const project = projects.getById(projectId);
    if (!project) throw new Error(`project not found: ${projectId}`);
    return join(project.repoPath, project.agentsDir, 'skills');
  };
  const assertId = (id: string) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) throw new Error('skill id must be a safe directory name');
  };
  const projectSkills = (projectId: string): Skill[] => {
    const root = projectRoot(projectId);
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'SKILL.md')))
      .map((entry) => {
        const id = entry.name;
        const dir = join(root, id);
        const metadataPath = join(dir, 'skill.json');
        const metadata = existsSync(metadataPath) ? JSON.parse(readFileSync(metadataPath, 'utf8')) as Partial<Skill> : {};
        const body = readFileSync(join(dir, 'SKILL.md'), 'utf8');
        const description = metadata.description ?? body.split(/\r?\n/).find((line) => line.trim() && !line.startsWith('#'))?.trim();
        return { id, name: metadata.name ?? id, description, source: 'project', enabled: metadata.enabled ?? true, path: `${id}/SKILL.md` };
      });
  };

  return {
    async listSkills(projectId) {
      const local = projectSkills(projectId);
      return local.length > 0 ? local : DEFAULT_SKILLS;
    },

    async getSkill(projectId, skillId) { return (await this.listSkills(projectId)).find((skill) => skill.id === skillId); },

    async saveSkill(projectId, skillId, input) {
      assertId(skillId);
      if (input.source && input.source !== 'project') throw new Error('package skills are read-only');
      const root = projectRoot(projectId);
      const dir = join(root, skillId);
      mkdirSync(dir, { recursive: true });
      const skillPath = join(dir, 'SKILL.md');
      if (!existsSync(skillPath)) writeFileSync(skillPath, `# ${input.name ?? skillId}\n\n${input.description ?? ''}\n`, 'utf8');
      const skill: Skill = { id: skillId, name: input.name ?? skillId, description: input.description, source: 'project', enabled: input.enabled ?? true, path: `${skillId}/SKILL.md` };
      const metadataPath = join(dir, 'skill.json');
      const temporary = `${metadataPath}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify(skill, null, 2), 'utf8');
      renameSync(temporary, metadataPath);
      return skill;
    },

    async runSkill(skillId, _input) {
      return { ok: true, output: `skill ${skillId} ran` };
    },
  };
}
