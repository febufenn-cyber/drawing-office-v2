// P3 — key-provisioner. One master keyring holds the master key and seals a
// per-workspace data key and partition id. Derivation is deterministic in the
// workspace id, so the same workspace always opens under the same key. Zeroize
// drops a workspace's key so its AEAD partition becomes unrecoverable. The master
// key never leaves the process and never enters a partition.

import { deriveKey } from './crypto.ts';
import type { PartitionId, WorkspaceId, WorkspaceKeys } from './types.ts';

const DATA_INFO = 'ws-data';

export class KeyProvisioner {
  // Models the owner-only sealed keyring file.
  private readonly keyring = new Map<WorkspaceId, { data_key: Buffer; partition_id: PartitionId }>();

  constructor(private readonly master: Buffer) {}

  provision(workspace_id: WorkspaceId): WorkspaceKeys {
    const existing = this.keyring.get(workspace_id);
    if (existing !== undefined) return { data_key: existing.data_key, partition_id: existing.partition_id };
    const data_key = deriveKey(this.master, workspace_id, DATA_INFO);
    const partition_id: PartitionId = 'persist:ws-' + workspace_id;
    this.keyring.set(workspace_id, { data_key, partition_id });
    return { data_key, partition_id };
  }

  keyFor(workspace_id: WorkspaceId): Buffer | null {
    return this.keyring.get(workspace_id)?.data_key ?? null;
  }

  partitionFor(workspace_id: WorkspaceId): PartitionId | null {
    return this.keyring.get(workspace_id)?.partition_id ?? null;
  }

  zeroize(workspace_id: WorkspaceId): void {
    const e = this.keyring.get(workspace_id);
    if (e !== undefined) {
      e.data_key.fill(0);
      this.keyring.delete(workspace_id);
    }
  }
}
