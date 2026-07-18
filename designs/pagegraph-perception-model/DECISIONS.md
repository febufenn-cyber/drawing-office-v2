# DO-014 — Companion notes

Not part of the drawing. Open questions, contradictions found in the parent
architecture doc (Browser OS, Rev 0.1), and roads not taken. Everything that
could become a decision is on the sheet; this file holds what could not.

## Contradictions found in the parent doc

1. **`snapshot()` returns a `PageGraph` in the parent, raw material here.**
   Rev 0.1 types `RenderSurface.snapshot(h): Promise<PageGraph>` with the
   comment "DOM + AX tree + structured data" — conflating L0 capture with the
   L1 product this sheet builds. If L0 already returns a PageGraph, this
   subsystem has nothing to build. DO-014 resolves the layering: L0 returns
   raw material (DOM, accessibility tree, structured-data payload, nav_epoch,
   workspace_id) and L1 fuses the PageGraph. The parent's type annotation and
   DO-013's own drawing must carry the corrected split, or the two sheets
   disagree on who owns fusion.

2. **Who assigns the stable node id.** Rev 0.1 says `act()` targets "a stable
   node id from the last snapshot," implying L0 mints ids, while the register
   cross-sheet note states DO-014 owns PageGraph node identity. DO-014 claims
   identity for L1: DO-013 returns raw node handles, and P6 derives the stable
   id from durable signals. DO-013 must expose the raw handles the assigner
   maps from, and must not mint a competing id of its own.

3. **Vision fallback versus binding stability.** The parent scopes vision to
   "only when the DOM path fails" but also has grants and adapters bind to
   node ids. Set-of-marks ids are capture-local and have no durable signal, so
   a vision node cannot offer the drift stability a DOM node does. DO-014
   labels vision-sourced graphs so consumers treat their bindings as
   short-lived; whether DO-012 may bind a grant to a vision node at all is
   left to that sheet.

4. **"Models never see raw HTML" is stated as a property, enforced nowhere in
   the parent.** Rev 0.1 asserts the PageGraph is what models see "never raw
   HTML," but the open `snapshot()` return and the DOM field in it leave a
   path to the markup. DO-014 makes the property structural: the emitted
   PageGraph carries no raw HTML field, and Op 90 asserts its absence.

## Open questions (no decision resolvable at this revision)

1. **The 0.98 id-retention target is chosen, not measured.** "Minor drift" is
   an empirical distribution that does not exist until a drift corpus is built
   from real captures. Whether 0.98 is achievable across real sites, or the
   right floor at all, is unknown before Op 100 runs on real data.

2. **Reordered lists churn ids.** When rows sort or filter, `role_path`
   shifts and ids move even though the entity is unchanged. Binding an id to a
   structured-data entity identity (a JSON-LD `@id`) when one is present would
   stabilize it, but couples P4 and P6 and is unresolved.

3. **Shadow DOM and cross-origin iframes.** Whether the accessibility tree
   pierces shadow roots and iframes depends on engine capture flags owned by
   DO-013. Coverage sets the vision-gate trigger rate, so the exact flags are
   a boundary question this sheet cannot settle alone.

4. **Provenance timestamp granularity.** Every fact records the snapshot
   capture time. A design that re-extracts parts of a page across several
   passes would want a per-extractor stamp; the single capture time is chosen
   here because construction is one deterministic pass over one snapshot.

## Roads not taken

- **A raw-HTML escape hatch for consumers.** Rejected: any raw-markup field
  above L0 breaks the typed-surface invariant and the engine-swap boundary.
- **Using the digest as the node id.** Rejected: a content hash changes on
  every content edit, so it cannot be a stable anchor. The id and the digest
  are split precisely so one survives content change and the other detects it.
- **Persisting the whole DOM in the PageGraph for fidelity.** Rejected on cost
  and on the raw-HTML invariant; the typed spine plus provenance is the record.
- **Running vision on every page for uniformity.** Rejected: about ten times
  the cost of the DOM path. Vision is a gated fallback, not the default.
- **LLM-driven extraction as the primary path.** Rejected: model extraction is
  nondeterministic, which breaks the byte-identical PageGraph and the cheap
  replay the parent's determinism principle depends on. Deterministic parsers
  are primary; the model call is the fallback.
- **Embedding CSS selectors in the id for precision.** Rejected: the selector
  is exactly the volatile signal a stable id must survive.
