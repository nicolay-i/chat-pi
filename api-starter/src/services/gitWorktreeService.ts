export type CreateWorktreeInput = {
  repoPath: string;
  taskId: string;
  baseSha: string;
  runtimePath: string;
};

export type WorktreeRef = {
  branchName: string;
  worktreePath: string;
};

export class GitWorktreeService {
  async createTaskWorktree(input: CreateWorktreeInput): Promise<WorktreeRef> {
    const branchName = `agents/task/${input.taskId}`;
    const worktreePath = `${input.runtimePath}/worktrees/${input.taskId}`;

    // Implementation task B03 must replace this stub with real git command execution.
    return { branchName, worktreePath };
  }
}
