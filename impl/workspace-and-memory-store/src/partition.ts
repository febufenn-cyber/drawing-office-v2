// An open, encrypted workspace partition. Rows are sealed under the workspace
// data key before they reach the backend and opened on read, so the backend —
// and thus the on-disk file — holds only ciphertext. A partition is only ever
// obtained through an opened workspace, which is how every store access stays
// scoped to one workspace.

import { open, seal } from './crypto.ts';
import type { Sealed } from './crypto.ts';
import type { RawBackend } from './disk.ts';

export class Partition {
  constructor(
    private readonly key: Buffer,
    private readonly backend: RawBackend,
  ) {}

  put(table: string, row_id: string, value: unknown): void {
    this.backend.write(table, row_id, JSON.stringify(seal(this.key, JSON.stringify(value))));
  }

  get<T>(table: string, row_id: string): T | null {
    const blob = this.backend.read(table, row_id);
    if (blob === undefined) return null;
    const pt = open(this.key, JSON.parse(blob) as Sealed);
    return pt === null ? null : (JSON.parse(pt) as T);
  }

  all<T>(table: string): T[] {
    const out: T[] = [];
    for (const { blob } of this.backend.all(table)) {
      const pt = open(this.key, JSON.parse(blob) as Sealed);
      if (pt !== null) out.push(JSON.parse(pt) as T);
    }
    return out;
  }

  remove(table: string, row_id: string): void {
    this.backend.remove(table, row_id);
  }
}
