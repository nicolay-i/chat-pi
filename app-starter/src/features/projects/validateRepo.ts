import type { ValidateRepoInput, ValidateRepoResult } from '@pi-agents/contracts';

export function validateRepoInputLocally(input: ValidateRepoInput): ValidateRepoResult {
  const repoOk = input.repoPath.trim().length > 0;
  const branchOk = input.defaultBranch.trim().length > 0;
  if (!repoOk) {
    return { valid: false, agentsDirExists: false, error: 'repo path is required' };
  }
  if (!branchOk) {
    return { valid: false, agentsDirExists: false, error: 'default branch is required' };
  }
  return {
    valid: true,
    branch: input.defaultBranch,
    agentsDirExists: true,
  };
}
