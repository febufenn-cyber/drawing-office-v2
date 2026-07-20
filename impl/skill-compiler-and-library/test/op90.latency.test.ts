// Op 90 — latency and throughput. p99 at or below budget: lookup_exact 10 ms on a
// 5000-skill library, generalizer overhead 30 ms excluding the model call, verifier
// orchestration 50 ms excluding model and page wait; durable-write-before-serve
// ordering observed under load.

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { SkillLibrary } from '../src/library.ts';
import { generalize } from '../src/generalizer.ts';
import { verify } from '../src/verifier.ts';
import { canonical } from '../src/canonical.ts';
import { FakeModel, FakeSurface, FakeWorkspaceStore, FIXED_CLOCK, SANDBOX, searchNodes, searchTrajectory, WS } from './helpers.ts';
import type { Skill } from '../src/types.ts';

const LOOKUP_BUDGET_MS = 10;
const GENERALIZE_BUDGET_MS = 30;
const VERIFY_BUDGET_MS = 50;

function p99(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.99))] ?? 0;
}

function seedSkill(sig: string): Skill {
  return {
    skill_id: 'sk:' + sig, signature: sig, version: 1, parameters: [],
    steps: [{ index: 0, kind: 'click', locator: { role: 'button', name_pattern: 'Go', structural_path: 'p' }, bindings: [], commit: 'none' }],
    guards: [], postconditions: [],
    provenance: { trajectory_ref: 't', generalizing_model: 'm', source_digest: 'd' }, status: 'promoted',
  };
}

test('lookup_exact on a 5000-skill library is within budget', () => {
  const ws = new FakeWorkspaceStore();
  const lib = new SkillLibrary(ws, WS);
  ws.put('snap:cur', canonical({ snapshot_ref: 'snap:cur', nodes: [{ stable_id: 'go', role: 'button', name: 'Go', structural_path: 'p' }] }), false);
  for (let i = 0; i < 5000; i++) lib.put(seedSkill('sig' + String(i)), 'promoted', false);

  for (let i = 0; i < 30; i++) lib.lookup_exact('sig2500', 'snap:cur'); // warm
  const samples: number[] = [];
  for (let i = 0; i < 500; i++) {
    const t0 = performance.now();
    lib.lookup_exact('sig2500', 'snap:cur');
    samples.push(performance.now() - t0);
  }
  assert.ok(p99(samples) <= LOOKUP_BUDGET_MS, 'lookup_exact p99 ' + p99(samples).toFixed(3) + 'ms');
});

test('generalizer overhead excluding the model call is within budget', () => {
  const model = new FakeModel();
  const traj = searchTrajectory();
  for (let i = 0; i < 30; i++) generalize(traj, model, FIXED_CLOCK);
  const samples: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const t0 = performance.now();
    generalize(traj, model, FIXED_CLOCK);
    samples.push(performance.now() - t0);
  }
  assert.ok(p99(samples) <= GENERALIZE_BUDGET_MS, 'generalize p99 ' + p99(samples).toFixed(3) + 'ms');
});

test('verifier orchestration excluding model and page wait is within budget', () => {
  const model = new FakeModel();
  const gen = generalize(searchTrajectory(), model, FIXED_CLOCK);
  assert.ok(gen.ok);
  if (!gen.ok) return;
  const samples: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const surface = new FakeSurface(searchNodes());
    const t0 = performance.now();
    verify(gen.candidate, { query: 'held' }, { model, surface, sandboxPartition: SANDBOX });
    samples.push(performance.now() - t0);
  }
  assert.ok(p99(samples) <= VERIFY_BUDGET_MS, 'verify p99 ' + p99(samples).toFixed(3) + 'ms');
});

test('a promoted skill is durably flushed before it is served', () => {
  const ws = new FakeWorkspaceStore();
  const lib = new SkillLibrary(ws, WS);
  ws.put('snap:cur', canonical({ snapshot_ref: 'snap:cur', nodes: [{ stable_id: 'go', role: 'button', name: 'Go', structural_path: 'p' }] }), false);
  const flushesBefore = ws.flushes;
  lib.put(seedSkill('sig-x'), 'promoted', true); // durable
  assert.ok(ws.flushes > flushesBefore); // flushed before the serve below
  assert.ok(lib.lookup_exact('sig-x', 'snap:cur'));
});
