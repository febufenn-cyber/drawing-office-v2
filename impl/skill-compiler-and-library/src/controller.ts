// P5 — promotion-controller. The only writer of skill status. On a submitted
// trajectory it generalizes, then verifies with a model the router guarantees
// differs from the generalizer; only a passing verification writes the skill to the
// library as promoted. A demotion signal moves a promoted skill to demoted — which
// the library immediately drops from both lookups — and records one re-learning
// request. Re-learning needs no separate learner: with the skill demoted the
// executor's next run falls to a model-driven run, whose success is submitted here
// as a fresh trajectory that re-enters compilation. Promotion is idempotent per
// candidate digest.

import { canonical } from './canonical.ts';
import { generalize } from './generalizer.ts';
import { verify } from './verifier.ts';
import type { SkillLibrary } from './library.ts';
import type { ReplayMonitor } from './monitor.ts';
import type { Clock, ModelRouter, RenderSurface, WorkspaceStore } from './seams.ts';
import type { PromoteResult, Trajectory } from './types.ts';

export interface ControllerDeps {
  readonly library: SkillLibrary;
  readonly monitor: ReplayMonitor;
  readonly model: ModelRouter;
  readonly surface: RenderSurface;
  readonly ws: WorkspaceStore;
  readonly clock: Clock;
  readonly workspaceId: string;
  readonly sandboxPartition?: string;
}

export class PromotionController {
  private readonly sandboxPartition: string;
  constructor(private readonly deps: ControllerDeps) {
    this.sandboxPartition = deps.sandboxPartition ?? 'sandbox';
  }

  compile_and_verify(trajectory: Trajectory): PromoteResult {
    const gen = generalize(trajectory, this.deps.model, this.deps.clock);
    if (!gen.ok) return { ok: false, reason: gen.reason };
    const candidate = gen.candidate;

    // Written as a candidate before verification; the digest keys the version, so a
    // resubmitted identical candidate reuses it rather than forking.
    this.deps.library.put(candidate, 'candidate', true);

    const vres = verify(candidate, trajectory.source_inputs, {
      model: this.deps.model, surface: this.deps.surface, sandboxPartition: this.sandboxPartition,
    });
    if (!vres.ok) {
      this.deps.library.put(candidate, 'candidate', true); // stays a candidate, never promoted
      return { ok: false, reason: vres.reason };
    }

    const { version } = this.deps.library.put(candidate, 'promoted', true);
    return { ok: true, skill_id: candidate.skill_id, version };
  }

  demote(signature: string): PromoteResult {
    const rec = this.deps.library.latest_promoted(signature);
    if (rec === null) return { ok: false, reason: 'noop' };
    this.deps.library.put(rec.skill, 'demoted', true);
    // Record exactly one re-learning request and clear the monitor latch so the
    // re-learned skill can be monitored anew.
    const ack = this.deps.ws.append(this.relearnKey(signature), canonical({ signature, ts: this.deps.clock.now() }), true);
    if (!ack.durable) throw new Error('durable relearn record not flushed');
    this.deps.monitor.reset(signature);
    return { ok: true, skill_id: rec.skill.skill_id, version: rec.version };
  }

  // Wires P6 -> P5: record a production replay outcome and demote on a signal.
  on_outcome(signature: string, ok: boolean): PromoteResult | null {
    const res = this.deps.monitor.record_outcome(signature, ok);
    return res.signal ? this.demote(signature) : null;
  }

  private relearnKey(signature: string): string {
    return 'relearn:' + this.deps.workspaceId + ':' + signature;
  }

  relearn_count(signature: string): number {
    return this.deps.ws.readAll(this.relearnKey(signature)).length;
  }
}
