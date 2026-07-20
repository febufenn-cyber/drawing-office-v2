// Op 40 — P5 evidence-panel. Artifact and evidence refs resolve within the card's
// workspace with provenance; a dangling ref renders unavailable; a cross-workspace
// read is refused; evidence strings are labeled page content.

import test from 'node:test';
import assert from 'node:assert/strict';
import { show } from '../src/evidencePanel.ts';
import { initialCard, projectAll } from '../src/cardModel.ts';
import { runEvents, StubStore, WS } from './helpers.ts';
import type { TaskCard } from '../src/types.ts';

function seededStore(): StubStore {
  const store = new StubStore();
  store.put(WS, 'art-1', { type: 'artifact', ref: 'art-1', kind: 'report', title: 'Findings', workspace_id: WS });
  store.put(WS, 'snap-1', { type: 'evidence', ref: 'snap-1', origin: 'https://shop.example', source_node: 'n42', captured_at: '2026-07-20T00:00:06Z' });
  return store;
}

test('artifacts and evidence resolve within the workspace with provenance', () => {
  const card = projectAll(initialCard('task-1', WS, 'A task'), runEvents());
  const rows = show(card, seededStore());
  assert.equal(rows.length, 2);
  const artifact = rows.find((r) => r.item_kind === 'artifact');
  const evidence = rows.find((r) => r.item_kind === 'evidence');
  assert.equal(artifact?.status, 'ok');
  assert.equal(artifact?.detail['title'], 'Findings');
  assert.equal(evidence?.status, 'ok');
  assert.equal(evidence?.detail['source_node'], 'n42'); // traces the fact to its page node
});

test('evidence strings are labeled page content', () => {
  const card = projectAll(initialCard('task-1', WS, 'A task'), runEvents());
  const rows = show(card, seededStore());
  const evidence = rows.find((r) => r.item_kind === 'evidence');
  assert.equal(evidence?.label, 'page content');
});

test('a dangling ref renders as unavailable, never as fabricated content', () => {
  const card: TaskCard = { ...initialCard('task-1', WS, 'x'), artifact_refs: ['missing'], evidence_refs: [] };
  const rows = show(card, new StubStore());
  assert.equal(rows[0]?.status, 'unavailable');
  assert.deepEqual(rows[0]?.detail, {}); // no fabricated fields
});

test('a ref stored under another workspace does not resolve — reads are scoped', () => {
  const store = new StubStore();
  store.put('ws-other', 'snap-x', { type: 'evidence', ref: 'snap-x', origin: 'https://x', source_node: 'n', captured_at: 't' });
  const card: TaskCard = { ...initialCard('task-1', WS, 'x'), evidence_refs: ['snap-x'] };
  const rows = show(card, store);
  assert.equal(rows[0]?.status, 'unavailable'); // cross-workspace read refused
});
