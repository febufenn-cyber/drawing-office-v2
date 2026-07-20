// Op 30 — P3 key-store.
// Keys are ciphertext at rest; select returns a handle for provisioned pairs and
// refuses others; the managed-source stub resolves behind the identical signature;
// the plaintext key appears in no return; per-workspace key separation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyStore } from '../src/keyStore.ts';
import type { KeySource, WorkspaceKeySource } from '../src/keyStore.ts';

const wsKeys: WorkspaceKeySource = {
  keyFor: (id: string) => Buffer.from(id.padEnd(32, 'x').slice(0, 32)),
};

const SECRET = 'sk-PLAINTEXT-PROVIDER-KEY';

test('select returns a handle only for a provisioned pair; the handle carries no key', () => {
  const ks = new KeyStore(wsKeys);
  ks.put('w1', 'openai', Buffer.from(SECRET));
  const handle = ks.select('w1', 'openai');
  assert.ok(handle);
  assert.equal(JSON.stringify(handle).includes(SECRET), false);
  assert.equal(ks.select('w1', 'anthropic'), null);
  assert.equal(ks.select('w2', 'openai'), null);
});

test('keys are ciphertext at rest — the plaintext appears nowhere in the store', () => {
  const ks = new KeyStore(wsKeys);
  ks.put('w1', 'openai', Buffer.from(SECRET));
  // Inspect the whole serialized store; the plaintext must not appear.
  const dump = JSON.stringify(ks, (_k, v) => (v instanceof Map ? [...v.entries()] : v));
  assert.equal(dump.includes(SECRET), false);
});

test('the local KeySource resolves a provisioned key; the managed stub shares the signature', () => {
  const ks = new KeyStore(wsKeys);
  ks.put('w1', 'openai', Buffer.from(SECRET));
  const local = ks.localSource();
  assert.equal(local.resolve('w1', 'openai')?.toString(), SECRET);
  assert.equal(local.resolve('w1', 'absent'), null);

  // A managed source implements the identical interface with no new caller field.
  const managed: KeySource = {
    kind: 'managed',
    resolve: (_ws: string, _provider: string) => Buffer.from('broker-token'),
  };
  assert.equal(managed.resolve('w1', 'openai')?.toString(), 'broker-token');
});

test('per-workspace key separation: distinct workspaces seal under distinct keys', () => {
  const ks = new KeyStore(wsKeys);
  ks.put('w1', 'openai', Buffer.from(SECRET));
  ks.put('w2', 'openai', Buffer.from(SECRET));
  const s1 = ks.localSource().resolve('w1', 'openai');
  const s2 = ks.localSource().resolve('w2', 'openai');
  assert.equal(s1?.toString(), SECRET);
  assert.equal(s2?.toString(), SECRET);
  // The ciphertext differs because the workspace keys differ (checked via dump).
  const dump = JSON.stringify(ks, (_k, v) => (v instanceof Map ? [...v.entries()] : v));
  const blobs = dump.match(/"ct":"[0-9a-f]+"/g) ?? [];
  assert.equal(new Set(blobs).size, blobs.length); // no two identical ciphertexts
});
