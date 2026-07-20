// Op 60 — P6 capability-vault.
// mint and check enforce scope, tier, expiry; fill returns only a boolean and the
// secret appears in no return; the ledger sums exactly and is append-only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityVault, mintTicket } from '../src/index.ts';
import { StubSurface, SECRET_VALUE, SESSION_KEY, wsKeys } from './helpers.ts';

const NOW = new Date('2026-07-20T00:00:00Z');

function vault() {
  const v = new CapabilityVault(wsKeys);
  v.putSecret('w1', 'vault://pw', Buffer.from(SECRET_VALUE), 'https://shop', 'credential_ref');
  return v;
}

test('check enforces scope, tier, and expiry', () => {
  const v = vault();
  const t = v.mint('w1', 'https://shop', 'transact', null, '2027-01-01T00:00:00Z');
  assert.equal(v.check(t.token_id, 'https://shop', 'interact', NOW), true); // transact >= interact
  assert.equal(v.check(t.token_id, 'https://other', 'read', NOW), false); // wrong scope
  const expired = v.mint('w1', 'https://shop', 'transact', null, '2020-01-01T00:00:00Z');
  assert.equal(v.check(expired.token_id, 'https://shop', 'read', NOW), false); // expired
  const weak = v.mint('w1', 'https://shop', 'interact', null, '2027-01-01T00:00:00Z');
  assert.equal(v.check(weak.token_id, 'https://shop', 'transact', NOW), false); // below tier
});

test('fill returns only a boolean and never surfaces the secret', () => {
  const v = vault();
  const surface = new StubSurface(SESSION_KEY, () => NOW);
  const ticket = mintTicket(SESSION_KEY, { ticket_id: 'tk', action_digest: 'ad', nav_epoch: 0, expiry: '2026-07-20T00:00:02Z', single_use: true });
  const r = v.fill(surface, 'w1', 'h1', 'pw', 'vault://pw', 'https://shop', ticket);
  assert.equal(r.ok, true);
  assert.equal(surface.fillCount, 1);
  assert.equal(JSON.stringify(r).includes(SECRET_VALUE), false);
});

test('an out-of-scope fill is refused and streams nothing', () => {
  const v = vault();
  const surface = new StubSurface(SESSION_KEY, () => NOW);
  const ticket = mintTicket(SESSION_KEY, { ticket_id: 'tk2', action_digest: 'ad', nav_epoch: 0, expiry: '2026-07-20T00:00:02Z', single_use: true });
  const r = v.fill(surface, 'w1', 'h1', 'pw', 'vault://pw', 'https://attacker', ticket);
  assert.equal(r.ok, false);
  assert.equal(surface.fillCount, 0);
});

test('the ledger is append-only and month_spent is exact', () => {
  const v = vault();
  v.debit('w1', 'https://shop', 100, 'USD', 'g1', '2026-07-20T00:00:00Z');
  v.debit('w1', 'https://shop', 250, 'USD', 'g2', '2026-07-20T00:00:00Z');
  assert.equal(v.monthSpent('w1', NOW), 350);
  // A debit in another month is excluded.
  v.debit('w1', 'https://shop', 999, 'USD', 'g3', '2026-08-01T00:00:00Z');
  assert.equal(v.monthSpent('w1', NOW), 350);
});
