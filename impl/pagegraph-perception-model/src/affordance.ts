// P5 — affordance-inventory. Decides what an action against a node would do. Its
// posture never under-classifies: field class follows a fixed precedence and the
// credential and payment classes never fall through to free_form.

import type { Affordance, AffordanceKind, FieldClass, Spine, WorkingNode } from './types.ts';

const AUTOCOMPLETE_MAP: Readonly<Record<string, FieldClass>> = {
  'cc-number': 'payment', 'cc-exp': 'payment', 'cc-csc': 'payment', 'cc-name': 'payment',
  email: 'identifier', tel: 'identifier', username: 'identifier',
  'street-address': 'address', 'address-line1': 'address', 'postal-code': 'address',
};
const PAYMENT_RE = /\b(card|cardnumber|cc|cvv|cvc|credit|payment|amount|price)\b/;
const ADDRESS_RE = /\b(address|street|city|zip|postal|state|country)\b/;
const SEARCH_RE = /\b(search|query)\b/;

function attr(node: WorkingNode, k: string): string {
  return (node.attrs[k] ?? '').toLowerCase();
}

function inferFieldClass(node: WorkingNode): FieldClass {
  const auto = attr(node, 'autocomplete');
  const mapped = AUTOCOMPLETE_MAP[auto];
  if (mapped !== undefined) return mapped;

  const type = attr(node, 'type');
  if (type === 'password' || node.value_mask !== null) return 'credential_ref';
  if (type === 'email' || type === 'tel' || type === 'url') return 'identifier';

  const label = (node.name + ' ' + attr(node, 'name') + ' ' + attr(node, 'placeholder')).toLowerCase();
  if (PAYMENT_RE.test(label)) return 'payment';
  if (ADDRESS_RE.test(label)) return 'address';
  if (SEARCH_RE.test(label)) return 'search';
  if (node.role === 'textbox' || type === 'text') return 'text';
  return 'free_form';
}

function affordanceKind(node: WorkingNode): AffordanceKind {
  if (node.value_mask !== null || attr(node, 'type') === 'password') return 'fill_secret';
  switch (node.role) {
    case 'button':
      return attr(node, 'type') === 'submit' ? 'submit' : 'click';
    case 'link':
      return 'navigate';
    case 'textbox':
      return 'type';
    case 'select':
    case 'checkbox':
    case 'radio':
    case 'option':
      return 'select';
    default:
      return 'none';
  }
}

function enclosingForm(node: WorkingNode, spine: Spine, parent: Map<string, string>): WorkingNode | null {
  let cur = parent.get(node.ax_id);
  while (cur !== undefined) {
    const p = spine.nodes.get(cur);
    if (p === undefined) return null;
    if (p.role === 'form') return p;
    cur = parent.get(cur);
  }
  return null;
}

export function inventory(spine: Spine): void {
  const parent = new Map<string, string>();
  for (const n of spine.nodes.values()) for (const c of n.children_ax_ids) parent.set(c, n.ax_id);

  for (const ax_id of spine.order) {
    const node = spine.nodes.get(ax_id);
    if (node === undefined) continue;
    const kind = affordanceKind(node);
    if (kind === 'none') {
      node.affordance = null;
      continue;
    }
    const typing = kind === 'type' || kind === 'fill_secret';
    const field_class: FieldClass | null = typing ? inferFieldClass(node) : null;
    const secret_scope = field_class === 'credential_ref' ? node.value_mask : null;
    const form = enclosingForm(node, spine, parent);
    const method = kind === 'submit' || typing ? (form?.attrs['method'] ?? null) : null;
    const action_target =
      kind === 'submit' ? (form?.attrs['action'] ?? null) : kind === 'navigate' ? (node.attrs['href'] ?? null) : null;
    const affordance: Affordance = { kind, method, action_target, field_class, secret_scope };
    node.affordance = affordance;
  }
}
