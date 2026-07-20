// P2 — page-handle-registry.
//
// The single source of a handle's identity: workspace, partition, surface, and
// current nav_epoch. The workspace binding is set at mint and never changes.
// The registry holds no page content and no secret material.

import { randomUUID } from 'node:crypto';
import type { HandleId, PageHandle, PartitionId, SurfaceId, WorkspaceId } from './types.ts';

export interface HandleRecord {
  readonly handle_id: HandleId;
  readonly workspace_id: WorkspaceId;
  readonly partition: PartitionId;
  readonly surface: SurfaceId;
  nav_epoch: number;
  closed: boolean;
}

export const NOT_FOUND = Symbol('not_found');
export type ResolveResult = HandleRecord | typeof NOT_FOUND;
export type SetEpochResult = 'ok' | 'not_found' | 'non_monotonic';

export class PageHandleRegistry {
  private readonly recs = new Map<HandleId, HandleRecord>();

  mint(workspace_id: WorkspaceId, partition: PartitionId, surface: SurfaceId): PageHandle {
    const handle_id = randomUUID();
    this.recs.set(handle_id, {
      handle_id,
      workspace_id,
      partition,
      surface,
      nav_epoch: 0,
      closed: false,
    });
    return { handle_id };
  }

  // Resolve returns the live record, or NOT_FOUND for a closed or unknown
  // handle — never a stale surface.
  resolve(h: PageHandle): ResolveResult {
    const rec = this.recs.get(h.handle_id);
    if (rec === undefined || rec.closed) return NOT_FOUND;
    return rec;
  }

  epoch(h: PageHandle): number | typeof NOT_FOUND {
    const rec = this.resolve(h);
    if (rec === NOT_FOUND) return NOT_FOUND;
    return rec.nav_epoch;
  }

  setEpoch(h: PageHandle, epoch: number): SetEpochResult {
    const rec = this.recs.get(h.handle_id);
    if (rec === undefined || rec.closed) return 'not_found';
    if (epoch <= rec.nav_epoch) return 'non_monotonic';
    rec.nav_epoch = epoch;
    return 'ok';
  }

  close(h: PageHandle): void {
    const rec = this.recs.get(h.handle_id);
    if (rec !== undefined) rec.closed = true;
  }
}
