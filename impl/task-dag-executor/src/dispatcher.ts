// P4 — step-dispatcher. Executes one ready step. It resolves the fixed strategy
// ladder — exact skill, else nearest skill with model-patched gaps, else a full
// model run — first applicable tier winning, deterministic for a pinned skill
// snapshot. It routes by kind: consequential kinds (navigate, fill) submit an
// ActionProposal to the action control plane, the only path to an act-class
// effect; perception kinds (extract, verify) read a RenderSurface snapshot;
// compare crosses the model router. This part never calls RenderSurface act — its
// RenderSurface interface exposes only read-only methods. It evaluates the verify
// postcondition on every result.

import { evaluate } from './canonical.ts';
import { CONSEQUENTIAL, PERCEPTION } from './types.ts';
import type { ActionControlPlane, ActionProposal, ModelRouter, RenderSurface, SkillLibrary } from './seams.ts';
import type { Boundary, Port, Step, StepResult, StrategyKind } from './types.ts';

export interface DispatchContext {
  readonly workspace_id: string;
  readonly graph_id: string;
  readonly handle: string;
}

// The controller depends on this interface, so a test can wrap a real dispatcher
// (e.g. to inject a crash) without changing production wiring.
export interface Dispatcher {
  dispatch(ctx: DispatchContext, step: Step, inputs: Readonly<Record<string, unknown>>, idempotency_key: string): StepResult;
}

function materialize(ports: readonly Port[], values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of ports) if (p.name in values && values[p.name] !== undefined) out[p.name] = values[p.name];
  return out;
}

export class StepDispatcher implements Dispatcher {
  constructor(
    private readonly skills: SkillLibrary,
    private readonly control: ActionControlPlane,
    private readonly surface: RenderSurface,
    private readonly model: ModelRouter,
    private readonly snapshotRef: string,
  ) {}

  private resolveStrategy(step: Step): StrategyKind {
    if (this.skills.lookup_exact(step.signature, this.snapshotRef) !== null) return 'exact';
    if (this.skills.lookup_nearest(step.signature) !== null) return 'patched';
    return 'model';
  }

  dispatch(ctx: DispatchContext, step: Step, inputs: Readonly<Record<string, unknown>>, idempotency_key: string): StepResult {
    const strategy = this.resolveStrategy(step);

    let outputs: Record<string, unknown>;
    let boundary: Boundary;
    let snapshot_ref: string | null = null;
    let proposal_ref: string | null = null;
    let denied = false;

    if (CONSEQUENTIAL.has(step.kind)) {
      const proposal: ActionProposal = {
        workspace_id: ctx.workspace_id, graph_id: ctx.graph_id, step_id: step.step_id,
        kind: step.kind, inputs, idempotency_key,
      };
      const decision = this.control.submit(proposal);
      boundary = 'control_plane';
      proposal_ref = decision.proposal_ref;
      denied = decision.decision === 'deny';
      outputs = materialize(step.outputs, decision.outputs);
    } else if (PERCEPTION.has(step.kind)) {
      const snap = this.surface.snapshot(ctx.handle);
      boundary = 'perception';
      snapshot_ref = snap.snapshot_ref;
      outputs = materialize(step.outputs, snap.values);
    } else {
      const res = this.model.call('compare', inputs);
      boundary = 'model';
      outputs = materialize(step.outputs, res.outputs);
    }

    const ok = !denied && evaluate(step.postcondition, outputs);
    const detail = denied ? 'denied' : ok ? 'ok' : 'postcondition_failed';
    return { status: ok ? 'succeeded' : 'failed', outputs, strategy, boundary, snapshot_ref, proposal_ref, detail };
  }
}
