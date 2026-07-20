# DO-018 — Companion notes

Not part of the drawing. Open questions, contradictions found in the parent
architecture doc (Browser OS, Rev 0.1), and roads not taken. Everything that
could become a decision is on the sheet; this file holds what could not.

## Contradictions found in the parent doc

1. **"Verifier is a different model" is stated for the runtime, not for the
   skill compiler.** §L2's model router says verification uses a different
   model than produced the work, and §L2's skill-compiler line says the
   verifier replays the skill — but never states the replay grader must
   differ from the generalizer that produced the skill. Read literally, the
   same model could generalize and grade its own generalization, which is no
   check at all. DO-018 resolves this by making verifier independence a
   first-class refusal (`VERIFIER_NOT_INDEPENDENT`) keyed on the recorded
   `generalizing_model`. The parent doc should say so in its own next
   revision.

2. **Sandbox replay "against the live site" collides with the transact
   rule.** §L2 has the verifier replay in a sandbox against the live site;
   §L4 forbids any autonomous payment and gates every transact action behind
   a human. A skill whose terminal step is a real purchase cannot be verified
   by committing it. DO-018 resolves in favor of §L4: a terminal irreversible
   or monetary step is bound and resolved to prove the script reaches it, but
   its committing effect is not executed in the sandbox. Verification proves
   the script binds and reproduces up to the gated action; the commit stays
   the human-gated event it is at production run time.

3. **Skills as a fast-path vs. the control-plane gate.** §P4 of the thesis
   frames compiled skills as the way model calls become the fallback, which
   reads as if a promoted skill executes cheaply and directly. DO-012's own
   sheet already rejects a privileged skill fast-path: every skill step
   submits a proposal to the control plane like any other caller. DO-018
   holds that line — the skill format carries no authority token and no gate
   bypass. Determinism makes a skill cheap, never trusted. This is why DO-018
   lists no control-plane actor: it compiles, verifies, stores, and serves
   skills; the executor (DO-016) runs them and gates their consequential
   steps.

## Open questions (no decision possible at this revision)

1. **Verification realism versus the un-committed terminal step.** Because a
   monetary or irreversible terminal step is never committed in the sandbox,
   a skill whose only failure mode lives at that final action passes
   verification and is caught only by a production replay outcome. A
   trustworthy pre-commit oracle for the live site would close the gap; none
   exists at L1 today, so the residual risk is carried by the demotion loop.

2. **Demotion criterion parameters.** The failure threshold and the recent
   window are fixed on the sheet as a shape, but the numbers that balance
   prompt demotion against transient-flake tolerance need production replay
   data to set. The mechanism is decided; the constants wait on measurement.

3. **Skill sharing across workspaces.** The library is per-workspace, matching
   the local-first and partition-isolation stance. §3 of the thesis names a
   community skill library at Phase 3. Whether a skill verified in one
   workspace may be promoted into another without re-verification there — and
   how provenance and trust carry across that boundary — is unresolved and
   needs the orchestration and trust sheets.

4. **Nearest-skill distance metric.** `lookup_nearest` names unbound-locator
   gaps for model patching, but the ranking when several promoted skills
   share a signature is left to the library version's ordering. A principled
   distance — over parameter overlap and locator stability — would make the
   patched-skill tier stronger; it needs the executor's patch-success data.

## Roads not taken

- **Recording-replay skills.** Replaying the captured concrete node ids and
  values directly would be simpler than generalizing to locators and typed
  parameters. Rejected: a recording breaks on the first DOM drift or the
  first different parameter value, which defeats the whole economic point of
  a reusable skill.

- **A single model for generalize and verify.** Cheaper by one model role.
  Rejected: a model grading its own generalization is not a check, and the
  parent's own "different model" discipline exists precisely to avoid it.

- **Promoting on compile, verifying lazily in production.** Would skip the
  sandbox cost. Rejected: it makes the first production run the verification,
  which for a consequential skill means the first real user action is the
  experiment. Verification precedes promotion.

- **Lifetime success ratio as the demotion criterion.** Rejected in favor of
  a bounded recent window: a skill with thousands of past successes would
  survive far too long after a site change under a lifetime ratio, exactly
  when prompt demotion matters most.

- **Embedding a capability or approval token in the skill.** Would let a
  promoted skill execute its gated steps without re-approval. Rejected on the
  same grounds DO-012 rejected the skill fast-path: authority derives from
  the live consequence and policy at run time, never from a flag frozen into
  a skill at compile time.

- **Storing the full source trajectory inside the skill.** Rejected as
  bloat and a leak surface — the skill carries a `trajectory_ref` and a
  `source_digest` for provenance; the trajectory itself stays in the
  episodic store the workspace owns.
