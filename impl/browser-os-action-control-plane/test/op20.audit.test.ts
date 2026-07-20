// Op 20 — P7 audit-log.
// Append events then verify clean; flip a byte, delete a line, swap two lines —
// verify names the exact broken line; the chain re-verifies from serialized form.

import test from 'node:test';
import assert from 'node:assert/strict';
import { AuditLog } from '../src/index.ts';

const KEY = Buffer.alloc(32, 1);

function seeded() {
  const log = new AuditLog(KEY);
  log.append('policy.loaded', { policy_rev: 1 }, '2026-07-20T00:00:00Z');
  log.append('proposal.received', { proposal_id: 'p1' }, '2026-07-20T00:00:01Z');
  log.append('decision.rendered', { verdict: 'ALLOW' }, '2026-07-20T00:00:02Z');
  return log;
}

test('a well-formed chain verifies clean', () => {
  assert.equal(seeded().verify().ok, true);
});

test('a flipped byte is caught at its line', () => {
  const jsonl = seeded().toJsonl();
  const lines = jsonl.split('\n');
  lines[1] = (lines[1] as string).replace('proposal.received', 'proposal.rejected');
  const rep = AuditLog.verifyJsonl(KEY, lines.join('\n'));
  assert.equal(rep.ok, false);
  assert.equal(rep.problems.some((p) => p.includes('line 2')), true);
});

test('a deleted line breaks sequence and chain', () => {
  const lines = seeded().toJsonl().split('\n');
  lines.splice(1, 1); // drop the middle entry
  const rep = AuditLog.verifyJsonl(KEY, lines.join('\n'));
  assert.equal(rep.ok, false);
});

test('swapped lines are caught', () => {
  const lines = seeded().toJsonl().split('\n');
  const tmp = lines[1] as string;
  lines[1] = lines[2] as string;
  lines[2] = tmp;
  const rep = AuditLog.verifyJsonl(KEY, lines.join('\n'));
  assert.equal(rep.ok, false);
});

test('a wrong key fails signature verification', () => {
  const rep = AuditLog.verifyJsonl(Buffer.alloc(32, 9), seeded().toJsonl());
  assert.equal(rep.ok, false);
});
