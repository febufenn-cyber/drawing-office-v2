# DO-020 — Agent Orchestration Layer (implementation)

Manufactured from [`designs/agent-orchestration-layer/LLD.md`](../../designs/agent-orchestration-layer/LLD.md).
The L5 layer that **fans out agents under enforced per-task budgets** and runs
**scheduled and event-driven background tasks** over the task DAG executor, so the
machine works while the user does not. This subsystem's `BudgetManager` is the
**real one that closes the DO-017 ↔ DO-020 feedback edge** — DO-017 was built
against a budget-manager stub, and this is the interface it targeted.

TypeScript, zero runtime dependencies (`node:crypto` for SHA-256 only). Tests run
on Node's built-in runner with native type stripping.

```
npm install        # dev-only: typescript + @types/node
npm run typecheck   # tsc --noEmit
npm test            # node --experimental-transform-types --test
```

## Bill of materials → source

| Part | Name | File | Op test |
|------|------|------|---------|
| P1 | fanout-scheduler | `src/fanout.ts` | op40 |
| P2 | merge-verifier | `src/merge.ts` | op30 |
| P3 | budget-manager | `src/budget.ts` | op20 |
| P4 | trigger-store | `src/triggerStore.ts` | op10 |
| P5 | trigger-engine | `src/triggerEngine.ts` | op50 |
| P6 | background-runner | `src/runner.ts` | op60 |

Shared: `src/types.ts`, `src/seams.ts` (the four consumed subsystems as interfaces),
`src/canonical.ts`, `src/schedule.ts` (epoch-seconds schedule arithmetic), `src/index.ts`.

## Seams (this subsystem's dependencies)

All four are interfaces here; tests supply in-memory stubs.

- **DO-016 executor** — behind `Executor`; sub-agents reach pages only through it,
  under a reserved slice, and a budget-exhausted step returns a gap marker.
- **DO-019 ledger** — behind `Ledger`, **read-only**; the budget-manager reads
  month-to-date spend and the workspace cap and never writes them.
- **DO-017 model router** — behind `Router`; the merge-verifier draws a verify role
  distinct from every producing role.
- **DO-012 action control plane** — behind `ActionControlPlane`; every transact-tier
  action a background task takes still crosses the human gate, regardless of budget
  headroom.

## Verification

- `npm run typecheck` (tsc, strict — NodeNext, `verbatimModuleSyntax`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) — clean
- `npm test` — **46/46 pass** (op10–op100), stable across repeated runs

The load-bearing guarantees are exercised directly:

- **Disjoint fan-out** (op40, op70): the page set partitions into N workloads
  covering every page exactly once; each sub-agent gets a nonzero slice summing
  within the ceiling; an incomplete bucket surfaces a gap marker, never a silent drop.
- **Budget is a bound, not an authorization** (op20, op80): a reservation is granted
  only within every ceiling axis and against the ledger's live month-spend; the money
  ceiling shrinks what a task may *attempt* but the budget-manager holds no capability
  token — every transact-tier action still routes to the DO-012 human gate.
- **Deterministic merge, flag-not-delete verify** (op30): identical partials in any
  order collapse to a byte-identical artifact; an unsupported claim is flagged in
  place, never removed; the verify role differs from every producing role.
- **Durable triggers, coalesced catch-up** (op10, op50, op90): triggers and run
  history survive restart; a downtime spanning several scheduled instants coalesces
  to exactly one fire; a paused or expired trigger never fires.
- **At-most-once background runs** (op60, op90): a firing reserves before it
  dispatches (a denied reservation dispatches nothing); an active-run guard refuses a
  concurrent run; an interrupted run completes exactly once on recovery, never
  duplicated or lost.

Latency (op100) meets budget: reserve p99 well under 5 ms, fan-out dispatch overhead
under 50 ms per sub-agent, wake-to-dispatch under 100 ms (excluding executor time).
