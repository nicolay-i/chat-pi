import type { DatabaseSync } from 'node:sqlite';
import type { Action, ActionRun } from '@pi-agents/contracts';
import { randomId } from '../db/util';

export type ActionContext = {
  taskStatus?: string;
  hasDiff?: boolean;
};

export interface ActionEngine {
  listActions(projectId: string, context?: ActionContext): Promise<Action[]>;
  runAction(
    actionId: string,
    input?: Record<string, unknown>,
  ): Promise<ActionRun>;
}

/**
 * Static catalog of project-level actions. `visibleWhen` / `enabledWhen`
 * are simple expression strings evaluated against the action context to
 * drive UI gating (the UI may also interpret them client-side). The
 * context filter below is an intentional approximation; real wiring lands
 * with the task-detail surface.
 */
const CATALOG: Action[] = [
  {
    id: 'commit',
    label: 'Commit',
    icon: 'git-commit',
    visibleWhen: 'taskStatus == "needs_review" || hasDiff == true',
    enabledWhen: 'hasDiff == true',
    hasSideEffect: true,
    confirmMessage: 'Commit staged changes?',
  },
  {
    id: 'run-tests',
    label: 'Запустить тесты',
    icon: 'beaker',
    visibleWhen: 'taskStatus != "created"',
    enabledWhen: 'taskStatus != "created"',
    hasSideEffect: true,
    confirmMessage: 'Run the test suite?',
  },
  {
    id: 'merge',
    label: 'Слить в repo',
    icon: 'git-merge',
    visibleWhen: 'taskStatus == "needs_review" || taskStatus == "passing"',
    enabledWhen: 'taskStatus == "needs_review" || taskStatus == "passing"',
    hasSideEffect: true,
    confirmMessage: 'Merge this task into the target branch?',
  },
  {
    id: 'revert',
    label: 'Откатить',
    icon: 'discard',
    visibleWhen: 'hasDiff == true || taskStatus == "needs_review"',
    enabledWhen: 'hasDiff == true',
    hasSideEffect: true,
    confirmMessage: 'Revert pending changes?',
  },
];

function evalExpr(expr: string | undefined, ctx: ActionContext): boolean {
  if (!expr) return true;
  const clauses = expr.split('||').map((c) => c.trim());
  for (const clause of clauses) {
    const m = clause.match(/^(\w+)\s*(==|!=)\s*"([^"]*)"$/);
    if (!m) continue;
    const [, key, op, lit] = m;
    const actual = readCtx(ctx, key);
    const litNorm = lit === 'true' ? true : lit === 'false' ? false : lit;
    if (op === '==' && actual === litNorm) return true;
    if (op === '!=' && actual !== litNorm) return true;
  }
  return false;
}

function readCtx(ctx: ActionContext, key: string): unknown {
  if (key === 'taskStatus') return ctx.taskStatus;
  if (key === 'hasDiff') return ctx.hasDiff === true;
  return undefined;
}

function visible(action: Action, ctx: ActionContext): boolean {
  return evalExpr(action.visibleWhen, ctx);
}

export function createActionEngine(_db: DatabaseSync): ActionEngine {
  return {
    async listActions(_projectId, context) {
      const ctx = context ?? {};
      const hasCtx =
        ctx.taskStatus !== undefined || ctx.hasDiff !== undefined;
      if (!hasCtx) return [...CATALOG];
      return CATALOG.filter((a) => visible(a, ctx));
    },

    async runAction(actionId, input) {
      return {
        id: randomId(),
        actionId,
        status: 'completed',
        result: { actionId, input: input ?? {} },
        createdAt: new Date().toISOString(),
      };
    },
  };
}
