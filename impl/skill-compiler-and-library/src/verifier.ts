// P3 — sandbox-verifier. Adversarial by construction: the model that grades a
// replay is a different model than the one that produced it, resolved through a
// distinct router role. A candidate whose provenance names the verifier role is
// refused rather than graded. Replay runs only in a sandbox workspace partition,
// isolated from every production partition, so it never touches the user's live
// logins or artifacts. A terminal irreversible or monetary step is bound and
// resolved to prove the script reaches it, but its committing effect is not
// executed in the sandbox — the commit stays gated at production run time.

import { parseSource, resolve_locators } from './format.ts';
import type { ModelRouter, RenderSurface, SandboxAction } from './seams.ts';
import type { Skill, SkillStep, VerifyResult } from './types.ts';

const VERIFIER_ROLE = 'verifier';

function bindValue(step: SkillStep, inputs: Readonly<Record<string, string>>): string | null {
  for (const b of step.bindings) {
    const src = parseSource(b.source);
    if (src === null) continue;
    return src.kind === 'param' ? (inputs[src.ref] ?? null) : src.value;
  }
  return null;
}

export interface VerifyDeps {
  readonly model: ModelRouter;
  readonly surface: RenderSurface;
  readonly sandboxPartition: string;
}

export function verify(candidate: Skill, holdout: Readonly<Record<string, string>>, deps: VerifyDeps): VerifyResult {
  // Independence: the verifier never grades its own work.
  if (candidate.provenance.generalizing_model === deps.model.identity(VERIFIER_ROLE)) {
    return { ok: false, reason: 'VERIFIER_NOT_INDEPENDENT' };
  }

  const handle = deps.surface.open({ partition: deps.sandboxPartition, sandbox: true });
  const snapshot = deps.surface.snapshot(handle);
  const resolved = resolve_locators(candidate, snapshot);
  if (!resolved.ok) return { ok: false, reason: 'LOCATOR_UNBOUND' };

  const idByIndex = new Map(resolved.bound.map((b) => [b.index, b.stable_id] as const));
  const lastIndex = candidate.steps.length - 1;
  const outputs: Record<string, unknown> = { executed: [] as string[] };
  const executed = outputs['executed'] as string[];

  for (const step of candidate.steps) {
    const stable_id = idByIndex.get(step.index);
    if (stable_id === undefined) return { ok: false, reason: 'LOCATOR_UNBOUND' };
    const value = bindValue(step, holdout);

    const terminalCommit = step.index === lastIndex && step.commit !== 'none';
    if (terminalCommit) {
      // Bound and resolved (idByIndex holds it) but never committed in the sandbox.
      continue;
    }
    const action: SandboxAction = { stable_id, kind: step.kind, value };
    deps.surface.act(handle, action);
    executed.push(stable_id);
  }

  const graded = deps.model.grade(VERIFIER_ROLE, outputs, candidate.postconditions);
  if (graded === 'diverged') return { ok: false, reason: 'OUTPUT_DIVERGED' };
  return { ok: true };
}
