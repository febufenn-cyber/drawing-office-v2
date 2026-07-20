// Op 70 — P5 affordance-inventory.
// Field class assigned by the fixed precedence; credential and payment fields
// never free_form; method and action target recorded for form-enclosed controls;
// affordance present where expected.

import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/builder.ts';
import { isRejection } from '../src/types.ts';
import { nodeByName, sampleSnapshot } from './helpers.ts';

test('field classes follow the precedence; credential and payment are never free_form', () => {
  const g = build(sampleSnapshot());
  if (isRejection(g)) throw new Error('build failed');
  const email = nodeByName(g, 'Email')?.affordance;
  const pw = nodeByName(g, 'Password')?.affordance;
  const card = nodeByName(g, 'Card number')?.affordance;
  assert.equal(email?.field_class, 'identifier');
  assert.equal(pw?.kind, 'fill_secret');
  assert.equal(pw?.field_class, 'credential_ref');
  assert.equal(card?.field_class, 'payment');
  for (const a of [email, pw, card]) assert.notEqual(a?.field_class, 'free_form');
});

test('a submit button records method and action target from its enclosing form', () => {
  const g = build(sampleSnapshot());
  if (isRejection(g)) throw new Error('build failed');
  const pay = nodeByName(g, 'Pay')?.affordance;
  assert.equal(pay?.kind, 'submit');
  assert.equal(pay?.method, 'post');
  assert.equal(pay?.action_target, '/pay');
});

test('a link is a navigate affordance carrying its href', () => {
  const g = build(sampleSnapshot());
  if (isRejection(g)) throw new Error('build failed');
  const home = nodeByName(g, 'Home')?.affordance;
  assert.equal(home?.kind, 'navigate');
  assert.equal(home?.action_target, '/');
});

test('a vault-masked field carries credential_ref and its secret scope', () => {
  const g = build(
    sampleSnapshot({
      ax_tree: {
        ax_id: 'root', ax_role: 'document', name: 'D', bbox: { x: 0, y: 0, w: 10, h: 10 },
        children: [
          { ax_id: 'b', ax_role: 'button', name: 'ok', bbox: { x: 0, y: 0, w: 10, h: 10 }, attrs: {} },
          { ax_id: 'm', ax_role: 'textbox', name: 'Password', bbox: { x: 0, y: 20, w: 10, h: 10 }, value_mask: 'vault:https://shop.example', attrs: {} },
        ],
      },
    }),
  );
  if (isRejection(g)) throw new Error('build failed');
  const masked = nodeByName(g, 'Password')?.affordance;
  assert.equal(masked?.kind, 'fill_secret');
  assert.equal(masked?.field_class, 'credential_ref');
  assert.equal(masked?.secret_scope, 'vault:https://shop.example');
});
