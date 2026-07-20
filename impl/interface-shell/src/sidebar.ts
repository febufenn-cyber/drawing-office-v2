// P6 — ambient-sidebar. Makes normal browsing copilotable without a mode switch: it
// hosts the intent-box, the active task card, and the approval sheet alongside the
// page the user is already on, addressed only by its page handle. Attaching or
// detaching changes no page or engine state — this part imports no engine or
// Electron code, so live page rendering stays with L0. When a foreground task raises
// a DO-012 ApprovalRequest, the sidebar surfaces the sheet inline, and the response
// still binds to request_id only: placement changes where the sheet appears, never
// what it authorizes.

import { IntentBox } from './intentBox.ts';
import { respond } from './approvalSheet.ts';
import type { Executor, SidebarHost } from './seams.ts';
import type { ApprovalRequest, Decision, RespondResult, SidebarState } from './types.ts';
import type { SubmitResult } from './intentBox.ts';

export class AmbientSidebar implements SidebarHost {
  state: SidebarState = 'hidden';
  page_handle: string | null = null;
  private readonly intentBox: IntentBox;
  private pendingApproval: ApprovalRequest | null = null;

  constructor(executor: Executor, private workspace: string) {
    this.intentBox = new IntentBox(executor, this);
  }

  foreground_workspace(): string {
    return this.workspace;
  }
  setForegroundWorkspace(workspace: string): void {
    this.workspace = workspace;
  }

  // Hosting the sidebar over a page mutates no page or engine state.
  attach(page_handle: string): void {
    this.page_handle = page_handle;
  }
  detach(): void {
    this.page_handle = null;
  }

  submit(text: string): SubmitResult {
    return this.intentBox.submit_intent(text);
  }

  // ---- Mode transitions (the fixed set; anything else is a no-op) -----------

  open(): boolean {
    if (this.state === 'hidden') { this.state = 'ambient'; return true; }
    return false;
  }
  openCard(): boolean {
    if (this.state === 'ambient') { this.state = 'focused'; return true; }
    return false;
  }
  closeCard(): boolean {
    if (this.state === 'focused') { this.state = 'ambient'; return true; }
    return false;
  }
  closeSidebar(): boolean {
    if (this.state === 'ambient') { this.state = 'hidden'; return true; }
    return false;
  }
  navigate(): boolean {
    return this.state === 'focused'; // stays focused; navigation changes no shell state
  }

  onApprovalRequest(request: ApprovalRequest): boolean {
    if (this.state === 'ambient' || this.state === 'focused') {
      this.pendingApproval = request;
      this.state = 'approving';
      return true;
    }
    return false;
  }

  // Inline approval: the response still binds to request_id via the same P4 respond.
  respondApproval(decision: Decision, now: number): RespondResult {
    const request = this.pendingApproval;
    if (request === null) return { ok: false, reason: 'REQUEST_MISMATCH' };
    const result = respond(request, decision, now);
    this.pendingApproval = null;
    this.state = 'ambient';
    return result;
  }
}
