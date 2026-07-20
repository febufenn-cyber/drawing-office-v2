// Op 20 — P3 key-provisioner.
// Same workspace_id yields the same data key and partition id; two workspaces
// yield distinct keys; the master key appears in no return above L3; zeroize
// drops the key.

import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyProvisioner } from '../src/keyProvisioner.ts';
import { MASTER } from './helpers.ts';

test('same workspace_id yields the same data key and partition id', () => {
  const kp = new KeyProvisioner(MASTER);
  const a1 = kp.provision('wsA');
  const a2 = kp.provision('wsA');
  assert.equal(a1.data_key.equals(a2.data_key), true);
  assert.equal(a1.partition_id, a2.partition_id);
  assert.equal(a1.partition_id, 'persist:ws-wsA');
});

test('distinct workspaces yield distinct keys and partitions', () => {
  const kp = new KeyProvisioner(MASTER);
  const a = kp.provision('wsA');
  const b = kp.provision('wsB');
  assert.equal(a.data_key.equals(b.data_key), false);
  assert.notEqual(a.partition_id, b.partition_id);
});

test('the master key never appears in a provisioning return', () => {
  const kp = new KeyProvisioner(MASTER);
  const a = kp.provision('wsA');
  assert.equal(a.data_key.equals(MASTER), false);
  assert.equal(a.data_key.toString('hex').includes(MASTER.toString('hex')), false);
});

test('zeroize drops the key so the workspace can no longer be opened', () => {
  const kp = new KeyProvisioner(MASTER);
  kp.provision('wsA');
  assert.notEqual(kp.keyFor('wsA'), null);
  kp.zeroize('wsA');
  assert.equal(kp.keyFor('wsA'), null);
  assert.equal(kp.partitionFor('wsA'), null);
});
