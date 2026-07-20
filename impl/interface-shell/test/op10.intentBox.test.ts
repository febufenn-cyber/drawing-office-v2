// Op 10 — P1 intent-box. Absolute-URL strings route to navigate tasks and all other
// non-empty strings to task-intents; empty-after-trim is rejected with no submission;
// each accepted intent submits exactly one task.

import test from 'node:test';
import assert from 'node:assert/strict';
import { IntentBox } from '../src/intentBox.ts';
import { StubExecutor, StubHost, WS } from './helpers.ts';

function box(): { box: IntentBox; ex: StubExecutor } {
  const ex = new StubExecutor();
  return { box: new IntentBox(ex, new StubHost(WS)), ex };
}

test('an absolute URL routes to a navigate task against its origin', () => {
  const { box: b, ex } = box();
  const r = b.submit_intent('https://shop.example/cart?x=1');
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.task.kind, 'navigate');
  assert.equal(r.task.origin, 'https://shop.example');
  assert.equal(ex.submits.length, 1);
  assert.equal(ex.submits[0]!.workspace_id, WS); // workspace taken from the host
});

test('a natural-language string routes to a task-intent', () => {
  const { box: b } = box();
  const r = b.submit_intent('find the cheapest flight to Lisbon');
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.task.kind, 'intent');
});

test('a string that parses without a host is natural language, not a URL', () => {
  const { box: b } = box();
  const r = b.submit_intent('buy:milk'); // parses as a URL but has no host
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.task.kind, 'intent');
});

test('an empty-after-trim string is rejected and submits nothing', () => {
  const { box: b, ex } = box();
  const r = b.submit_intent('   ');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'EMPTY_INTENT');
  assert.equal(ex.submits.length, 0);
});

test('each accepted intent submits exactly one task', () => {
  const { box: b, ex } = box();
  b.submit_intent('https://a.example');
  b.submit_intent('research widgets');
  assert.equal(ex.submits.length, 2); // one per accepted intent, never doubled
});
