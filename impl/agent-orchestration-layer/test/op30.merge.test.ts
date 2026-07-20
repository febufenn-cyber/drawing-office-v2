// Op 30 — P2 merge-verifier. Identical partials in any order give a byte-identical
// artifact; duplicates collapse with unioned sources; a seeded unsupported claim is
// flagged and not dropped; the verify role differs from the producing role.

import test from 'node:test';
import assert from 'node:assert/strict';
import { merge, verify } from '../src/merge.ts';
import { canonical } from '../src/canonical.ts';
import { StubRouter } from './helpers.ts';
import type { Partial } from '../src/types.ts';

const P1: Partial = { agent_id: 'agent-0', claims: [{ key: 'k1', statement: 's1', sources: ['src-a'] }], gap: false };
const P2: Partial = { agent_id: 'agent-1', claims: [{ key: 'k1', statement: 's1', sources: ['src-b'] }, { key: 'k2', statement: 's2', sources: ['src-c'] }], gap: false };

test('merge is deterministic regardless of partial order', () => {
  assert.equal(canonical(merge([P1, P2])), canonical(merge([P2, P1])));
});

test('duplicate claims collapse to one with unioned, sorted sources', () => {
  const art = merge([P1, P2]);
  assert.deepEqual(art.claims.map((c) => c.key), ['k1', 'k2']); // sorted by key
  const k1 = art.claims.find((c) => c.key === 'k1');
  assert.deepEqual(k1!.sources, ['src-a', 'src-b']); // unioned
});

test('gap markers are surfaced on the artifact, not silently dropped', () => {
  const withGap = merge([P1, { agent_id: 'agent-2', claims: [], gap: true }]);
  assert.deepEqual(withGap.gaps, ['agent-2']);
});

test('verify flags an unsupported claim in place and never removes it', () => {
  const art = merge([P1, P2]);
  const report = verify(art, new StubRouter(new Set(['k2'])), ['agent-0', 'agent-1']);
  assert.deepEqual(report.flagged, ['k2']);
  assert.equal(report.artifact.claims.length, 2); // k2 still present, just flagged
});

test('the verify role is distinct from every producing role', () => {
  const report = verify(merge([P1]), new StubRouter(new Set(), 'verifier'), ['verifier', 'agent-1']);
  assert.notEqual(report.verify_role, 'verifier'); // collides -> falls to the alt role
  assert.equal(report.verify_role, 'verifier-alt');
});
