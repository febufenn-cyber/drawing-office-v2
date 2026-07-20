// The storage substrate seam. A RawBackend is one encrypted database file: it
// stores opaque sealed blobs per (table, row_id) and never sees a plaintext
// field. MemBackend is the in-memory test substrate; the production substrate is
// SQLite with AEAD page encryption (SQLCipher) plus sqlite-vec, behind this same
// interface. Disk models the local data directory: one RawBackend per partition
// id, plus a durable workspace catalog, all surviving a process "restart"
// (constructing a new store over the same Disk).

import type { PartitionId, WorkspaceId } from './types.ts';

export interface RawRow {
  readonly row_id: string;
  readonly blob: string;
}

export interface RawBackend {
  write(table: string, row_id: string, blob: string): void;
  read(table: string, row_id: string): string | undefined;
  all(table: string): readonly RawRow[];
  remove(table: string, row_id: string): void;
  // Everything actually persisted, for the on-disk inspector: it must contain no
  // plaintext field value.
  rawBytes(): string;
}

export class MemBackend implements RawBackend {
  private readonly tables = new Map<string, Map<string, string>>();

  private table(name: string): Map<string, string> {
    let t = this.tables.get(name);
    if (t === undefined) {
      t = new Map<string, string>();
      this.tables.set(name, t);
    }
    return t;
  }

  write(table: string, row_id: string, blob: string): void {
    this.table(table).set(row_id, blob);
  }

  read(table: string, row_id: string): string | undefined {
    return this.tables.get(table)?.get(row_id);
  }

  all(table: string): readonly RawRow[] {
    const t = this.tables.get(table);
    if (t === undefined) return [];
    return [...t.entries()].map(([row_id, blob]) => ({ row_id, blob }));
  }

  remove(table: string, row_id: string): void {
    this.tables.get(table)?.delete(row_id);
  }

  rawBytes(): string {
    const parts: string[] = [];
    for (const t of this.tables.values()) for (const blob of t.values()) parts.push(blob);
    return parts.join('');
  }
}

// The local data directory: partition files plus the durable catalog. Survives a
// store restart, which is modeled by building a fresh WorkspaceStore over the
// same Disk (and the same keyring).
export class Disk {
  readonly partitions = new Map<PartitionId, RawBackend>();
  readonly catalogRows = new Map<WorkspaceId, string>();

  backendFor(partition_id: PartitionId): RawBackend {
    let b = this.partitions.get(partition_id);
    if (b === undefined) {
      b = new MemBackend();
      this.partitions.set(partition_id, b);
    }
    return b;
  }
}
