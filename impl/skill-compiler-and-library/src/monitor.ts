// P6 — replay-monitor. Consumes the outcome of every production replay the
// executor reports for a served skill and increments the per-skill success or
// failure counter durably before acknowledging, so no outcome is lost behind the
// reliability figure it feeds. The demotion criterion is a fixed threshold over a
// bounded recent window, not lifetime totals, so a long-successful skill that
// breaks on a site change demotes promptly. A crossing raises exactly one demotion
// signal; subsequent failures on the same already-signaled skill raise none.

import { canonical } from './canonical.ts';
import type { WorkspaceStore } from './seams.ts';

interface MonitorState {
  recent: boolean[]; // true = ok, most recent last
  success: number;
  failure: number;
  signaled: boolean;
}

export type MonitorResult =
  | { readonly signal: false }
  | { readonly signal: true; readonly signature: string };

export class ReplayMonitor {
  private readonly cache = new Map<string, MonitorState>();

  constructor(
    private readonly ws: WorkspaceStore,
    private readonly workspaceId: string,
    private readonly windowSize = 5,
    private readonly threshold = 3,
  ) {}

  private key(signature: string): string {
    return 'monitor:' + this.workspaceId + ':' + signature;
  }

  private load(signature: string): MonitorState {
    const cached = this.cache.get(signature);
    if (cached !== undefined) return cached;
    const raw = this.ws.get(this.key(signature));
    const state: MonitorState = raw !== null
      ? (JSON.parse(raw) as MonitorState)
      : { recent: [], success: 0, failure: 0, signaled: false };
    this.cache.set(signature, state);
    return state;
  }

  private persist(signature: string, state: MonitorState): void {
    const ack = this.ws.put(this.key(signature), canonical(state), true); // durable before ack
    if (!ack.durable) throw new Error('durable counter write not flushed');
    this.cache.set(signature, state);
  }

  record_outcome(signature: string, ok: boolean): MonitorResult {
    const state = this.load(signature);
    if (ok) state.success++; else state.failure++;
    state.recent.push(ok);
    if (state.recent.length > this.windowSize) state.recent.shift();

    const failuresInWindow = state.recent.filter((o) => !o).length;
    let result: MonitorResult = { signal: false };
    if (failuresInWindow >= this.threshold && !state.signaled) {
      state.signaled = true;
      result = { signal: true, signature };
    }
    this.persist(signature, state);
    return result;
  }

  // After a demotion and re-learn, the signal latch is cleared so a fresh skill for
  // the signature can be monitored anew.
  reset(signature: string): void {
    this.persist(signature, { recent: [], success: 0, failure: 0, signaled: false });
  }

  counts(signature: string): { success: number; failure: number } {
    const s = this.load(signature);
    return { success: s.success, failure: s.failure };
  }
}
