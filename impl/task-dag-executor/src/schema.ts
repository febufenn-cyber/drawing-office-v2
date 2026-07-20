// P1 — task-dag-schema. Validates a TaskGraph (acyclic, unique step ids, existing
// edge endpoints and ports, matching port types) and computes the canonical input
// digest that keys each step's checkpoint. The digest is byte-identical for equal
// resolved inputs regardless of port order, because the canonical form sorts keys.

import { canonical, sha256hex } from './canonical.ts';
import type { Edge, Port, Step, TaskGraph, ValidateResult } from './types.ts';

function portByName(ports: readonly Port[], name: string): Port | undefined {
  return ports.find((p) => p.name === name);
}

export function validate(graph: TaskGraph): ValidateResult {
  const byId = new Map<string, Step>();
  for (const step of graph.steps) {
    if (byId.has(step.step_id)) return { ok: false, reason: 'DUPLICATE_ID', at: step.step_id };
    byId.set(step.step_id, step);
  }

  for (const e of graph.edges) {
    const from = byId.get(e.from_step);
    const to = byId.get(e.to_step);
    if (from === undefined || to === undefined) return { ok: false, reason: 'BAD_EDGE', at: edgeLabel(e) };
    const fp = portByName(from.outputs, e.from_port);
    const tp = portByName(to.inputs, e.to_port);
    if (fp === undefined || tp === undefined) return { ok: false, reason: 'BAD_EDGE', at: edgeLabel(e) };
    if (fp.type !== tp.type) return { ok: false, reason: 'BAD_EDGE', at: edgeLabel(e) };
  }

  const cycle = findCycle(graph);
  if (cycle !== null) return { ok: false, reason: 'CYCLE', at: cycle.join('->') };

  return { ok: true, graph };
}

function edgeLabel(e: Edge): string {
  return e.from_step + '.' + e.from_port + '->' + e.to_step + '.' + e.to_port;
}

// Depth-first cycle detection over the step-to-step edge relation. Returns the
// path of a detected cycle, or null.
function findCycle(graph: TaskGraph): string[] | null {
  const succ = new Map<string, string[]>();
  for (const s of graph.steps) succ.set(s.step_id, []);
  for (const e of graph.edges) succ.get(e.from_step)?.push(e.to_step);

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const s of graph.steps) color.set(s.step_id, WHITE);
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    color.set(id, GRAY);
    stack.push(id);
    for (const n of succ.get(id) ?? []) {
      const c = color.get(n) ?? WHITE;
      if (c === GRAY) return [...stack.slice(stack.indexOf(n)), n];
      if (c === WHITE) {
        const found = visit(n);
        if (found !== null) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  }

  for (const s of graph.steps) {
    if (color.get(s.step_id) === WHITE) {
      const found = visit(s.step_id);
      if (found !== null) return found;
    }
  }
  return null;
}

// The digest of the step kind and its resolved inputs; keys the checkpoint.
export function inputDigest(step: Step, resolvedInputs: Readonly<Record<string, unknown>>): string {
  return sha256hex(canonical({ kind: step.kind, inputs: resolvedInputs }));
}
