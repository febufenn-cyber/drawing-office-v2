# DO-020 — Companion notes

Not part of the drawing. Open questions, contradictions found in the parent
architecture doc (Browser OS, Rev 0.1), and roads not taken. Everything that
could become a decision is on the sheet; this file holds what could not.

## Contradictions found in the parent doc

1. **"The machine works while the user doesn't" versus "no fully-autonomous
   payments, period."** §L5 sells triggers as autonomous background work and
   §L4 forbids autonomous transact and puts a human gate on every transact
   tier. A trigger phrased as "watch this price and buy when it drops" cannot
   satisfy both. DO-020 resolves in favour of the gate: a background trigger
   may research and prepare a transact, but the monetary action still routes
   through DO-012 and parks at the human gate. "Watch and buy" is realised as
   "watch and prompt". The parent doc's L5 copy needs the same qualifier or
   the two sheets disagree on what a trigger may do unattended.

2. **Three homes for the money limit.** §L3 gives each workspace "a budget",
   §L4 owns per-workspace spend caps, and §L5 owns a budget manager with
   money ceilings. Read literally, three subsystems each cap money. DO-020
   layers them rather than duplicating: the per-task token, time, and money
   ceiling lives in the L5 budget-manager (P3); the per-workspace monetary cap
   and the human gate live in DO-012; the ledger of record lives in DO-019.
   P3 reads the other two and authorizes nothing. If a future revision moves
   any cap between layers, P3's reserve pseudocode changes.

3. **Verifier independence under fan-out.** §L2 requires the verifier to be a
   different model than the one that produced the work. Under fan-out, N
   sub-agents may all run the same cheap extraction model, so "different from
   the producer" is ambiguous when there are many producers. DO-020 reads it
   as "distinct from every producing role in the fan-out" and draws the verify
   role from DO-017 on that basis. Whether the router can always supply a
   distinct role within budget is a DO-017 concern, recorded here as the
   coordination boundary it is.

## Open questions (no decision possible at this revision)

1. **Event-source trust.** Event-driven triggers subscribe to page-derived
   signals, and a page that lies moves the trigger. Whether event evaluation
   needs its own verify pass, and whether the event-source registry belongs
   in L1 perception or L5 orchestration, is unresolved and needs DO-014 input.

2. **Fan-out width policy.** Who sets N — the L2 planner, a fixed cap, or a
   function of the money ceiling — is undecided. The right answer depends on
   cost-per-completed-task data that does not exist before Phase 1.

3. **Catch-up semantics beyond coalescing.** Coalescing missed instants to a
   single fire is correct for "brief me every morning" and wrong for a trigger
   where every instant matters (one run per invoice). A per-trigger catch-up
   policy is a trigger-store schema extension; the schema here carries only the
   coalescing behaviour.

4. **Cross-task budget contention.** Ceilings are per task. A workspace running
   many background triggers can collectively exhaust the monthly cap with no
   L5 arbiter between tasks. Whether L5 needs a workspace-level fair-share
   scheduler, or whether DO-012's per-workspace cap plus DO-019's ledger is a
   sufficient backstop, is unresolved.

## Roads not taken

- **A "trusted trigger" flag that authorizes autonomous transact.** Rejected:
  every transact keeps the DO-012 human gate. A trigger the user trusts is
  still a trigger acting on injected page content, so the gate is the
  structural guarantee, not a per-trigger opt-out.
- **Budget-manager owning the ledger of record.** Rejected: DO-019 owns the
  ledger and P3 reads it. A second source of spend truth would drift across
  restarts and across the background-runner and the interactive path.
- **A distributed job queue for background runs.** Rejected for a local-first
  single-machine v1: the durable trigger-store plus one runner loop with an
  active-run guard covers the scheduling need without a broker to operate.
- **Speculative pre-fetch of sub-agent pages before reservation.** Rejected: a
  task that fails its ceiling must spend nothing, so reservation strictly
  precedes any dispatch or fetch.
- **Per-sub-agent independent verification.** Rejected: verification runs once
  over the merged artifact so cross-source contradictions between sub-agents
  surface. Verifying each sub-result in isolation would miss exactly the
  disagreements the merge exists to reconcile.
