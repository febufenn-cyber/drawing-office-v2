// Op 40 — P2 action-resolver.
// Byte-identical ResolvedAction across repeated runs; declared-versus-actual
// mismatches listed; an ambiguous payment amount resolves to none; under-declared
// proposals never lower the effective tier or consequence; a stale snapshot fails.

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '../src/index.ts';
import { makeProposal, makeSnapshot } from './helpers.ts';

test('resolution is deterministic', () => {
  const p = makeProposal();
  const s = makeSnapshot();
  const a = resolve(p, s);
  const b = resolve(p, s);
  assert.equal(a.ok && b.ok, true);
  if (a.ok && b.ok) assert.deepEqual(a.resolved, b.resolved);
});

test('the monetary submit resolves tier transact and consequence monetary', () => {
  const r = resolve(makeProposal(), makeSnapshot());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.resolved.tier_effective, 'transact');
    assert.equal(r.resolved.consequence_effective, 'monetary');
    assert.equal(r.resolved.amount_minor, 5000);
  }
});

test('declared-versus-actual mismatch is listed', () => {
  // Declare a click as read-tier reversible; the resolver detects interact.
  const p = makeProposal({ kind: 'click', target_node: 'btnClick', declared: { intent_text: 'x', origin: 'https://shop', tier: 'read', consequence: 'reversible', amount_minor: null, currency: null } });
  const r = resolve(p, makeSnapshot());
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.resolved.mismatches.includes('tier'), true);
});

test('under-declaration never lowers the effective posture', () => {
  // Declare the buy as reversible; the resolver detects monetary and keeps it.
  const p = makeProposal({ declared: { intent_text: 'x', origin: 'https://shop', tier: 'read', consequence: 'reversible', amount_minor: 5000, currency: 'USD' } });
  const r = resolve(p, makeSnapshot());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.resolved.consequence_effective, 'monetary');
    assert.equal(r.resolved.tier_effective, 'transact');
    assert.equal(r.resolved.mismatches.includes('consequence'), true);
  }
});

test('an unresolvable amount resolves to none, never estimated', () => {
  const snap = makeSnapshot({ forms: [{ form_id: 'f1', action: '/checkout', method: 'POST', form_digest: 'fd1', amount_minor: null, currency: null, fields: [{ field_class: 'payment', secret_scope: null }] }] });
  const r = resolve(makeProposal(), snap);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.resolved.amount_minor, null);
});

test('a stale snapshot is a resolution failure', () => {
  const stale = makeSnapshot({ handle_epoch: 1 }); // nav_epoch 0 != handle_epoch 1
  const r = resolve(makeProposal(), stale);
  assert.equal(r.ok, false);
});
