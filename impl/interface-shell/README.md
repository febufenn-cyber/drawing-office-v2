# DO-021 — Interface Shell (implementation)

Manufactured from [`designs/interface-shell/LLD.md`](../../designs/interface-shell/LLD.md).
The L6 human surface over the agent layers: the **intent box**, live **task cards**,
the **activity feed**, the **approval sheet**, the **evidence panel**, and the
**ambient sidebar** that hosts them inline over normal browsing. This is the last
subsystem in the program — the piece the user actually touches.

The shell is a **pure projection**: it displays runs and never advances one. It
submits exactly one task per intent to DO-016 and thereafter only projects run state
and reads the workspace store. It imports no engine or Electron code — live page
rendering stays with L0 (op60 asserts this on the import graph).

TypeScript, zero runtime dependencies. Tests run on Node's built-in runner with
native type stripping.

```
npm install        # dev-only: typescript + @types/node
npm run typecheck   # tsc --noEmit
npm test            # node --experimental-transform-types --test
```

## Bill of materials → source

| Part | Name | File | Op test |
|------|------|------|---------|
| P1 | intent-box | `src/intentBox.ts` | op10 |
| P2 | task-card-model | `src/cardModel.ts` | op20 |
| P3 | activity-stream | `src/activityStream.ts` | op30 |
| P4 | approval-sheet | `src/approvalSheet.ts` | op50 |
| P5 | evidence-panel | `src/evidencePanel.ts` | op40 |
| P6 | ambient-sidebar | `src/sidebar.ts` | op60 |

Shared: `src/types.ts` (the view-models), `src/seams.ts` (the three consumed
subsystems as interfaces), `src/index.ts`.

## Seams (this subsystem's dependencies)

All three are interfaces here; tests supply in-memory stubs.

- **DO-016 executor** — behind `Executor`; the intent-box submits one task and
  receives a handle. The shell calls no run-advancing method.
- **DO-012 approval contract** — the approval-sheet renders an `ApprovalRequest` and
  returns an `ApprovalResponse` bound to the request_id.
- **DO-019 workspace store** — behind `WorkspaceRead`, read-only and scoped to the
  card's workspace partition.

## Verification

- `npm run typecheck` (tsc, strict — NodeNext, `verbatimModuleSyntax`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) — clean
- `npm test` — **39/39 pass** (op10–op90), stable across repeated runs

The load-bearing guarantees are exercised directly:

- **One intent, one task** (op10, op70): a string that parses as an absolute URL with
  a host routes to a navigate task, every other non-empty string to a task-intent, an
  empty-after-trim string is rejected; each accepted intent submits exactly one task.
- **Pure projection** (op20, op30, op70): a card is a pure function of run state
  (identical event streams yield an identical card, re-delivery is idempotent); the
  activity feed is one item per surfaced event in seq order (the two non-surfaced
  taxonomy events project to none) and replays byte-identical; no interface path
  executes or checkpoints a run.
- **Page content is always labeled** (op40, op80): every page-origin string in the
  approval sheet and the evidence panel is labeled *page content* — even a hostile
  corpus crafted to impersonate the shell — so a page cannot social-engineer the
  approver.
- **Approval binds to request_id** (op50, op80): a response is accepted only for the
  rendered request_id and only before `expires_at`; a foreign id is rejected and a
  late response lapses; placement in the sidebar changes where the sheet appears,
  never what it authorizes.
- **Scoped, read-only evidence** (op40): refs resolve only within the card's
  workspace; a dangling or cross-workspace ref renders *unavailable*, never as
  fabricated content.
- **No engine reach** (op60): attach/detach mutate no page or engine state, and no
  source imports an engine or Electron module.

Latency (op90) meets budget: card projection p99 well under the 50 ms event-to-card
budget; feed and evidence projections comfortably within it under load.
