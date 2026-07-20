# DO-012 — Browser OS Action Control Plane (implementation)

Manufactured from [`designs/browser-os-action-control-plane/LLD.md`](../../designs/browser-os-action-control-plane/LLD.md).
The L4 security core: the deterministic authorization and evidence layer between
the agent runtime (L2) and every consequential action executed through
RenderSurface (L0). It answers one question — *may this specific action, in this
session state, execute now?* — and records the answer as tamper-evident evidence.

TypeScript, zero runtime dependencies (AES/HMAC/SHA-256 from `node:crypto`). Tests
run on Node's built-in runner with native type stripping.

```
npm install        # dev-only: typescript + @types/node
npm run typecheck   # tsc --noEmit
npm test            # node --experimental-transform-types --test
```

## Bill of materials → source

| Part | Name | File |
|------|------|------|
| P1 | action-proposal-contract | `src/contract.ts` (+ `src/types.ts`) |
| P2 | action-resolver | `src/resolver.ts` |
| P3 | policy-store | `src/policyStore.ts` |
| P4 | policy-engine | `src/engine.ts` |
| P5 | approval-gate | `src/gate.ts` |
| P6 | capability-vault | `src/vault.ts` |
| P7 | audit-log | `src/audit.ts` |

Shared: `src/canonical.ts` (canonical serialization, SHA-256, HMAC). Boundaries
(`src/boundary.ts`): `RenderSurface` (DO-013), `Perception` (DO-014), and
`ApprovalSheet` (L6) are interfaces; the workspace key source (DO-019) is a
`WorkspaceKeySource`. Tests wire stubs behind each.

## The four injection guarantees

The whole subsystem exists so that a fully-injected, fully-jailbroken agent still
cannot cross four lines. Each is exercised directly by the Op 90 battery, and holds
because the gate is the single choke point:

1. **No credential read** — the vault streams a secret into the page below L0 and
   returns only a boolean; the value appears in no result, snapshot, event, or
   audit record (`op90`, `op60`).
2. **No spend past the cap** — integer minor-unit accounting with debit-at-dispatch;
   a stream of small payments stops exactly at the monthly cap (`op90`).
3. **No ungated irreversible/monetary action** — those verdicts are CONFIRM; without
   a state-bound `ApprovalGrant` nothing dispatches (`op70`, `op80`, `op90`).
4. **No cross-workspace reach** — a proposal whose workspace differs from the
   handle's blocks on `CROSS_WORKSPACE` (`op90`).

Session continuity is the hardest part and is enforced by re-resolving against a
fresh snapshot at dispatch: navigation, target/form mutation, amount change, or a
policy reload between approval and dispatch all break the `StateBinding` and refuse
the grant (`op80`).

## Verification

- `npm run typecheck` (tsc, strict) — clean
- `npm test` — **49/49 pass**, each `test/opNN.*.test.ts` encoding the matching
  Process Plan inspection (Op 10 through Op 110)
- **Both latency budgets met**: resolve ~10 ms on a 20000-node snapshot (budget
  100 ms), evaluate p99 ~0.006 ms (budget 20 ms)
- The audit log is a real hash-chained, HMAC-signed evidence log: a flipped byte,
  a deleted line, or a swapped pair is caught at the exact line (`op20`); a
  three-action session reconstructs from the log alone with every event inside the
  closed taxonomy (`op110`).

## Not in scope here

The production RenderSurface (DO-013, already built), PageGraph provider (DO-014,
already built), and approval-sheet UI (L6) — all behind the interfaces this
implementation targets. Reuse from the Rampart prototype is realized here: the
audit log is PORTED, the policy engine and stores are SKELETON, the resolver and
gate are NEW — as the drawing's reuse discipline specifies.
