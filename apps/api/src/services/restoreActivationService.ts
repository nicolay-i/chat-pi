import { createDb } from '../db';
import { createPiSessionsRepository } from '../db/repositories/piSessionsRepository';
import { createProjectsRepository, type ProjectRecord } from '../db/repositories/projectsRepository';
import { createTasksRepository, type TaskRecord } from '../db/repositories/tasksRepository';
import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { TaskStatus } from '@pi-agents/contracts';
import { runGit } from './gitExec';

type RestoreManifest = {
  projects: Array<{ id: string; gitRefsPath: string }>;
};

export type RestoredProjectMapping = {
  projectId: string;
  repoPath: string;
  runtimeStatePath: string;
};

export type ActivateRestoredBackupInput = {
  stagingRoot: string;
  projects: RestoredProjectMapping[];
};

export type ActivatedProject = {
  projectId: string;
  repoPath: string;
  runtimeStatePath: string;
  restoredWorktreeCount: number;
};

const WORKTREE_STATUSES = new Set<TaskStatus>([
  'idle',
  'queued',
  'running',
  'aborting',
  'needs_review',
  'stale',
  'checks_running',
  'checks_failed',
  'merge_running',
  'merge_conflict',
  'failed',
]);

function isWithin(basePath: string, targetPath: string): boolean {
  const relativePath = relative(basePath, targetPath);
  return relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..');
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function assertMissing(path: string, description: string): Promise<void> {
  if (await exists(path)) throw new Error(`${description} must not exist: ${path}`);
}

function mapRuntimePath(oldRuntimePath: string, newRuntimePath: string, value: string, description: string): string {
  const relativePath = relative(oldRuntimePath, value);
  if (relativePath === '' || relativePath === '.' || relativePath.startsWith(`..${sep}`) || relativePath === '..') {
    throw new Error(`${description} must be inside the original runtime path: ${value}`);
  }
  return join(newRuntimePath, relativePath);
}

function parseGitRefs(contents: string): Map<string, string> {
  const refs = new Map<string, string>();
  for (const line of contents.split(/\r?\n/)) {
    const [ref, sha] = line.trim().split(/\s+/, 2);
    if (ref && sha) refs.set(ref, sha);
  }
  return refs;
}

function expectedTaskRef(branchName: string, refs: Map<string, string>): string {
  const refName = `refs/heads/${branchName}`;
  const expected = refs.get(refName);
  if (!expected) throw new Error(`Backup is missing Git ref ${refName}`);
  return expected;
}

type RestorePlan = {
  project: ProjectRecord;
  mapping: RestoredProjectMapping;
  sourceAgentsPath: string;
  sourceRuntimePath: string;
  targetAgentsPath: string;
  tasks: TaskRecord[];
  taskPaths: Map<string, { worktreePath: string; piSessionPath: string }>;
};

async function buildRestorePlan(
  stagingRoot: string,
  manifest: RestoreManifest,
  project: ProjectRecord,
  mapping: RestoredProjectMapping,
  tasks: TaskRecord[],
): Promise<RestorePlan> {
  const repoPath = resolve(mapping.repoPath);
  const runtimeStatePath = resolve(mapping.runtimeStatePath);
  if (isWithin(repoPath, runtimeStatePath)) {
    throw new Error(`Runtime path must be outside the repository: ${runtimeStatePath}`);
  }
  if (runGit(['rev-parse', '--is-inside-work-tree'], { cwd: repoPath }).stdout !== 'true') {
    throw new Error(`Not a Git checkout: ${repoPath}`);
  }
  await assertMissing(runtimeStatePath, `Runtime path for project ${project.id}`);

  const targetAgentsPath = resolve(repoPath, project.agentsDir);
  if (!isWithin(repoPath, targetAgentsPath)) throw new Error(`Invalid agents path for project ${project.id}`);

  const projectRoot = resolve(stagingRoot, 'projects', project.id);
  if (!isWithin(stagingRoot, projectRoot)) throw new Error(`Invalid project id in restored database: ${project.id}`);
  const sourceAgentsPath = join(projectRoot, 'agents');
  const sourceRuntimePath = join(projectRoot, 'runtime');
  if (await exists(sourceAgentsPath)) await assertMissing(targetAgentsPath, `Agents directory for project ${project.id}`);

  const manifestProject = manifest.projects.find((entry) => entry.id === project.id);
  if (!manifestProject) throw new Error(`Backup manifest is missing project ${project.id}`);
  const refsPath = resolve(stagingRoot, manifestProject.gitRefsPath);
  if (!isWithin(stagingRoot, refsPath)) throw new Error(`Invalid Git refs path for project ${project.id}`);
  const refs = parseGitRefs(await readFile(refsPath, 'utf8'));

  const taskPaths = new Map<string, { worktreePath: string; piSessionPath: string }>();
  for (const task of tasks) {
    const worktreePath = mapRuntimePath(project.runtimeStatePath, runtimeStatePath, task.worktreePath, `Task worktree ${task.id}`);
    const piSessionPath = mapRuntimePath(project.runtimeStatePath, runtimeStatePath, task.piSessionPath, `Task session ${task.id}`);
    taskPaths.set(task.id, { worktreePath, piSessionPath });
    if (!WORKTREE_STATUSES.has(task.status)) continue;

    const expectedSha = expectedTaskRef(task.branchName, refs);
    let actualSha: string;
    try {
      actualSha = runGit(['rev-parse', '--verify', `${task.branchName}^{commit}`], { cwd: repoPath }).stdout;
    } catch {
      throw new Error(`Task branch ${task.branchName} does not match backup ref for project ${project.id}`);
    }
    if (actualSha !== expectedSha) {
      throw new Error(`Task branch ${task.branchName} does not match backup ref for project ${project.id}`);
    }
    await assertMissing(worktreePath, `Task worktree ${task.id}`);
  }

  return {
    project,
    mapping: { projectId: project.id, repoPath, runtimeStatePath },
    sourceAgentsPath,
    sourceRuntimePath,
    targetAgentsPath,
    tasks,
    taskPaths,
  };
}

export async function activateRestoredBackup(input: ActivateRestoredBackupInput): Promise<ActivatedProject[]> {
  const stagingRoot = resolve(input.stagingRoot);
  const databasePath = join(stagingRoot, 'database.sqlite');
  if (!await exists(databasePath)) throw new Error(`Restored database is missing: ${databasePath}`);
  const mappingsByProject = new Map<string, RestoredProjectMapping>();
  for (const mapping of input.projects) {
    if (mappingsByProject.has(mapping.projectId)) throw new Error(`Duplicate project mapping: ${mapping.projectId}`);
    mappingsByProject.set(mapping.projectId, mapping);
  }

  const manifest = JSON.parse(await readFile(join(stagingRoot, 'manifest.json'), 'utf8')) as RestoreManifest;
  const db = createDb(databasePath);
  const projects = createProjectsRepository(db);
  const tasks = createTasksRepository(db);
  const piSessions = createPiSessionsRepository(db);
  const createdRuntimePaths: string[] = [];
  const createdAgentsPaths: string[] = [];
  const createdWorktrees: Array<{ repoPath: string; worktreePath: string }> = [];

  try {
    const storedProjects = projects.list();
    if (mappingsByProject.size !== storedProjects.length) throw new Error('A mapping is required for every restored project');
    const plans: RestorePlan[] = [];
    for (const project of storedProjects) {
      const mapping = mappingsByProject.get(project.id);
      if (!mapping) throw new Error(`Missing project mapping: ${project.id}`);
      plans.push(await buildRestorePlan(stagingRoot, manifest, project, mapping, tasks.listByProject(project.id)));
    }

    for (const plan of plans) {
      await mkdir(plan.mapping.runtimeStatePath, { recursive: true });
      createdRuntimePaths.push(plan.mapping.runtimeStatePath);
      if (await exists(plan.sourceRuntimePath)) await cp(plan.sourceRuntimePath, plan.mapping.runtimeStatePath, { recursive: true });
      if (await exists(plan.sourceAgentsPath)) {
        await mkdir(plan.targetAgentsPath, { recursive: true });
        createdAgentsPaths.push(plan.targetAgentsPath);
        await cp(plan.sourceAgentsPath, plan.targetAgentsPath, { recursive: true });
      }

      for (const task of plan.tasks) {
        if (!WORKTREE_STATUSES.has(task.status)) continue;
        const paths = plan.taskPaths.get(task.id);
        if (!paths) throw new Error(`Task paths are missing: ${task.id}`);
        await mkdir(join(plan.mapping.runtimeStatePath, 'worktrees'), { recursive: true });
        runGit(['worktree', 'add', paths.worktreePath, task.branchName], { cwd: plan.mapping.repoPath });
        createdWorktrees.push({ repoPath: plan.mapping.repoPath, worktreePath: paths.worktreePath });
      }
    }

    db.exec('BEGIN');
    try {
      for (const plan of plans) {
        projects.update(plan.project.id, {
          repoPath: plan.mapping.repoPath,
          runtimeStatePath: plan.mapping.runtimeStatePath,
        });
        for (const task of plan.tasks) {
          const paths = plan.taskPaths.get(task.id);
          if (!paths) throw new Error(`Task paths are missing: ${task.id}`);
          tasks.update(task.id, paths);
        }
        for (const session of piSessions.list().filter((entry) => entry.projectId === plan.project.id)) {
          const taskPaths = session.taskId ? plan.taskPaths.get(session.taskId) : undefined;
          const path = mapRuntimePath(plan.project.runtimeStatePath, plan.mapping.runtimeStatePath, session.path, `Pi session ${session.id}`);
          piSessions.update(session.id, {
            path,
            cwd: taskPaths?.worktreePath ?? plan.mapping.repoPath,
            lockOwner: null,
            lockHeartbeatAt: null,
          });
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return plans.map((plan) => ({
      projectId: plan.project.id,
      repoPath: plan.mapping.repoPath,
      runtimeStatePath: plan.mapping.runtimeStatePath,
      restoredWorktreeCount: plan.tasks.filter((task) => WORKTREE_STATUSES.has(task.status)).length,
    }));
  } catch (error) {
    for (const worktree of createdWorktrees.reverse()) {
      try { runGit(['worktree', 'remove', '--force', worktree.worktreePath], { cwd: worktree.repoPath }); } catch { /* best effort rollback */ }
    }
    for (const path of createdAgentsPaths.reverse()) await rm(path, { recursive: true, force: true });
    for (const path of createdRuntimePaths.reverse()) await rm(path, { recursive: true, force: true });
    throw error;
  } finally {
    db.close();
  }
}
