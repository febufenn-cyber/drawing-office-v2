// P6 — skill-store. The workspace's compiled skill library, versioned and
// encrypted. Put appends an immutable new version and advances the skill head;
// get returns the current promoted version by default; demotion flips a version's
// status without deleting it, and a demoted head is never served as current.

import type { Partition } from './partition.ts';
import type { SkillDraft, SkillRecord } from './types.ts';

const RECORDS = 'skill';
const HEADS = 'skill_head';

interface Head {
  readonly skill_id: string;
  readonly current_version: number;
}

function rowId(skill_id: string, version: number): string {
  return skill_id + '@' + String(version);
}

export class SkillStore {
  constructor(
    private readonly partition: Partition,
    private readonly now: () => Date,
  ) {}

  private versions(skill_id: string): SkillRecord[] {
    return this.partition
      .all<SkillRecord>(RECORDS)
      .filter((r) => r.skill_id === skill_id)
      .sort((a, b) => a.version - b.version);
  }

  put(skill: SkillDraft): SkillRecord {
    const head = this.partition.get<Head>(HEADS, skill.skill_id);
    const version = (head?.current_version ?? 0) + 1;
    const record: SkillRecord = {
      skill_id: skill.skill_id,
      version,
      signature: skill.signature,
      body_ref: skill.body_ref,
      status: 'promoted',
      created_at: this.now().toISOString(),
    };
    this.partition.put(RECORDS, rowId(skill.skill_id, version), record);
    this.partition.put(HEADS, skill.skill_id, { skill_id: skill.skill_id, current_version: version });
    return record;
  }

  // Default: the highest-version promoted record. A demoted top version is not
  // served; the next-highest promoted version is returned instead.
  get(skill_id: string, version?: number): SkillRecord | null {
    if (version !== undefined) return this.partition.get<SkillRecord>(RECORDS, rowId(skill_id, version));
    const promoted = this.versions(skill_id).filter((r) => r.status === 'promoted');
    return promoted.length === 0 ? null : (promoted[promoted.length - 1] as SkillRecord);
  }

  demote(skill_id: string, version: number): void {
    const rec = this.partition.get<SkillRecord>(RECORDS, rowId(skill_id, version));
    if (rec === null) return;
    this.partition.put(RECORDS, rowId(skill_id, version), { ...rec, status: 'demoted' });
  }

  list(): SkillRecord[] {
    return this.partition.all<SkillRecord>(RECORDS);
  }
}
