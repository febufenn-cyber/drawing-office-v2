// P1 — fanout-scheduler. Partitions a research task's page set into N disjoint
// workloads by stable page id (every page researched exactly once, no two
// sub-agents duplicate work), reserves one budget slice split into nonzero
// per-sub-agent sub-slices, dispatches N sub-agent DAGs to the executor, and drives
// merge and verify. A sub-agent that exhausts its slice returns a recorded gap
// marker, never a silent omission. The scheduler owns no action path — sub-agents
// reach pages only through the executor.

import { merge, verify } from './merge.ts';
import type { BudgetManager } from './budget.ts';
import type { Executor, Router } from './seams.ts';
import type { Actual, DenyAxis, Partial, Request, ResearchTask, SubAgentDag, VerifyReport } from './types.ts';

export function partition(pages: readonly string[], n: number): string[][] {
  if (n < 1) throw new Error('invalid_width');
  const width = Math.min(n, pages.length);
  if (width === 0) return [];
  const buckets: string[][] = Array.from({ length: width }, () => []);
  const ordered = [...pages].sort();
  ordered.forEach((page, i) => buckets[i % width]!.push(page));
  return buckets;
}

function bucketRequest(bucket: readonly string[], perPage: Request): Request {
  return {
    tokens: perPage.tokens * bucket.length,
    seconds: perPage.seconds * bucket.length,
    money_max: perPage.money_max * bucket.length,
  };
}

export type FanoutResult =
  | { readonly ok: true; readonly report: VerifyReport; readonly actual: Actual }
  | { readonly ok: false; readonly reason: DenyAxis; readonly report: VerifyReport };

export interface FanoutDeps {
  readonly budget: BudgetManager;
  readonly executor: Executor;
  readonly router: Router;
}

export class FanoutScheduler {
  constructor(private readonly deps: FanoutDeps) {}

  run(task: ResearchTask, width: number): FanoutResult {
    const buckets = partition(task.page_set, width);
    const agentIds = buckets.map((_, i) => 'agent-' + String(i));

    const total: Request = buckets.reduce<Request>(
      (acc, b) => {
        const r = bucketRequest(b, task.per_page);
        return { tokens: acc.tokens + r.tokens, seconds: acc.seconds + r.seconds, money_max: acc.money_max + r.money_max };
      },
      { tokens: 0, seconds: 0, money_max: 0 },
    );

    const slice = this.deps.budget.reserve(task.id, task.workspace, task.ceiling, total);
    if (!slice.granted) {
      // Halt at the ceiling: a partial artifact marking every bucket as a gap.
      const halted = merge(agentIds.map((id): Partial => ({ agent_id: id, claims: [], gap: true })));
      return { ok: false, reason: slice.reason, report: verify(halted, this.deps.router, task.producing_roles) };
    }

    const partials: Partial[] = [];
    let actual: Actual = { tokens: 0, seconds: 0, money_minor: 0 };
    buckets.forEach((bucket, i) => {
      const dag: SubAgentDag = { agent_id: agentIds[i]!, pages: bucket };
      const res = this.deps.executor.submit(dag, bucketRequest(bucket, task.per_page)); // nonzero sub-slice
      partials.push(res.partial);
      actual = {
        tokens: actual.tokens + res.actual.tokens,
        seconds: actual.seconds + res.actual.seconds,
        money_minor: actual.money_minor + res.actual.money_minor,
      };
    });

    this.deps.budget.commit(slice.reservation, actual);
    const artifact = merge(partials);
    return { ok: true, report: verify(artifact, this.deps.router, task.producing_roles), actual };
  }
}
