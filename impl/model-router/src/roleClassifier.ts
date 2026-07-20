// P2 — role-classifier. Total function over the closed role set. plan -> frontier,
// extract -> fast, classify -> fast. verify is admitted but its class is deferred
// to the dispatcher, which sets it from the producer tag. An unknown role is
// rejected, never defaulted.

import { ROLES, reject } from './types.ts';
import type { ModelClass, Rejection, Role } from './types.ts';

export type ClassRequirement = { readonly deferred: true } | { readonly deferred: false; readonly model_class: ModelClass };

const FIXED: Readonly<Record<'plan' | 'extract' | 'classify', ModelClass>> = {
  plan: 'frontier',
  extract: 'fast',
  classify: 'fast',
};

export function classify(role: Role): ClassRequirement | Rejection {
  if (!ROLES.has(role)) return reject('invalid_request');
  if (role === 'verify') return { deferred: true };
  return { deferred: false, model_class: FIXED[role] };
}
