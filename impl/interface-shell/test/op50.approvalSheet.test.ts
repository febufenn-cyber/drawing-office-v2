// Op 50 — P4 approval-sheet. All request fields render; every page-origin string is
// labeled page content; the response binds to the rendered request_id; a foreign-id
// response is rejected; a response after expiry lapses.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render, respond } from '../src/approvalSheet.ts';
import { approvalRequest } from './helpers.ts';
import type { Decision } from '../src/types.ts';

const decision = (over: Partial<Decision> = {}): Decision => ({
  request_id: over.request_id ?? 'req-1',
  approved: over.approved ?? true,
  operator_ref: over.operator_ref ?? 'operator:alice',
  note: over.note ?? null,
});

test('render presents all request fields', () => {
  const sheet = render(approvalRequest());
  assert.equal(sheet.request_id, 'req-1');
  assert.equal(sheet.consequence, 'transact');
  assert.equal(sheet.amount_minor, 1000);
  assert.equal(sheet.currency, 'USD');
  assert.deepEqual(sheet.finding_codes, ['FC_MONETARY']);
  assert.equal(sheet.expires_at, 100);
});

test('every page-origin string is labeled page content', () => {
  const sheet = render(approvalRequest({ page_strings: ['Buy now', 'Limited offer'] }));
  const origin = sheet.fields.find((f) => f.field === 'origin');
  assert.equal(origin?.label, 'page content'); // the origin is page content
  assert.ok(sheet.fields.filter((f) => f.field.startsWith('page[')).every((f) => f.label === 'page content'));
});

test('a response before expiry binds to the rendered request_id with operator and note', () => {
  const req = approvalRequest();
  const r = respond(req, decision({ approved: true, note: 'looks fine' }), 50);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.response.request_id, 'req-1');
  assert.equal(r.response.approved, true);
  assert.equal(r.response.operator_ref, 'operator:alice');
  assert.equal(r.response.note, 'looks fine');
});

test('a response for a foreign request_id is rejected', () => {
  const r = respond(approvalRequest(), decision({ request_id: 'req-999' }), 50);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'REQUEST_MISMATCH');
});

test('a response at or after expires_at lapses and emits nothing', () => {
  const r = respond(approvalRequest({ expires_at: 100 }), decision(), 100);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'LAPSED');
});
