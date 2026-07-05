# Verify Subagent Output

Use this skill after a subagent claims a task is complete.

## Steps

1. Read the task file from `.agents/tasks/`.
2. Read `docs/11-definition-of-done.md`.
3. Inspect changed files.
4. Run or review the listed verification commands.
5. Confirm every acceptance check.
6. Produce a verdict:
   - `pass`;
   - `pass_with_notes`;
   - `fail`.

## Output format

```text
Verdict:
Task:
Checks passed:
Checks failed:
Commands reviewed/run:
Required fixes:
```
