# DO-012 — Companion notes

Not part of the drawing. Open questions, contradictions found in the parent
architecture doc (Browser OS, Rev 0.1), and roads not taken. Everything that
could become a decision is on the sheet; this file holds what could not.

## Contradictions found in the parent doc

1. **`act()` is open in the parent, gated in the thesis.** Rev 0.1 gives
   `RenderSurface.act()` to any holder of a `PageHandle`, while L4's stated
   purpose is that every consequential action passes the control plane. As
   written, L2 could call `act()` directly and no L4 guarantee would hold.
   DO-012 resolves this by adding the ExecutionTicket parameter to `act()`
   (contract row, RenderSurface additions). The parent doc needs the same
   change in its own next revision, or the two sheets disagree.

2. **Capability tokens vs "no fully-autonomous payments."** The parent's
   token shape (`tier: transact`, `budget`) implies a token could authorize
   spending by itself; §L4 simultaneously says transact always requires a
   human gate. DO-012 resolves in favor of the human gate: MONETARY is an
   unconditional CONFIRM floor, and token budgets only bound what an approval
   may authorize, never replace one.

3. **PageGraph lacks the fields the control plane needs.** Rev 0.1's
   `snapshot()` promises stable node ids but says nothing of `nav_epoch`,
   `workspace_id`, or per-node digests — all load-bearing for grant binding.
   Specified as contract rows here; the PageGraph DO sheet, when drawn,
   must carry them.

4. **"Page content enters as data, never as instructions" is listed as
   mitigation №1** but is probabilistic with an LLM in the loop. DO-012
   treats it as defence-in-depth only; no tolerance on the sheet depends on
   it. The parent doc's threat-model section reads as if it were structural.

## Open questions (no decision possible at this revision)

1. **Composite multi-page actions.** A task spanning several handles (pay on
   page A using a code from page B) currently needs one grant per action.
   Whether a single approval may cover a declared multi-action plan — and
   what its StateBinding would hash — is unresolved; it needs L5 input.

2. **Approval fatigue.** CONFIRM on every irreversible action is correct for
   v1 and will be noisy at scale. Standing grants ("always allow archiving
   in this mailbox") are a policy-schema extension with real injection
   surface; deferred until usage data exists.

3. **Failed-payment budget release.** Debit-at-dispatch means a failed
   payment consumes cap until an operator-approved credit. Automatic release
   on a verifiable failure signal would need a trustworthy failure oracle at
   L1; none exists yet.

4. **Clock trust.** TTLs use the local monotonic clock via the injected
   clock source. A hostile local clock is out of scope for v1 (the machine
   owner is the principal), but a future managed tier changes that.

## Roads not taken

- **Privileged skill fast-path.** Compiled skills (L2/P4-moat) could bypass
  the gate for previously-approved trajectories. Rejected: skills replay in
  changed page states; every skill step submits proposals like any other
  caller. Determinism makes them cheap, not trusted.
- **Whole-page hash in StateBinding.** Rejected as too brittle — ads and
  clocks mutate constantly. Binding covers the target subtree and enclosing
  form values only.
- **Ed25519 signatures and external WORM anchoring for the audit chain.**
  Retained as Rampart's docstring notes them: a future revision, HMAC is
  sufficient for a local-first v1 with per-workspace keys.
- **OS keychain for vault keys.** Owner-only key files match Rampart's
  posture and are portable across the three target platforms; keychain
  integration is an implementation upgrade that changes no contract.
- **Regex danger-flags on raw payloads** (Rampart's `_DANGER` table).
  Replaced by classification over resolved PageGraph semantics; raw-string
  pattern matching on web payloads is both noisy and evadable.
