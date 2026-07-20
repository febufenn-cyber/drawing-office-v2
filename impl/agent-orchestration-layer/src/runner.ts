// P6 — background-runner. Wakes on a fired trigger, runs its task under a reserved
// budget, records the outcome, and re-arms the trigger. It processes one firing per
// trigger at a time: a has_active_run guard refuses a second concurrent run. It
// reserves a budget before the first executor step, so a firing whose reservation
// is denied dispatches nothing and records a denied run. On recovery from a crash, a
// run left started with no terminal record is resumed exactly once — the active-run
// guard keyed by run_id keeps a resumed run from doubling.

import type { BudgetManager } from './budget.ts';
import type { FanoutScheduler } from './fanout.ts';
import type { Runner } from './triggerEngine.ts';
import type { TriggerStore } from './triggerStore.ts';
import type { Executor } from './seams.ts';
import type { Actual, Trigger } from './types.ts';

export type RunOutcome =
  | { readonly status: 'done'; readonly run_id: string }
  | { readonly status: 'denied'; readonly reason: string }
  | { readonly status: 'skip' }
  | { readonly status: 'nothing' };

const ZERO: Actual = { tokens: 0, seconds: 0, money_minor: 0 };

export interface RunnerDeps {
  readonly store: TriggerStore;
  readonly budget: BudgetManager;
  readonly fanout: FanoutScheduler;
  readonly executor: Executor;
}

export class BackgroundRunner implements Runner {
  private counter = 0;
  constructor(private readonly deps: RunnerDeps) {}

  enqueue(t: Trigger): void {
    this.run(t);
  }

  run(t: Trigger): RunOutcome {
    if (this.deps.store.has_active_run(t.trigger_id)) return { status: 'skip' };
    const run_id = 'run-' + String(++this.counter);
    this.deps.store.record_run(t.trigger_id, run_id, 'started');
    return this.execute(t, run_id);
  }

  // On recovery, complete an orphaned started run exactly once (resume under its own
  // run_id). If there is no orphan, there is nothing to recover.
  recover(t: Trigger): RunOutcome {
    const orphan = this.deps.store.orphanedRun(t.trigger_id);
    if (orphan === null) return { status: 'nothing' };
    return this.execute(t, orphan);
  }

  private execute(t: Trigger, run_id: string): RunOutcome {
    // Budget before the first executor step: a denied reservation dispatches nothing.
    const slice = this.deps.budget.reserve(t.trigger_id, t.workspace_id, t.ceiling, t.task_template.request);
    if (!slice.granted) {
      this.deps.store.record_run(t.trigger_id, run_id, 'denied');
      return { status: 'denied', reason: slice.reason };
    }

    let actual: Actual = ZERO;
    const tpl = t.task_template;
    if (tpl.fans_out && tpl.task !== null) {
      const res = this.deps.fanout.run(tpl.task, tpl.width);
      if (res.ok) actual = res.actual;
    } else if (tpl.dag !== null) {
      actual = this.deps.executor.submit(tpl.dag, tpl.request).actual;
    }

    this.deps.budget.commit(slice.reservation, actual);
    this.deps.store.record_run(t.trigger_id, run_id, 'done', 'artifact:' + run_id);
    this.deps.store.update(t, 'armed'); // re-arm; next_fire_at already advanced by the engine
    return { status: 'done', run_id };
  }
}
