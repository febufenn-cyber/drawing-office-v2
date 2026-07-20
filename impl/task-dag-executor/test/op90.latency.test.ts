// Op 90 — latency and throughput. p99 dispatcher overhead at or below 15 ms
// excluding model, perception, and control-plane wait; scheduler ready_set at or
// below 5 ms on 5000-step graphs; durable-record-before-dispatch ordering observed
// under load.

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readySet } from '../src/scheduler.ts';
import { StepDispatcher } from '../src/dispatcher.ts';
import { CheckpointStore } from '../src/checkpointStore.ts';
import type { DispatchContext } from '../src/dispatcher.ts';
import type { ActionDecision, ActionProposal } from '../src/seams.ts';
import type { Edge, Expr, Step, TaskGraph } from '../src/types.ts';
import {
  FakeControlPlane, FakeModelRouter, FakeRenderSurface, FakeSkillLibrary, FakeWorkspaceStore,
  CONTROL_OUTPUTS, HANDLE, linearGraph, PERCEPTION_VALUES, SNAPSHOT_REF, wire, WS,
} from './helpers.ts';

const READY_BUDGET_MS = 5;
const DISPATCH_BUDGET_MS = 15;

function p99(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.99))] ?? 0;
}

function bigGraph(n: number): TaskGraph {
  const steps: Step[] = [];
  const edges: Edge[] = [];
  const post: Expr = { op: 'present', port: 'out' };
  for (let i = 0; i < n; i++) {
    const id = 's' + String(i).padStart(5, '0');
    steps.push({
      step_id: id, kind: 'extract',
      inputs: i === 0 ? [] : [{ name: 'in', type: 'string' }],
      outputs: [{ name: 'out', type: 'string' }],
      precondition: { op: 'always' }, postcondition: post, signature: 'sig',
    });
    if (i > 0) edges.push({ from_step: 's' + String(i - 1).padStart(5, '0'), from_port: 'out', to_step: id, to_port: 'in' });
  }
  return { graph_id: 'big', workspace_id: WS, steps, edges };
}

test('ready_set on a 5000-step graph is within budget', () => {
  const g = bigGraph(5000);
  const store = new CheckpointStore(new FakeWorkspaceStore(), WS);
  for (let i = 0; i < 30; i++) readySet(g, store); // warm the JIT
  const samples: number[] = [];
  for (let i = 0; i < 500; i++) {
    const t0 = performance.now();
    readySet(g, store);
    samples.push(performance.now() - t0);
  }
  // 500 samples so p99 is a true 99th percentile, not the single worst GC spike.
  assert.ok(p99(samples) <= READY_BUDGET_MS, 'ready_set p99 ' + p99(samples).toFixed(3) + 'ms');
});

test('dispatcher overhead on a skill-resolved perception step is within budget', () => {
  const control = new FakeControlPlane(CONTROL_OUTPUTS);
  const surface = new FakeRenderSurface(PERCEPTION_VALUES);
  const d = new StepDispatcher(new FakeSkillLibrary(new Set(['sig-ext'])), control, surface, new FakeModelRouter(), SNAPSHOT_REF);
  const ctx: DispatchContext = { workspace_id: WS, graph_id: 'g1', handle: HANDLE };
  const step: Step = linearGraph().steps[1]!; // extract, exact skill present -> no model call
  const samples: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const t0 = performance.now();
    d.dispatch(ctx, step, { page: 'p1' }, 'k');
    samples.push(performance.now() - t0);
  }
  assert.ok(p99(samples) <= DISPATCH_BUDGET_MS, 'dispatch p99 ' + p99(samples).toFixed(3) + 'ms');
});

test('under load, every act-class submission is preceded by a durable pre_dispatch flush', () => {
  // A control plane that records the workspace flush count at submit time proves
  // the durable pre_dispatch was flushed before the effect was sent.
  const ws = new FakeWorkspaceStore();
  const flushesAtSubmit: number[] = [];
  const inner = new FakeControlPlane(CONTROL_OUTPUTS);
  const control: FakeControlPlane = Object.assign(new FakeControlPlane(CONTROL_OUTPUTS), {
    submit(proposal: ActionProposal): ActionDecision {
      flushesAtSubmit.push(ws.flushes);
      return inner.submit(proposal);
    },
  });

  const w = wire({ ws, control });
  w.controller.run(linearGraph(), { workspace_id: WS, handle: HANDLE });
  // Two consequential submits (s1, s4); each saw at least its own pre_dispatch flush.
  assert.equal(flushesAtSubmit.length, 2);
  assert.ok(flushesAtSubmit[0]! >= 1);
  assert.ok(flushesAtSubmit[1]! >= 2);
});
