// The external seams DO-015 consumes: PageGraph (DO-014), RenderSurface (DO-013),
// and the model router (DO-017). Interfaces here; tests provide stubs. No engine
// or Electron symbol appears in this subsystem.

import type { ActionKind, NodeAnchor, Trajectory } from './types.ts';

// A PageGraph node as this subsystem reads it: a stable id plus the structural
// digest an anchor resolves by, plus readable fields for `read` steps.
export interface GraphNode {
  readonly stable_id: string;
  readonly role: string;
  readonly name: string;
  readonly structural_digest: string;
  readonly fields: Readonly<Record<string, string | number | boolean>>;
}
export interface GraphSnapshot {
  readonly snapshot_id: string;
  readonly nodes: readonly GraphNode[];
}

export interface PageGraph {
  snapshot(handle: string): GraphSnapshot;
}

// Resolve an anchor against a snapshot by structural digest and role, with the
// name pattern as a further constraint — never a raw selector.
export function resolveAnchor(anchor: NodeAnchor, snap: GraphSnapshot): GraphNode | null {
  for (const n of snap.nodes) {
    if (n.structural_digest === anchor.structural_digest && n.role === anchor.role && matchName(anchor.name_pattern, n.name)) {
      return n;
    }
  }
  return null;
}

function matchName(pattern: string, name: string): boolean {
  if (pattern.length === 0) return true;
  return name.includes(pattern);
}

export interface ActResult {
  readonly ok: boolean;
}
export interface RenderSurface {
  act(handle: string, stable_id: string, action: ActionKind, value: string | null): ActResult;
}

// The learning pass output: structure only. The model names tools, proposes
// schemas, and marks which recorded literals are parameters — never anchors.
export interface ToolStructure {
  readonly name: string;
  readonly kind: 'search' | 'extract' | 'act' | 'navigate';
  readonly step_seqs: readonly number[]; // trajectory step seqs this tool spans
  readonly param_names: Readonly<Record<number, string>>; // step seq -> param name for marked literals
  readonly return_fields: Readonly<Record<string, 'string' | 'number' | 'boolean'>>;
}
export interface LearnResult {
  readonly tools: readonly ToolStructure[];
}
export interface ModelRouter {
  learn(trajectory: Trajectory): LearnResult;
}

// An injected monotone clock. now() returns an ISO-8601 instant. Tests supply a
// fake clock so trajectories, adapters, and health reports are byte-deterministic.
export interface Clock {
  now(): string;
}

// One command in an agent-driven exploration pass: the target node (as the agent
// located it in the current snapshot), the action, the declared intent, the value
// typed or selected, whether that value is a parameter candidate, and the fields
// a read step captures. The recorder derives a stable anchor from this.
export interface ExploreTarget {
  readonly role: string;
  readonly name: string;
  readonly structural_digest: string;
  readonly stable_id: string;
}
export interface ExploreCommand {
  readonly target: ExploreTarget;
  readonly action: ActionKind;
  readonly intent: string;
  readonly value: string | null;
  readonly param_candidate: boolean;
  readonly read_fields: readonly string[];
}

// The seam through which P7 obtains a fresh exploration script for an origin. In
// production the agent runtime drives exploration live; here a driver supplies
// the command sequence for the origin under re-learn.
export interface ExploreDriver {
  script(origin: string): readonly ExploreCommand[];
}
