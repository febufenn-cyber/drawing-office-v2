// P5 — health-checker. Scheduled self-test. It replays every tool through the P1
// interpreter with the golden params recorded from the trajectory, validates the
// return against the schema, and evaluates the tool's golden assertions, emitting
// a per-tool HealthReport. The run replays only: it mutates no adapter and calls
// no model.

import { validateSchema } from './canonical.ts';
import { replay } from './contract.ts';
import type { Clock, PageGraph, RenderSurface } from './seams.ts';
import type { Assertion, HealthReport, Schema, SiteAdapter, ToolHealth } from './types.ts';

function assertionHolds(a: Assertion, value: unknown, schema: Schema): boolean {
  if (a.kind === 'non_empty_list') return Array.isArray(value) && value.length > 0;
  // record_complete: a single record with every schema field populated.
  return validateSchema(value, { kind: 'record', fields: schema.fields });
}

export function health(
  adapter: SiteAdapter,
  surface: RenderSurface,
  graph: PageGraph,
  handle: string,
  clock: Clock,
): HealthReport {
  const tools: ToolHealth[] = adapter.tools.map((tool) => {
    const result = replay(adapter, tool, tool.golden_params, surface, graph, handle);
    if (!result.ok) {
      const broken = result.error !== null && result.error.startsWith('anchor_unresolved');
      return { name: tool.name, status: broken ? 'broken' : 'drifted', detail: result.error ?? 'replay_failed' };
    }
    if (!validateSchema(result.value, tool.return_schema)) {
      return { name: tool.name, status: 'drifted', detail: 'schema_violation' };
    }
    for (const a of tool.assertions) {
      if (!assertionHolds(a, result.value, tool.return_schema)) {
        return { name: tool.name, status: 'drifted', detail: 'assertion_failed:' + a.kind };
      }
    }
    return { name: tool.name, status: 'healthy', detail: 'ok' };
  });
  return { adapter_id: adapter.adapter_id, version: adapter.version, ts: clock.now(), tools };
}

export function allHealthy(report: HealthReport): boolean {
  return report.tools.every((t) => t.status === 'healthy');
}

// A tick-driven scheduler: fires health for an origin at most once per configured
// interval. `due` is the mechanism; the caller runs `health` when it returns true.
export class HealthScheduler {
  private readonly last = new Map<string, number>();

  constructor(private readonly intervalTicks: number) {
    if (intervalTicks <= 0) throw new Error('interval must be positive');
  }

  due(origin: string, tick: number): boolean {
    const last = this.last.get(origin);
    if (last === undefined || tick - last >= this.intervalTicks) {
      this.last.set(origin, tick);
      return true;
    }
    return false;
  }
}
