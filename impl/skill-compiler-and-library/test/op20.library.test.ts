// Op 20 — P4 skill-library. put then lookup_exact returns the skill when all
// locators bind and none when one is unbound; lookup_nearest returns the nearest
// with gaps named; version id strictly monotonic; per-workspace separation; a
// durable write flushes before the skill is served; a demoted skill is served by
// neither lookup.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SkillLibrary } from '../src/library.ts';
import { generalize } from '../src/generalizer.ts';
import { FakeWorkspaceStore, FIXED_CLOCK, putSnapshot, searchNodes, searchTrajectory, wire, WS } from './helpers.ts';
import type { Skill } from '../src/types.ts';

function candidate(): Skill {
  const gen = generalize(searchTrajectory(), new (class { identity(r: string) { return r; } lift() { return { parameters: [{ name: 'query', type: 'string', required: true }], param_binding: { 0: 'query' } }; } grade() { return 'reproduced' as const; } })(), FIXED_CLOCK);
  if (!gen.ok) throw new Error('fixture did not generalize');
  return gen.candidate;
}

test('a promoted skill whose locators all bind is returned by lookup_exact', () => {
  const { library, ws } = wire();
  putSnapshot(ws, 'snap:cur', searchNodes());
  library.put(candidate(), 'promoted', true);
  assert.equal(library.lookup_exact('shop.search', 'snap:cur')?.signature, 'shop.search');
});

test('lookup_exact returns none when a locator is unbound', () => {
  const { library, ws } = wire();
  putSnapshot(ws, 'snap:empty', []); // no nodes -> nothing binds
  library.put(candidate(), 'promoted', true);
  assert.equal(library.lookup_exact('shop.search', 'snap:empty'), null);
});

test('lookup_nearest returns the skill and names the unbound gaps', () => {
  const { library, ws } = wire();
  putSnapshot(ws, 'snap:partial', [searchNodes()[0]!]); // only the box node present
  library.put(candidate(), 'promoted', true);
  const near = library.lookup_nearest('shop.search', 'snap:partial');
  assert.ok(near);
  assert.deepEqual(near!.unbound, [1]); // the submit step's locator does not bind
});

test('version id is strictly monotonic per signature and idempotent per digest', () => {
  const { library } = wire();
  const c = candidate();
  assert.equal(library.put(c, 'candidate', true).version, 1);
  assert.equal(library.put(c, 'promoted', true).version, 1); // same digest -> same version
  const variant: Skill = { ...c, guards: [{ subject: 'x', relation: 'eq', value: 'y' }] }; // new digest
  assert.equal(library.put(variant, 'candidate', true).version, 2);
});

test('a durable put flushes before the skill is served', () => {
  const { library, ws } = wire();
  const before = ws.flushes;
  library.put(candidate(), 'promoted', true);
  assert.ok(ws.flushes > before);
});

test('a demoted skill is served by neither lookup', () => {
  const { library, ws } = wire();
  putSnapshot(ws, 'snap:cur', searchNodes());
  library.put(candidate(), 'promoted', true);
  library.put(candidate(), 'demoted', true); // same digest, now demoted
  assert.equal(library.lookup_exact('shop.search', 'snap:cur'), null);
  assert.equal(library.lookup_nearest('shop.search', 'snap:cur'), null);
});

test('the library is per-workspace', () => {
  const ws = new FakeWorkspaceStore();
  new SkillLibrary(ws, WS).put(candidate(), 'promoted', true);
  assert.equal(new SkillLibrary(ws, 'ws-other').latest_promoted('shop.search'), null);
});

test('history is append-only and ordered by version', () => {
  const { library } = wire();
  const c = candidate();
  library.put(c, 'promoted', true);
  library.put({ ...c, guards: [{ subject: 'a', relation: 'eq', value: 'b' }] }, 'candidate', true);
  const h = library.history('shop.search');
  assert.deepEqual(h.map((r) => r.version), [1, 2]);
});
