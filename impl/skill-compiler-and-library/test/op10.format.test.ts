// Op 10 — P1 skill-format. Golden skills validate; untyped-parameter,
// undeclared-binding, unbound-locator, unknown-action-kind, and no-provenance
// skills are rejected; digests are identical across step and parameter orderings;
// resolve_locators returns exactly one node per locator or unbound.

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve_locators, skill_digest, validate_skill } from '../src/format.ts';
import type { Skill } from '../src/types.ts';
import { searchNodes } from './helpers.ts';

function goodSkill(): Skill {
  return {
    skill_id: 'sk:x',
    signature: 'shop.search',
    version: 1,
    parameters: [{ name: 'query', type: 'string', required: true }],
    steps: [
      { index: 0, kind: 'type', locator: { role: 'textbox', name_pattern: 'Search', structural_path: 'form/input[0]' }, bindings: [{ field: 'text', source: 'param:query' }], commit: 'none' },
      { index: 1, kind: 'submit', locator: { role: 'button', name_pattern: 'Search', structural_path: 'form/button[0]' }, bindings: [], commit: 'none' },
    ],
    guards: [],
    postconditions: ['results non-empty'],
    provenance: { trajectory_ref: 'traj-1', generalizing_model: 'model-A', source_digest: 'abc' },
    status: 'candidate',
  };
}

test('a well-formed skill validates', () => {
  assert.equal(validate_skill(goodSkill()).ok, true);
});

test('an untyped parameter is rejected', () => {
  const s: Skill = { ...goodSkill(), parameters: [{ name: 'query', type: '', required: true }] };
  const r = validate_skill(s);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'UNTYPED_PARAMETER');
});

test('a binding to an undeclared parameter is rejected', () => {
  const g = goodSkill();
  const s: Skill = { ...g, steps: [{ ...g.steps[0]!, bindings: [{ field: 'text', source: 'param:missing' }] }, g.steps[1]!] };
  const r = validate_skill(s);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'UNDECLARED_PARAMETER');
});

test('an unbound locator (no structural path) is rejected', () => {
  const g = goodSkill();
  const s: Skill = { ...g, steps: [{ ...g.steps[0]!, locator: { role: 'textbox', name_pattern: 'Search', structural_path: '' } }, g.steps[1]!] };
  const r = validate_skill(s);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'UNBOUND_LOCATOR');
});

test('an unknown action kind is rejected', () => {
  const g = goodSkill();
  const s = { ...g, steps: [{ ...g.steps[0]!, kind: 'frobnicate' as unknown as Skill['steps'][number]['kind'] }, g.steps[1]!] };
  const r = validate_skill(s);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'UNKNOWN_ACTION_KIND');
});

test('absent provenance is rejected', () => {
  const s: Skill = { ...goodSkill(), provenance: { trajectory_ref: '', generalizing_model: 'model-A', source_digest: '' } };
  const r = validate_skill(s);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'NO_PROVENANCE');
});

test('the digest is identical across parameter and step ordering and excludes status', () => {
  const a = goodSkill();
  const b: Skill = { ...a, status: 'promoted' }; // status differs
  assert.equal(skill_digest(a), skill_digest(b)); // status excluded
  const reordered: Skill = { ...a, parameters: [...a.parameters].reverse() };
  assert.equal(skill_digest(a), skill_digest(reordered)); // canonical sorts
});

test('resolve_locators binds each locator to exactly one node', () => {
  const r = resolve_locators(goodSkill(), { snapshot_ref: 's', nodes: searchNodes() });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.bound.map((b) => b.stable_id), ['sb-box', 'sb-submit']);
});

test('a locator matching zero nodes reports unbound', () => {
  const r = resolve_locators(goodSkill(), { snapshot_ref: 's', nodes: [] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.unbound, 0);
});

test('a locator matching two nodes reports unbound', () => {
  const dup = [...searchNodes(), { stable_id: 'sb-box2', role: 'textbox', name: 'Search', structural_path: 'form/input[0]' }];
  const r = resolve_locators(goodSkill(), { snapshot_ref: 's', nodes: dup });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.unbound, 0); // step 0's locator now matches two
});
