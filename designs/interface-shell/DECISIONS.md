# DO-021 — Companion notes

Not part of the drawing. Open questions, contradictions found in the parent
architecture doc (Browser OS, Rev 0.1), and roads not taken. Everything that
could become a decision is on the sheet; this file holds what could not.

## Contradictions found in the parent doc

1. **L6 lives "in the Electron shell (React)" but nothing above L0 may
   import engine or Electron code.** §L6 places the desktop UI in the
   Electron shell, while the spanning rule (§P3, and the register's one rule)
   forbids engine or Electron imports above L0. As written the interface
   both is Electron and may not touch it. DO-021 resolves narrowly: the UI
   framework is unconstrained, but the interface reaches pages only by handle
   supplied through DO-016 and DO-019 and imports no engine, Electron-main,
   or CDP API. The render-process hosting that draws the shell is an L0 and
   shell-substrate concern, not an L6 one. The parent doc reads as if L6
   owned the Electron surface directly.

2. **"The omnibox is an intent box; tabs are not the top-level object" vs
   "URLs still work."** §P1 makes the task, not the tab, the unit of work,
   yet §L6 keeps URL entry. If a user types a URL, the two framings disagree
   on whether a tab or a task results. DO-021 resolves in favor of the task:
   a URL becomes a navigate task whose page is evidence on the card, and no
   top-level tab object exists. The contradiction is only latent in the
   parent because it never says what typing a URL produces.

3. **Approval UX is claimed by both L4 and L6.** §L4 lists "approval UX" as
   a mitigation and DO-012 says "pixels are L6's"; §L6 lists "approval
   sheets." Both layers appear to own the approval surface. DO-021 resolves
   the boundary: DO-012 owns the ApprovalRequest and ApprovalResponse
   contract and the decision; DO-021 owns only the rendering and the
   request_id binding, and derives nothing. The sheet is a projection of the
   request, never an authority over it.

## Open questions (no decision possible at this revision)

1. **How the card learns a task is awaiting approval.** The card model maps
   a "pending approval reported in run state" to awaiting_approval, but
   DO-016's drawn run-log taxonomy carries action.submitted and no explicit
   awaiting-human-approval event. Whether DO-016 surfaces a pending-approval
   status and the request_id the card reads, or the shell learns of the
   pending request another way, needs a DO-016 contract addition. Specified
   here against the pending-in-run-state assumption; the DO-016 sheet must
   carry the event for the mapping to be total.

2. **Artifact and evidence ref schema.** The card model reads artifact_refs
   and evidence_refs and the panel resolves them against DO-019, but neither
   DO-016 nor DO-019 as drawn defines an artifact or evidence-page ref schema
   or how a produced artifact is attached to a task. Whether the shell learns
   a ref from a run-log payload or from a workspace index is unresolved and
   needs a cross-sheet interface for artifacts.

3. **Attention across many tasks.** With DO-020 triggers producing cards
   while the user browses, how the sidebar surfaces a completed background
   task or a pending approval for a non-foreground workspace — notifications,
   a queue, ordering by urgency — is unspecified. It needs DO-020 input and a
   notification contract that does not exist yet.

4. **Stream versus snapshot of run state.** Whether the card model
   subscribes to a DO-016 event stream or polls a run-state snapshot is a
   coupling and cost decision left to the DO-016 interface. The projection is
   written to be pure over either shape, so the choice changes no tolerance
   on this sheet.

## Roads not taken

- **Tabs as a first-class object.** Rejected per §P1: the unit of work is a
  task, and pages are evidence on cards. A tab strip would reintroduce the
  top-level object the thesis removes.
- **Live re-rendering of evidence pages in the panel.** Rejected: evidence
  pages are captured refs read as data. Re-opening the engine to render them
  live would put the shell back across the L0 boundary it must not cross.
- **Inline action controls in the activity stream** ("retry this step",
  "approve here"). Rejected for this revision: the stream is read-only, and
  the only human surface with authority is the approval sheet bound to a
  request_id. Inline controls would create a second, unbound authorization
  path — exactly the surface DO-012 closes.
- **A command palette that executes shell commands.** Rejected: the intent
  box submits tasks to DO-016 and nothing else. A direct-execution path from
  the interface would bypass the run log and the control plane.
- **Optimistic card updates ahead of run state.** Rejected: the card is a
  pure projection of run state. Showing a step done before the run says so
  would break the provenance guarantee that every displayed fact traces to a
  logged event.
- **Persisting the view-model to the workspace store.** The card, feed, and
  evidence listing are derived projections, fully reconstructable from run
  state and the log. Persisting them would duplicate the source of truth and
  invite drift; the shell reconstructs rather than stores.
