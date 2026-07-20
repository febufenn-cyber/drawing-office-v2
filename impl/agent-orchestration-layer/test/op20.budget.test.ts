// Op 20 — P3 budget-manager. Reserve within ceiling grants and over ceiling denies
// with the breached axis; concurrent reserves never exceed a ceiling; committed plus
// released equals reserved; the money path emits no authorization; the ledger's
// month-to-date spend is read live at reservation time.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BudgetManager } from '../src/budget.ts';
import { StubLedger, WS } from './helpers.ts';
import type { Ceiling } from '../src/types.ts';

const CEIL: Ceiling = { tokens: 1000, seconds: 100, money_minor: 500, currency: 'USD' };

test('a reservation within every ceiling axis is granted', () => {
  const b = new BudgetManager(new StubLedger(0, 10000));
  const r = b.reserve('t1', WS, CEIL, { tokens: 500, seconds: 50, money_max: 200 });
  assert.equal(r.granted, true);
});

test('a request over the token, time, or money ceiling denies with the breached axis', () => {
  const b = new BudgetManager(new StubLedger(0, 10000));
  assert.deepEqual(b.reserve('t1', WS, CEIL, { tokens: 1001, seconds: 1, money_max: 0 }), { granted: false, reason: 'TOKEN_CEILING' });
  assert.deepEqual(b.reserve('t2', WS, CEIL, { tokens: 1, seconds: 101, money_max: 0 }), { granted: false, reason: 'TIME_CEILING' });
  assert.deepEqual(b.reserve('t3', WS, CEIL, { tokens: 1, seconds: 1, money_max: 501 }), { granted: false, reason: 'MONEY_CEILING' });
});

test('cumulative live reservations never exceed a ceiling axis', () => {
  const b = new BudgetManager(new StubLedger(0, 10000));
  assert.equal(b.reserve('t1', WS, CEIL, { tokens: 600, seconds: 10, money_max: 0 }).granted, true);
  assert.equal(b.reserve('t1', WS, CEIL, { tokens: 600, seconds: 10, money_max: 0 }).granted, false); // 600+600 > 1000
  assert.equal(b.reserve('t1', WS, CEIL, { tokens: 400, seconds: 10, money_max: 0 }).granted, true); // 600+400 = 1000 ok
});

test('committed plus released equals reserved for every axis', () => {
  const b = new BudgetManager(new StubLedger(0, 10000));
  const r = b.reserve('t1', WS, CEIL, { tokens: 100, seconds: 20, money_max: 300 });
  assert.ok(r.granted);
  if (!r.granted) return;
  b.commit(r.reservation, { tokens: 60, seconds: 12, money_minor: 100 });
  const s = b.settlement(r.reservation.reservation_id);
  assert.ok(s);
  assert.equal(s!.committed.tokens + s!.released.tokens, 100);
  assert.equal(s!.committed.seconds + s!.released.seconds, 20);
  assert.equal(s!.committed.money_minor + s!.released.money_minor, 300);
});

test('release returns the full reservation and frees the live headroom', () => {
  const b = new BudgetManager(new StubLedger(0, 10000));
  const r = b.reserve('t1', WS, CEIL, { tokens: 900, seconds: 10, money_max: 0 });
  assert.ok(r.granted);
  if (!r.granted) return;
  b.release(r.reservation);
  // headroom freed: another 900-token reservation now fits.
  assert.equal(b.reserve('t1', WS, CEIL, { tokens: 900, seconds: 10, money_max: 0 }).granted, true);
});

test('month-to-date spend is read live: a ledger mutation between reserves changes the verdict', () => {
  const ledger = new StubLedger(0, 1000);
  const b = new BudgetManager(ledger);
  const ceil: Ceiling = { tokens: 1000, seconds: 100, money_minor: 1000, currency: 'USD' };
  assert.equal(b.reserve('t1', WS, ceil, { tokens: 1, seconds: 1, money_max: 300 }).granted, true);
  ledger.spent = 800; // the ledger now shows the workspace near its cap
  const denied = b.reserve('t2', WS, ceil, { tokens: 1, seconds: 1, money_max: 300 }); // 800 + 300 > 1000
  assert.deepEqual(denied, { granted: false, reason: 'MONEY_CEILING' });
});

test('a granted reservation carries no authorization token — it only bounds', () => {
  const b = new BudgetManager(new StubLedger(0, 10000));
  const r = b.reserve('t1', WS, CEIL, { tokens: 1, seconds: 1, money_max: 400 });
  assert.ok(r.granted);
  if (!r.granted) return;
  // The reservation is a bound (money_max), not a capability: no auth/grant field.
  assert.equal('authorization' in r.reservation, false);
  assert.equal('capability' in r.reservation, false);
  assert.equal(r.reservation.money_max_minor, 400);
});
