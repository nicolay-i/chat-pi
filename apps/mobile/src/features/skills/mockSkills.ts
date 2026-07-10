import type { Skill } from '@pi-agents/contracts';

/**
 * Local fallback reflecting the repo's own `.agents/skills/` source.
 * Used when the API is unavailable so the "loaded from .agents source"
 * acceptance is demonstrable offline.
 */
export const mockSkills: Skill[] = [
  {
    id: 'update-implementation-state',
    name: 'Update Implementation State',
    description: 'Use this skill after a task is accepted.',
    source: 'project',
    enabled: true,
    path: '.agents/skills/update-implementation-state/SKILL.md',
  },
  {
    id: 'verify-subagent-output',
    name: 'Verify Subagent Output',
    description: 'Use this skill after a subagent claims a task is complete.',
    source: 'project',
    enabled: true,
    path: '.agents/skills/verify-subagent-output/SKILL.md',
  },
];

/**
 * Mirrors the SKILL.md body of each known project skill, so the editor
 * has something to render even though the Skill DTO carries no body field.
 */
export const mockSkillBodies: Record<string, string> = {
  'update-implementation-state':
    '# Update Implementation State\n\nUse this skill after a task is accepted.\n\n## Steps\n\n1. Mark task status in `.agents/status.json` if present.\n2. Add a brief note to the implementation changelog.\n3. Record verification commands that passed.\n4. List next unblocked tasks.\n\nDo not edit product code unless explicitly asked.\n',
  'verify-subagent-output':
    '# Verify Subagent Output\n\nUse this skill after a subagent claims a task is complete.\n\n## Steps\n\n1. Read the task file from `.agents/tasks/`.\n2. Read `docs/11-definition-of-done.md`.\n3. Inspect changed files.\n4. Run or review the listed verification commands.\n5. Confirm every acceptance check.\n6. Produce a verdict:\n   - `pass`;\n   - `pass_with_notes`;\n   - `fail`.\n\n## Output format\n\n```text\nVerdict:\nTask:\nChecks passed:\nChecks failed:\nCommands reviewed/run:\nRequired fixes:\n```\n',
};

export function findMockSkill(id: string): Skill | undefined {
  return mockSkills.find((s) => s.id === id);
}
