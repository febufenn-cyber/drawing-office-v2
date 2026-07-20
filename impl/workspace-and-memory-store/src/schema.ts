// P1 — workspace-schema. Validates the Workspace record and its scope and budget
// fields, and defines the total lifecycle transition table.

import { reject } from './types.ts';
import type {
  Budget,
  CredentialScope,
  LifecycleEvent,
  LifecycleState,
  Rejection,
  Tier,
  Workspace,
} from './types.ts';

const WS_KEYS = new Set([
  'workspace_id',
  'goal',
  'state',
  'partition_id',
  'credential_scope',
  'budget',
  'created_at',
  'archived_at',
]);
const STATES = new Set<LifecycleState>(['active', 'archived', 'deleted']);
const TIERS = new Set<Tier>(['read', 'interact', 'transact']);

// A representative ISO-4217 set; a currency outside it is rejected.
const ISO_4217 = new Set([
  'USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SGD',
  'HKD', 'SEK', 'NOK', 'NZD', 'ZAR', 'BRL', 'MXN', 'AED', 'KRW', 'DKK',
]);

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

function validateScope(v: unknown): CredentialScope | Rejection {
  if (typeof v !== 'object' || v === null) return reject('bad_scope');
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (k !== 'origins' && k !== 'max_tier') return reject('unknown_scope_field:' + k);
  if (!Array.isArray(o.origins) || o.origins.some((x) => typeof x !== 'string')) return reject('bad_origins');
  if (typeof o.max_tier !== 'string' || !TIERS.has(o.max_tier as Tier)) return reject('bad_max_tier');
  return { origins: o.origins as string[], max_tier: o.max_tier as Tier };
}

function validateBudget(v: unknown): Budget | Rejection {
  if (typeof v !== 'object' || v === null) return reject('bad_budget');
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (k !== 'currency' && k !== 'per_action_minor' && k !== 'per_month_minor') return reject('unknown_budget_field:' + k);
  }
  if (typeof o.currency !== 'string' || !ISO_4217.has(o.currency)) return reject('bad_currency');
  if (!isInt(o.per_action_minor) || o.per_action_minor <= 0) return reject('bad_per_action');
  if (!isInt(o.per_month_minor) || o.per_month_minor <= 0) return reject('bad_per_month');
  return {
    currency: o.currency,
    per_action_minor: o.per_action_minor,
    per_month_minor: o.per_month_minor,
  };
}

export function validate(candidate: unknown): Workspace | Rejection {
  if (typeof candidate !== 'object' || candidate === null) return reject('not_an_object');
  const o = candidate as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!WS_KEYS.has(k)) return reject('unknown_field:' + k);
  for (const k of WS_KEYS) if (!(k in o)) return reject('missing_field:' + k);
  if (typeof o.workspace_id !== 'string' || o.workspace_id.length === 0) return reject('bad_workspace_id');
  if (typeof o.goal !== 'string' || o.goal.trim().length === 0) return reject('empty_goal');
  if (typeof o.state !== 'string' || !STATES.has(o.state as LifecycleState)) return reject('bad_state');
  if (typeof o.partition_id !== 'string' || o.partition_id.length === 0) return reject('bad_partition_id');
  if (typeof o.created_at !== 'string') return reject('bad_created_at');
  if (!(o.archived_at === null || typeof o.archived_at === 'string')) return reject('bad_archived_at');
  const scope = validateScope(o.credential_scope);
  if ('rejected' in scope) return scope;
  const budget = validateBudget(o.budget);
  if ('rejected' in budget) return budget;
  return {
    workspace_id: o.workspace_id,
    goal: o.goal,
    state: o.state as LifecycleState,
    partition_id: o.partition_id,
    credential_scope: scope,
    budget,
    created_at: o.created_at,
    archived_at: o.archived_at as string | null,
  };
}

// The total transition table: every state accepts a fixed set of events and
// rejects the rest.
export function transition(state: LifecycleState, event: LifecycleEvent): LifecycleState | Rejection {
  if (state === 'active' && event === 'archive') return 'archived';
  if (state === 'active' && event === 'delete') return 'deleted';
  if (state === 'archived' && event === 'reopen') return 'active';
  if (state === 'archived' && event === 'delete') return 'deleted';
  return reject('illegal_transition');
}
