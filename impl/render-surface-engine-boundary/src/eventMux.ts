// P7 — event-multiplexer.
//
// observe multiplexes navigation, network, and mutation events into one ordered
// stream. On a committed navigation it increments the handle's nav_epoch through
// P2 and emits a nav event carrying it, so a stale grant above L0 is invalidated
// the moment the page changes. Under buffer pressure the oldest network or
// mutation event is dropped, but a nav event is never dropped, so an epoch change
// is never lost.

import { NOT_FOUND } from './registry.ts';
import type { PageHandleRegistry } from './registry.ts';
import type { HandleId, PageEvent, PageHandle } from './types.ts';

export class EventMultiplexer {
  private readonly queues = new Map<HandleId, PageEvent[]>();
  private seq = 0;

  constructor(
    private readonly registry: PageHandleRegistry,
    private readonly bufferLimit: number = 1024,
  ) {}

  private queueFor(handle_id: HandleId): PageEvent[] {
    let q = this.queues.get(handle_id);
    if (q === undefined) {
      q = [];
      this.queues.set(handle_id, q);
    }
    return q;
  }

  private enqueue(handle_id: HandleId, ev: PageEvent): void {
    const q = this.queueFor(handle_id);
    q.push(ev);
    // Evict oldest non-nav events first; never evict a nav event.
    while (q.length > this.bufferLimit) {
      const victim = q.findIndex((e) => e.kind !== 'nav');
      if (victim === -1) break; // all nav events; keep them all
      q.splice(victim, 1);
    }
  }

  ingestNetwork(handle_id: HandleId, detail: string): void {
    this.enqueue(handle_id, { kind: 'network', handle_id, detail, seq: this.seq++ });
  }

  ingestMutation(handle_id: HandleId, detail: string): void {
    this.enqueue(handle_id, { kind: 'mutation', handle_id, detail, seq: this.seq++ });
  }

  // A committed navigation: bump the epoch through P2, then emit a nav event
  // carrying the new epoch. The emitted epoch equals the one the next snapshot
  // will stamp, so a caller can order a snapshot against its navigation.
  onNavigationCommit(handle: PageHandle): PageEvent | typeof NOT_FOUND {
    const cur = this.registry.epoch(handle);
    if (cur === NOT_FOUND) return NOT_FOUND;
    const next = cur + 1;
    this.registry.setEpoch(handle, next);
    const ev: PageEvent = { kind: 'nav', handle_id: handle.handle_id, nav_epoch: next, seq: this.seq++ };
    this.enqueue(handle.handle_id, ev);
    return ev;
  }

  // Drain the ordered events observed so far for a handle.
  drain(handle: PageHandle): readonly PageEvent[] {
    const q = this.queues.get(handle.handle_id) ?? [];
    const out = q.slice();
    q.length = 0;
    return out;
  }
}
