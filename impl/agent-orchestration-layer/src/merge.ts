// P2 — merge-verifier. Collapses N partial results into one artifact by claim key,
// unioning each claim's supporting sources, then runs an independent verify pass.
// The merge is deterministic: identical partials in any order collapse to a
// byte-identical artifact whose claims are sorted by key. Verification draws a role
// distinct from every producing role, checks each merged claim against its cited
// sources, and flags every unsupported claim *in place* — it annotates, it never
// removes, so an unsupported claim is visible, not deleted.

import type { Router } from './seams.ts';
import type { Artifact, Claim, Partial, VerifyReport } from './types.ts';

function unionSorted(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}

export function merge(partials: readonly Partial[]): Artifact {
  const byKey = new Map<string, Claim>();
  const gaps: string[] = [];
  for (const p of partials) {
    if (p.gap) gaps.push(p.agent_id);
    for (const c of p.claims) {
      const existing = byKey.get(c.key);
      byKey.set(c.key, existing === undefined
        ? { key: c.key, statement: c.statement, sources: [...c.sources].sort() }
        : { key: existing.key, statement: existing.statement, sources: unionSorted(existing.sources, c.sources) });
    }
  }
  const claims = [...byKey.values()].sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  return { claims, gaps: gaps.sort() };
}

export function verify(artifact: Artifact, router: Router, producing: readonly string[]): VerifyReport {
  const verify_role = router.verify_role(producing);
  const flagged: string[] = [];
  for (const c of artifact.claims) {
    if (!router.supported(verify_role, c)) flagged.push(c.key); // flagged, never removed
  }
  return { artifact, flagged, verify_role };
}
