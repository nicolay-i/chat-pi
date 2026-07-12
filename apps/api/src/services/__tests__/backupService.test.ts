import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createDb } from '../../db';
import { createPiSessionsRepository } from '../../db/repositories/piSessionsRepository';
import { createProjectsRepository } from '../../db/repositories/projectsRepository';
import { createTasksRepository } from '../../db/repositories/tasksRepository';
import { TemporaryGitRepository } from '../../test/harness/TemporaryGitRepository';
import { createBackup, restoreBackup } from '../backupService';
import { runGit } from '../gitExec';
import { activateRestoredBackup } from '../restoreActivationService';

describe('backup service', () => {
  it('snapshots database, safe agent/runtime files and git refs into a restorable staging directory', async () => {
    const repo = new TemporaryGitRepository();
    const db = createDb(join(repo.runtimePath, 'source.sqlite'));
    const root = join(dirname(repo.runtimePath), 'backup');
    const restored = join(dirname(repo.runtimePath), 'restored');
    try {
      const agents = join(repo.repoPath, '.agents');
      mkdirSync(join(agents, 'skills', 'verify'), { recursive: true });
      writeFileSync(join(agents, 'skills', 'verify', 'SKILL.md'), '# Verify\n');
      writeFileSync(join(agents, '.env'), 'SHOULD_NOT_BE_BACKED_UP');
      mkdirSync(join(repo.runtimePath, 'sessions'), { recursive: true });
      writeFileSync(join(repo.runtimePath, 'sessions', 'task.jsonl'), '{"type":"message"}\n');
      mkdirSync(join(repo.runtimePath, 'worktrees', 'task-a'), { recursive: true });
      writeFileSync(join(repo.runtimePath, 'worktrees', 'task-a', 'private-source.txt'), 'DO_NOT_BACK_UP');
      writeFileSync(join(repo.runtimePath, 'prompts.json'), '{"prompt":"saved"}\n');
      writeFileSync(join(repo.runtimePath, 'theme.json'), '{"color":{"primary":"#00AAFF"}}\n');
      writeFileSync(join(repo.runtimePath, 'auth.json'), '{"secret":"excluded"}');
      const project = createProjectsRepository(db).create({
        name: 'backup', repoPath: repo.repoPath, defaultBranch: 'main', runtimeStatePath: repo.runtimePath,
      });

      const manifest = await createBackup({ db, destination: root, projects: [project] });
      expect(manifest.files.map((file) => file.path)).toContain('database.sqlite');
      expect(manifest.files.map((file) => file.path)).toContain(`projects/${project.id}/agents/skills/verify/SKILL.md`);
      expect(manifest.files.map((file) => file.path)).toContain(`projects/${project.id}/runtime/sessions/task.jsonl`);
      expect(manifest.files.map((file) => file.path)).toContain(`projects/${project.id}/runtime/prompts.json`);
      expect(manifest.files.map((file) => file.path)).toContain(`projects/${project.id}/runtime/theme.json`);
      expect(manifest.files.map((file) => file.path)).not.toContain(`projects/${project.id}/agents/.env`);
      expect(manifest.files.map((file) => file.path)).not.toContain(`projects/${project.id}/runtime/auth.json`);
      expect(manifest.files.map((file) => file.path)).not.toContain(`projects/${project.id}/runtime/worktrees/task-a/private-source.txt`);

      await restoreBackup(root, restored);
      const restoredDb = createDb(join(restored, 'database.sqlite'));
      expect(createProjectsRepository(restoredDb).getById(project.id)?.name).toBe('backup');
      restoredDb.close();
      await expect(restoreBackup(root, restored)).rejects.toThrow('must be empty');
    } finally {
      db.close();
      repo.dispose();
    }
  }, 20_000);

  it('rebinds a staged backup to an exact task branch and rebuilds its worktree', async () => {
    const repo = new TemporaryGitRepository();
    const db = createDb(join(repo.runtimePath, 'source.sqlite'));
    const backupRoot = join(repo.root, 'backup');
    const stagingRoot = join(repo.root, 'staging');
    const restoredRepo = join(repo.root, 'restored-repo');
    const restoredRuntime = join(repo.root, 'restored-runtime');
    try {
      const worktreePath = repo.createWorktree('task-a');
      repo.changeAndCommit(worktreePath, 'agent change\n', 'agent task');
      const taskHead = runGit(['rev-parse', 'agents/task-a'], { cwd: repo.repoPath }).stdout;
      const project = createProjectsRepository(db).create({
        name: 'restore', repoPath: repo.repoPath, defaultBranch: 'main', runtimeStatePath: repo.runtimePath,
      });
      const task = createTasksRepository(db).create({
        id: 'task-a', projectId: project.id, title: 'Restore task', mode: 'implementation', status: 'needs_review',
        baseBranch: 'main', baseSha: repo.mainHead, branchName: 'agents/task-a', worktreePath,
        piSessionPath: join(repo.runtimePath, 'sessions', 'task-a.jsonl'), mergeTarget: 'main', currentHeadSha: taskHead,
      });
      mkdirSync(join(repo.repoPath, '.agents', 'skills', 'restore'), { recursive: true });
      writeFileSync(join(repo.repoPath, '.agents', 'skills', 'restore', 'SKILL.md'), '# Restore\n');
      mkdirSync(join(repo.runtimePath, 'sessions'), { recursive: true });
      writeFileSync(task.piSessionPath, '{"type":"message","id":"entry-1"}\n');
      const session = createPiSessionsRepository(db).create({
        projectId: project.id, taskId: task.id, path: task.piSessionPath, cwd: task.worktreePath,
      });

      await createBackup({ db, destination: backupRoot, projects: [project] });
      await restoreBackup(backupRoot, stagingRoot);
      runGit(['clone', repo.repoPath, restoredRepo], { cwd: repo.root });
      runGit(['branch', 'agents/task-a', taskHead], { cwd: restoredRepo });

      const activated = await activateRestoredBackup({
        stagingRoot,
        projects: [{ projectId: project.id, repoPath: restoredRepo, runtimeStatePath: restoredRuntime }],
      });

      expect(activated).toEqual([expect.objectContaining({ projectId: project.id, restoredWorktreeCount: 1 })]);
      const restoredDb = createDb(join(stagingRoot, 'database.sqlite'));
      const restoredProject = createProjectsRepository(restoredDb).getById(project.id);
      const restoredTask = createTasksRepository(restoredDb).getById(task.id);
      const restoredSession = createPiSessionsRepository(restoredDb).getById(session.id);
      expect(restoredProject?.repoPath).toBe(restoredRepo);
      expect(restoredProject?.runtimeStatePath).toBe(restoredRuntime);
      expect(restoredTask?.worktreePath).toBe(join(restoredRuntime, 'worktrees', task.id));
      expect(restoredTask?.piSessionPath).toBe(join(restoredRuntime, 'sessions', 'task-a.jsonl'));
      expect(restoredSession?.cwd).toBe(restoredTask?.worktreePath);
      expect(restoredSession?.path).toBe(restoredTask?.piSessionPath);
      expect(readFileSync(join(restoredRepo, '.agents', 'skills', 'restore', 'SKILL.md'), 'utf8')).toContain('# Restore');
      expect(readFileSync(restoredTask?.piSessionPath ?? '', 'utf8')).toContain('entry-1');
      expect(runGit(['rev-parse', 'HEAD'], { cwd: restoredTask?.worktreePath ?? '' }).stdout).toBe(taskHead);
      restoredDb.close();
    } finally {
      db.close();
      repo.dispose();
    }
  }, 30_000);

  it('refuses activation before creating files when the mapped checkout lacks the backup task branch', async () => {
    const repo = new TemporaryGitRepository();
    const db = createDb(join(repo.runtimePath, 'source.sqlite'));
    const backupRoot = join(repo.root, 'backup');
    const stagingRoot = join(repo.root, 'staging');
    const restoredRepo = join(repo.root, 'restored-repo');
    const restoredRuntime = join(repo.root, 'restored-runtime');
    try {
      const worktreePath = repo.createWorktree('task-a');
      const project = createProjectsRepository(db).create({
        name: 'restore', repoPath: repo.repoPath, defaultBranch: 'main', runtimeStatePath: repo.runtimePath,
      });
      const task = createTasksRepository(db).create({
        id: 'task-a', projectId: project.id, title: 'Restore task', mode: 'implementation', status: 'needs_review',
        baseBranch: 'main', baseSha: repo.mainHead, branchName: 'agents/task-a', worktreePath,
        piSessionPath: join(repo.runtimePath, 'sessions', 'task-a.jsonl'), mergeTarget: 'main',
      });
      mkdirSync(join(repo.runtimePath, 'sessions'), { recursive: true });
      writeFileSync(task.piSessionPath, '{"type":"message"}\n');
      await createBackup({ db, destination: backupRoot, projects: [project] });
      await restoreBackup(backupRoot, stagingRoot);
      runGit(['clone', repo.repoPath, restoredRepo], { cwd: repo.root });

      await expect(activateRestoredBackup({
        stagingRoot,
        projects: [{ projectId: project.id, repoPath: restoredRepo, runtimeStatePath: restoredRuntime }],
      })).rejects.toThrow('does not match backup ref');

      expect(existsSync(restoredRuntime)).toBe(false);
      expect(existsSync(join(restoredRepo, '.agents'))).toBe(false);
    } finally {
      db.close();
      repo.dispose();
    }
  }, 30_000);
});
