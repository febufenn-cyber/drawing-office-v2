// P7 — hot-swapper. Re-learn and swap, fail-closed. On a drift signal it acquires
// a per-origin re-learn lock, drives a fresh exploration (P2), re-synthesizes a
// candidate version (P3), and verifies the candidate against health (P5) on the
// live origin. It promotes the candidate by atomic pointer swap only when the
// candidate passes; otherwise the prior version stays live, marked degraded. A
// candidate is never promoted unverified, and at most one re-learn runs per origin
// at a time.

import { allHealthy, health } from './health.ts';
import { explore } from './recorder.ts';
import { synthesize } from './synthesizer.ts';
import type { AdapterStore } from './store.ts';
import type { Clock, ExploreDriver, ModelRouter, PageGraph, RenderSurface } from './seams.ts';

export type SwapOutcome = 'busy' | 'promoted' | 'degraded_kept_prior' | 'no_prior';

export class HotSwapper {
  private readonly locks = new Set<string>();

  constructor(
    private readonly store: AdapterStore,
    private readonly driver: ExploreDriver,
    private readonly surface: RenderSurface,
    private readonly graph: PageGraph,
    private readonly model: ModelRouter,
    private readonly clock: Clock,
  ) {}

  isLocked(origin: string): boolean {
    return this.locks.has(origin);
  }

  relearn_and_swap(origin: string, handle: string): SwapOutcome {
    if (this.locks.has(origin)) return 'busy';
    this.locks.add(origin);
    try {
      const script = this.driver.script(origin);
      const trajectory = explore(this.surface, this.graph, this.clock, origin, handle, script);
      const { version } = synthesize(trajectory, this.model, this.store, this.clock); // pointer unchanged
      const candidate = this.store.get(origin, version);
      if (candidate === null) return 'degraded_kept_prior';

      const report = health(candidate, this.surface, this.graph, handle, this.clock);
      if (allHealthy(report)) {
        this.store.swap(origin, version); // atomic promotion
        return 'promoted';
      }

      // Fail-closed: keep the prior live version and mark it degraded. If there is
      // no prior live version, the candidate is left retained but unpromoted.
      const prior = this.store.currentVersion(origin);
      if (prior === null) return 'no_prior';
      this.store.markDegraded(origin, prior);
      return 'degraded_kept_prior';
    } finally {
      this.locks.delete(origin);
    }
  }
}
