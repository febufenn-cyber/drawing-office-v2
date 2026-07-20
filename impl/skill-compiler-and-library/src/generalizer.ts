// P2 — trajectory-generalizer. Lifts a successful trajectory into a candidate
// skill: a generalizing model proposes which concrete values become typed
// parameters and which node ids become locators; the deterministic post-check then
// re-binds the candidate to the source trajectory's own inputs and confirms it
// reproduces the source action sequence step for step. The model is the proposer,
// the post-check is the judge — a candidate that leaves a varied value
// un-parameterized or diverges from its source is rejected before any verification
// cost is spent. The model never writes provenance or status.

import { canonical, sha256hex } from './canonical.ts';
import { parseSource, skill_digest, validate_skill } from './format.ts';
import type { Clock, ModelRouter } from './seams.ts';
import type { Binding, GeneralizeResult, Skill, SkillStep, TrajectoryAction, Trajectory } from './types.ts';

const GENERALIZER_ROLE = 'generalizer';

function bindingsFor(action: TrajectoryAction, paramName: string | undefined): Binding[] {
  if (action.field === null) return [];
  const source = paramName !== undefined ? 'param:' + paramName : 'lit:' + (action.value ?? '');
  return [{ field: action.field, source }];
}

function boundValue(step: SkillStep, sourceInputs: Readonly<Record<string, string>>): string | null {
  for (const b of step.bindings) {
    const src = parseSource(b.source);
    if (src === null) continue;
    return src.kind === 'param' ? (sourceInputs[src.ref] ?? null) : src.value;
  }
  return null;
}

export function generalize(trajectory: Trajectory, model: ModelRouter, clock: Clock): GeneralizeResult {
  void clock;
  const lift = model.lift(GENERALIZER_ROLE, trajectory); // one generalizing model call (the proposer)

  const steps: SkillStep[] = trajectory.actions.map((a) => ({
    index: a.index,
    kind: a.kind,
    locator: { role: a.role, name_pattern: a.name, structural_path: a.structural_path },
    bindings: bindingsFor(a, lift.param_binding[a.index]),
    commit: a.commit,
  }));

  const provenance = {
    trajectory_ref: trajectory.trajectory_id,
    generalizing_model: model.identity(GENERALIZER_ROLE), // stamped by the generalizer, not the model
    source_digest: sha256hex(canonical(trajectory)),
  };

  const candidateNoId: Omit<Skill, 'skill_id'> = {
    signature: trajectory.signature,
    version: 0,
    parameters: lift.parameters,
    steps,
    guards: [],
    postconditions: trajectory.postconditions,
    provenance,
    status: 'candidate',
  };
  const candidate: Skill = { ...candidateNoId, skill_id: 'sk:' + skill_digest({ ...candidateNoId, skill_id: '' }) };

  if (!validate_skill(candidate).ok) return { ok: false, reason: 'SHAPE_INVALID' };

  // Every declared parameter must be used by exactly one binding — a varied value
  // lifted to a parameter that no step consumes is a bad lift.
  const used = new Map<string, number>();
  for (const step of steps) for (const b of step.bindings) {
    const src = parseSource(b.source);
    if (src?.kind === 'param') used.set(src.ref, (used.get(src.ref) ?? 0) + 1);
  }
  for (const p of candidate.parameters) if ((used.get(p.name) ?? 0) !== 1) return { ok: false, reason: 'SHAPE_INVALID' };

  // Deterministic post-check: re-bind to the source inputs and reproduce the
  // source action sequence step for step.
  if (candidate.steps.length !== trajectory.actions.length) return { ok: false, reason: 'SOURCE_DIVERGED' };
  for (let i = 0; i < candidate.steps.length; i++) {
    const step = candidate.steps[i]!;
    const action = trajectory.actions[i]!;
    const value = boundValue(step, trajectory.source_inputs);
    const reproduces =
      step.kind === action.kind &&
      step.locator.role === action.role &&
      step.locator.structural_path === action.structural_path &&
      step.commit === action.commit &&
      value === action.value;
    if (!reproduces) return { ok: false, reason: 'SOURCE_DIVERGED' };
  }

  return { ok: true, candidate };
}
