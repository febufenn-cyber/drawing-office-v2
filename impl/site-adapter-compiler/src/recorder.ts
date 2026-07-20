// P2 — exploration-recorder. Records one agent pass over an origin into a
// replayable Trajectory of stable-anchor steps. Each step captures the pre- and
// post-action PageGraph snapshot refs, the RenderSurface action, the fields it
// read, and the agent's intent. A target with no structural digest in the current
// snapshot is rejected as unstable_target rather than recorded as a guess. The
// recorder reads only PageGraph and acts only through RenderSurface.

import { canonical, sha256hex } from './canonical.ts';
import { resolveAnchor } from './seams.ts';
import type { Clock, ExploreCommand, ExploreTarget, PageGraph, RenderSurface } from './seams.ts';
import type { ActionKind, NodeAnchor, Trajectory, TrajectoryStep } from './types.ts';

export type RecordResult =
  | { readonly ok: true; readonly step: TrajectoryStep }
  | { readonly ok: false; readonly error: 'unstable_target' };

export class ExplorationRecorder {
  private readonly steps: TrajectoryStep[] = [];
  private seq = 0;

  constructor(
    private readonly surface: RenderSurface,
    private readonly graph: PageGraph,
    private readonly clock: Clock,
  ) {}

  // Derives a NodeAnchor, drives the action through RenderSurface, and appends a
  // TrajectoryStep. Rejects a target absent from the pre-snapshot; records nothing
  // in that case.
  record_step(
    handle: string,
    target: ExploreTarget,
    action: ActionKind,
    intent: string,
    value: string | null,
    param_candidate: boolean,
    read_fields: readonly string[],
  ): RecordResult {
    const pre = this.graph.snapshot(handle);
    const anchor: NodeAnchor = {
      role: target.role,
      name_pattern: target.name,
      structural_digest: target.structural_digest,
    };
    const node = resolveAnchor(anchor, pre);
    if (node === null) return { ok: false, error: 'unstable_target' };

    if (action !== 'read') this.surface.act(handle, node.stable_id, action, value);

    const post = this.graph.snapshot(handle);
    const step: TrajectoryStep = {
      seq: this.seq++,
      intent,
      pre_ref: pre.snapshot_id,
      anchor,
      action,
      literal: value,
      param_candidate,
      read_fields,
      post_ref: post.snapshot_id,
      observed_at: this.clock.now(),
    };
    this.steps.push(step);
    return { ok: true, step };
  }

  // Exactly one trajectory per exploration. The id is a digest of the origin and
  // the ordered steps, so an identical exploration yields a byte-identical id.
  trajectory(origin: string): Trajectory {
    const steps = [...this.steps];
    const trajectory_id = sha256hex(canonical({ origin, steps }));
    return { trajectory_id, origin, steps };
  }
}

// Convenience: run a whole exploration script and return its Trajectory. An
// unstable target aborts the exploration rather than seeding a guessed step.
export function explore(
  surface: RenderSurface,
  graph: PageGraph,
  clock: Clock,
  origin: string,
  handle: string,
  script: readonly ExploreCommand[],
): Trajectory {
  const recorder = new ExplorationRecorder(surface, graph, clock);
  for (const cmd of script) {
    const res = recorder.record_step(
      handle, cmd.target, cmd.action, cmd.intent, cmd.value, cmd.param_candidate, cmd.read_fields,
    );
    if (!res.ok) throw new Error('unstable_target:' + cmd.intent);
  }
  return recorder.trajectory(origin);
}
