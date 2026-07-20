// Op 20 — P2 role-classifier.
// Each role maps to its class per the table; verify defers; an unknown role is
// rejected as invalid_request; classification is deterministic and stateless.

import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/roleClassifier.ts';
import { isRejection } from '../src/types.ts';
import type { Role } from '../src/types.ts';

test('plan maps to frontier; extract and classify map to fast', () => {
  assert.deepEqual(classify('plan'), { deferred: false, model_class: 'frontier' });
  assert.deepEqual(classify('extract'), { deferred: false, model_class: 'fast' });
  assert.deepEqual(classify('classify'), { deferred: false, model_class: 'fast' });
});

test('verify is admitted with its class deferred', () => {
  assert.deepEqual(classify('verify'), { deferred: true });
});

test('an unknown role is rejected, never defaulted', () => {
  assert.equal(isRejection(classify('exfiltrate' as unknown as Role)), true);
});

test('classification is deterministic', () => {
  assert.deepEqual(classify('plan'), classify('plan'));
});
