// Op 90 — P9 pagegraph-builder.
// Identical snapshot yields a byte-identical PageGraph; nav_epoch and workspace_id
// equal the snapshot values; every node and entity carries provenance; every fact
// attaches to a spine node with no orphans; the graph exposes no raw HTML field;
// no module imports engine or Electron symbols.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from '../src/builder.ts';
import { canonical } from '../src/canonical.ts';
import { isRejection } from '../src/types.ts';
import { sampleSnapshot } from './helpers.ts';

test('identical snapshot yields a byte-identical PageGraph', () => {
  const a = build(sampleSnapshot());
  const b = build(sampleSnapshot());
  if (isRejection(a) || isRejection(b)) throw new Error('build failed');
  assert.equal(canonical(a), canonical(b));
});

test('nav_epoch and workspace_id equal the snapshot values', () => {
  const g = build(sampleSnapshot({ nav_epoch: 42, workspace_id: 'ws-xyz' }));
  if (isRejection(g)) throw new Error('build failed');
  assert.equal(g.nav_epoch, 42);
  assert.equal(g.workspace_id, 'ws-xyz');
});

test('every node and entity carries provenance and no fact is orphaned', () => {
  const g = build(sampleSnapshot());
  if (isRejection(g)) throw new Error('build failed');
  const ids = new Set(g.nodes.map((n) => n.node_id));
  for (const n of g.nodes) {
    assert.equal(n.provenance.source_node.length > 0, true);
    assert.equal(n.provenance.captured_at.length > 0, true);
  }
  for (const e of g.entities) {
    assert.equal(e.source_node_ids.length > 0, true);
    for (const s of e.source_node_ids) assert.equal(ids.has(s), true);
  }
  for (const c of g.main_content_ids) assert.equal(ids.has(c), true);
  assert.equal('html' in g, false);
});

test('no source imports an engine or Electron module', () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const importFrom = /(?:import|export)\b[^'"]*\bfrom\s*['"]([^'"]+)['"]/g;
  const engine = /^(electron|puppeteer|playwright|chrome-remote-interface)(\/|$)/i;
  let checked = 0;
  for (const f of readdirSync(src).filter((x) => x.endsWith('.ts'))) {
    const text = readFileSync(join(src, f), 'utf8');
    assert.equal(/\bfetch\s*\(/.test(text), false, f + ' performs a fetch');
    let m: RegExpExecArray | null;
    while ((m = importFrom.exec(text)) !== null) {
      const spec = m[1] as string;
      checked++;
      assert.equal(engine.test(spec), false, f + ' imports ' + spec);
      assert.equal(spec.startsWith('.') || spec.startsWith('node:'), true, f + ' imports non-local ' + spec);
    }
  }
  assert.ok(checked > 0);
});
