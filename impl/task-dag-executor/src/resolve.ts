// Shared input resolution: a step's resolved inputs are the upstream output values
// wired to it by edges, read from the latest succeeded checkpoint of each source
// step. Used by both the scheduler (P2) and the controller (P5), so it lives apart
// from either. Pure over the graph and a checkpoint view.

import type { Checkpoint, Step, TaskGraph } from './types.ts';

export interface CheckpointView {
  latest(step_id: string): Checkpoint | null;
}

export function resolveInputs(
  graph: TaskGraph,
  step: Step,
  checkpoints: CheckpointView,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const port of step.inputs) {
    const edge = graph.edges.find((e) => e.to_step === step.step_id && e.to_port === port.name);
    if (edge === undefined) continue; // an unwired input port stays unresolved
    const cp = checkpoints.latest(edge.from_step);
    if (cp !== null && cp.status === 'succeeded' && edge.from_port in cp.outputs) {
      inputs[port.name] = cp.outputs[edge.from_port];
    }
  }
  return inputs;
}
