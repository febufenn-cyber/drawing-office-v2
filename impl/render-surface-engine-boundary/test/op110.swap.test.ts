// Op 110 — engine-swap and boundary conformance.
// No symbol above L0 imports engine or Electron; swapping the driver (StubEngine
// -> AltStubEngine) leaves the RenderSurface contract and all above-L0 code
// unchanged; the acceptance suite passes on both drivers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RenderSurface } from '../src/renderSurface.ts';
import { AltStubEngine, StubEngine } from '../src/stubEngine.ts';
import type { TestEngine } from '../src/stubEngine.ts';
import { KEY, mkNode, nodeIdOf, now, secretResolver, SECRET_VALUE, ticketFor } from './helpers.ts';

// The full boundary scenario, written once against the engine-neutral contract.
function acceptance(engine: TestEngine): void {
  const rs = new RenderSurface(engine, KEY, secretResolver, now);
  const opened = rs.open('https://site', { workspace_id: 'A', partition_key: 'A:main' });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  const h = opened.value;
  const surface = engine.surfaceIds().at(-1) as string;

  const btn = mkNode('btn', { role: 'button', name: 'Go', path: 'body/btn' });
  const pw = mkNode('pw', { role: 'textbox', name: 'password', path: 'body/pw' });
  engine.setNodes(surface, [btn, pw]);

  const snap = rs.snapshot(h);
  assert.equal(snap.ok, true);
  if (snap.ok) {
    assert.equal(snap.value.nodes.length, 2);
    assert.equal(snap.value.workspace_id, 'A');
  }

  const bid = nodeIdOf(btn);
  assert.equal(rs.act(h, { kind: 'click', node_id: bid }, ticketFor({ kind: 'click', node_id: bid }, 0)).ok, true);
  assert.equal(engine.dispatched.length >= 1, true);

  const pid = nodeIdOf(pw);
  const filled = rs.fillSecret(h, pid, { ref: 'vault://pw', scope: 'https://site' }, ticketFor({ kind: 'fill_secret', node_id: pid }, 0));
  assert.equal(filled.ok && filled.value, true);
  const snap2 = rs.snapshot(h);
  assert.equal(snap2.ok, true);
  if (snap2.ok) {
    assert.equal(snap2.value.nodes.find((n) => n.node_id === pid)?.masked, true);
    assert.equal(JSON.stringify(snap2.value).includes(SECRET_VALUE), false);
  }

  engine.navigate(surface, 'https://site/2', [mkNode('n2')]);
  const evs = rs.observe(h);
  assert.equal(evs.ok, true);
  if (evs.ok) {
    const nav = evs.value.find((e) => e.kind === 'nav');
    assert.ok(nav);
    if (nav && nav.kind === 'nav') assert.equal(nav.nav_epoch, 1);
  }
}

test('the acceptance suite passes on the primary driver', () => {
  acceptance(new StubEngine());
});

test('the acceptance suite passes on a second, internally different driver', () => {
  acceptance(new AltStubEngine());
});

test('the import graph pulls in no engine or Electron module', () => {
  // Op 110's import-graph invariant. Every import specifier across the boundary
  // must be a relative path or a node builtin; no source imports electron,
  // puppeteer, playwright, or a CDP client. Engine names may appear in comments
  // that describe the production adapter, but never as an import — the engine
  // sits behind the RawEngine seam, which a real driver implements elsewhere.
  const here = dirname(fileURLToPath(import.meta.url));
  const src = join(here, '..', 'src');
  const files = readdirSync(src).filter((f) => f.endsWith('.ts'));
  const importFrom = /(?:import|export)\b[^'"]*\bfrom\s*['"]([^'"]+)['"]/g;
  const engineModule = /^(electron|puppeteer|playwright|chrome-remote-interface)(\/|$)/i;
  let checked = 0;
  for (const f of files) {
    const text = readFileSync(join(src, f), 'utf8');
    let m: RegExpExecArray | null;
    while ((m = importFrom.exec(text)) !== null) {
      const spec = m[1] as string;
      checked++;
      assert.equal(engineModule.test(spec), false, f + ' imports engine module ' + spec);
      assert.equal(
        spec.startsWith('.') || spec.startsWith('node:'),
        true,
        f + ' imports non-local module ' + spec,
      );
    }
  }
  assert.ok(checked > 0);
});
