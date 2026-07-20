// Shared fixtures and boundary stubs. Not a test file.

import { AuditLog } from '../src/audit.ts';
import { ticketBody } from '../src/boundary.ts';
import type {
  ActResult, ApprovalRequest, ApprovalResponse, ApprovalSheet, ExecutionTicket,
  FillResult, Perception, RenderSurface, SurfaceAction,
} from '../src/boundary.ts';
import { hexEqual, hmacHex } from '../src/canonical.ts';
import { ApprovalGate } from '../src/gate.ts';
import { PolicyStore } from '../src/policyStore.ts';
import type { PolicyDraft } from '../src/policyStore.ts';
import { CapabilityVault } from '../src/vault.ts';
import type { WorkspaceKeySource } from '../src/vault.ts';
import type { ActionProposal, Snapshot } from '../src/types.ts';

export const SESSION_KEY = Buffer.alloc(32, 5);
export const SECRET_VALUE = 'PASSWORD-TOPSECRET-VALUE';

export const wsKeys: WorkspaceKeySource = {
  keyFor: (id: string) => Buffer.from(id.padEnd(32, 'k').slice(0, 32)),
};

export class Clock {
  constructor(public t: Date = new Date('2026-07-20T00:00:00Z')) {}
  now = (): Date => this.t;
  advanceSeconds(s: number): void {
    this.t = new Date(this.t.getTime() + s * 1000);
  }
}

export function samplePolicy(over: Partial<PolicyDraft> = {}): PolicyDraft {
  return {
    workspace_id: over.workspace_id ?? 'w1',
    origin_grants: over.origin_grants ?? [
      { origin: 'https://shop', tier: 'transact' },
      { origin: 'https://mail', tier: 'interact' },
    ],
    forbidden_origins: over.forbidden_origins ?? ['https://evil'],
    caps: 'caps' in over ? (over.caps ?? null) : { currency: 'USD', per_action_minor: 100000, per_workspace_month_minor: 500000 },
    ...(over.rate !== undefined ? { rate: over.rate } : {}),
    destructive_bulk_limit: over.destructive_bulk_limit ?? 25,
    grant_ttl_s: over.grant_ttl_s ?? 120,
    approval_timeout_s: over.approval_timeout_s ?? 600,
  };
}

export function makeSnapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    snapshot_id: over.snapshot_id ?? 's1',
    nav_epoch: over.nav_epoch ?? 0,
    handle_epoch: over.handle_epoch ?? 0,
    workspace_id: over.workspace_id ?? 'w1',
    origin: over.origin ?? 'https://shop',
    url: over.url ?? 'https://shop/checkout',
    nodes: over.nodes ?? [
      { node_id: 'btnBuy', digest: 'dig-buy', role: 'button', name: 'Pay now', kind: 'submit', form_ref: 'f1', href: null, field_class: null, secret_scope: null },
      { node_id: 'btnClick', digest: 'dig-click', role: 'button', name: 'Expand', kind: 'click', form_ref: null, href: null, field_class: null, secret_scope: null },
      { node_id: 'pw', digest: 'dig-pw', role: 'textbox', name: 'password', kind: 'fill_secret', form_ref: null, href: null, field_class: 'credential_ref', secret_scope: 'https://shop' },
      { node_id: 'lnk', digest: 'dig-lnk', role: 'link', name: 'Home', kind: 'navigate', form_ref: null, href: '/home', field_class: null, secret_scope: null },
    ],
    forms: over.forms ?? [
      { form_id: 'f1', action: '/checkout', method: 'POST', form_digest: 'fd1', amount_minor: 5000, currency: 'USD', fields: [{ field_class: 'payment', secret_scope: null }] },
    ],
    entity_count: over.entity_count ?? {},
  };
}

