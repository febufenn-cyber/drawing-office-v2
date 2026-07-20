// Op 70 — lifecycle and demotion battery. A demotion signal demotes and records
// one re-learning request; a demoted skill is returned by neither lookup; a
// re-learning trajectory re-enters compilation; a demote with no promoted skill is
// a no-op; no sandbox action reaches a production partition.

import test from 'node:test';
import assert from 'node:assert/strict';
import { putSnapshot, searchNodes, searchTrajectory, SANDBOX, wire } from './helpers.ts';

const SIG = 'shop.search';

test('a demotion signal demotes the skill and records exactly one re-learning request', () => {
  const w = wire({ threshold: 3 });
  assert.ok(w.controller.compile_and_verify(searchTrajectory()).ok);
  putSnapshot(w.ws, 'snap:cur', searchNodes());
  assert.ok(w.library.lookup_exact(SIG, 'snap:cur')); // served while promoted

  w.controller.on_outcome(SIG, false);
  w.controller.on_outcome(SIG, false);
  const demoted = w.controller.on_outcome(SIG, false); // third failure crosses -> demote
  assert.ok(demoted && demoted.ok);
  assert.equal(w.controller.relearn_count(SIG), 1);

  // A demoted skill is served by neither lookup.
  assert.equal(w.library.lookup_exact(SIG, 'snap:cur'), null);
  assert.equal(w.library.lookup_nearest(SIG, 'snap:cur'), null);
});

test('a re-learning trajectory re-enters compilation and re-promotes', () => {
  const w = wire({ threshold: 3 });
  w.controller.compile_and_verify(searchTrajectory());
  for (let i = 0; i < 3; i++) w.controller.on_outcome(SIG, false); // demote
  putSnapshot(w.ws, 'snap:cur', searchNodes());
  assert.equal(w.library.latest_promoted(SIG), null);

  // A fresh successful trajectory for the signature re-enters compilation.
  const relearned = w.controller.compile_and_verify(searchTrajectory());
  assert.equal(relearned.ok, true);
  assert.ok(w.library.lookup_exact(SIG, 'snap:cur')); // served again
});

test('the monitor latch resets on demotion so a re-promoted skill can demote again', () => {
  const w = wire({ threshold: 3 });
  w.controller.compile_and_verify(searchTrajectory());
  for (let i = 0; i < 3; i++) w.controller.on_outcome(SIG, false); // demote #1
  w.controller.compile_and_verify(searchTrajectory()); // re-promote
  for (let i = 0; i < 3; i++) w.controller.on_outcome(SIG, false); // demote #2
  assert.equal(w.controller.relearn_count(SIG), 2); // two demotions, two requests
});

test('a demote with no promoted skill is a no-op and records nothing', () => {
  const w = wire();
  const res = w.controller.demote('never.compiled');
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'noop');
  assert.equal(w.controller.relearn_count('never.compiled'), 0);
});

test('no sandbox action reaches a production partition across the lifecycle', () => {
  const w = wire();
  w.controller.compile_and_verify(searchTrajectory());
  assert.ok(w.surface.acts.length > 0);
  assert.ok(w.surface.acts.every((a) => a.partition === SANDBOX));
});
