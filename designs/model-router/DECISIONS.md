# DO-017 — Companion notes

Not part of the drawing. Open questions, contradictions found in the parent
architecture doc (Browser OS, Rev 0.1), and roads not taken. Everything that
could become a decision is on the sheet; this file holds what could not.

## Contradictions found in the parent doc

1. **"Verification uses a different model" has no carrier in the parent.**
   Rev 0.1 §L2 requires the verifier to differ from the model that produced
   the work, but describes no mechanism to carry the producer's identity from
   the producing call to the verifying call. As written the rule is
   unenforceable. DO-017 resolves it by stamping every routed result with a
   session-mac producer tag that a verify request must echo, and by deriving
   producer identity from that tag rather than caller free text. DO-016's
   sheet must thread the tag through the task DAG, or the guarantee reverts to
   a convention the router cannot hold.

2. **BYOK single-key collides with independent verification.** Rev 0.1 asserts
   both that the planner is a frontier model and that verification uses a
   different model, and that BYOK keeps v0 margin-positive. A BYOK user who
   supplies one frontier key cannot get an independent frontier verifier — the
   two requirements are unsatisfiable together. DO-017 resolves in favor of the
   hard rule: it fails closed with independence_unsatisfiable rather than
   quietly verifying with the producer. The parent doc does not acknowledge the
   collision; the managed tier or a second BYO key is the real relief.

3. **"Models never see secrets" conflates two kinds of secret.** Rev 0.1
   attributes the secret boundary to L4's vault, but the router necessarily
   holds provider API keys, which are secrets of a different kind. The parent
   does not separate provider keys (router-held, attached at transport) from
   site credentials (vault-held, never in a prompt). DO-017 draws the line
   explicitly: provider keys never enter a prompt body or a return, and site
   credentials never pass through the router at all.

4. **Metering versus enforcement.** Rev 0.1 puts budget ceilings in L5's budget
   manager yet also frames the router as the margin lever. DO-017 splits the
   two cleanly: the router estimates, honors an admission verdict, and reports
   actual cost, but never itself enforces a ceiling. A reader expecting the
   router to block overspend will not find that here — enforcement stays with
   DO-020, and duplicating it would race two owners over one cap.

## Open questions (no decision resolvable at this revision)

1. **Independence granularity.** Whether "a different model" should mean a
   different version, a different family, or a different provider is a policy
   axis here, defaulting to model identity. Which axis actually yields
   independent judgment is an empirical question about correlated model errors
   that no drift data settles yet; the default may prove too weak.

2. **Producer-tag trust across sessions.** The tag mac binds to this router's
   session key. A crash-resume through DO-016 checkpointing can produce an
   artifact in one session and verify it in another, where the mac no longer
   validates. A durable tag key or a re-stamp path is needed; it depends on
   DO-016's checkpoint format, which is not yet fixed.

3. **Streaming and multi-turn cost attribution.** The cost meter prices one
   request and one response. Streaming completions and multi-turn tool-use
   loops accrue cost across many provider round-trips; how the meter attributes
   those to a single call_id, and whether admission runs once or per round-trip,
   is unsettled.

4. **Price-table staleness.** Provider prices drift, and a stale table
   silently misreports cost to the budget manager. Whether the policy pins
   prices or fetches them is unresolved: fetching reintroduces the network
   dependency the local-first stance resists.

## Roads not taken

- **Router-side prompt assembly.** Rejected: the router forwards caller-owned
  prompt bundles opaquely. Assembling prompts here would place the router in
  the injection path and blur the secret boundary the parent assigns to L4.
- **Live-benchmark cheapest-model selection.** Rejected for v0: benchmark-driven
  routing is nondeterministic and breaks replay. Selection is priority-ordered
  over a declared policy, deterministic given policy and request.
- **A single shared model pool across roles.** Rejected: role-to-class
  separation is the economic lever that keeps frontier calls where they pay.
  Collapsing it forfeits the parent's determinism-and-cost thesis.
- **Router-enforced budget ceilings.** Rejected: enforcement is DO-020's;
  duplicating it splits one cap across two owners.
- **Managed keys in v0.** Deferred by design, not omitted: the KeySource
  interface is shaped for the managed tier now so it lands as a non-breaking
  addition, but only the local BYOK source ships in v0 — BYOK is the margin
  stance the parent chose.
- **Completion caching keyed by prompt digest.** Attractive for cost but a
  skill-compiler (DO-018) concern. The router stays a stateless forwarder so
  its guarantees do not depend on a cache's correctness.
