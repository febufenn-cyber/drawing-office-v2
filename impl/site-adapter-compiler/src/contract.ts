// P1 — site-adapter-contract. The typed tool interface and the deterministic
// replay interpreter. Replay resolves each anchor against the current PageGraph,
// binds params, and crosses RenderSurface; it calls no model and never falls back
// to a raw selector.

import { canonical, sha256hex, validateParams, validateSchema } from './canonical.ts';
import { resolveAnchor } from './seams.ts';
import type { PageGraph, RenderSurface } from './seams.ts';
import type { AdapterStore } from './store.ts';
import type { ActionRecord, ParamBinding, ProvenanceRef, SiteAdapter, Tool, ToolResult } from './types.ts';

export function replayDigest(tools: readonly Tool[]): string {
  return sha256hex(canonical(tools.map((t) => ({
    name: t.name, kind: t.kind, params_schema: t.params_schema, return_schema: t.return_schema,
    steps: t.steps.map((s) => ({ seq: s.seq, anchor: s.anchor, action: s.action, binding: s.binding, read_fields: s.read_fields })),
  }))));
}

function bind(binding: ParamBinding, params: Readonly<Record<string, string>>, record: Record<string, unknown>): string | null {
  if (binding.kind === 'param' && binding.param_ref !== null) return params[binding.param_ref] ?? null;
  if (binding.kind === 'literal') return binding.literal;
  if (binding.kind === 'extract' && binding.extract_field !== null) {
    const v = record[binding.extract_field];
    return typeof v === 'string' ? v : v === undefined ? null : String(v);
  }
  return null;
}

export function replay(
  adapter: SiteAdapter,
  tool: Tool,
  params: Readonly<Record<string, string>>,
  surface: RenderSurface,
  graph: PageGraph,
  handle: string,
): ToolResult {
  const actions: ActionRecord[] = [];
  const readRecords: Record<string, unknown>[] = [];
  let lastReadCtx: Record<string, unknown> = {};

  for (const step of [...tool.steps].sort((a, b) => a.seq - b.seq)) {
    const snap = graph.snapshot(handle);
    const node = resolveAnchor(step.anchor, snap);
    if (node === null) {
      return { ok: false, error: 'anchor_unresolved:' + String(step.seq), value: null, actions, provenance: tool.provenance };
    }
    const value = bind(step.binding, params, lastReadCtx);
    if (step.action === 'read') {
      const rec: Record<string, unknown> = {};
      for (const f of step.read_fields) rec[f] = node.fields[f];
      readRecords.push(rec);
      lastReadCtx = rec;
    } else {
      const act = surface.act(handle, node.stable_id, step.action, value);
      actions.push({ stable_id: node.stable_id, action: step.action, value });
      if (!act.ok) return { ok: false, error: 'action_failed:' + String(step.seq), value: null, actions, provenance: tool.provenance };
    }
  }

  const value: unknown = readRecords.length > 0
    ? (tool.return_schema.kind === 'list' ? readRecords : readRecords[0] ?? {})
    : { ok: true };
  return { ok: true, error: null, value, actions, provenance: tool.provenance };
}

export type InvokeResult = { readonly ok: true; readonly result: ToolResult } | { readonly ok: false; readonly error: string };

export function invoke(
  store: AdapterStore,
  origin: string,
  tool_name: string,
  params: Readonly<Record<string, string>>,
  surface: RenderSurface,
  graph: PageGraph,
  handle: string,
): InvokeResult {
  const adapter = store.current(origin);
  if (adapter === null) return { ok: false, error: 'no_adapter' };
  const tool = adapter.tools.find((t) => t.name === tool_name);
  if (tool === undefined) return { ok: false, error: 'no_such_tool' };
  if (!validateParams(params, tool.params_schema)) return { ok: false, error: 'bad_params' };
  const result = replay(adapter, tool, params, surface, graph, handle);
  if (!result.ok) return { ok: false, error: result.error ?? 'replay_failed' };
  if (!validateSchema(result.value, tool.return_schema)) return { ok: false, error: 'schema_violation' };
  return { ok: true, result };
}

export function tools(store: AdapterStore, origin: string): Array<{ name: string; kind: string; params_schema: unknown; return_schema: unknown }> {
  const adapter = store.current(origin);
  if (adapter === null) return [];
  return adapter.tools.map((t) => ({ name: t.name, kind: t.kind, params_schema: t.params_schema, return_schema: t.return_schema }));
}

export function provenance(adapter: SiteAdapter, tool_name: string): readonly ProvenanceRef[] | null {
  const tool = adapter.tools.find((t) => t.name === tool_name);
  return tool === undefined ? null : tool.provenance;
}
