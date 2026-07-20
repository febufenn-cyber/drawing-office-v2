# DO-017 — Model Router (implementation)

Manufactured from [`designs/model-router/LLD.md`](../../designs/model-router/LLD.md).
The L2 subsystem that binds each agent role to a concrete model under a
per-workspace routing policy, holds the caller's own provider keys encrypted, and
guarantees that **a verifier never runs on the model that produced the artifact
under review**.

TypeScript, zero runtime dependencies (AES/HMAC from `node:crypto`). Tests run on
Node's built-in runner with native type stripping.

```
npm install        # dev-only: typescript + @types/node
npm run typecheck   # tsc --noEmit
npm test            # node --experimental-transform-types --test
```

## Bill of materials → source

| Part | Name | File |
|------|------|------|
| P1 | routing-policy | `src/policy.ts` |
| P2 | role-classifier | `src/roleClassifier.ts` |
| P3 | key-store | `src/keyStore.ts` |
| P4 | provider-adapter | `src/providerAdapter.ts` |
| P5 | independence-guard | `src/independence.ts` |
| P6 | cost-meter | `src/costMeter.ts` |
| P7 | route-dispatcher | `src/dispatcher.ts` |

Shared: `src/types.ts`, `src/crypto.ts` (AES-256-GCM for keys at rest, HMAC for
the producer-tag mac, canonical serialization).

## Seams (this subsystem's dependencies)

- **Providers** sit behind `ProviderTransport` — a real provider performs the HTTP
  call with the key in the transport auth argument, never in the body. Tests use
  in-memory stubs.
- **Budget manager (DO-020)** is behind the `BudgetManager` interface. DO-020 is a
  *feedback edge* in the register (DO-017 ↔ DO-020), so — exactly as the
  manufacture order prescribes — this is built against a **stub** budget manager;
  the real one slots in unchanged.
- **Workspace keys (DO-019)** are behind `WorkspaceKeySource`; BYO provider keys
  are AES-256-GCM sealed under the per-workspace key.

## Verification

- `npm run typecheck` (tsc, strict) — clean
- `npm test` — **39/39 pass**, each `test/opNN.*.test.ts` encoding the matching
  Process Plan inspection
- **Op 100 meets its budget**: dispatch overhead p99 ≈ 0.2 ms vs the 15 ms budget

The hard guarantees are exercised directly: the independence battery (op80) shows
no verify request ever routes to the producing model across the model, family, and
provider axes, forged producer tags are rejected by the session mac, and a
single-frontier pool yields `independence_unsatisfiable` with zero provider calls;
the key battery (op90) shows no provider-key byte reaches a caller, log, or cost
record (the key lives only in the transport auth); cost is exact integer minor-unit
arithmetic with per-bucket round-up (op60); and the dispatcher is the sole path to
a provider call, with exactly one call and one cost record per admitted request and
zero calls on any fail-closed branch (op70).

Unlike DO-014 and DO-019, this subsystem has **no latency gap** — the routing hot
path is orchestration, not hashing, so it meets the drawing's timing tolerance
outright.