export function makeProposal(over: Partial<ActionProposal> = {}): ActionProposal {
  return {
    proposal_id: over.proposal_id ?? 'p-' + Math.random().toString(16).slice(2),
    workspace_id: over.workspace_id ?? 'w1',
    handle_ref: over.handle_ref ?? 'h1',
    kind: over.kind ?? 'submit',
    target_node: over.target_node ?? 'btnBuy',
    snapshot_ref: over.snapshot_ref ?? { snapshot_id: 's1', nav_epoch: 0 },
    declared: over.declared ?? { intent_text: 'buy', origin: 'https://shop', tier: 'transact', consequence: 'monetary', amount_minor: 5000, currency: 'USD' },
    token_id: over.token_id ?? null,
    secret_ref: over.secret_ref ?? null,
    task_ref: over.task_ref ?? 'task-1',
  };
}

export class StubPerception implements Perception {
  private snap: Snapshot;
  constructor(snap: Snapshot) {
    this.snap = snap;
  }
  set(snap: Snapshot): void {
    this.snap = snap;
  }
  snapshot(_handle: string): Snapshot | null {
    void _handle;
    return this.snap;
  }
}

export class StubSurface implements RenderSurface {
  actCount = 0;
  fillCount = 0;
  lastAction: SurfaceAction | null = null;
  private readonly consumed = new Set<string>();
  private capturedValues: string[] = []; // field content, below L0 — must never surface above

  constructor(
    private readonly sessionKey: Buffer,
    private readonly now: () => Date,
    private readonly handleEpoch = 0,
  ) {}

  private verify(ticket: ExecutionTicket): boolean {
    if (!hexEqual(hmacHex(this.sessionKey, ticketBody(ticket)), ticket.mac)) return false;
    if (this.now().getTime() >= Date.parse(ticket.expiry)) return false;
    if (this.consumed.has(ticket.ticket_id)) return false;
    if (ticket.nav_epoch !== this.handleEpoch) return false;
    this.consumed.add(ticket.ticket_id);
    return true;
  }

  act(_handle: string, action: SurfaceAction, ticket: ExecutionTicket): ActResult {
    void _handle;
    if (!this.verify(ticket)) return { ok: false, detail: 'TICKET_REJECTED' };
    this.actCount++;
    this.lastAction = action;
    return { ok: true, detail: 'done' };
  }

  fillSecret(_handle: string, _node: string, secretValue: Buffer, ticket: ExecutionTicket): FillResult {
    void _handle;
    void _node;
    if (!this.verify(ticket)) return { ok: false };
    this.fillCount++;
    this.capturedValues.push(secretValue.toString()); // the field now holds it, below L0
    return { ok: true };
  }
}

export class StubApproval implements ApprovalSheet {
  requests: ApprovalRequest[] = [];
  approved = true;
  elapsed_s = 1;
  operator_ref = 'operator-1';
  beforeRespond: (() => void) | null = null;

  request(req: ApprovalRequest): ApprovalResponse {
    this.requests.push(req);
    if (this.beforeRespond !== null) this.beforeRespond();
    return { request_id: req.request_id, approved: this.approved, operator_ref: this.operator_ref, note: '', elapsed_s: this.elapsed_s };
  }
}

export interface Wired {
  gate: ApprovalGate;
  perception: StubPerception;
  surface: StubSurface;
  approval: StubApproval;
  vault: CapabilityVault;
  policy: PolicyStore;
  audit: AuditLog;
  clock: Clock;
  transactToken: string;
}

export function makeGate(over: { policy?: PolicyDraft; snapshot?: Snapshot; handleEpoch?: number } = {}): Wired {
  const clock = new Clock();
  const policy = new PolicyStore();
  policy.load(over.policy ?? samplePolicy());
  const vault = new CapabilityVault(wsKeys);
  vault.putSecret('w1', 'vault://pw', Buffer.from(SECRET_VALUE), 'https://shop', 'credential_ref');
  const token = vault.mint('w1', 'https://shop', 'transact', null, new Date('2027-01-01T00:00:00Z').toISOString());
  const audit = new AuditLog(wsKeys.keyFor('w1') as Buffer);
  const perception = new StubPerception(over.snapshot ?? makeSnapshot());
  const surface = new StubSurface(SESSION_KEY, clock.now, over.handleEpoch ?? 0);
  const approval = new StubApproval();
  const gate = new ApprovalGate(policy, vault, audit, perception, surface, approval, SESSION_KEY, clock.now);
  return { gate, perception, surface, approval, vault, policy, audit, clock, transactToken: token.token_id };
}
