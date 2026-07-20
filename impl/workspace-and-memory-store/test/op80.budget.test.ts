// Op 80 — P8 budget-ledger.
// caps and scope equal the stored record; debit is append-only and monotonic; the
// month sum is exact to the minor unit and independent of read order.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BudgetLedger } from '../src/budgetLedger.ts';
import { Disk } from '../src/disk.ts';
import { KeyProvisioner } from '../src/keyProvisioner.ts';
import { Partition } from '../src/partition.ts';
import { isRejection } from '../src/types.ts';
import { WorkspaceStore } from '../src/workspaceStore.ts';
import { budget, MASTER, now, scope } from './helpers.ts';

test('caps and credential scope equal the stored workspace record', () => {
  const disk = new Disk();
  const s = new WorkspaceStore(disk, new KeyProvisioner(MASTER), now);
  const w = s.create('g', scope(['https://x']), budget());
  if (isRejection(w)) throw new Error('create failed');
  const led = s.budget(w.workspace_id);
  if (isRejection(led)) throw new Error('budget failed');
  assert.deepEqual(led.caps(), budget());
  assert.deepEqual(led.credentialScope(), scope(['https://x']));
});

test('debit is append-only and monotonic in seq', () => {
  const disk = new Disk();
  const s = new WorkspaceStore(disk, new KeyProvisioner(MASTER), now);
  const w = s.create('g', scope(), budget());
  if (isRejection(w)) throw new Error('create failed');
  const led = s.budget(w.workspace_id);
  if (isRejection(led)) throw new Error('budget failed');
  const e0 = led.debit(100, 'USD', 'r0');
  const e1 = led.debit(250, 'USD', 'r1');
  assert.equal(e0.seq, 0);
  assert.equal(e1.seq, 1);
});

test('month sum is exact and filters by UTC calendar month', () => {
  // Drive the ledger directly with a mutable clock to cross a month boundary.
  const kp = new KeyProvisioner(MASTER);
  const wk = kp.provision('wsClock');
  const disk = new Disk();
  const partition = new Partition(wk.data_key, disk.backendFor(wk.partition_id));
  let clock = new Date('2026-07-15T00:00:00Z');
  const led = new BudgetLedger(partition, () => clock);
  led.debit(100, 'USD', 'july-a');
  led.debit(200, 'USD', 'july-b');
  clock = new Date('2026-08-02T00:00:00Z');
  led.debit(50, 'USD', 'aug-a');
  // now = August: only August entries count.
  assert.equal(led.monthSpent(), 50);
  clock = new Date('2026-07-31T23:00:00Z');
  assert.equal(led.monthSpent(), 300);
});
