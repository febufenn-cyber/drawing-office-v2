# drawing-office v2

A Git-native standard for writing software Low-Level Designs as machine-checkable
Markdown, using conventions co-opted from mechanical-engineering production
drawings (title block, bill of materials, tolerances, routing/process plan,
assembly-vs-detail drawings).

v2 evolves v1 with two changes, each discovered by building software from v1
drawings and finding where they leaked:

- **Return-shape contract** — every operation pins the shape of its return
  value, closing the "behavior pinned, interface not" gap that let two builders
  produce incompatible APIs from one conformant drawing.
- **Kind-tagged, observable tolerances** — every tolerance declares a kind, and
  non-behavioral kinds (complexity, timing, resource, concurrency, fault) must
  cite an inspection op whose tooling can actually observe a violation. A
  complexity tolerance can no longer be "checked" by a behavior test that an
  O(n) implementation passes (error E610).

See `STANDARD.md` for the full spec and `designs/bounded-stack/LLD.md` for a
worked example. Validate with:

```
python tools/validate.py designs/
```

## What the validator does and does not do

It checks **form**: are the seven sections present, is every return shape stated,
does every non-behavioral tolerance cite an op that can observe it. It does
**not** check **substance**: whether a stated shape is the right one, whether a
measurement is correctly implemented, whether a claim is true. A drawing that
passes is well-formed and its tolerances are observable in principle; correctness
is established by building the software and running the ops, never by the
validator. This boundary is deliberate and permanent.

## Relationship to v1

v2 is a separate repository, not a patch to v1. A v1 drawing does not validate
under v2 (it lacks the Return shape and Kind columns) and must be ported — see
the DO-005 revision history for what porting one design involved.
