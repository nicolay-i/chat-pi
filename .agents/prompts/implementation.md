# Implementation mode prompt

Implement the requested task with minimal unrelated changes. Preserve the architecture decisions:

- `.agents` is the project system directory.
- Writable agent work must use task worktrees.
- Chat, Task, Pi session, and Event log are separate concepts.
- Shared DTOs belong in `packages/contracts`.
- UI must support mobile and web.

Before finishing, run the task's verification checklist.
