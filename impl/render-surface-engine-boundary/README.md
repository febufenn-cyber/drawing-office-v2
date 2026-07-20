# DO-013 — Render Surface Engine Boundary (implementation)

Manufactured from [`designs/render-surface-engine-boundary/LLD.md`](../../designs/render-surface-engine-boundary/LLD.md).
The L0 boundary between the agent-native layers and a commodity rendering
engine: it owns the engine and exposes pages only through the engine-neutral
`RenderSurface` contract, so the engine is swappable and no code above L0 ever
touches it.

TypeScript, zero runtime dependencies. Tests run on Node's built-in test runner
with native type stripping — the "language stdlib, unit test runner" tooling the
drawing's Process Plan calls for.

```
npm install        # dev-only: typescript + @types/node for typechecking
npm run typecheck   # tsc --noEmit
npm test            # node --experimental-transform-types --test
```

## Bill of materials → source

| Part | Name | File |
|------|------|------|
| P1 | render-surface-contract | `src/renderSurface.ts` |
| P2 | page-handle-registry | `src/registry.ts` |
| P3 | session-partitioner | `src/partitioner.ts` |
| P4 | cdp-driver | `src/cdpDriver.ts` |
| P5 | ticket-verifier | `src/ticket.ts` |
| P6 | secret-fill-channel | `src/secretFill.ts` |
| P7 | event-multiplexer | `src/eventMux.ts` |

Shared: `src/types.ts` (engine-neutral contract types), `src/digest.ts`
(canonical serialization, per-node stable digest, action digest, HMAC).

## The engine seam

Everything engine-specific lives behind one interface, `RawEngine`
(`src/driver.ts`). P3 and P4 are engine-neutral logic built over it. Two
in-memory implementations exist:

- `StubEngine` — the acceptance and leak-detection harness.
- `AltStubEngine` — a second, internally different implementation, used to prove
  engine-swappability (Op 110): the same acceptance suite passes on both with no
  change above L0.

The production driver is an `ElectronCdpEngine` implementing the same `RawEngine`
interface (wrapping `webContents.debugger` and Electron session partitions). It
is the one remaining adapter and is not exercised in a headless build; nothing
above the seam changes when it is added.

## Process Plan → tests

Each `test/opNN.*.test.ts` encodes the inspection of the corresponding Process
Plan op:

| Op | Inspection | Test |
|----|------------|------|
| 10 | handle identity, epoch monotonicity | `op10.registry.test.ts` |
| 20 | ticket verification and single-use | `op20.ticket.test.ts` |
| 30 | secret fill, masking, no leak | `op30.secretFill.test.ts` |
| 40 | stable digests, stamping, marks, injection | `op40.driver.test.ts` |
| 50 | nav-epoch, ordering, nav never dropped | `op50.eventMux.test.ts` |
| 60 | one partition per workspace, cookie isolation | `op60.partitioner.test.ts` |
| 70 | contract dispatch, ticket gate, ctx refusal | `op70.contract.test.ts` |
| 80 | ticket and epoch invalidation battery | `op80.invalidation.test.ts` |
| 90 | adversarial secret and ticket battery | `op90.adversarial.test.ts` |
| 100 | 20000-node snapshot latency | `op100.latency.test.ts` |
| 110 | engine swap and import-graph confinement | `op110.swap.test.ts` |

The four security guarantees the sheet tolerances — a filled credential never
crosses L0, every consequential action requires a valid single-use ticket, a
stale grant cannot survive navigation or mutation, and no workspace reaches
another's partition — are exercised by ops 30, 80, 90, and 60 respectively.
