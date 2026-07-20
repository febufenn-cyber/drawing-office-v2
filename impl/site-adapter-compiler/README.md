# DO-015 — Site Adapter Compiler (implementation)

Manufactured from [`designs/site-adapter-compiler/LLD.md`](../../designs/site-adapter-compiler/LLD.md).
The L1 subsystem that turns one exploration of an origin into typed, self-testing
tools. An agent explores an origin once; the compiler generalizes that single
trajectory into a replayable `SiteAdapter` of typed tools; the adapter **replays
with no model call**, self-tests on a schedule, and **hot-swaps on drift,
fail-closed** — a re-learned adapter that does not pass health on the live origin
is never made current.

TypeScript, zero runtime dependencies (`node:crypto` for SHA-256 only). Tests run
on Node's built-in runner with native type stripping.

```
npm install        # dev-only: typescript + @types/node
npm run typecheck   # tsc --noEmit
npm test            # node --experimental-transform-types --test
```

## Bill of materials → source

| Part | Name | File |
|------|------|------|
| P1 | site-adapter-contract | `src/contract.ts` |
| P2 | exploration-recorder | `src/recorder.ts` |
| P3 | adapter-synthesizer | `src/synthesizer.ts` |
| P4 | adapter-store | `src/store.ts` |
| P5 | health-checker | `src/health.ts` |
| P6 | drift-detector | `src/drift.ts` |
| P7 | hot-swapper | `src/hotswap.ts` |

Shared: `src/types.ts` (the `SiteAdapter`/`Trajectory`/health records), `src/seams.ts`
(the external interfaces and stubs' contracts), `src/canonical.ts` (canonical
serialization, SHA-256, schema validation), `src/index.ts` (public surface and the
end-to-end `compile` flow).

## Seams (this subsystem's dependencies)

All three are interfaces here; tests supply in-memory stubs. No engine or Electron
symbol appears anywhere in the subsystem (Op 110 enforces this on the import graph).

- **PageGraph (DO-014)** is behind `PageGraph` — anchors are PageGraph stable node
  identities resolved by structural digest and role, never raw selectors. The
  compiler reads no raw HTML.
- **RenderSurface (DO-013)** is behind `RenderSurface` — every exploration step and
  every tool step acts by stable node id through the surface.
- **Model router (DO-017)** is behind `ModelRouter` — called **exactly once per
  compilation**, for structure only (tool names, typed schemas, and a parameter
  mark on each recorded literal). The replay and health paths call no model.

The model proposes structure; the trajectory supplies truth. Every anchor and
literal is bound from the recorded trajectory, never from model text, and a
proposed step whose anchor is absent from the trajectory is dropped, not invented.

## Verification

- `npm run typecheck` (tsc, strict — NodeNext, `verbatimModuleSyntax`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) — clean
- `npm test` — **63/63 pass**, each `test/opNN.*.test.ts` encoding the matching
  Process Plan inspection

The load-bearing guarantees are exercised directly:

- **Deterministic replay** (op20, op80): identical params against identical
  PageGraph state yield a byte-identical action sequence and record across repeated
  runs; an unresolved anchor returns `anchor_unresolved` with the step index and
  performs no further action — never a raw-selector fallback.
- **Model isolation** (op40, op80): synthesis makes exactly one model call; the
  replay and health paths make zero.
- **Total provenance** (op40, op100): every tool and every step resolves to a
  trajectory step; the adapter carries its whole trajectory's id.
- **Debounced drift** (op60, op90): each tool is classified healthy / drifted /
  broken against the compiled baseline; the adapter status is the worst tool
  status; drift and the re-learn signal fire only on the third consecutive failing
  run, so a single transient failure never triggers a re-learn.
- **Fail-closed hot-swap** (op70, op90): a candidate is promoted by atomic pointer
  swap only after it passes health on the live origin; a candidate failing health
  keeps the prior version live and marked degraded; an in-flight call finishes on
  the prior version while new calls bind the promoted one; at most one re-learn runs
  per origin, serialized by the lock.
- **Five-adapter corpus** (op100): two e-commerce, one flights, one news, and one
  docs origin each compile, expose typed tools, pass health, resolve provenance, and
  round-trip through the store byte-identical.

Like the other logic-layer subsystems, the two native dependencies (the Chromium
engine behind RenderSurface/PageGraph and the model provider behind the router)
are left behind seams; the reference core is complete and self-verified against the
sheet.
