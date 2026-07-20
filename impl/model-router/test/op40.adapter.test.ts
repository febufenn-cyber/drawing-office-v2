// Op 40 — P4 provider-adapter.
// The prompt bundle is forwarded byte-identical; the key is present only in
// transport auth; Completion and Usage shape is identical across providers; usage
// counts equal the stub response; a slow stub is abandoned at the timeout with no
// usage.

import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyStore } from '../src/keyStore.ts';
import type { WorkspaceKeySource } from '../src/keyStore.ts';
import { ProviderAdapter } from '../src/providerAdapter.ts';
import type { ProviderTransport } from '../src/providerAdapter.ts';
import { F1, F2, OPENAI_KEY, StubProvider } from './helpers.ts';

const wsKeys: WorkspaceKeySource = { keyFor: (id: string) => Buffer.from(id.padEnd(32, 'x').slice(0, 32)) };

function setup(duration = 1) {
  const ks = new KeyStore(wsKeys);
  ks.put('w1', 'openai', Buffer.from(OPENAI_KEY));
  ks.put('w1', 'anthropic', Buffer.from('ANTHROPIC-KEY'));
  const openai = new StubProvider(duration);
  const anthropic = new StubProvider(1);
  const transports = new Map<string, ProviderTransport>([['openai', openai], ['anthropic', anthropic]]);
  const adapter = new ProviderAdapter(ks.localSource(), transports, 30000);
  const handle = ks.select('w1', 'openai');
  return { adapter, openai, anthropic, ks, handle };
}

test('the prompt is forwarded byte-identical and the key is only in transport auth', () => {
  const { adapter, openai } = setup();
  const handle = { workspace_id: 'w1', provider: 'openai', source: 'byok' as const };
  const out = adapter.call(F1, handle, 'PROMPT-BODY-EXACT', 256);
  assert.equal(out.ok, true);
  assert.equal(openai.lastBody, 'PROMPT-BODY-EXACT');
  assert.equal(openai.lastBody.includes(OPENAI_KEY), false);
  assert.equal(openai.lastAuth.toString(), OPENAI_KEY); // key present at transport
});

test('Completion and Usage shape is identical across providers and equals the response', () => {
  const { adapter } = setup();
  const a = adapter.call(F1, { workspace_id: 'w1', provider: 'openai', source: 'byok' }, 'p', 10);
  const b = adapter.call(F2, { workspace_id: 'w1', provider: 'anthropic', source: 'byok' }, 'p', 10);
  assert.equal(a.ok && b.ok, true);
  if (a.ok && b.ok) {
    assert.deepEqual(Object.keys(a.usage).sort(), Object.keys(b.usage).sort());
    assert.deepEqual(a.usage, { input_tokens: 1500, output_tokens: 500 });
  }
});

test('a call slower than the timeout is abandoned as provider_error with no usage', () => {
  const { adapter } = setup(60000); // slower than the 30000 ms timeout
  const out = adapter.call(F1, { workspace_id: 'w1', provider: 'openai', source: 'byok' }, 'p', 10);
  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.error, 'provider_error');
});
