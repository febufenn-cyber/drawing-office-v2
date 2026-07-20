// P4 — episodic-store. Trajectories and outcomes inside the workspace partition,
// one row per episode, encrypted at rest. Steps are stored in ascending ordinal
// and read back in the same order. The store computes no embeddings; the caller
// supplies the vector.

import type { Partition } from './partition.ts';
import type { Episode, EpisodeFilter } from './types.ts';

const TABLE = 'episodic';

export class EpisodicStore {
  constructor(private readonly partition: Partition) {}

  append(episode: Episode): void {
    const steps = [...episode.steps].sort((a, b) => a.ordinal - b.ordinal);
    this.partition.put(TABLE, episode.episode_id, { ...episode, steps });
  }

  query(filter: EpisodeFilter): Episode[] {
    return this.partition.all<Episode>(TABLE).filter((e) => {
      if (filter.task_ref !== undefined && e.task_ref !== filter.task_ref) return false;
      if (filter.outcome !== undefined && e.outcome.status !== filter.outcome) return false;
      if (filter.from !== undefined && e.started_at < filter.from) return false;
      if (filter.to !== undefined && e.started_at > filter.to) return false;
      return true;
    });
  }

  // Row id and embedding pairs the vector-index reads. It never widens the read
  // surface: only the id and the vector leave the store.
  embeddings(): Array<{ row_id: string; vector: readonly number[] }> {
    return this.partition.all<Episode>(TABLE).map((e) => ({ row_id: e.episode_id, vector: e.embedding }));
  }
}
