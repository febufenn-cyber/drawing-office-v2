// P3 — adapter-synthesizer. The only model-calling part. It runs one learning
// pass over a single trajectory through the model router to get structure — tool
// names, typed schemas, and a parameter mark on each recorded literal — then binds
// every anchor and literal from the recorded trajectory, never from model text. A
// proposed step whose anchor is absent from the trajectory is dropped, not
// invented. Synthesis is deterministic given the trajectory and the model
// response: the same pair yields a byte-identical SiteAdapter and replay_digest.

import { canonical, sha256hex } from './canonical.ts';
import { replayDigest } from './contract.ts';
import type { AdapterStore } from './store.ts';
import type { Clock, ModelRouter, ToolStructure } from './seams.ts';
import type {
  Assertion, FieldType, ParamBinding, ParamSet, ProvenanceRef, Schema, SiteAdapter, Step, Tool, Trajectory, TrajectoryStep,
} from './types.ts';

function bindingFor(step: TrajectoryStep, paramName: string | undefined): ParamBinding {
  if (paramName !== undefined) return { kind: 'param', param_ref: paramName, literal: null, extract_field: null };
  if (step.action !== 'read' && step.literal !== null) {
    return { kind: 'literal', param_ref: null, literal: step.literal, extract_field: null };
  }
  return { kind: 'literal', param_ref: null, literal: null, extract_field: null };
}

function returnSchemaFor(ts: ToolStructure, steps: readonly TrajectoryStep[]): Schema {
  // The return schema covers every field the trajectory's read steps captured,
  // typed by the model where it named a type and string by default otherwise.
  const fields: Record<string, FieldType> = {};
  for (const s of steps) if (s.action === 'read') for (const f of s.read_fields) fields[f] = 'string';
  for (const [k, t] of Object.entries(ts.return_fields)) fields[k] = t;
  return { kind: ts.kind === 'search' ? 'list' : 'record', fields };
}

function assertionsFor(kind: ToolStructure['kind']): readonly Assertion[] {
  if (kind === 'search') return [{ kind: 'non_empty_list', field: null }];
  if (kind === 'extract') return [{ kind: 'record_complete', field: null }];
  return [];
}

function buildTool(ts: ToolStructure, traj: Trajectory): Tool | null {
  const byseq = new Map(traj.steps.map((s) => [s.seq, s] as const));
  // Drop any proposed step whose anchor is absent from the trajectory.
  const trajSteps = ts.step_seqs.map((seq) => byseq.get(seq)).filter((s): s is TrajectoryStep => s !== undefined);
  if (trajSteps.length === 0) return null;

  const paramNames = ts.param_names;
  const steps: Step[] = trajSteps.map((s, i) => {
    const provenance: ProvenanceRef = { trajectory_id: traj.trajectory_id, step_index: s.seq, observed_at: s.observed_at };
    return {
      seq: i,
      anchor: s.anchor,
      action: s.action,
      binding: bindingFor(s, paramNames[s.seq]),
      read_fields: s.read_fields,
      provenance,
    };
  });

  // Every param traces to exactly one trajectory literal; golden params are those
  // concrete recorded values, replayed later by the health-checker.
  const paramFields: Record<string, FieldType> = {};
  const golden: Record<string, string> = {};
  for (const s of trajSteps) {
    const name = paramNames[s.seq];
    if (name !== undefined) {
      paramFields[name] = 'string';
      golden[name] = s.literal ?? '';
    }
  }

  const provenance: readonly ProvenanceRef[] = steps.map((s) => s.provenance);
  return {
    name: ts.name,
    kind: ts.kind,
    params_schema: { kind: 'record', fields: paramFields },
    return_schema: returnSchemaFor(ts, trajSteps),
    steps,
    golden_params: golden as ParamSet,
    assertions: assertionsFor(ts.kind),
    provenance,
  };
}

export interface SynthesisResult {
  readonly version: number;
  readonly adapter: SiteAdapter;
}

// Runs one learning pass and writes a versioned SiteAdapter (and its source
// trajectory) to the store. The store pointer is unchanged; promotion is a
// separate swap.
export function synthesize(trajectory: Trajectory, model: ModelRouter, store: AdapterStore, clock: Clock): SynthesisResult {
  const learn = model.learn(trajectory); // exactly one model call per compilation
  const tools = learn.tools
    .map((ts) => buildTool(ts, trajectory))
    .filter((t): t is Tool => t !== null)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const replay_digest = replayDigest(tools);
  const adapter_id = sha256hex(canonical({ origin: trajectory.origin, trajectory_id: trajectory.trajectory_id, replay_digest }));
  const adapter: SiteAdapter = {
    adapter_id,
    origin: trajectory.origin,
    version: 0, // assigned by the store on put
    tools,
    trajectory_ref: trajectory.trajectory_id,
    replay_digest,
    compiled_at: clock.now(),
  };
  const version = store.put(trajectory.origin, adapter, trajectory);
  const stored = store.get(trajectory.origin, version);
  return { version, adapter: stored ?? { ...adapter, version } };
}
