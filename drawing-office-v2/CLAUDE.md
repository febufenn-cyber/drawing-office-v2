# Context for AI coding sessions on drawing-office v2

- The load-bearing strings are pinned and MUST change together across files:
  the v2 contract header
  `| Operation | Input domain | Return shape | Tolerance | Kind | Inspection op | Failure mode outside tolerance |`
  and the Kind enum {behavioral, complexity, timing, resource, concurrency,
  fault}. If you change either, update STANDARD.md, tools/validate.py, the
  template, and every design in one commit, or un-migrated designs fail CI.
- The validator checks form, not substance. Do not add checks that claim to
  verify correctness; that is not mechanizable and pretending otherwise is the
  failure this standard exists to prevent.
- E610 is the anti-toothless rule: a non-behavioral tolerance must cite an op
  whose tooling can observe it. When adding a complexity/timing/resource/
  concurrency/fault tolerance, the Process Plan must contain an op with matching
  tooling, or validation fails.
- Every design must pass `python tools/validate.py designs/` (exit 0) before
  commit. Fixtures under tools/tests/fixtures/ may fail on purpose; keep them
  out of designs/.
