// Shared test fixtures. Not a test file (no *.test.ts suffix), imported by tests.

import { nodeDigest } from '../src/digest.ts';
import { mintTicket } from '../src/ticket.ts';
import type { RawNode } from '../src/driver.ts';
import type { Action, ExecutionTicket, SecretRef } from '../src/types.ts';

export const FIXED_NOW = '2026-07-20T00:00:00Z';
export const FUTURE = '2026-07-20T01:00:00Z';
export const PAST = '2026-07-19T00:00:00Z';
export const now = (): Date => new Date(FIXED_NOW);

// Deterministic 32-byte session key shared between the boundary and the gate.
export const KEY = Buffer.alloc(32, 7);

export const SECRET_VALUE = 'hunter2-TOPSECRET-value';
export const secretResolver = {
  resolve(ref: SecretRef): string | null {
    return ref.ref === 'vault://pw' && ref.scope === 'https://site' ? SECRET_VALUE : null;
  },
};

export function mkNode(engine_ref: string, o: Partial<Omit<RawNode, 'engine_ref'>> = {}): RawNode {
  return {
    engine_ref,
    tag: o.tag ?? 'input',
    role: o.role ?? 'textbox',
    name: o.name ?? engine_ref,
    testid: o.testid ?? '',
    aria: o.aria ?? '',
    path: o.path ?? 'body/' + engine_ref,
    value: o.value ?? null,
    secret_field: o.secret_field ?? false,
  };
}

export function nodeIdOf(n: RawNode): string {
  return nodeDigest({ tag: n.tag, role: n.role, name: n.name, testid: n.testid, aria: n.aria, path: n.path });
}

let ticketCounter = 0;
export function ticketFor(
  action: Action,
  nav_epoch: number,
  opts: { expiry?: string; ticket_id?: string } = {},
): ExecutionTicket {
  return mintTicket(KEY, {
    ticket_id: opts.ticket_id ?? 'tk-' + String(++ticketCounter),
    action,
    nav_epoch,
    expiry: opts.expiry ?? FUTURE,
  });
}
