# AI OS — Drawing Office

The design library for AI OS (Browser OS): an agent-native browser where
webpages are tools, agents transact under deterministic control, and every
subsystem earns a production drawing before it is built.

Drawings follow the Drawing Standard, revision C — see `STANDARD.md`. Each
design lives in `designs/<slug>/LLD.md`; genuine open questions and roads
not taken live beside the sheet in `DECISIONS.md`. Start new drawings from
`templates/LLD-template.md`.

Validate the library with:

```
python tools/validate.py designs/
```

The validator checks form, never substance: sections, title block, BOM and
part-count agreement, tolerance and inspection-op coverage, and the
derived-drawing evidence rules. Whether a tolerance is the right one is
established by review and by building the artifact — never by the validator.
The validator's own fixture suite runs with `python tools/tests/run.py`;
fixtures fail on purpose and stay out of `designs/`.

## Drawings

The subsystem design program (DO-012 through DO-021) and its register live under
`designs/`; see [`designs/REGISTER.md`](designs/REGISTER.md) for the full L0–L6
set, dependency graph, and manufacture order.

## Implementations

Code manufactured from a drawing lives under `impl/<slug>/`, separate from the
design library. Each is built to its sheet and verified against the sheet's
Process Plan.

| Drawing | Implementation | Status |
|---------|----------------|--------|
| DO-013 Render Surface Engine Boundary | [`impl/render-surface-engine-boundary/`](impl/render-surface-engine-boundary/) | engine-neutral core built and tested; production Electron driver pending |
| DO-019 Workspace and Memory Store | [`impl/workspace-and-memory-store/`](impl/workspace-and-memory-store/) | logic and AEAD-at-rest built and tested; SQLite/SQLCipher/sqlite-vec substrate pending |
| DO-014 PageGraph Perception Model | [`impl/pagegraph-perception-model/`](impl/pagegraph-perception-model/) | full deterministic perception pipeline built and tested |
