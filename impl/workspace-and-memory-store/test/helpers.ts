// Shared test fixtures. Not a test file.

import type { Budget, CredentialScope, Entity, Episode, SkillDraft } from '../src/types.ts';

export const now = (): Date => new Date('2026-07-20T00:00:00Z');
export const MASTER = Buffer.alloc(32, 9);

export function scope(origins: string[] = ['https://site']): CredentialScope {
  return { origins, max_tier: 'transact' };
}

export function budget(): Budget {
  return { currency: 'USD', per_action_minor: 5000, per_month_minor: 200000 };
}

export function episode(id: string, o: Partial<Episode> = {}): Episode {
  return {
    episode_id: id,
    task_ref: o.task_ref ?? 'task-1',
    started_at: o.started_at ?? '2026-07-20T00:00:00Z',
    ended_at: o.ended_at ?? '2026-07-20T00:01:00Z',
    outcome: o.outcome ?? { status: 'succeeded', detail: 'ok' },
    steps: o.steps ?? [
      { ordinal: 0, action_digest: 'd0', observation_ref: 'obs0' },
      { ordinal: 1, action_digest: 'd1', observation_ref: 'obs1' },
    ],
    embedding: o.embedding ?? [0, 0, 0, 0],
  };
}

export function entity(id: string, o: Partial<Entity> = {}): Entity {
  return {
    entity_id: id,
    kind: o.kind ?? 'product',
    label: o.label ?? 'Label-' + id,
    attributes: o.attributes ?? { price: 10 },
    embedding: o.embedding ?? [0, 0, 0, 0],
    updated_at: o.updated_at ?? '2026-07-20T00:00:00Z',
  };
}

export function skill(id: string): SkillDraft {
  return { skill_id: id, signature: 'sig-' + id, body_ref: 'body://' + id };
}
