// P3 — session-partitioner.
//
// One session partition per workspace. Two workspaces never share a partition,
// so a compromised task cannot reach another workspace's cookies, storage, or
// logins. This is the only part that touches the engine's session API (through
// the RawEngine seam). It refuses a partition key that is not scoped to its
// workspace, so a caller cannot smuggle a surface into a foreign partition.

import type { RawEngine } from './driver.ts';
import type { PartitionId, SurfaceId, WorkspaceId } from './types.ts';

// A partition key is workspace-scoped iff it is prefixed by the workspace id.
export function keyScopedToWorkspace(key: string, workspace_id: WorkspaceId): boolean {
  return workspace_id.length > 0 && key.startsWith(workspace_id + ':');
}

export class SessionPartitioner {
  private readonly partitions = new Map<WorkspaceId, PartitionId>();

  constructor(private readonly engine: RawEngine) {}

  // Returns the one partition for the workspace, creating it once. Returns null
  // when the key is not scoped to the workspace; P1 maps that to invalid_ctx.
  partitionFor(workspace_id: WorkspaceId, key: string): PartitionId | null {
    if (!keyScopedToWorkspace(key, workspace_id)) return null;
    const existing = this.partitions.get(workspace_id);
    if (existing !== undefined) return existing;
    const partition: PartitionId = 'persist:' + workspace_id;
    this.partitions.set(workspace_id, partition);
    return partition;
  }

  createSurface(partition: PartitionId, url: string, workspace_id: WorkspaceId): SurfaceId {
    return this.engine.createSurface(partition, url, workspace_id);
  }
}
