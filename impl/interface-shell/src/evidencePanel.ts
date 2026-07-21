// P5 — evidence-panel. Lists a card's produced artifacts and the evidence pages
// behind its facts, resolving each ref against the workspace store scoped to the
// task's workspace. Every listed item carries provenance; an evidence page names its
// origin, source node, and capture timestamp, so a fact traces to its page.
// Evidence-page strings are page content and labeled as such; a ref that does not
// resolve renders as unavailable rather than as fabricated content. Read-only, and
// only within the card's workspace partition.

import type { WorkspaceRead } from './seams.ts';
import type { EvidenceRow, TaskCard } from './types.ts';

export function show(card: TaskCard, store: WorkspaceRead): EvidenceRow[] {
  const rows: EvidenceRow[] = [];

  for (const ref of card.artifact_refs) {
    const item = store.read(card.workspace_id, ref); // scoped to the card's workspace
    if (item === null || item.type !== 'artifact') {
      rows.push({ status: 'unavailable', item_kind: 'artifact', ref, label: 'shell', detail: {} });
    } else {
      rows.push({ status: 'ok', item_kind: 'artifact', ref, label: 'shell', detail: { kind: item.kind, title: item.title } });
    }
  }

  for (const ref of card.evidence_refs) {
    const item = store.read(card.workspace_id, ref);
    if (item === null || item.type !== 'evidence') {
      rows.push({ status: 'unavailable', item_kind: 'evidence', ref, label: 'page content', detail: {} });
    } else {
      // Evidence strings originate in the page — labeled page content.
      rows.push({
        status: 'ok', item_kind: 'evidence', ref, label: 'page content',
        detail: { origin: item.origin, source_node: item.source_node, captured_at: item.captured_at },
      });
    }
  }

  return rows;
}
