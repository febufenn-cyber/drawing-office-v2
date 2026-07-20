// P2 — step-scheduler. A pure function from graph and checkpoint state to the
// ready set and the next runnable step. A step is ready when every incoming edge's
// source step holds a succeeded checkpoint whose named output port is materialized,
// and the step itself holds no terminal checkpoint. A checkpoint is terminal when
// it is failed or skipped, or a succeeded checkpoint that is honored — its
// input_digest still equals the step's resolved digest. A succeeded checkpoint gone
// stale re-enters the ready set. Ties break ascending by step_id, so the schedule
// is deterministic and replayable.

import { inputDigest } from './schema.ts';
import { resolveInputs, type CheckpointView } from './resolve.ts';
import type { Edge, Step, TaskGraph } from './types.ts';

function byStepId(a: Step, b: Step): number {
  return a.step_id < b.step_id ? -1 : a.step_id > b.step_id ? 1 : 0;
}

export function readySet(graph: TaskGraph, checkpoints: CheckpointView): Step[] {
  // Precompute incoming edges per step so readiness is O(V + E), not O(V * E).
  const incoming = new Map<string, Edge[]>();
  for (const e of graph.edges) {
    const arr = incoming.get(e.to_step);
    if (arr === undefined) incoming.set(e.to_step, [e]); else arr.push(e);
  }

  const ready: Step[] = [];
  for (const step of graph.steps) {
    const cp = checkpoints.latest(step.step_id);
    if (cp !== null && (cp.status === 'failed' || cp.status === 'skipped')) continue; // terminal
    if (cp !== null && cp.status === 'succeeded') {
      const resolved = resolveInputs(graph, step, checkpoints);
      if (cp.input_digest === inputDigest(step, resolved)) continue; // honored terminal
    }
    const inc = incoming.get(step.step_id) ?? [];
    const satisfied = inc.every((e) => {
      const src = checkpoints.latest(e.from_step);
      return src !== null && src.status === 'succeeded' && src.outputs[e.from_port] !== undefined;
    });
    if (satisfied) ready.push(step);
  }
  return ready.sort(byStepId);
}

export function next(graph: TaskGraph, checkpoints: CheckpointView): Step | null {
  const r = readySet(graph, checkpoints);
  return r.length > 0 ? (r[0] ?? null) : null;
}

// Whether every step holds a terminal checkpoint (succeeded, failed, or skipped),
// distinguishing a completed graph from one blocked on a failed predecessor.
export function allTerminal(graph: TaskGraph, checkpoints: CheckpointView): boolean {
  return graph.steps.every((step) => {
    const cp = checkpoints.latest(step.step_id);
    return cp !== null && (cp.status === 'succeeded' || cp.status === 'failed' || cp.status === 'skipped');
  });
}
