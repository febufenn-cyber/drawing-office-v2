// P5 — trigger-engine. Ticks on the injected clock and a drained batch of
// subscribed events. A scheduled trigger fires once its next_fire_at is at or before
// now; the engine advances next_fire_at to the next instant strictly after now in
// the same step, so a downtime spanning several instants coalesces to exactly one
// fire rather than a burst. An event trigger fires once per tick on a match and
// never on a non-match. A paused or expired trigger never fires.

import { nextAfter } from './schedule.ts';
import type { TriggerStore } from './triggerStore.ts';
import type { OrchestrationEvent, Trigger } from './types.ts';

export interface Runner {
  enqueue(t: Trigger): void;
}

function eventMatched(t: Trigger, events: readonly OrchestrationEvent[]): boolean {
  return t.event_sub !== null && events.some((e) => e.type === t.event_sub!.event_type);
}

export function tick(now: number, events: readonly OrchestrationEvent[], store: TriggerStore, runner: Runner): number {
  const fired: Trigger[] = [];
  for (const t of store.load_armed(now)) {
    if (t.kind === 'scheduled' && t.schedule !== null && t.next_fire_at !== null && now >= t.next_fire_at) {
      t.next_fire_at = nextAfter(t.schedule, now); // coalesce missed instants
      fired.push(t);
    } else if (t.kind === 'event' && eventMatched(t, events)) {
      fired.push(t);
    }
  }
  for (const t of fired) {
    store.update(t, 'firing');
    runner.enqueue(t);
  }
  return fired.length;
}
