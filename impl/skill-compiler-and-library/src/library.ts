// P4 — skill-library. Versioned per-workspace store keyed by signature, versioned
// by skill_digest, append-only. lookup_exact returns the promoted skill only when
// every locator binds against the referenced snapshot; lookup_nearest returns the
// promoted skill regardless and names the unbound-locator gaps. A demoted skill is
// served by neither. Together they realize the execution order the DO-016 executor
// consumes: exact skill, else nearest with model-patched gaps, else a model run.

import { canonical } from './canonical.ts';
import { resolve_locators, skill_digest, unbound_steps } from './format.ts';
import type { Snapshot, WorkspaceStore } from './seams.ts';
import type { NearestResult, Skill, SkillRecord, SkillStatus } from './types.ts';

export class SkillLibrary {
  private readonly bySig = new Map<string, SkillRecord[]>();

  constructor(
    private readonly ws: WorkspaceStore,
    private readonly workspaceId: string,
  ) {}

  private key(signature: string, version: number): string {
    return 'skill:' + this.workspaceId + ':' + signature + ':' + String(version);
  }

  private records(signature: string): SkillRecord[] {
    let recs = this.bySig.get(signature);
    if (recs === undefined) { recs = []; this.bySig.set(signature, recs); }
    return recs;
  }

  // Writes a versioned record. Idempotent per digest: a resubmitted identical skill
  // reuses its version and only updates status, never forking a duplicate.
  put(skill: Skill, status: SkillStatus, durable: boolean): { version: number } {
    const recs = this.records(skill.signature);
    const dig = skill_digest(skill);
    const existing = recs.find((r) => skill_digest(r.skill) === dig);
    const version = existing !== undefined
      ? existing.version
      : (recs.length === 0 ? 0 : Math.max(...recs.map((r) => r.version))) + 1;

    const stored: Skill = { ...skill, version, status };
    const rec: SkillRecord = { signature: skill.signature, version, skill: stored, status };
    if (existing !== undefined) recs[recs.indexOf(existing)] = rec; else recs.push(rec);

    const ack = this.ws.put(this.key(skill.signature, version), canonical(rec), durable);
    if (durable && !ack.durable) throw new Error('durable put not flushed');
    return { version };
  }

  latest_promoted(signature: string): SkillRecord | null {
    let best: SkillRecord | null = null;
    for (const r of this.records(signature)) {
      if (r.status === 'promoted' && (best === null || r.version > best.version)) best = r;
    }
    return best;
  }

  private snapshotOf(snapshot_ref: string): Snapshot {
    const raw = this.ws.get(snapshot_ref);
    return raw !== null ? (JSON.parse(raw) as Snapshot) : { snapshot_ref, nodes: [] };
  }

  lookup_exact(signature: string, snapshot_ref: string): Skill | null {
    const rec = this.latest_promoted(signature);
    if (rec === null) return null;
    const resolved = resolve_locators(rec.skill, this.snapshotOf(snapshot_ref));
    return resolved.ok ? rec.skill : null;
  }

  lookup_nearest(signature: string, snapshot_ref: string): NearestResult | null {
    const rec = this.latest_promoted(signature);
    if (rec === null) return null;
    return { skill: rec.skill, unbound: unbound_steps(rec.skill, this.snapshotOf(snapshot_ref)) };
  }

  history(signature: string): readonly SkillRecord[] {
    return [...this.records(signature)].sort((a, b) => a.version - b.version);
  }
}
