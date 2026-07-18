# AI OS — Design Register

The register of subsystem drawings for Browser OS, derived from the
architecture doc (Rev 0.1) layers L0–L6. One drawing per subsystem. Each is
a prescriptive leaf drawing: its parts are `local`, and its dependencies on
other subsystems appear as unnumbered external actors in the assembly plus
contract rows — never as BOM `Ref` edges — so every sheet validates on its
own and the library validates as a set.

The one architectural rule that spans every sheet: **nothing above L0
imports engine or Electron code.** Perception and action cross the
`RenderSurface` boundary (DO-013) only.

## Drawings

| DO | Title | Layer | Responsibility | Depends on | Status |
|----|-------|-------|----------------|------------|--------|
| DO-012 | Browser OS Action Control Plane | L4 | Deterministic authorization and evidence between the agent and any consequential action. | DO-013, DO-014, DO-019 | drafted |
| DO-013 | Render Surface Engine Boundary | L0 | Own the engine; expose pages only through RenderSurface. | none | planned |
| DO-014 | PageGraph Perception Model | L1 | Turn any page into typed, stable-id structured data and affordances. | DO-013 | planned |
| DO-015 | Site Adapter Compiler | L1 | Compile an origin into typed, self-testing tools with provenance. | DO-013, DO-014, DO-017 | planned |
| DO-016 | Task DAG Executor | L2 | Execute task graphs with per-step checkpoints and crash-resume. | DO-012, DO-013, DO-019 | planned |
| DO-017 | Model Router | L2 | Route each role to a model; hold BYO keys; keep the verifier independent. | DO-019 | planned |
| DO-018 | Skill Compiler and Library | L2 | Compile successful trajectories into verified, replayable skills. | DO-013, DO-016, DO-017, DO-019 | planned |
| DO-019 | Workspace and Memory Store | L3 | Persist workspaces and the episodic, entity, and skill stores, encrypted and partitioned. | none | planned |
| DO-020 | Agent Orchestration Layer | L5 | Fan out agents, enforce budgets, and run scheduled and event triggers. | DO-016, DO-019 | planned |
| DO-021 | Interface Shell | L6 | Intent box, task cards, approval sheet, ambient sidebar. | DO-012, DO-016, DO-019 | planned |

## Manufacture order

The build order is a topological sort of the dependency column: a subsystem
is manufactured only after every subsystem it depends on is accepted per its
own drawing.

1. DO-013 Render Surface Engine Boundary
2. DO-019 Workspace and Memory Store
3. DO-014 PageGraph Perception Model
4. DO-017 Model Router
5. DO-012 Browser OS Action Control Plane
6. DO-015 Site Adapter Compiler
7. DO-016 Task DAG Executor
8. DO-018 Skill Compiler and Library
9. DO-020 Agent Orchestration Layer
10. DO-021 Interface Shell

## Cross-sheet interface notes

- DO-013 owns the RenderSurface additions DO-012 specified as contract rows:
  `ExecutionTicket` on `act`, `fillSecret`, and `nav_epoch`, `workspace_id`,
  and per-node stable digests on `snapshot`. When DO-013 is accepted, DO-012
  revises those rows to cite it.
- DO-014 owns PageGraph node identity; DO-012's resolver, DO-015's adapters,
  and DO-016's executor all consume it and never touch raw HTML.
- DO-019 owns per-workspace session partitions, encryption keys, and the
  budget ledger that DO-012 and DO-020 read.

## Conventions

- Each design lives in `designs/<slug>/LLD.md` with a companion
  `DECISIONS.md`. The slug is the kebab-case title.
- All drawings are prescriptive: nine title-block keys only, no source or
  derived keys, no Basis or Evidence columns.
- Validate the library with `python tools/validate.py designs/` and the
  validator itself with `python tools/tests/run.py`.
