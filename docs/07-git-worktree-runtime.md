# 07. Git worktree runtime

## 1. Why worktree

Trying to run several writable agent tasks in one checkout creates uncontrolled dirty state. Git can track commits, but it cannot make concurrent file edits safe without isolation. Worktree is the simplest isolation boundary for one user and one VPS.

## 2. Policy

```text
read-only chat     -> canonical repo checkout is allowed
writable task      -> always separate branch + worktree
fork writable task -> separate branch + worktree from selected checkpoint
merge              -> explicit action into target branch
```

## 3. Creating a task worktree

Pseudo-flow:

```ts
async function createWritableTask(input) {
  const taskId = createId();
  const baseSha = await git.revParse(input.baseRef ?? project.defaultBranch);
  const branch = `agents/task/${taskId}`;
  const worktreePath = `${runtime}/worktrees/${taskId}`;

  await git.branch(branch, baseSha);
  await git.worktreeAdd(worktreePath, branch);

  await db.tasks.insert({
    id: taskId,
    branchName: branch,
    baseSha,
    worktreePath,
    status: 'idle',
  });
}
```

## 4. Checkpoints

After every completed turn:

```text
1. detect before/after sha
2. create commit or stash-like patch on task branch
3. save patch file
4. save task_checkpoints row
5. emit checkpoint.created
```

MVP checkpoint method:

```bash
git add -A
git commit -m "agent checkpoint: <taskId> <turnId>"
```

Alternative later:

- Lightweight patch snapshots without commits.
- Squash noisy commits on merge.

## 5. Rebase / stale handling

When target branch moves:

```text
if mergeBase(taskBranch, targetBranch) != targetHead:
  task.status = stale
```

User action:

```text
Rebase from target
  -> only when task idle
  -> create pre-rebase checkpoint
  -> run git rebase target
  -> if conflict: merge_conflict
  -> if success: idle/needs_review
```

## 6. Merge action

Default:

```bash
git switch <target>
git pull --ff-only
git merge --squash agents/task/<taskId>
git commit -m "agent: <task title>"
```

Checks before merge:

- task is idle/needs_review;
- worktree is clean after final checkpoint;
- no active lock;
- target branch known;
- user confirms.

## 7. Fork from checkpoint

```text
source task checkpoint C afterSha=A2
new branch agents/task/<newTaskId> from A2
new worktree runtime/worktrees/<newTaskId>
new Pi session fork/copy/import from linked entry
new chat optional
```

## 8. Rollback

Default safe rollback:

```text
Rollback to checkpoint = create new task from checkpoint
```

Destructive rollback can be added later behind danger confirmation.

## 9. Verification checklist

- Starting two implementation tasks creates two branches and two worktrees.
- Both tasks can edit same file without filesystem conflict until merge.
- Merge of first task updates target branch.
- Second task becomes stale if target changed.
- Rebase conflict is represented in UI and does not destroy worktree.
- Fork from checkpoint starts from correct file content.
