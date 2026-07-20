// P7 — vector-index. Exact nearest-neighbor search over the episodic and entity
// embeddings of one partition. Search is brute-force exact, ordered by distance
// ascending, and never crosses a partition boundary — it reads embeddings the
// stores hold and returns row ids only. Dimension is fixed per store; a
// wrong-dimension vector is rejected, never padded or truncated. sqlite-vec is
// the production substrate for the same exact-kNN semantics.

import { reject } from './types.ts';
import type { Rejection } from './types.ts';

export type StoreName = 'episodic' | 'entity';

export interface Neighbor {
  readonly row_id: string;
  readonly distance: number;
}

// The index reads embeddings the stores hold and nothing more; both the episodic
// store and the entity graph satisfy this.
export interface EmbeddingSource {
  embeddings(): Array<{ row_id: string; vector: readonly number[] }>;
}

function squaredDistance(a: readonly number[], b: readonly number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    const diff = ai - bi;
    d += diff * diff;
  }
  return d;
}

export class VectorIndex {
  constructor(
    private readonly episodic: EmbeddingSource,
    private readonly entity: EmbeddingSource,
    private readonly dims: Readonly<Record<StoreName, number>>,
  ) {}

  checkDimension(store: StoreName, vector: readonly number[]): boolean {
    return vector.length === this.dims[store];
  }

  private source(store: StoreName): Array<{ row_id: string; vector: readonly number[] }> {
    return store === 'episodic' ? this.episodic.embeddings() : this.entity.embeddings();
  }

  search(store: StoreName, query_vector: readonly number[], k: number): Neighbor[] | Rejection {
    if (!this.checkDimension(store, query_vector)) return reject('dimension_mismatch');
    if (!Number.isInteger(k) || k <= 0) return reject('bad_k');
    const rows = this.source(store)
      .filter((r) => r.vector.length === this.dims[store]) // ignore malformed rows, never reshape
      .map((r) => ({ row_id: r.row_id, distance: squaredDistance(query_vector, r.vector) }));
    rows.sort((a, b) => a.distance - b.distance || (a.row_id < b.row_id ? -1 : 1));
    return rows.slice(0, k);
  }
}
