// P1 — skill-format. Validates a Skill, computes its canonical form and version
// digest (excluding the mutable status), and resolves each NodeLocator to at most
// one stable node id against a snapshot. A locator matching zero or two nodes is
// unbound — a skill binds only when every locator resolves to exactly one node.

import { canonical, sha256hex } from './canonical.ts';
import { ACTION_KINDS } from './types.ts';
import type { Snapshot, SnapshotNode } from './seams.ts';
import type { Binding, Skill, ValidateResult } from './types.ts';

// A binding source is 'param:NAME' (bind an action field from a parameter) or
// 'lit:VALUE' (a compile-time literal).
export type ParsedSource =
  | { readonly kind: 'param'; readonly ref: string }
  | { readonly kind: 'literal'; readonly value: string };

export function parseSource(source: string): ParsedSource | null {
  if (source.startsWith('param:')) return { kind: 'param', ref: source.slice('param:'.length) };
  if (source.startsWith('lit:')) return { kind: 'literal', value: source.slice('lit:'.length) };
  return null;
}

export function validate_skill(skill: Skill): ValidateResult {
  // Provenance must be present.
  if (skill.provenance.trajectory_ref === '' || skill.provenance.source_digest === '') {
    return { ok: false, reason: 'NO_PROVENANCE' };
  }
  // Parameters must be typed.
  const paramNames = new Set<string>();
  for (const p of skill.parameters) {
    if (p.name === '' || p.type === '') return { ok: false, reason: 'UNTYPED_PARAMETER' };
    paramNames.add(p.name);
  }
  for (const step of skill.steps) {
    if (!ACTION_KINDS.has(step.kind)) return { ok: false, reason: 'UNKNOWN_ACTION_KIND' };
    // Every locator must be bindable in shape: role and structural_path present.
    if (step.locator.role === '' || step.locator.structural_path === '') return { ok: false, reason: 'UNBOUND_LOCATOR' };
    for (const b of step.bindings) {
      const src = parseSource(b.source);
      if (src === null) return { ok: false, reason: 'BAD_BINDING_SOURCE' };
      if (src.kind === 'param' && !paramNames.has(src.ref)) return { ok: false, reason: 'UNDECLARED_PARAMETER' };
    }
  }
  return { ok: true };
}

// The version identity: a digest over signature, parameters, steps, and guards —
// excluding the mutable status and the derived skill_id.
export function skill_digest(skill: Skill): string {
  return sha256hex(canonical({
    signature: skill.signature,
    parameters: skill.parameters,
    steps: skill.steps,
    guards: skill.guards,
  }));
}

function nameMatches(pattern: string, name: string): boolean {
  return pattern.length === 0 ? true : name.includes(pattern);
}

export type ResolveResult =
  | { readonly ok: true; readonly bound: ReadonlyArray<{ index: number; stable_id: string }> }
  | { readonly ok: false; readonly unbound: number };

export function resolve_locators(skill: Skill, snapshot: Snapshot): ResolveResult {
  const bound: Array<{ index: number; stable_id: string }> = [];
  for (const step of skill.steps) {
    const matches = snapshot.nodes.filter((n: SnapshotNode) =>
      n.role === step.locator.role &&
      n.structural_path === step.locator.structural_path &&
      nameMatches(step.locator.name_pattern, n.name));
    if (matches.length === 1) bound.push({ index: step.index, stable_id: matches[0]!.stable_id });
    else return { ok: false, unbound: step.index }; // zero or many -> unbound
  }
  return { ok: true, bound };
}

// The subset of steps whose locators do not bind against the snapshot (for nearest).
export function unbound_steps(skill: Skill, snapshot: Snapshot): number[] {
  const gaps: number[] = [];
  for (const step of skill.steps) {
    const matches = snapshot.nodes.filter((n) =>
      n.role === step.locator.role &&
      n.structural_path === step.locator.structural_path &&
      nameMatches(step.locator.name_pattern, n.name));
    if (matches.length !== 1) gaps.push(step.index);
  }
  return gaps;
}
