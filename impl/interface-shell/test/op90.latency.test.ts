// Op 90 — latency. p99 card projection at or below 50 ms from event receipt to
// updated card; feed and evidence projections measured under load.

import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { initialCard, project } from '../src/cardModel.ts';
import { feed } from '../src/activityStream.ts';
import { show } from '../src/evidencePanel.ts';
import { runEvents, StubStore, WS } from './helpers.ts';
import type { RunEvent } from '../src/types.ts';

const PROJECT_BUDGET_MS = 50;

function p99(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.99))] ?? 0;
}

test('card projection is within budget from event receipt to updated card', () => {
  const events = runEvents();
  const evt: RunEvent = events[6]!; // step.succeeded with an artifact ref
  let card = initialCard('t', WS, 'x');
  for (let i = 0; i < events.length; i++) card = project(card, events[i]!);
  for (let i = 0; i < 50; i++) project(card, { ...evt, seq: card.updated_seq + 1 }); // warm
  const samples: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const next = { ...evt, seq: card.updated_seq + 1 + i };
    const t0 = performance.now();
    project(card, next);
    samples.push(performance.now() - t0);
  }
  assert.ok(p99(samples) <= PROJECT_BUDGET_MS, 'project p99 ' + p99(samples).toFixed(4) + 'ms');
});

test('feed and evidence projections are within budget under load', () => {
  const events = runEvents();
  const store = new StubStore();
  store.put(WS, 'art-1', { type: 'artifact', ref: 'art-1', kind: 'report', title: 'T', workspace_id: WS });
  store.put(WS, 'snap-1', { type: 'evidence', ref: 'snap-1', origin: 'https://x', source_node: 'n', captured_at: 't' });
  const card = { ...initialCard('t', WS, 'x'), artifact_refs: ['art-1'], evidence_refs: ['snap-1'] };
  const samples: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const t0 = performance.now();
    feed(events);
    show(card, store);
    samples.push(performance.now() - t0);
  }
  assert.ok(p99(samples) <= PROJECT_BUDGET_MS, 'feed+evidence p99 ' + p99(samples).toFixed(4) + 'ms');
});
