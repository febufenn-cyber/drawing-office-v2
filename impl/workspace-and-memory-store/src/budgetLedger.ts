// P8 — budget-ledger. A workspace's credential scope, budget caps, and
// append-only spend entries, inside the workspace partition. Entries are
// monotonic in seq; a debit never mutates a prior entry, and a reversal is a
// further entry. The month sum is exact to the minor unit and independent of
// read order.

import type { Partition } from './partition.ts';
import type { Budget, BudgetState, CredentialScope, LedgerEntry } from './types.ts';

const STATE = 'budget_state';
const LEDGER = 'ledger';

function sameUtcMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

export class BudgetLedger {
  constructor(
    private readonly partition: Partition,
    private readonly now: () => Date,
  ) {}

  init(state: BudgetState): void {
    this.partition.put(STATE, 'state', state);
  }

  private state(): BudgetState | null {
    return this.partition.get<BudgetState>(STATE, 'state');
  }

  caps(): Budget | null {
    return this.state()?.caps ?? null;
  }

  credentialScope(): CredentialScope | null {
    return this.state()?.credential_scope ?? null;
  }

  private entries(): LedgerEntry[] {
    return this.partition.all<LedgerEntry>(LEDGER).sort((a, b) => a.seq - b.seq);
  }

  debit(amount_minor: number, currency: string, ref: string): LedgerEntry {
    const seq = this.entries().length;
    const entry: LedgerEntry = { seq, ts: this.now().toISOString(), amount_minor, currency, ref };
    this.partition.put(LEDGER, String(seq), entry);
    return entry;
  }

  monthSpent(): number {
    const now = this.now();
    let sum = 0;
    for (const e of this.entries()) {
      if (sameUtcMonth(new Date(e.ts), now)) sum += e.amount_minor;
    }
    return sum;
  }
}
