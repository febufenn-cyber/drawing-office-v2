// Op 70 — P7 route-dispatcher.
// An admitted request yields exactly one provider call and one cost record;
// invalid, key-missing, and unsatisfiable requests yield zero calls; a budget deny
// yields budget_denied and zero calls; records equal completed calls one to one.

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Role } from '../src/types.ts';
import { makeRouter } from './helpers.ts';

function req(over: Record<string, unknown> = {}) {
  return { workspace_id: 'w1', role: 'plan' as Role, prompt_bundle: 'p', prompt_tokens: 100, max_output: 100, ...over };
}

test('an admitted request makes exactly one provider call and one cost record', () => {
  const w = makeRouter();
  const r = w.dispatcher.route(req());
  assert.equal(r.status, 'routed');
  assert.equal(w.openai.callCount + w.anthropic.callCount, 1);
  assert.equal(w.budget.records.length, 1);
  assert.equal(r.cost?.cost_minor, w.budget.records[0]?.cost_minor);
});

test('an invalid request makes zero provider calls', () => {
  const w = makeRouter();
  const r = w.dispatcher.route(req({ role: 'nonsense' }));
  assert.equal(r.status, 'invalid_request');
  assert.equal(w.openai.callCount + w.anthropic.callCount, 0);
  assert.equal(w.budget.records.length, 0);
});

test('a key-missing workspace makes zero provider calls', () => {
  const w = makeRouter();
  const r = w.dispatcher.route(req({ workspace_id: 'unprovisioned' }));
  assert.equal(r.status, 'key_missing');
  assert.equal(w.openai.callCount + w.anthropic.callCount, 0);
});

test('a budget deny yields budget_denied and zero provider calls', () => {
  const w = makeRouter();
  w.budget.verdict = 'deny';
  const r = w.dispatcher.route(req());
  assert.equal(r.status, 'budget_denied');
  assert.equal(w.openai.callCount + w.anthropic.callCount, 0);
  assert.equal(w.budget.records.length, 0);
});

test('records equal completed calls one to one', () => {
  const w = makeRouter();
  const roles: Role[] = ['plan', 'extract', 'classify'];
  for (const role of roles) w.dispatcher.route(req({ role }));
  assert.equal(w.openai.callCount + w.anthropic.callCount, 3);
  assert.equal(w.budget.records.length, 3);
});
