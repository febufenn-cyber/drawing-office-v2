// Shared fixtures: a fixed clock, a mutable fake PageGraph, a recording
// RenderSurface stub, a structure-only ModelRouter stub, and a canonical shop
// exploration script that compiles to one typed `search_products` tool. Not a
// test file.

import { canonical, sha256hex } from '../src/canonical.ts';
import { AdapterStore } from '../src/store.ts';
import { compile } from '../src/index.ts';
import type {
  Clock, ExploreCommand, GraphSnapshot, LearnResult, ModelRouter, PageGraph, RenderSurface,
} from '../src/seams.ts';
import type { ActionKind, Trajectory } from '../src/types.ts';

export const ORIGIN = 'https://shop.example';
export const HANDLE = 'h1';

// A fixed clock: byte-deterministic trajectories, adapters, and reports.
export const FIXED_CLOCK: Clock = { now: () => '2026-07-20T00:00:00Z' };

export interface MutableNode {
  stable_id: string;
  role: string;
  name: string;
  structural_digest: string;
  fields: Record<string, string | number | boolean>;
}

export class FakePage implements PageGraph {
  constructor(public nodes: MutableNode[]) {}

  snapshot(handle: string): GraphSnapshot {
    void handle;
    const nodes = this.nodes.map((n) => ({ ...n, fields: { ...n.fields } }));
    const snapshot_id = sha256hex(canonical(nodes)).slice(0, 16);
    return { snapshot_id, nodes };
  }

  remove(stable_id: string): void {
    this.nodes = this.nodes.filter((n) => n.stable_id !== stable_id);
  }

  setField(stable_id: string, field: string, value: string | number | boolean): void {
    const n = this.nodes.find((x) => x.stable_id === stable_id);
    if (n !== undefined) n.fields[field] = value;
  }

  dropField(stable_id: string, field: string): void {
    const n = this.nodes.find((x) => x.stable_id === stable_id);
    if (n !== undefined) delete n.fields[field];
  }
}

export class FakeSurface implements RenderSurface {
  readonly acts: Array<{ stable_id: string; action: ActionKind; value: string | null }> = [];
  act(handle: string, stable_id: string, action: ActionKind, value: string | null): { ok: boolean } {
    void handle;
    this.acts.push({ stable_id, action, value });
    return { ok: true };
  }
}

export class FakeModel implements ModelRouter {
  calls = 0;
  constructor(private readonly fn: (t: Trajectory) => LearnResult) {}
  learn(t: Trajectory): LearnResult {
    this.calls++;
    return this.fn(t);
  }
}

export function shopNodes(): MutableNode[] {
  return [
    { stable_id: 'n-search', role: 'textbox', name: 'Search', structural_digest: 'd-search', fields: {} },
    { stable_id: 'n-submit', role: 'button', name: 'Search', structural_digest: 'd-submit', fields: {} },
    { stable_id: 'n-result', role: 'listitem', name: 'Widget', structural_digest: 'd-result', fields: { title: 'Widget', price: '9.99' } },
  ];
}

export const SEARCH_SCRIPT: readonly ExploreCommand[] = [
  { target: { role: 'textbox', name: 'Search', structural_digest: 'd-search', stable_id: 'n-search' }, action: 'type', intent: 'search:type', value: 'widget', param_candidate: true, read_fields: [] },
  { target: { role: 'button', name: 'Search', structural_digest: 'd-submit', stable_id: 'n-submit' }, action: 'click', intent: 'search:submit', value: null, param_candidate: false, read_fields: [] },
  { target: { role: 'listitem', name: 'Widget', structural_digest: 'd-result', stable_id: 'n-result' }, action: 'read', intent: 'search:read', value: null, param_candidate: false, read_fields: ['title', 'price'] },
];

// A structure-only learning pass for the shop script: one search tool spanning
// all steps, the typed query as its one param, and a two-field return record.
export function searchModel(): FakeModel {
  return new FakeModel((t) => ({
    tools: [{
      name: 'search_products',
      kind: 'search',
      step_seqs: t.steps.map((s) => s.seq),
      param_names: { 0: 'query' },
      return_fields: { title: 'string', price: 'string' },
    }],
  }));
}

export interface Compiled {
  store: AdapterStore;
  surface: FakeSurface;
  graph: FakePage;
  model: FakeModel;
  version: number;
}

export function compiledShop(): Compiled {
  const store = new AdapterStore();
  const surface = new FakeSurface();
  const graph = new FakePage(shopNodes());
  const model = searchModel();
  const { version } = compile(store, surface, graph, model, FIXED_CLOCK, ORIGIN, HANDLE, SEARCH_SCRIPT);
  return { store, surface, graph, model, version };
}
