// Op 20 — P5 ticket-verifier.
// A valid ticket verifies; expired, MAC-mutated, digest-mismatched, and
// epoch-mismatched tickets each verify false; a consumed ticket_id never verifies
// twice; the session key appears in no return.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PageHandleRegistry } from '../src/registry.ts';
import { TicketVerifier } from '../src/ticket.ts';
import type { Action } from '../src/types.ts';
import { KEY, now, PAST, ticketFor } from './helpers.ts';

function setup() {
  const reg = new PageHandleRegistry();
  const h = reg.mint('W', 'persist:W', 's');
  reg.setEpoch(h, 3);
  const verifier = new TicketVerifier(KEY, reg, now);
  const action: Action = { kind: 'click', node_id: 'abc', value: 'x' };
  return { reg, h, verifier, action };
}

test('a valid ticket verifies', () => {
  const { verifier, h, action } = setup();
  const t = ticketFor(action, 3);
  assert.equal(verifier.verify(t, h, action), 'ok');
});

test('an expired ticket verifies false', () => {
  const { verifier, h, action } = setup();
  const t = ticketFor(action, 3, { expiry: PAST });
  assert.equal(verifier.verify(t, h, action), 'reject');
});

test('a MAC-mutated ticket verifies false', () => {
  const { verifier, h, action } = setup();
  const t = ticketFor(action, 3);
  const flipped = t.mac[0] === '0' ? '1' : '0';
  const bad = { ...t, mac: flipped + t.mac.slice(1) };
  assert.equal(verifier.verify(bad, h, action), 'reject');
});

test('a digest-mismatched ticket verifies false', () => {
  const { verifier, h, action } = setup();
  const t = ticketFor(action, 3);
  const otherAction: Action = { kind: 'click', node_id: 'abc', value: 'DIFFERENT' };
  assert.equal(verifier.verify(t, h, otherAction), 'reject');
});

test('an epoch-mismatched ticket verifies false', () => {
  const { verifier, h, action } = setup();
  const t = ticketFor(action, 999);
  assert.equal(verifier.verify(t, h, action), 'reject');
});

test('a consumed ticket_id never verifies twice', () => {
  const { verifier, h, action } = setup();
  const t = ticketFor(action, 3);
  assert.equal(verifier.verify(t, h, action), 'ok');
  assert.equal(verifier.verify(t, h, action), 'reject');
});

test('the session key appears in no ticket return', () => {
  const { action } = setup();
  const t = ticketFor(action, 3);
  const keyHex = KEY.toString('hex');
  assert.equal(JSON.stringify(t).includes(keyHex), false);
});
