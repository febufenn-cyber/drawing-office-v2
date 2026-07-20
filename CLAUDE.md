# Context for AI coding sessions on the AI OS drawing office

- This repo is a design library, not a codebase: drawings under
  `designs/<slug>/LLD.md`, governed by `STANDARD.md` (Drawing Standard
  rev C). Start new drawings from `templates/LLD-template.md`.
- The load-bearing strings are pinned and MUST change together across
  STANDARD.md, tools/validate.py, the template, and every design: the six
  section titles, the contract header
  `| Operation | Input domain | Nominal behavior | Tolerance | Inspection op | Failure mode outside tolerance |`
  (derived drawings insert `Basis | Evidence |` before the failure-mode
  column), the BOM, process-plan, and revision-history headers, and the
  nine title-block keys plus the four derived keys.
- Every design must pass `python tools/validate.py designs/` (exit 0)
  before commit. Fixtures under tools/tests/fixtures/ fail on purpose;
  keep them out of designs/. Run the validator's own suite with
  `python tools/tests/run.py`.
- The validator checks form, not substance. Do not add checks that claim
  to verify correctness; that boundary is deliberate and permanent.
- Prescriptive drawings decide; derived drawings evidence. A prescriptive
  cell you cannot fill is a decision you have not made — make it or move
  the genuine unknown to the design's DECISIONS.md, never onto the sheet.
- Register: drafting room. Declarative, present tense, no deferral
  markers, no pipe characters inside table cells.
