// P5 — ticket-verifier.
//
// act and fillSecret execute only against a valid ExecutionTicket. The verifier
// checks the MAC under the per-session key, the expiry, the single-use
// consumption state, the action digest, and the nav_epoch, then consumes the
// ticket. The per-session key is shared with the action control plane (DO-012)
// at surface construction and is unreadable above L0.

import { actionDigest, canonical, hexEqual, hmacHex } from './digest.ts';
import { NOT_FOUND } from './registry.ts';
import type { PageHandleRegistry } from './registry.ts';
import type { Action, ExecutionTicket, PageHandle } from './types.ts';

export type VerifyResult = 'ok' | 'reject';

// The signed body of a ticket: everything except the MAC itself.
export function ticketBody(t: Omit<ExecutionTicket, 'mac'>): string {
  return canonical({
    ticket_id: t.ticket_id,
    action_digest: t.action_digest,
    nav_epoch: t.nav_epoch,
    expiry: t.expiry,
  });
}

// The gate/test side: mint a ticket for a resolved action under the session key.
// Present here so the boundary and its tests can produce authentic tickets; the
// key never leaves L0.
export function mintTicket(
  key: Buffer,
  fields: { ticket_id: string; action: Action; nav_epoch: number; expiry: string },
): ExecutionTicket {
  const body = {
    ticket_id: fields.ticket_id,
    action_digest: actionDigest(fields.action),
    nav_epoch: fields.nav_epoch,
    expiry: fields.expiry,
  };
  return { ...body, mac: hmacHex(key, ticketBody(body)) };
}

export class TicketVerifier {
  private readonly consumed = new Set<string>();

  constructor(
    private readonly key: Buffer,
    private readonly registry: PageHandleRegistry,
    private readonly now: () => Date,
  ) {}

  verify(ticket: ExecutionTicket, handle: PageHandle, action: Action): VerifyResult {
    const expectedMac = hmacHex(this.key, ticketBody(ticket));
    if (!hexEqual(expectedMac, ticket.mac)) return 'reject';
    if (this.now().getTime() >= Date.parse(ticket.expiry)) return 'reject';
    if (this.consumed.has(ticket.ticket_id)) return 'reject';
    if (ticket.action_digest !== actionDigest(action)) return 'reject';
    const epoch = this.registry.epoch(handle);
    if (epoch === NOT_FOUND || ticket.nav_epoch !== epoch) return 'reject';
    this.consumed.add(ticket.ticket_id);
    return 'ok';
  }
}
