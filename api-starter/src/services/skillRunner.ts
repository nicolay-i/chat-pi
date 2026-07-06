import type { DatabaseSync } from 'node:sqlite';
import type { Skill } from '@pi-agents/contracts';
import {
  createPackagesRepository,
  type PackagesRepository,
} from '../db';

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
  runSkill(
    skillId: string,
    input?: Record<string, unknown>,
  ): Promise<RunSkillResult>;
}

export type SkillRunnerDeps = {
  packages?: PackagesRepository;
};

/**
 * Catalog-backed skill listing. Default project skills mirror the repo's
 * own `.agents/skills`. Package-provided skills are included ONLY when the
 * owning package is both trusted AND enabled — same gate as extensions
 * (untrusted sources do not contribute executable artifacts).
 */
export function createSkillRunner(
  db: DatabaseSync,
  deps: SkillRunnerDeps = {},
): SkillRunner {
  const packages: PackagesRepository =
    deps.packages ?? createPackagesRepository(db);

  return {
    async listSkills(projectId) {
      const out: Skill[] = [...DEFAULT_SKILLS];
      for (const pkg of packages.listByProject(projectId)) {
        if (!pkg.trusted || !pkg.enabled) continue;
        for (const skillId of pkg.manifest.resources.skills) {
          out.push({
            id: `${pkg.name}/${skillId}`,
            name: skillId,
            source: 'package',
            enabled: true,
            path: `${pkg.installPath}/skills/${skillId}/SKILL.md`,
          });
        }
      }
      return out;
    },

    async runSkill(skillId, _input) {
      return { ok: true, output: `skill ${skillId} ran` };
    },
  };
}
