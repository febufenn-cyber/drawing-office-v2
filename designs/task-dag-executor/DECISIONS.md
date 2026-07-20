# DO-016 — Companion notes

Not part of the drawing. Open questions, contradictions found in the parent
architecture doc (Browser OS, Rev 0.1), and roads not taken. Everything that
could become a decision is on the sheet; this file holds what could not.

## Contradictions found in the parent doc

1. **"Every run is replayable from its log" versus nondeterministic model
   calls.** Rev 0.1 §L2 promises replay, but a literal replay that re-issues
   the planner and extraction model calls is not reproducible — the same
   prompt yields different tokens. DO-016 resolves by recording model and
   skill outputs at first execution and replaying the recorded outputs, so
   replay is deterministic and side-effect-free but does not re-exercise the
   model. The parent doc conflates replay with re-execution; they are not the
   same operation.

2. **Crash-resume versus at-most-once on consequential actions.** The parent
   says a crash "resumes from the last checkpoint," but a consequential step
   has a real in-doubt window: the control plane (DO-012) may have executed
   the act after DO-016 wrote its pre-dispatch record and before it wrote the
   settle record. Blindly resuming would risk a duplicate payment or send.
   DO-016 resolves in favor of safety — an in-doubt consequential step halts
   and never auto-resubmits — which means resume is not always fully
   automatic. The parent doc reads as if resume were unconditional.

3. **`navigate` tier.** The parent lists `navigate` as a plain step kind and
   elsewhere treats read-tier navigation as ungated, while DO-012's resolver
   classifies navigation as an act-class RenderSurface operation. DO-016
   routes every act-class effect, navigation included, through DO-012 rather
   than calling RenderSurface `act`, resolving in favor of the L4 rule that
   nothing above L0 reaches a consequential effect except through the control
   plane.

4. **Durability of workspace state is assumed, not specified.** "Laptop
   lid-close resumes from the last checkpoint" requires that checkpoints and
   the log survive process death, but Rev 0.1's L3 store gives no durability
   contract. DO-016 depends on a durable, flush-before-ack per-workspace
   put/append from DO-019 and states it as a boundary tolerance; the DO-019
   sheet must carry the matching guarantee or the resume promise is hollow.

## Open questions (no decision possible at this revision)

1. **In-doubt reconciliation oracle.** Clearing an in-doubt consequential
   step requires knowing whether its prior submission executed. DO-012 owns
   the audit record that would answer this, but exposes no
   disposition-by-idempotency-key query. Until it does, in-doubt steps need
   orchestration or operator reconciliation. This is a needed DO-012 boundary
   revision, not something DO-016 can settle alone.

2. **Checkpoint granularity for long steps.** A single model-driven step that
   runs for minutes carries no sub-step checkpoint; an interruption mid-step
   re-runs the whole step. Sub-step checkpointing would need cooperation from
   DO-017 streaming and a partial-output contract that does not exist yet.

3. **Skill-library drift across a resume.** A run pins a skill-library
   snapshot ref so strategy resolution is deterministic. Whether a run
   resumed after the library changed should keep its pinned snapshot or adopt
   newer, possibly better skills is a policy question spanning DO-018 and
   DO-020.

4. **Dynamic graphs.** The schema is a static DAG. Tasks that discover new
   steps at runtime — fan-out over extracted rows — need graph mutation
   mid-run. Whether that mutation lives in DO-016 or belongs to DO-020
   orchestration is unresolved; keeping the DAG static preserves replay
   determinism, which argues for pushing fan-out up to L5.

5. **Retention and garbage collection.** The run-log and checkpoints grow
   unbounded per workspace. A retention policy is a DO-019 storage concern;
   DO-016 states durability but not lifetime.

## Roads not taken

- **Verifier-hook as its own part.** The candidate BOM listed one; it is
  folded into the dispatcher. `verify` is a step kind dispatched like any
  other, and its postcondition check is a thin tail of dispatch. A standalone
  module bought nothing and cost a node against the 12-node assembly ceiling.

- **Merging checkpoint-store and run-log into one store.** Rejected.
  Checkpoints are latest-wins state read for fast resume; the log is
  append-only history read for replay. One structure would either bloat the
  resume read or weaken the replay ordering guarantee.

- **Optimistic auto-resubmit of in-doubt steps.** Rejected. A duplicated
  transaction is worse than a halt, so at-most-once beats liveness for
  consequential steps. Liveness returns through reconciliation, not through
  guessing.

- **Re-running the model during replay.** Rejected. Replay must be
  deterministic and free of side effects; the recorded outputs are the truth
  of what happened, and a fresh model call would fabricate a different run.

- **Speculative parallel execution of independent ready steps.** The
  scheduler yields a single deterministic next step. Parallel fan-out is
  DO-020's job; keeping it out preserves replay determinism and a single
  linear log.

- **Content-addressed step outputs in the log.** Considered for
  deduplication of large repeated outputs; deferred to DO-019 as a storage
  concern rather than encoded into the executor's log format.
