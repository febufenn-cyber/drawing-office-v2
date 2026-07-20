// Op 60 — P4 structured-data-parser.
// Well-formed structured data yields typed entities each linked to a source node;
// malformed blocks skipped, never guessed; identical input yields identical
// entities.

import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/builder.ts';
import { canonical } from '../src/canonical.ts';
import { isRejection } from '../src/types.ts';
import { nodeByName, sampleSnapshot } from './helpers.ts';

test('a well-formed block yields one entity linked to its source node; malformed skipped', () => {
  const g = build(sampleSnapshot());
  if (isRejection(g)) throw new Error('build failed');
  assert.equal(g.entities.length, 1); // Product only; the malformed microdata block is skipped
  const entity = g.entities[0];
  const h1 = nodeByName(g, 'Great Laptop');
  assert.ok(entity && h1);
  assert.equal(entity?.entity_type, 'Product');
  assert.deepEqual(entity?.source_node_ids, [h1?.node_id]);
  assert.equal(entity?.provenance.source, 'structured_data');
});

test('an entity whose source node cannot be resolved is dropped, never fabricated', () => {
  const g = build(
    sampleSnapshot({
      structured_data: [
        { format: 'json-ld', well_formed: true, entity_type: 'Ghost', props: {}, source_ax_ids: ['does-not-exist'] },
      ],
    }),
  );
  if (isRejection(g)) throw new Error('build failed');
  assert.equal(g.entities.length, 0);
});

test('identical input yields identical entities', () => {
  const a = build(sampleSnapshot());
  const b = build(sampleSnapshot());
  if (isRejection(a) || isRejection(b)) throw new Error('build failed');
  assert.equal(canonical(a.entities), canonical(b.entities));
});
