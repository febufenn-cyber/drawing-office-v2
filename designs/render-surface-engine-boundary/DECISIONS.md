# DO-013 — Companion notes

Not part of the drawing. Open questions, contradictions found in the parent
architecture doc (Browser OS, Rev 0.1), and roads not taken. Everything that
could become a decision is on the sheet; this file holds what could not.

## Contradictions found in the parent doc

1. **The RenderSurface interface in Rev 0.1 has no ticket and no fill.** The
   parent gives `act(h, a): Promise<ActResult>` to any holder of a
   `PageHandle`, and the `RenderSurface` block lists no `fillSecret` at all.
   Yet L4 requires that every consequential action pass a gate and that the
   vault "fills credentials into the page directly." As written, either L2
   calls `act()` ungated, or the vault reaches around RenderSurface into the
   engine — both break a stated invariant. DO-013 owns the resolution: `act`
   takes an ExecutionTicket and `fillSecret` is a first-class interface
   operation. The parent doc's interface block needs the same two changes in
   its next revision, or L0 and L4 disagree.

2. **`snapshot()` promises a stable node id but not the fields that make it
   bind.** Rev 0.1's `snapshot()` returns a PageGraph with "stable node id"
   and nothing else named. DO-012's grant binding needs `nav_epoch`,
   `workspace_id`, and per-node stable digests on every snapshot, and its
   ticket needs the digest to bind against. DO-013 makes the three fields
   part of the snapshot contract; DO-014, which owns PageGraph node identity,
   must carry them through unchanged.

3. **CDP is Chromium-specific, but the engine is meant to be swappable.** The
   parent says CDP via `webContents.debugger` needs "no extra dependency" and
   in the same document plans a Servo/AgentView engine at Horizon 2. Servo
   exposes no CDP. A contract written in CDP terms cannot survive the swap the
   thesis depends on. DO-013 draws the RenderSurface contract engine-neutral —
   it names no CDP or Chromium type — and confines CDP to P4, P6, and P7. The
   swap invariant (Op 110) is the check that keeps the two claims consistent.

4. **"Per-workspace session partitions" is stated as an L0 duty and an L4
   duty.** Rev 0.1 lists partitions under both L0 (site isolation) and L4
   (mitigation). DO-013 owns the mechanism (P3, one Electron partition per
   workspace); DO-019 owns provisioning the workspace-scoped keys. The split
   is drawn here and in the register; the parent doc states it twice without
   assigning it.

## Open questions (no decision possible at this revision)

1. **What counts as a committed navigation for the nav_epoch bump.** A full
   document navigation clearly increments the epoch. SPA soft-navigations
   (`history.pushState`, client routers) change the route and mutate the DOM
   without a document swap. Bumping the epoch on every soft-navigation makes
   grant invalidation aggressive and correct but noisy; not bumping risks a
   stale grant surviving a route change. The right rule needs DO-014's model
   of how PageGraph represents SPA routes.

2. **fillSecret against non-standard widgets.** The fill channel targets a
   field node. Some real auth flows use `contenteditable` regions or custom
   web components that do not accept a value the way an input does. Whether
   the channel can fill those without ever exposing the value is undetermined
   until adapter data shows which widgets actually appear at login.

3. **observe backpressure discipline.** The multiplexer drops the oldest
   network or mutation event under buffer pressure and never a nav event. The
   correct buffer size, and whether a skill can tolerate a dropped mutation
   event, needs L2 usage data. The nav-event guarantee is firm; the rest of
   the drop policy is provisional.

4. **Per-session ticket key rotation.** The MAC key is established once at
   surface construction. A long-lived surface — a persistent workspace open
   for days — may want key rotation. How rotation coordinates with DO-012's
   gate, and whether it is needed at all when the gate and surface share one
   trust domain, is unresolved.

5. **Digest stability versus benign DOM churn.** A per-node digest over tag,
   attributes, name, and geometry is stable against unrelated page mutation
   only if the digest excludes volatile attributes. Which attributes are
   volatile enough to exclude is an empirical question that overlaps DO-014;
   too broad an exclusion weakens ticket binding, too narrow breaks it on ad
   and clock churn.

## Roads not taken

- **CSS-selector actions.** Rejected: the architecture mandates stable node
  ids so skills survive DOM drift and so a ticket can bind an action to a
  digest. A selector binds to nothing verifiable.
- **Exposing raw HTML or the live DOM to callers.** Rejected: PageGraph is
  the only page representation that crosses the boundary. Raw HTML would let
  L1 reason about engine specifics and defeat the swap.
- **One shared Electron session with cookie namespacing.** Rejected in favor
  of one partition per workspace. Namespacing is a soft boundary a compromised
  task can cross; a partition is enforced by the engine.
- **Letting the vault call CDP directly for fillSecret.** Rejected: that is
  above-L0 code touching the engine. The fill path stays inside L0 behind
  `fillSecret`, and the secret rides a channel separate from the general
  driver so it never transits general driver buffers.
- **Merging the secret channel (P6) into the cdp-driver (P4).** Rejected:
  keeping the secret path a separate narrow channel shrinks the exposure
  surface — the value never touches the code that assembles snapshots.
- **Ed25519-signed tickets.** Rejected for now: HMAC under a per-session key
  is sufficient where the gate and surface share one trust domain in one
  process. Asymmetric signatures buy nothing until the two sit across a
  process or trust boundary.
- **Vision-first perception at L0.** The screenshot and set-of-marks path is
  the fallback at ten times the cost per the parent doc; the DOM and AX
  snapshot is primary. L0 exposes both and decides neither — the choice is
  L1's.
