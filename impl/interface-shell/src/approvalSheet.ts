// P4 — approval-sheet. The visual side of DO-012's approval contract; it derives
// nothing itself. It renders the ApprovalRequest fields and labels every string that
// originated in the page as page content, so a page cannot impersonate the shell to
// the approver. The response it returns is bound to exactly the rendered request_id
// and is valid only before expires_at — no blanket approval, no approval that
// outlives its request. The operator_ref and note ride the response to DO-012's
// audit trail.

import type { ApprovalRequest, Decision, LabeledField, RenderedSheet, RespondResult } from './types.ts';

export function render(request: ApprovalRequest): RenderedSheet {
  // origin and every page string are page-origin content; label them so.
  const fields: LabeledField[] = [
    { label: 'page content', field: 'origin', value: request.origin },
    ...request.page_strings.map((s, i): LabeledField => ({ label: 'page content', field: 'page[' + String(i) + ']', value: s })),
  ];
  return {
    request_id: request.request_id,
    consequence: request.consequence,
    amount_minor: request.amount_minor,
    currency: request.currency,
    finding_codes: request.finding_codes,
    expires_at: request.expires_at,
    fields,
  };
}

export function respond(request: ApprovalRequest, decision: Decision, now: number): RespondResult {
  if (now >= request.expires_at) return { ok: false, reason: 'LAPSED' };
  if (decision.request_id !== request.request_id) return { ok: false, reason: 'REQUEST_MISMATCH' };
  return {
    ok: true,
    response: { request_id: request.request_id, approved: decision.approved, operator_ref: decision.operator_ref, note: decision.note },
  };
}
