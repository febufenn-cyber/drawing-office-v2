# drawing-office STANDARD — v2

A drawing-office LLD is a Markdown file that specifies a piece of deterministic
software precisely enough that a builder can implement it in any language and
accept the result against stated, testable tolerances — without consulting the
designer. v2 adds two things v1 lacked, both discovered by building from v1
drawings and finding where they leaked:

1. **Return-shape contract.** v1 pinned *behavior* but not *interface*. Two
   builders reading the same v1 drawing produced incompatible return types that
   both passed. v2 requires every operation to pin the shape of its return
   value.
2. **Kind-tagged, observable tolerances.** v1 let a tolerance name an inspection
   op that could not actually observe its violation — an O(1) tolerance "checked"
   by a behavior test that an O(n) implementation passes. v2 requires every
   tolerance to declare a *kind*, and requires non-behavioral kinds to cite an
   op whose tooling can observe that class of violation.

Both are enforced by `tools/validate.py`. The validator checks **form**, not
**substance**: it can confirm a return shape is stated and a complexity
tolerance is backed by a measurement op, but it cannot confirm the shape is
*right* or the measurement is *correct*. That boundary is permanent; v2 simply
moves more of the specifiable surface onto the checkable side.

## The seven sections (unchanged from v1)

Every LLD has exactly these H2 sections, in order, spelled exactly:

1. Front matter — a `---`-delimited block with nine keys: `id` (DO-NNN),
   `title`, `revision` (capitals), `status` (draft|released|superseded),
   `author`, `reviewed_by` (a name, or `none` only while draft), `date`
   (YYYY-MM-DD), `part_count` (positive integer, equal to the BOM row count),
   `supersedes` (none or DO-NNN).
2. `## ASSEMBLY DRAWING` — one Mermaid diagram; parts carry their P-number,
   external actors do not.
3. `## BILL OF MATERIALS` — a table of parts P1, P2, … with name, kind,
   responsibility, deps.
4. `## DETAIL DRAWINGS` — one `### PN` per BOM part, each with a Mermaid diagram
   or an explicit "commodity part" note.
5. `## CONTRACTS & TOLERANCES` — the v2 contract table (below).
6. `## PROCESS PLAN` — a routing table: Op 10, Op 20, … with task, tooling,
   inspection.
7. `## REVISION HISTORY` — rev, date, author, change summary.

## The v2 contract table

The contract table has these columns, by exact header name (order is free; the
validator resolves by name):

```
| Operation | Input domain | Return shape | Tolerance | Kind | Inspection op | Failure mode outside tolerance |
```

- **Return shape** (required, non-empty): the exact shape/type the operation
  returns. Pin sum types in prose to avoid the pipe character, which breaks the
  table — write "the string A or the string B", not "A | B". This closes the
  return-shape gap: two builds must share one interface.
- **Tolerance** (required, non-empty): the allowed variance — what the operation
  guarantees.
- **Kind** (required): one of `behavioral`, `complexity`, `timing`, `resource`,
  `concurrency`, `fault`. Declares what *class* of property the tolerance is,
  which determines what tooling can observe its violation.
- **Inspection op** (required): the `Op NN` in the Process Plan that verifies
  this tolerance. Must reference an op that exists.

### Why Kind exists — the anti-toothless rule

A behavior test compares outputs. It cannot see a property that leaves outputs
unchanged: an O(n) stack and an O(1) stack print the same thing; a
non-atomic writer and an atomic one look identical until a fault fires; a racy
counter and a safe one agree until threads interleave badly. So a tolerance
about complexity, timing, resource use, concurrency, or fault behavior, if
"checked" by a behavior test, is **toothless** — stated but unverifiable.

v2 makes this mechanically catchable. Each non-behavioral kind must cite an op
whose tooling contains an observing keyword:

- `complexity` / `timing` / `resource` → measurement tooling (measure, timing,
  benchmark, counter, profil, latency, clock, memory, stopwatch).
- `concurrency` → concurrency tooling (race, concurrent, interleave, thread,
  goroutine, parallel).
- `fault` → fault tooling (fault, inject, failure, crash, kill).

If the cited op's tooling cannot observe the kind, the validator raises **E610**.
`behavioral` carries no tooling constraint.

## Conformance codes

Front matter: E101 (missing block), E102 (unclosed), E103 (malformed line),
E104 (unknown key), E105 (duplicate key), E106 (missing key), E107 (empty
value), E108 (bad id), E109 (duplicate id across the set), E110 (bad status),
E111 (bad revision), E112 (bad date), E113 (bad part_count), E114 (bad
supersedes), E115 (released but unreviewed).

Sections: E201 (missing), E202 (out of order), E203 (unexpected extra).

Assembly: E301 (no Mermaid). BOM: E401 (no table), E402 (bad part number), E403
(duplicate part), E404 (part_count ≠ BOM rows). Detail: E501 (BOM part has no
detail heading), E502 (detail entry lacks a diagram or commodity note), E503
(detail heading references a non-BOM part).

Contracts (v2): E601 (no table), E602 (no Tolerance column), E603 (empty
tolerance), **E604** (no Inspection op column), **E605** (tolerance names no op),
**E606** (op not in Process Plan), **E607** (no Return shape column, or empty
return-shape cell), **E608** (no Kind column, or invalid kind), **E610**
(non-behavioral tolerance cites an op whose tooling cannot observe it —
toothless).

## What the validator still cannot do

It confirms a return shape is *stated*, not that it is the *right* shape. It
confirms a complexity tolerance is *backed by a measurement op*, not that the
measurement is *correctly implemented* or that its threshold is *sane*. Form,
not substance. A drawing that passes v2 is well-formed and its tolerances are
observable in principle; whether they are correct is verified by building the
software and running the ops — never by the validator.
