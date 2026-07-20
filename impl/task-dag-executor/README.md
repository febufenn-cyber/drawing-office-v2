# DO-016 — Task DAG Executor (implementation)

Manufactured from [`designs/task-dag-executor/LLD.md`](../../designs/task-dag-executor/LLD.md).
The L2 subsystem that executes an explicit task graph with **per-step checkpoints**
so any interruption — crash, model timeout, or laptop lid-close — resumes from the
last good step, and every finished run **replays from its log alone**. Consequential
steps are **at-most-once**: a step interrupted between its submission and its settle
record is marked in-doubt and never auto-resubmitted, because a duplicated payment
or send is worse than a stall.

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
| P1 | task-dag-schema | `src/schema.ts` | op10 |
| P2 | step-scheduler | `src/scheduler.ts` | op40 |
| P3 | checkpoint-store | `src/checkpointStore.ts` | op30 |
| P4 | step-dispatcher | `src/dispatcher.ts` | op50 |
| P5 | resume-controller | `src/controller.ts` | op60 |
| P6 | run-log | `src/runLog.ts` | op20 |

Shared: `src/types.ts` (TaskGraph / Checkpoint / RunEntry / result types),
`src/seams.ts` (the five consumed subsystems as interfaces), `src/canonical.ts`
(canonical serialization, SHA-256, the closed guard-expression evaluator),
`src/resolve.ts` (edge-driven input resolution, shared by P2 and P5), `src/index.ts`.

## Seams (this subsystem's dependencies)

All five are interfaces here; tests supply in-memory stubs. The executor never
reaches an engine.

- **DO-019 workspace store** — durable per-workspace KV + append log behind
  `WorkspaceStore`; a durable write flushes before its ack, so a checkpoint or a
  pre-dispatch record read back after a crash survives process death.
- **DO-012 action control plane** — behind `ActionControlPlane`; every
  consequential step (navigate, fill) submits an `ActionProposal` here, the **only**
  path to an act-class effect.
- **DO-013 RenderSurface** — behind `RenderSurface`, exposing only read-only
  `snapshot`/`observe`. This subsystem never calls `act`.
- **DO-017 model router** — behind `ModelRouter`; compare, gap-patch, and full-model
  reasoning. Replay issues zero model calls.
- **DO-018 skill library** — behind `SkillLibrary`; strategy resolution pinned to a
  snapshot ref. DO-018 is a register **feedback edge** (DO-016 ↔ DO-018), so — as the
  manufacture order prescribes — it is consumed here through a stub; the real one
  slots in unchanged.

## Verification

- `npm run typecheck` (tsc, strict — NodeNext, `verbatimModuleSyntax`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) — clean
- `npm test` — **46/46 pass** (op10–op90), each `test/opNN.*.test.ts` encoding the
  matching Process Plan inspection

The load-bearing guarantees are exercised directly:

- **Crash-resume equivalence** (op60): an uninterrupted run and a run crashed at
  each clean step boundary complete the same step set; no step with a honored
  checkpoint re-executes.
- **At-most-once / in-doubt** (op70): a consequential step submits to the control
  plane at most once across repeated crash-resume cycles; a step interrupted after
  its submit but before its settle record is marked `in_doubt` and halts without
  auto-resubmitting; every act-class submission is preceded by its durable
  pre-dispatch record.
- **Deterministic, side-effect-free replay** (op80): identical graph and checkpoint
  state yield a byte-identical schedule and event sequence; replay reconstructs the
  recorded sequence from the log alone with zero model, skill, control-plane, or
  RenderSurface calls.
- **Honored-checkpoint resume** (op30): a checkpoint is honored only when its
  `input_digest` equals the step's currently resolved digest — if an upstream output
  changed under a crash, the checkpoint is invalidated and the step re-runs.
- **Deterministic scheduling** (op40): the ready set is predecessors-satisfied minus
  terminal, ordered ascending by `step_id`; a stale succeeded checkpoint re-enters
  the ready set.

Latency (op90) meets budget on the reference corpus: `ready_set` p99 ≈ 1.3 ms on a
5000-step graph (5 ms budget) and dispatcher overhead p99 well under the 15 ms
budget excluding model, perception, and control-plane wait.
