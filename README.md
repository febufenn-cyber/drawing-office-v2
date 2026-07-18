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

| Id | Title | Status |
|----|-------|--------|
| DO-012 | Browser OS Action Control Plane | draft |
