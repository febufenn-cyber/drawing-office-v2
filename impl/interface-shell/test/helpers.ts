// Shared fixtures: a mutable clock, a submit-counting executor stub, a sidebar host
// stub, a workspace-read stub, and recorded run events / an approval request. Not a
// test file.

import type { Clock, Executor, SidebarHost, WorkspaceRead } from '../src/seams.ts';
import type { ApprovalRequest, RunEvent, ShellTask, StoredItem } from '../src/types.ts';

export const WS = 'ws-1';

export class MutableClock implements Clock {
  constructor(public t = 0) {}
  now(): number { return this.t; }
  set(t: number): void { this.t = t; }
}

export class StubExecutor implements Executor {
  readonly submits: Array<{ task: ShellTask; workspace_id: string }> = [];
  submit(task: ShellTask, workspace_id: string): string {
    this.submits.push({ task, workspace_id });
    return 'handle-' + String(this.submits.length);
  }
}

export class StubHost implements SidebarHost {
  constructor(private workspace = WS) {}
  foreground_workspace(): string { return this.workspace; }
}

export class StubStore implements WorkspaceRead {
  private readonly items = new Map<string, StoredItem>();
  put(workspace_id: string, ref: string, item: StoredItem): void {
    this.items.set(workspace_id + '|' + ref, item);
  }
  read(workspace_id: string, ref: string): StoredItem | null {
    return this.items.get(workspace_id + '|' + ref) ?? null;
  }
}

// A recorded run's log events. Includes the two non-surfaced events
// (step.strategy_chosen, step.pre_dispatch) so tests can assert they project to none.
export function runEvents(): RunEvent[] {
  return [
    { seq: 1, ts: '2026-07-20T00:00:01Z', event: 'run.started', data: { graph_id: 'g1' } },
    { seq: 2, ts: '2026-07-20T00:00:02Z', event: 'step.ready', data: { step_id: 's1' } },
    { seq: 3, ts: '2026-07-20T00:00:03Z', event: 'step.strategy_chosen', data: { step_id: 's1', strategy: 'model' } },
    { seq: 4, ts: '2026-07-20T00:00:04Z', event: 'step.pre_dispatch', data: { step_id: 's1', input_digest: 'd' } },
    { seq: 5, ts: '2026-07-20T00:00:05Z', event: 'action.submitted', data: { step_id: 's1', proposal_ref: 'pr-1' } },
    { seq: 6, ts: '2026-07-20T00:00:06Z', event: 'perception.read', data: { step_id: 's1', snapshot_ref: 'snap-1' } },
    { seq: 7, ts: '2026-07-20T00:00:07Z', event: 'step.succeeded', data: { step_id: 's1', output_ref: 'art-1' } },
    { seq: 8, ts: '2026-07-20T00:00:08Z', event: 'run.completed', data: { graph_id: 'g1', outcome: 'completed' } },
  ];
}

export function approvalRequest(over: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    request_id: over.request_id ?? 'req-1',
    origin: over.origin ?? 'https://shop.example',
    consequence: over.consequence ?? 'transact',
    amount_minor: over.amount_minor ?? 1000,
    currency: over.currency ?? 'USD',
    finding_codes: over.finding_codes ?? ['FC_MONETARY'],
    expires_at: over.expires_at ?? 100,
    page_strings: over.page_strings ?? ['Confirm your purchase'],
  };
}
