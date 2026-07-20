// P2 — workspace-store. The lifecycle owner and the single entry point. It
// validates each record (P1), provisions keys (P3), opens the encrypted
// partition, and hands out the four stores and the vector-index, each scoped to
// one workspace. The catalog is durable on the Disk, so active and archived
// workspaces reload after a process restart (a fresh store over the same Disk and
// keyring). Each workspace maps to exactly one partition id — the isolation
// invariant DO-012 and DO-013 depend on.

import { randomUUID } from 'node:crypto';
import { BudgetLedger } from './budgetLedger.ts';
import type { Disk } from './disk.ts';
import { EntityGraph } from './entityGraph.ts';
import { EpisodicStore } from './episodicStore.ts';
import type { KeyProvisioner } from './keyProvisioner.ts';
import { Partition } from './partition.ts';
import { transition, validate } from './schema.ts';
import { SkillStore } from './skillStore.ts';
import { isRejection, reject } from './types.ts';
import type {
  Budget,
  CredentialScope,
  LifecycleEvent,
  Rejection,
  Workspace,
  WorkspaceId,
} from './types.ts';
import { VectorIndex } from './vectorIndex.ts';
import type { StoreName } from './vectorIndex.ts';

export class WorkspaceStore {
  private readonly catalog = new Map<WorkspaceId, Workspace>();

  constructor(
    private readonly disk: Disk,
    private readonly keys: KeyProvisioner,
    private readonly now: () => Date,
  ) {
    // Restart reload: rebuild the catalog from the durable rows on disk.
    for (const [id, row] of this.disk.catalogRows) this.catalog.set(id, JSON.parse(row) as Workspace);
  }

  private persist(rec: Workspace): void {
    this.catalog.set(rec.workspace_id, rec);
    this.disk.catalogRows.set(rec.workspace_id, JSON.stringify(rec));
  }

  create(goal: string, scope: CredentialScope, budget: Budget): Workspace | Rejection {
    const workspace_id = randomUUID();
    const wk = this.keys.provision(workspace_id);
    const candidate: Workspace = {
      workspace_id,
      goal,
      state: 'active',
      partition_id: wk.partition_id,
      credential_scope: scope,
      budget,
      created_at: this.now().toISOString(),
      archived_at: null,
    };
    const record = validate(candidate);
    if (isRejection(record)) {
      this.keys.zeroize(workspace_id); // no orphan key when nothing is created
      return record;
    }
    const partition = new Partition(wk.data_key, this.disk.backendFor(wk.partition_id));
    new BudgetLedger(partition, this.now).init({
      workspace_id,
      credential_scope: scope,
      caps: budget,
    });
    this.persist(record);
    return record;
  }

  get(id: WorkspaceId): Workspace | Rejection {
    const rec = this.catalog.get(id);
    if (rec === undefined || rec.state === 'deleted') return reject('unknown_workspace');
    return rec;
  }

  list(): Workspace[] {
    return [...this.catalog.values()].filter((w) => w.state !== 'deleted');
  }

  private openPartition(id: WorkspaceId): Partition | Rejection {
    const rec = this.catalog.get(id);
    if (rec === undefined || rec.state === 'deleted') return reject('unknown_workspace');
    const key = this.keys.keyFor(id);
    if (key === null) return reject('no_key');
    return new Partition(key, this.disk.backendFor(rec.partition_id));
  }

  episodic(id: WorkspaceId): EpisodicStore | Rejection {
    const p = this.openPartition(id);
    return isRejection(p) ? p : new EpisodicStore(p);
  }

  entity(id: WorkspaceId): EntityGraph | Rejection {
    const p = this.openPartition(id);
    return isRejection(p) ? p : new EntityGraph(p);
  }

  skill(id: WorkspaceId): SkillStore | Rejection {
    const p = this.openPartition(id);
    return isRejection(p) ? p : new SkillStore(p, this.now);
  }

  budget(id: WorkspaceId): BudgetLedger | Rejection {
    const p = this.openPartition(id);
    return isRejection(p) ? p : new BudgetLedger(p, this.now);
  }

  vectorIndex(id: WorkspaceId, dims: Readonly<Record<StoreName, number>>): VectorIndex | Rejection {
    const ep = this.episodic(id);
    if (isRejection(ep)) return ep;
    const en = this.entity(id);
    if (isRejection(en)) return en;
    return new VectorIndex(ep, en, dims);
  }

  private applyTransition(id: WorkspaceId, event: LifecycleEvent): Workspace | Rejection {
    const rec = this.catalog.get(id);
    if (rec === undefined || rec.state === 'deleted') return reject('unknown_workspace');
    const next = transition(rec.state, event);
    if (isRejection(next)) return next;
    const archived_at =
      next === 'archived' ? this.now().toISOString() : next === 'active' ? null : rec.archived_at;
    const updated: Workspace = { ...rec, state: next, archived_at };
    if (next === 'deleted') this.keys.zeroize(id); // partition becomes unrecoverable
    this.persist(updated);
    return updated;
  }

  archive(id: WorkspaceId): Workspace | Rejection {
    return this.applyTransition(id, 'archive');
  }

  reopen(id: WorkspaceId): Workspace | Rejection {
    return this.applyTransition(id, 'reopen');
  }

  delete(id: WorkspaceId): Workspace | Rejection {
    return this.applyTransition(id, 'delete');
  }
}
