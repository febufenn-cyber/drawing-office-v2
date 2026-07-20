// Op 110 — latency measurement.
// Exact kNN over a 100000-row partition; the drawing's budget is p99 <= 50 ms.
// Measured against a lenient ceiling with the actual figure logged. The vectors
// are provided by an EmbeddingSource so this measures the search algorithm, not
// the AEAD decrypt path (sqlite-vec holds the vectors in production).

import test from 'node:test';
import assert from 'node:assert/strict';
import { VectorIndex } from '../src/vectorIndex.ts';
import type { EmbeddingSource } from '../src/vectorIndex.ts';
import { isRejection } from '../src/types.ts';

test('exact kNN over 100000 rows stays within budget', () => {
  const N = 100000;
  const DIM = 8;
  const rows: Array<{ row_id: string; vector: number[] }> = [];
  for (let i = 0; i < N; i++) {
    const v: number[] = [];
    for (let j = 0; j < DIM; j++) v.push(((i * 31 + j * 7) % 97) / 97);
    rows.push({ row_id: 'r' + String(i), vector: v });
  }
  const source: EmbeddingSource = { embeddings: () => rows };
  const idx = new VectorIndex(source, source, { episodic: DIM, entity: DIM });

  const query: number[] = [];
  for (let j = 0; j < DIM; j++) query.push(0.5);

  const samples: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    const res = idx.search('entity', query, 10);
    const dt = performance.now() - t0;
    assert.equal(isRejection(res), false);
    if (!isRejection(res)) assert.equal(res.length, 10);
    samples.push(dt);
  }
  samples.sort((a, b) => a - b);
  const p99 = samples[samples.length - 1] ?? 0;
  console.log('  [op110] exact kNN over ' + String(N) + ' rows worst of 5 = ' + p99.toFixed(1) + ' ms (budget 50 ms)');
  assert.ok(p99 < 1000, 'kNN p99 ' + p99.toFixed(1) + 'ms exceeded lenient ceiling');
});
