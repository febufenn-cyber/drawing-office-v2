// P5 — independence-guard. The mechanism behind "a verifier is never the
// producer". Producer identity is not caller free text: each routed result
// carries a producer tag whose mac is stamped with a per-session key, and a
// verify request must echo it. A tag with an invalid mac is rejected, so a caller
// cannot force verification onto a chosen model.

import { canonical, hexEqual, hmacHex } from './crypto.ts';
import type { Axis, ModelBinding, ProducerTag } from './types.ts';

// The signed body of a producer tag (everything except the mac).
export function tagBody(t: Omit<ProducerTag, 'mac'>): string {
  return canonical({ model_id: t.model_id, family: t.family, provider: t.provider, model_class: t.model_class });
}

export function stampProducerTag(sessionKey: Buffer, binding: ModelBinding): ProducerTag {
  const body = { model_id: binding.model_id, family: binding.family, provider: binding.provider, model_class: binding.model_class };
  return { ...body, mac: hmacHex(sessionKey, tagBody(body)) };
}

export function macValid(sessionKey: Buffer, tag: ProducerTag): boolean {
  return hexEqual(hmacHex(sessionKey, tagBody(tag)), tag.mac);
}

// The set of model_ids excluded from verification under the axis, over the full
// set of bindings the policy knows.
export function exclusionFor(tag: ProducerTag, axis: Axis, allBindings: readonly ModelBinding[]): Set<string> {
  if (axis === 'model') return new Set([tag.model_id]);
  const key = axis === 'family' ? 'family' : 'provider';
  const out = new Set<string>();
  for (const b of allBindings) if (b[key] === tag[key]) out.add(b.model_id);
  // The producer's own model_id is always excluded, even if it is absent from the
  // known bindings.
  out.add(tag.model_id);
  return out;
}

export function assertIndependent(selected_id: string, exclusion: ReadonlySet<string>): 'ok' | 'violation' {
  return exclusion.has(selected_id) ? 'violation' : 'ok';
}
