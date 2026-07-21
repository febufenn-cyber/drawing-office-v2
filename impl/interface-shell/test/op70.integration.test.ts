// Op 70 — full pipeline integration. One intent produces one task, one card, and a
// feed and evidence list that match the recorded run; no interface path executes or
// checkpoints a run.

import test from 'node:test';
import assert from 'node:assert/strict';
import { AmbientSidebar } from '../src/sidebar.ts';
import { initialCard, projectAll } from '../src/cardModel.ts';
import { feed } from '../src/activityStream.ts';
import { show } from '../src/evidencePanel.ts';
import { runEvents, StubExecutor, StubStore, WS } from './helpers.ts';

test('intent to task to card to activity and evidence, end to end', () => {
  const ex = new StubExecutor();
  const sb = new AmbientSidebar(ex, WS);

  // 1. One intent -> one task.
  const submitted = sb.submit('https://shop.example/deals');
  assert.ok(submitted.ok);
  assert.equal(ex.submits.length, 1);
  assert.equal(ex.submits[0]!.task.kind, 'navigate');

  // 2. Run state -> card.
  const card = projectAll(initialCard('task-1', WS, 'shop deals'), runEvents());
  assert.equal(card.status, 'done');

  // 3. Run log -> activity feed.
  const items = feed(runEvents());
  assert.equal(items.length, 6);

  // 4. Card refs -> evidence list.
  const store = new StubStore();
  store.put(WS, 'art-1', { type: 'artifact', ref: 'art-1', kind: 'report', title: 'Deals', workspace_id: WS });
  store.put(WS, 'snap-1', { type: 'evidence', ref: 'snap-1', origin: 'https://shop.example', source_node: 'n1', captured_at: 't' });
  const rows = show(card, store);
  assert.equal(rows.filter((r) => r.status === 'ok').length, 2);
});

test('no interface path submits a second task or advances the run', () => {
  const ex = new StubExecutor();
  const sb = new AmbientSidebar(ex, WS);
  sb.submit('research widgets');
  // Projecting run state, building the feed, and showing evidence issue no executor
  // calls — the only submit is the single intent.
  projectAll(initialCard('t', WS, 'x'), runEvents());
  feed(runEvents());
  assert.equal(ex.submits.length, 1); // still exactly one; the shell never re-submits or executes
});
