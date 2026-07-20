// The external boundaries DO-012 consumes: RenderSurface (DO-013), the perception
// snapshot source (DO-014), and the approval sheet (L6). Defined as interfaces so
// the real subsystems slot in; tests use stubs. Also owns the ExecutionTicket the
// gate mints and RenderSurface verifies.

import { canonical, hmacHex } from './canonical.ts';
import type { ActionKind, Consequence, Snapshot, Tier } from './types.ts';

export interface ExecutionTicket {
  readonly ticket_id: string;
  readonly action_digest: string;
  readonly nav_epoch: number;
  readonly expiry: string;
  readonly single_use: boolean;
  readonly mac: string;
}

export function ticketBody(t: Omit<ExecutionTicket, 'mac'>): string {
  return canonical({ ticket_id: t.ticket_id, action_digest: t.action_digest, nav_epoch: t.nav_epoch, expiry: t.expiry, single_use: t.single_use });
}

export function mintTicket(sessionKey: Buffer, body: Omit<ExecutionTicket, 'mac'>): ExecutionTicket {
  return { ...body, mac: hmacHex(sessionKey, ticketBody(body)) };
}

export interface ActResult {
  readonly ok: boolean;
  readonly detail: string;
}
export interface FillResult {
  readonly ok: boolean;
}

export interface SurfaceAction {
  readonly kind: ActionKind;
  readonly node_id: string;
}

// RenderSurface (DO-013). act and fillSecret execute only with a valid ticket. The
// secret value passes vault -> surface below the L0 boundary and is never returned.
export interface RenderSurface {
  act(handle_ref: string, action: SurfaceAction, ticket: ExecutionTicket): ActResult;
  fillSecret(handle_ref: string, node_id: string, secretValue: Buffer, ticket: ExecutionTicket): FillResult;
}

// Perception (DO-014): the sole page representation above L0.
export interface Perception {
  snapshot(handle_ref: string): Snapshot | null;
}

export interface ApprovalRequest {
  readonly request_id: string;
  readonly workspace_id: string;
  readonly origin: string;
  readonly kind: ActionKind;
  readonly consequence_effective: Consequence;
  readonly tier_effective: Tier;
  readonly amount_minor: number | null;
  readonly currency: string | null;
  readonly finding_codes: readonly string[];
  readonly expires_at: string;
  // Every string sourced from the page lives here, explicitly labeled page content.
  readonly page_content: { readonly target_name: string };
}

export interface ApprovalResponse {
  readonly request_id: string;
  readonly approved: boolean;
  readonly operator_ref: string;
  readonly note: string;
  readonly elapsed_s: number; // for timeout modeling against approval_timeout_s
}

// The approval sheet (L6). request returns the operator's decision.
export interface ApprovalSheet {
  request(req: ApprovalRequest): ApprovalResponse;
}
