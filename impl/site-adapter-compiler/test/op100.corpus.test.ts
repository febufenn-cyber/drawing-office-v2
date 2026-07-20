// Op 100 — seed five hand-tuned adapters and verify the pattern end to end. Two
// e-commerce, one flights, one news, and one docs origin. Each adapter loads,
// exposes typed tools with param and return schemas, passes health, resolves
// provenance from every tool back to its trajectory, and round-trips through the
// store byte-identical.

import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/index.ts';
import { health, allHealthy } from '../src/health.ts';
import { provenance } from '../src/contract.ts';
import { AdapterStore } from '../src/store.ts';
import { canonical } from '../src/canonical.ts';
import { FakeModel, FakePage, FakeSurface, FIXED_CLOCK, type MutableNode } from './helpers.ts';
import type { ExploreCommand, LearnResult } from '../src/seams.ts';

const HANDLE = 'h';

// A search-style fixture: a query box, a submit button, and one result record.
function searchFixture(origin: string, toolName: string, fields: Record<string, string>): {
  origin: string; nodes: MutableNode[]; script: readonly ExploreCommand[]; model: FakeModel;
} {
  const nodes: MutableNode[] = [
    { stable_id: 'box', role: 'textbox', name: 'Query', structural_digest: origin + '#box', fields: {} },
    { stable_id: 'go', role: 'button', name: 'Go', structural_digest: origin + '#go', fields: {} },
    { stable_id: 'row', role: 'listitem', name: 'Result', structural_digest: origin + '#row', fields },
  ];
  const script: readonly ExploreCommand[] = [
    { target: { role: 'textbox', name: 'Query', structural_digest: origin + '#box', stable_id: 'box' }, action: 'type', intent: 'q', value: 'seed', param_candidate: true, read_fields: [] },
    { target: { role: 'button', name: 'Go', structural_digest: origin + '#go', stable_id: 'go' }, action: 'click', intent: 'submit', value: null, param_candidate: false, read_fields: [] },
    { target: { role: 'listitem', name: 'Result', structural_digest: origin + '#row', stable_id: 'row' }, action: 'read', intent: 'read', value: null, param_candidate: false, read_fields: Object.keys(fields) },
  ];
  const model = new FakeModel((t): LearnResult => ({
    tools: [{
      name: toolName, kind: 'search', step_seqs: t.steps.map((s) => s.seq),
      param_names: { 0: 'query' },
      return_fields: Object.fromEntries(Object.keys(fields).map((k) => [k, 'string' as const])),
    }],
  }));
  return { origin, nodes, script, model };
}

// An extract-style fixture: open a record, then read one full record.
function extractFixture(origin: string, toolName: string): {
  origin: string; nodes: MutableNode[]; script: readonly ExploreCommand[]; model: FakeModel;
} {
  const nodes: MutableNode[] = [
    { stable_id: 'link', role: 'link', name: 'Doc', structural_digest: origin + '#link', fields: {} },
    { stable_id: 'body', role: 'article', name: 'Body', structural_digest: origin + '#body', fields: { title: 'Guide', body: 'text' } },
  ];
  const script: readonly ExploreCommand[] = [
    { target: { role: 'link', name: 'Doc', structural_digest: origin + '#link', stable_id: 'link' }, action: 'click', intent: 'open', value: null, param_candidate: false, read_fields: [] },
    { target: { role: 'article', name: 'Body', structural_digest: origin + '#body', stable_id: 'body' }, action: 'read', intent: 'read', value: null, param_candidate: false, read_fields: ['title', 'body'] },
  ];
  const model = new FakeModel((t): LearnResult => ({
    tools: [{
      name: toolName, kind: 'extract', step_seqs: t.steps.map((s) => s.seq),
      param_names: {}, return_fields: { title: 'string', body: 'string' },
    }],
  }));
  return { origin, nodes, script, model };
}

const CORPUS = [
  searchFixture('https://shop-a.example', 'search_products', { title: 'A', price: '1.00' }),
  searchFixture('https://shop-b.example', 'find_items', { name: 'B', cost: '2.00' }),
  searchFixture('https://flights.example', 'search_flights', { flight: 'ZZ1', fare: '99' }),
  searchFixture('https://news.example', 'latest_headlines', { headline: 'H', section: 'World' }),
  extractFixture('https://docs.example', 'get_doc'),
];

test('all five adapters compile, load, and pass health', () => {
  for (const fx of CORPUS) {
    const store = new AdapterStore();
    const graph = new FakePage(fx.nodes);
    const { version } = compile(store, new FakeSurface(), graph, fx.model, FIXED_CLOCK, fx.origin, HANDLE, fx.script);
    const adapter = store.current(fx.origin);
    assert.ok(adapter, fx.origin + ' loads');
    assert.equal(adapter!.version, version);
    assert.ok(adapter!.tools.length >= 1, fx.origin + ' exposes tools');
    for (const tool of adapter!.tools) {
      assert.ok(Object.keys(tool.return_schema.fields).length > 0, fx.origin + ' has a typed return');
    }
    const report = health(adapter!, new FakeSurface(), graph, HANDLE, FIXED_CLOCK);
    assert.equal(allHealthy(report), true, fx.origin + ' passes health');
  }
});

test('every tool of every adapter resolves provenance back to its trajectory', () => {
  for (const fx of CORPUS) {
    const store = new AdapterStore();
    compile(store, new FakeSurface(), new FakePage(fx.nodes), fx.model, FIXED_CLOCK, fx.origin, HANDLE, fx.script);
    const adapter = store.current(fx.origin)!;
    for (const tool of adapter.tools) {
      const prov = provenance(adapter, tool.name);
      assert.ok(prov && prov.length === tool.steps.length, fx.origin + '/' + tool.name + ' provenance total');
      for (const p of prov!) assert.equal(p.trajectory_id, adapter.trajectory_ref);
    }
  }
});

test('each adapter round-trips through the store byte-identical', () => {
  for (const fx of CORPUS) {
    const store = new AdapterStore();
    const { version } = compile(store, new FakeSurface(), new FakePage(fx.nodes), fx.model, FIXED_CLOCK, fx.origin, HANDLE, fx.script);
    assert.equal(canonical(store.get(fx.origin, version)), canonical(store.current(fx.origin)));
  }
});

test('the extract adapter returns a single typed record, the search adapters a list', () => {
  const searchFx = CORPUS[0]!;
  const extractFx = CORPUS[4]!;
  const s = new AdapterStore();
  compile(s, new FakeSurface(), new FakePage(searchFx.nodes), searchFx.model, FIXED_CLOCK, searchFx.origin, HANDLE, searchFx.script);
  assert.equal(s.current(searchFx.origin)!.tools[0]!.return_schema.kind, 'list');
  const e = new AdapterStore();
  compile(e, new FakeSurface(), new FakePage(extractFx.nodes), extractFx.model, FIXED_CLOCK, extractFx.origin, HANDLE, extractFx.script);
  assert.equal(e.current(extractFx.origin)!.tools[0]!.return_schema.kind, 'record');
});
