// Schedule arithmetic over epoch-seconds instants: a schedule fires at anchor,
// anchor+interval, anchor+2*interval, ... These are shared by the trigger-store
// (recompute next_fire_at on reload) and the trigger-engine (advance past now).

import type { Schedule } from './types.ts';

// The smallest scheduled instant strictly greater than `now`.
export function nextAfter(s: Schedule, now: number): number {
  if (now < s.anchor) return s.anchor;
  const k = Math.floor((now - s.anchor) / s.interval_seconds) + 1;
  return s.anchor + k * s.interval_seconds;
}

// The largest scheduled instant less than or equal to `now` (the most recent due
// instant). Used to coalesce a downtime that spanned several instants to one fire.
export function largestLE(s: Schedule, now: number): number {
  if (now < s.anchor) return s.anchor;
  const k = Math.floor((now - s.anchor) / s.interval_seconds);
  return s.anchor + k * s.interval_seconds;
}
