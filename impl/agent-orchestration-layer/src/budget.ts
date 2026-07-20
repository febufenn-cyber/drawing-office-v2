// P3 — budget-manager. Enforces per-task token, time, and money ceilings. A
// reservation is granted only when the sum of live reservations plus the request
// stays within every ceiling axis. Money is checked twice — against the per-task
// ceiling and against the ledger's month-to-date spend read live at reservation
// time — so a task never reserves spend the ledger already shows over its
// workspace cap. The money ceiling bounds only what a task may *attempt*: the
// budget-manager emits no authorization and holds no capability token, so a lower
// ceiling can only shrink what a task may request, never raise a cap or replace the
// action control plane's human gate.

import type { Ledger } from './seams.ts';
import type { Actual, Ceiling, Request, Reservation, ReserveResult } from './types.ts';

interface Settlement {
  readonly committed: Actual;
  readonly released: Actual;
}

export class BudgetManager {
  private readonly live = new Map<string, Reservation[]>();
  private readonly settled = new Map<string, Settlement>();
  private counter = 0;

  constructor(private readonly ledger: Ledger) {}

  private liveFor(task_id: string): Reservation[] {
    let l = this.live.get(task_id);
    if (l === undefined) { l = []; this.live.set(task_id, l); }
    return l;
  }

  private sumLive(task_id: string): { tokens: number; seconds: number; money: number } {
    const acc = { tokens: 0, seconds: 0, money: 0 };
    for (const r of this.liveFor(task_id)) {
      acc.tokens += r.tokens; acc.seconds += r.seconds; acc.money += r.money_max_minor;
    }
    return acc;
  }

  reserve(task_id: string, workspace: string, ceiling: Ceiling, request: Request): ReserveResult {
    const live = this.sumLive(task_id);
    if (live.tokens + request.tokens > ceiling.tokens) return { granted: false, reason: 'TOKEN_CEILING' };
    if (live.seconds + request.seconds > ceiling.seconds) return { granted: false, reason: 'TIME_CEILING' };

    const projected = live.money + request.money_max;
    if (projected > ceiling.money_minor) return { granted: false, reason: 'MONEY_CEILING' };
    // Live read of the ledger — never cached past this reservation.
    const spent = this.ledger.month_spent(workspace);
    if (spent + projected > this.ledger.workspace_cap(workspace)) return { granted: false, reason: 'MONEY_CEILING' };

    const reservation: Reservation = {
      reservation_id: 'res-' + String(++this.counter),
      task_id, tokens: request.tokens, seconds: request.seconds, money_max_minor: request.money_max, granted: true,
    };
    this.liveFor(task_id).push(reservation);
    return { granted: true, reservation };
  }

  private remove(reservation: Reservation): boolean {
    const l = this.liveFor(reservation.task_id);
    const i = l.findIndex((r) => r.reservation_id === reservation.reservation_id);
    if (i < 0) return false;
    l.splice(i, 1);
    return true;
  }

  // Debits the measured actual and returns the unused remainder; committed plus
  // released equals reserved for every axis.
  commit(reservation: Reservation, actual: Actual): void {
    if (!this.remove(reservation)) return;
    this.settled.set(reservation.reservation_id, {
      committed: actual,
      released: {
        tokens: reservation.tokens - actual.tokens,
        seconds: reservation.seconds - actual.seconds,
        money_minor: reservation.money_max_minor - actual.money_minor,
      },
    });
  }

  release(reservation: Reservation): void {
    if (!this.remove(reservation)) return;
    this.settled.set(reservation.reservation_id, {
      committed: { tokens: 0, seconds: 0, money_minor: 0 },
      released: { tokens: reservation.tokens, seconds: reservation.seconds, money_minor: reservation.money_max_minor },
    });
  }

  remaining(task_id: string, ceiling: Ceiling): Ceiling {
    const live = this.sumLive(task_id);
    return {
      tokens: ceiling.tokens - live.tokens,
      seconds: ceiling.seconds - live.seconds,
      money_minor: ceiling.money_minor - live.money,
      currency: ceiling.currency,
    };
  }

  // Inspection: committed + released for a settled reservation (should equal reserved).
  settlement(reservation_id: string): Settlement | null {
    return this.settled.get(reservation_id) ?? null;
  }
}
