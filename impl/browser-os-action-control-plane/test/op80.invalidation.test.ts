// Op 80 — grant-invalidation and ordering battery.
// A state change between approval and dispatch refuses the grant; single-use and
// expired tickets are rejected at the surface; every act is preceded by its
// durable action.dispatched record.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mintTicket } from '../src/index.ts';
import { makeGate, makeProposal, makeSnapshot, SESSION_KEY, StubSurface } from './helpers.ts';

// Each mutation happens during the operator's deliberation (beforeRespond), so the
// dispatch-time re-resolve sees a changed page and the grant no longer binds.
function invalidatedBy(mutate: (w: ReturnType<typeof makeGate>) => void): string {
  const w = makeGate();
  w.approval.beforeRespond = () => mutate(w);
  const r = w.gate.submit(makeProposal({ token_id: w.transactToken }));
  assert.equal(w.surface.actCount, 0, 'no dispatch on invalidation');
  return r.status;
}

test('navigation between approval and dispatch invalidates the grant', () => {
  assert.equal(invalidatedBy((w) => w.perception.set(makeSnapshot({ nav_epoch: 1, handle_epoch: 1 }))), 'invalidated');
});

test('a target-subtree mutation invalidates the grant', () => {
  assert.equal(invalidatedBy((w) => {
    const s = makeSnapshot();
    const nodes = s.nodes.map((n) => (n.node_id === 'btnBuy' ? { ...n, digest: 'dig-buy-MUTATED' } : n));
    w.perception.set({ ...s, nodes });
  }), 'invalidated');
});

test('an amount change invalidates the grant', () => {
  assert.equal(invalidatedBy((w) => {
    w.perception.set(makeSnapshot({ forms: [{ form_id: 'f1', action: '/checkout', method: 'POST', form_digest: 'fd1', amount_minor: 999999, currency: 'USD', fields: [{ field_class: 'payment', secret_scope: null }] }] }));
  }), 'invalidated');
});

test('a policy reload invalidates the grant', () => {
  const w = makeGate();
  w.approval.beforeRespond = () => { w.policy.load({ workspace_id: 'w1', origin_grants: [{ origin: 'https://shop', tier: 'transact' }], caps: { currency: 'USD', per_action_minor: 100000, per_workspace_month_minor: 500000 } }); };
  const r = w.gate.submit(makeProposal({ token_id: w.transactToken }));
  assert.equal(r.status, 'invalidated');
  assert.equal(w.surface.actCount, 0);
});

test('a single-use ticket is rejected on reuse at the surface', () => {
  const surface = new StubSurface(SESSION_KEY, () => new Date('2026-07-20T00:00:00Z'));
  const ticket = mintTicket(SESSION_KEY, { ticket_id: 'once', action_digest: 'ad', nav_epoch: 0, expiry: '2026-07-20T00:00:02Z', single_use: true });
  assert.equal(surface.act('h1', { kind: 'click', node_id: 'n' }, ticket).ok, true);
  assert.equal(surface.act('h1', { kind: 'click', node_id: 'n' }, ticket).ok, false);
  assert.equal(surface.actCount, 1);
});

test('an expired or forged ticket is rejected at the surface', () => {
  const surface = new StubSurface(SESSION_KEY, () => new Date('2026-07-20T00:00:00Z'));
  const expired = mintTicket(SESSION_KEY, { ticket_id: 'e', action_digest: 'ad', nav_epoch: 0, expiry: '2020-01-01T00:00:00Z', single_use: true });
  assert.equal(surface.act('h1', { kind: 'click', node_id: 'n' }, expired).ok, false);
  const good = mintTicket(SESSION_KEY, { ticket_id: 'g', action_digest: 'ad', nav_epoch: 0, expiry: '2026-07-20T00:00:02Z', single_use: true });
  const forged = { ...good, mac: '00'.repeat(32) };
  assert.equal(surface.act('h1', { kind: 'click', node_id: 'n' }, forged).ok, false);
  assert.equal(surface.actCount, 0);
});

test('every act is preceded by a durable action.dispatched record', () => {
  const w = makeGate();
  w.gate.submit(makeProposal({ token_id: w.transactToken }));
  const events = w.audit.readAll().map((e) => e.event);
  const di = events.indexOf('action.dispatched');
  const ri = events.indexOf('action.result');
  assert.equal(di >= 0 && ri > di, true);
  assert.equal(w.audit.durableThrough() > di, true); // dispatched was flushed durably
});
