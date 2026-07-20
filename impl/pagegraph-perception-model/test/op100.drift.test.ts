// Op 100 — drift and stability battery.
// Across attribute churn, sibling insertion, and geometry shift, at least 0.98 of
// durable nodes retain their id; a node whose geometry bucket changes gets a
// changed digest; a node whose durable signals are unchanged keeps its id.

import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/builder.ts';
import { isRejection } from '../src/types.ts';
import type { PageGraph } from '../src/types.ts';
import { ax, sampleSnapshot } from './helpers.ts';

// The same page after minor drift: volatile class attrs added, geometry shifted,
// and an unrelated paragraph inserted into the main region.
function drifted() {
  return sampleSnapshot({
    ax_tree: ax('root', 'document', { name: 'Doc', attrs: { class: 'theme-dark' } }, [
      ax('main', 'main', { name: 'Main' }, [
        ax('h1', 'heading', { name: 'Great Laptop', attrs: { class: 'blink' }, bbox: { x: 8, y: 200, w: 300, h: 24 } }),
        ax('p0', 'paragraph', { name: 'Inserted note.' }), // unrelated sibling insertion
        ax('p1', 'paragraph', { name: 'A fine machine.', bbox: { x: 8, y: 260, w: 300, h: 24 } }),
        ax('f1', 'form', { attrs: { method: 'post', action: '/pay' } }, [
          ax('email', 'textbox', { name: 'Email', attrs: { type: 'email', name: 'email', autocomplete: 'email', class: 'z' } }),
          ax('pw', 'textbox', { name: 'Password', attrs: { type: 'password', name: 'password' } }),
          ax('card', 'textbox', { name: 'Card number', attrs: { name: 'cardnumber' } }),
          ax('pay', 'button', { name: 'Pay', attrs: { type: 'submit' } }),
        ]),
      ]),
      ax('nav', 'navigation', { name: 'Nav' }, [ax('navlink', 'link', { name: 'Home', attrs: { href: '/' } })]),
    ]),
  });
}

function namedIds(g: PageGraph): Map<string, string> {
  const m = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const n of g.nodes) {
    if (n.name.length === 0) continue;
    counts.set(n.name, (counts.get(n.name) ?? 0) + 1);
  }
  for (const n of g.nodes) {
    if (n.name.length > 0 && counts.get(n.name) === 1) m.set(n.name, n.node_id);
  }
  return m;
}

test('at least 0.98 of durable named nodes retain their id across drift', () => {
  const base = build(sampleSnapshot());
  const after = build(drifted());
  if (isRejection(base) || isRejection(after)) throw new Error('build failed');
  const b = namedIds(base);
  const a = namedIds(after);
  let shared = 0;
  let retained = 0;
  for (const [name, id] of b) {
    const other = a.get(name);
    if (other === undefined) continue;
    shared++;
    if (other === id) retained++;
  }
  assert.ok(shared >= 8, 'expected a meaningful set of shared nodes, got ' + shared);
  const ratio = retained / shared;
  assert.ok(ratio >= 0.98, 'id retention ' + ratio.toFixed(3) + ' below 0.98');
});

test('a geometry shift changes the digest but not the id', () => {
  const base = build(sampleSnapshot());
  const after = build(drifted());
  if (isRejection(base) || isRejection(after)) throw new Error('build failed');
  const bh = base.nodes.find((n) => n.name === 'Great Laptop');
  const ah = after.nodes.find((n) => n.name === 'Great Laptop');
  assert.ok(bh && ah);
  assert.equal(bh?.node_id, ah?.node_id);
  assert.notEqual(bh?.digest, ah?.digest);
});
