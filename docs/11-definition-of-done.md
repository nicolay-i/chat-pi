# 11. Definition of Done

A task is done only if all relevant items are true.

## General

- Requirement implemented according to task file.
- No unrelated rewrites.
- TypeScript strict passes.
- Existing tests pass.
- New behavior has tests or a documented reason why not.
- User-visible text is Russian where product UI is Russian.
- Errors are explicit and actionable.
- No secrets in logs.

## Frontend

- Screen route exists.
- Loading/empty/error/success states implemented.
- testIDs for critical controls.
- Accessibility labels for buttons.
- Mobile viewport checked.
- Web viewport checked if route is web-supported.
- State updates from mock events, not hardcoded only.

## Backend

- Input schema validation.
- Errors use standard shape.
- Integration tests for side effects.
- Event emitted for state changes.
- Idempotency considered for dangerous actions.
- Locks used for Pi session/task runtime writes.

## Agent/runtime

- Writable task uses worktree.
- No agent write to main checkout.
- Checkpoint created after completed turn.
- Abort attempts to stop active process/tool.
- Fork links chat state and filesystem state.

## Review output required from subagent

```text
Status: done | partial | blocked
Changed files:
Verification run:
Manual checks:
Known gaps:
Follow-up tasks:
```
