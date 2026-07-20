# DO-015 — Companion notes

Not part of the drawing. Open questions, contradictions found in the parent
architecture doc (Browser OS, Rev 0.1), and roads not taken. Everything that
could become a decision is on the sheet; this file holds what could not.

## Contradictions found in the parent doc

1. **"Explores once" versus re-learn on drift.** §L1 says an agent "explores
   once, then compiles a SiteAdapter," while the same paragraph requires the
   compiler to "re-learn and hot-swap" on drift — which is a second
   exploration. As written the two clauses disagree. DO-015 resolves it by
   scope: a compilation consumes exactly one trajectory, but an adapter's
   lifetime spans one compilation per version. "Once" means once per version,
   not once ever; the single-trajectory invariant and hot-swap coexist because
   each version has its own single trajectory.

2. **`act` as an adapter tool versus the control-plane gate.** §L1 lists
   `act` among the typed tools a SiteAdapter exposes, while §L4 requires every
   consequential action to pass the action control plane. Read literally, an
   adapter could execute a transact-tier action directly. DO-015 resolves in
   favor of the gate: an adapter act step produces an action addressed by
   stable node id and crossing RenderSurface; the agent runtime submits any
   consequential action through the control plane. The adapter compiles the
   affordance; it does not authorize the action. The parent doc reads as if
   adapters execute autonomously.

3. **Origin-scoped adapters versus per-workspace partitions.** §P6 and §L0
   isolate cookies and logins per workspace partition, but an adapter is
   keyed by origin and shared across workspaces. An adapter learned in one
   workspace's logged-in state could embed steps that assume a session another
   workspace lacks. DO-015 resolves it by keeping adapters structural — stable
   anchors and typed schemas, never captured session state — and by running
   health in the calling workspace's context. The tension is real and is
   flagged for the workspace sheet (DO-019) to hold.

4. **Provenance retention versus the determinism moat.** §P5 wants every tool
   traceable "back to the learning trajectory," which means retaining
   trajectories; §P4 (the thesis) wants replay cheap and model-free, which
   means replay must not need the trajectory. Both are kept by separating the
   reads: replay uses the compiled steps and never loads the trajectory;
   provenance loads the retained trajectory and never runs. Storage carries
   both; the hot path reads neither the model nor the trajectory.

## Open questions (no decision possible at this revision)

1. **Cross-origin tools.** A real task often spans origins — search on one
   site, checkout on another. The single-origin adapter model does not cover a
   tool whose steps cross origins; that composition belongs to the skill
   compiler (DO-018), which chains adapters. Where the adapter boundary ends
   and the skill boundary begins for a two-origin flow is unresolved and needs
   DO-018 input.

2. **Anchors under A/B-tested or personalized DOM.** An origin that serves
   structurally different DOM to different users breaks a single structural
   digest per anchor. Whether to learn and store multiple variants per origin,
   or to widen the anchor to a role-and-name match that tolerates variant
   layout, needs real drift data from the five seed adapters before it can be
   decided.

3. **The debounce threshold.** The sheet sets drift declaration at three
   consecutive failing health runs. Three is a starting value chosen to reject
   single transient failures without letting a genuinely broken tool linger;
   the right number is a function of health interval and per-origin
   flakiness, which only usage measures.

4. **Health-probe rate against site terms.** Scheduled self-test hits live
   origins, and the parent doc's anti-bot risk section warns against
   datacenter-agent patterns and forbids CAPTCHA evasion. A per-origin probe
   rate and terms-compliance policy is needed; the sheet states the posture
   (honor terms, yield to a present operator on gated origins) but not the
   per-origin schedule, which is policy the workspace layer owns.

## Roads not taken

- **Multi-trajectory synthesis.** Generalizing an adapter from many recorded
  runs would produce more robust tools, but it makes compilation expensive and
  provenance plural. Rejected for this sheet: one trajectory keeps compilation
  cheap and provenance singular and auditable. Multi-run generalization is a
  later enhancement, not this version.

- **Model-in-the-loop replay.** A broken step could be patched inline by a
  model call at replay time, as the skill compiler patches nearest-skill gaps.
  Rejected here: replay must be deterministic and model-free, which is the
  whole point of the P4 moat. A broken step is drift; it triggers re-learn and
  hot-swap, never an inline model call. The model-patched-gap path lives in
  DO-018, not here.

- **Raw-selector fallback.** When an anchor fails to resolve, the interpreter
  could fall back to a raw CSS selector. Rejected: raw selectors are exactly
  the brittleness the stable-anchor discipline removes. A failed anchor is a
  drift signal, not a reason to reach around PageGraph.

- **Per-tool versioning and swap.** Versioning each tool independently would
  let one drifted tool re-learn without touching the rest. Rejected: the
  adapter is versioned as one unit so a health run and a hot-swap reason about
  one consistent object, and provenance stays whole. Per-tool versions would
  fragment the swap pointer and the trajectory link.

- **Shared or community adapter library.** The parent doc's Phase 3 imagines
  shareable adapters. Out of scope for this sheet: the store is local and
  owner-scoped, and a published-adapter trust model — who vouches for an
  adapter learned on someone else's machine — is a separate design with its
  own injection surface.

- **Vision-fallback compilation.** The perception layer's set-of-marks vision
  path could seed adapters for canvas-heavy or DOM-hostile origins. DO-015
  compiles from PageGraph only; a vision-seeded adapter depends on the
  perception sheet's fallback and is left to that sheet, since anchoring a step
  to a screenshot mark rather than a stable node id changes the determinism
  guarantee this sheet rests on.
