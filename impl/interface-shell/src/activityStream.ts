// P3 — activity-stream. Turns DO-016 run-log events into a human-readable feed: one
// ActivityItem per surfaced event, in strict run-log seq order. It is read-only — an
// item may link to a ref, but the stream carries no control path; nothing in the
// feed submits work or approves an action. SURFACED is a fixed subset of DO-016's
// fourteen-event taxonomy (all but step.strategy_chosen and step.pre_dispatch);
// non-surfaced events project to none. Because each item is keyed on the run-log
// seq, replaying a run's log reconstructs a byte-identical feed.

import type { ActivityItem, ActivityKind, RunEvent, RunEventName } from './types.ts';

interface Spec {
  readonly kind: ActivityKind;
  readonly text: (e: RunEvent) => string;
  readonly ref: (e: RunEvent) => string | null;
}

function label(e: RunEvent): string {
  const id = e.data['step_id'];
  return typeof id === 'string' ? id : 'step';
}
function dataRef(e: RunEvent, key: string): string | null {
  const v = e.data[key];
  return typeof v === 'string' ? v : null;
}

const SURFACED: Partial<Record<RunEventName, Spec>> = {
  'run.started': { kind: 'lifecycle', text: () => 'Run started', ref: () => null },
  'step.ready': { kind: 'step', text: (e) => label(e) + ' ready', ref: () => null },
  'action.submitted': { kind: 'action', text: () => 'Action proposed', ref: (e) => dataRef(e, 'proposal_ref') },
  'perception.read': { kind: 'evidence', text: () => 'Read a page', ref: (e) => dataRef(e, 'snapshot_ref') },
  'step.succeeded': { kind: 'step', text: (e) => label(e) + ' done', ref: () => null },
  'step.failed': { kind: 'alert', text: (e) => label(e) + ' failed', ref: () => null },
  'step.skipped': { kind: 'step', text: (e) => label(e) + ' skipped', ref: () => null },
  'step.in_doubt': { kind: 'alert', text: (e) => label(e) + ' in doubt', ref: () => null },
  'run.paused': { kind: 'lifecycle', text: () => 'Run paused', ref: () => null },
  'run.resumed': { kind: 'lifecycle', text: () => 'Run resumed', ref: () => null },
  'run.completed': { kind: 'lifecycle', text: () => 'Run completed', ref: () => null },
  'replay.started': { kind: 'lifecycle', text: () => 'Replay started', ref: () => null },
};

// Project one event to an activity item, or null if it is not surfaced.
export function projectActivity(event: RunEvent): ActivityItem | null {
  const spec = SURFACED[event.event];
  if (spec === undefined) return null;
  return { seq: event.seq, ts: event.ts, kind: spec.kind, text: spec.text(event), ref: spec.ref(event) };
}

// The ordered feed for a run's events, in seq order, surfaced events only.
export function feed(events: readonly RunEvent[]): ActivityItem[] {
  return [...events]
    .sort((a, b) => a.seq - b.seq)
    .map(projectActivity)
    .filter((x): x is ActivityItem => x !== null);
}
