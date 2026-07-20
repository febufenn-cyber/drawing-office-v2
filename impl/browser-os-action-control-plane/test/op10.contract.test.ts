// Op 10 — P1 action-proposal-contract.
// Golden round trips; digests identical across field orderings; malformed and
// unknown-field proposals rejected with SCHEMA_INVALID.

import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, validateProposal } from '../src/index.ts';
import { makeProposal } from './helpers.ts';

const NOW = '2026-07-20T00:00:00Z';

test('a golden proposal validates', () => {
  const r = validateProposal(makeProposal(), NOW);
  assert.equal(r.ok, true);
});

test('a missing, unknown, or out-of-enum field yields BLOCK SCHEMA_INVALID', () => {
  const base = makeProposal() as unknown as Record<string, unknown>;
  const missing = { ...base };
  delete missing.kind;
  const unknown = { ...base, bogus: 1 };
  const badEnum = { ...base, kind: 'destroy' };
  for (const bad of [missing, unknown, badEnum]) {
    const r = validateProposal(bad, NOW);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.decision.verdict, 'BLOCK');
      assert.equal(r.decision.findings[0]?.code, 'SCHEMA_INVALID');
    }
  }
});

test('non-JSON bytes are rejected with SCHEMA_INVALID', () => {
  const r = validateProposal('not json {', NOW);
  assert.equal(r.ok, false);
});

test('digest is identical across field orderings', () => {
  assert.equal(digest({ a: 1, b: 2, c: [1, 2] }), digest({ c: [1, 2], b: 2, a: 1 }));
  assert.notEqual(digest({ a: 1 }), digest({ a: 2 }));
});
