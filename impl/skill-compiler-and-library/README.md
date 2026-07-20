# DO-018 — Skill Compiler and Library (implementation)

Manufactured from [`designs/skill-compiler-and-library/LLD.md`](../../designs/skill-compiler-and-library/LLD.md).
The L2 subsystem that compiles a **successful trajectory** into a verified,
parameterized, replayable **skill** and manages its lifecycle — so a task that once
cost a full model-driven run resolves to a cheap deterministic replay. A skill is a
**script, not a recording**: each step names a stable node **locator** (role,
accessible-name pattern, structural path), never a raw selector or a
snapshot-specific node id, so it survives minor DOM drift by resolving to a fresh
stable node id against the replay snapshot.

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
| P1 | skill-format | `src/format.ts` | op10 |
| P2 | trajectory-generalizer | `src/generalizer.ts` | op30 |
| P3 | sandbox-verifier | `src/verifier.ts` | op40 |
| P4 | skill-library | `src/library.ts` | op20 |
| P5 | promotion-controller | `src/controller.ts` | op60 |
| P6 | replay-monitor | `src/monitor.ts` | op50 |

Shared: `src/types.ts` (Skill / Trajectory / record and result types), `src/seams.ts`
(the three consumed subsystems as interfaces), `src/canonical.ts` (canonical
serialization + SHA-256), `src/index.ts`.

## Seams (this subsystem's dependencies)

All three are interfaces here; tests supply in-memory stubs. The executor (DO-016)
is the *caller* of this subsystem — it submits trajectories, reports replay
outcomes, and queries the two lookups.

- **DO-013 RenderSurface** — behind `RenderSurface` (`open`/`snapshot`/`act`); the
  verifier opens **only a sandbox partition**, isolated from every production
  partition.
- **DO-017 model router** — behind `ModelRouter`; a `generalizer` role proposes the
  lift and a **distinct** `verifier` role grades the replay. The router's role
  identities enforce that the verifier never grades its own work.
- **DO-019 workspace store** — behind `WorkspaceStore`; skill records, monitor
  counters, and re-learning requests persist durably (flush before serve).

## Verification

- `npm run typecheck` (tsc, strict — NodeNext, `verbatimModuleSyntax`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) — clean
- `npm test` — **52/52 pass** (op10–op90), stable across repeated runs, each
  `test/opNN.*.test.ts` encoding the matching Process Plan inspection

The load-bearing guarantees are exercised directly:

- **Model proposes, post-check judges** (op30): the generalizing model marks which
  values become typed parameters and which node ids become locators; a deterministic
  post-check re-binds the candidate to the source inputs and rejects it (`SHAPE_INVALID`
  / `SOURCE_DIVERGED`) before any verification cost is spent.
- **Adversarial verification** (op40, op80): the grader is a **different model** than
  the generalizer (distinct router role); a candidate whose provenance names the
  verifier role is refused `VERIFIER_NOT_INDEPENDENT` and never graded.
- **Sandbox isolation, no commit** (op40, op70): every replay act lands on the
  sandbox partition and none on production; a terminal irreversible/monetary step is
  bound and resolved to prove the script reaches it, but its committing effect is
  never executed in the sandbox.
- **Exact / nearest / demoted** (op20): `lookup_exact` returns a promoted skill only
  when every locator binds against the referenced snapshot; `lookup_nearest` returns
  it regardless and names the unbound-locator gaps; a demoted skill is served by
  neither — realizing the executor's exact → patched → model-run order.
- **Debounced demotion** (op50, op70): a bounded recent-window failure threshold
  raises **exactly one** demotion signal per crossing; the controller (the sole
  status writer) demotes, records one re-learning request, and clears the latch so a
  re-learned skill can be monitored anew.
- **Determinism** (op80): an identical trajectory with fixed models yields a
  byte-identical candidate and `skill_id`; both lookups are deterministic for a fixed
  library version and snapshot.

Latency (op90) meets budget: `lookup_exact` p99 well under 10 ms on a 5000-skill
library, generalizer overhead under 30 ms and verifier orchestration under 50 ms
(both excluding the model and page wait).
