// P3 — checkpoint-store. Persists one Checkpoint per step under the workspace key
// through the workspace store; the latest checkpoint per step_id wins. A durable
// write returns only after the workspace store confirms a flush, so a checkpoint
// read back after a crash survives process death. A checkpoint is honored for
// resume only when its input_digest equals the step's currently resolved input
// digest — if an upstream output changed, the digest differs and the step re-runs.

import { canonical } from './canonical.ts';
import { inputDigest } from './schema.ts';
import type { WorkspaceStore } from './seams.ts';
import type { Checkpoint, Step } from './types.ts';

export class CheckpointStore {
  private readonly cache = new Map<string, Checkpoint>();

  constructor(
    private readonly ws: WorkspaceStore,
    private readonly workspaceId: string,
  ) {}

  private key(step_id: string): string {
    return 'cp:' + this.workspaceId + ':' + step_id;
  }

  write(cp: Checkpoint, durable: boolean): void {
    const ack = this.ws.put(this.key(cp.step_id), canonical(cp), durable);
    if (durable && !ack.durable) throw new Error('durable write not flushed');
    this.cache.set(cp.step_id, cp);
  }

  latest(step_id: string): Checkpoint | null {
    const cached = this.cache.get(step_id);
    if (cached !== undefined) return cached;
    const raw = this.ws.get(this.key(step_id));
    if (raw === null) return null;
    const cp = JSON.parse(raw) as Checkpoint;
    this.cache.set(step_id, cp);
    return cp;
  }

  honored(step: Step, resolvedInputs: Readonly<Record<string, unknown>>): boolean {
    const cp = this.latest(step.step_id);
    if (cp === null || cp.status !== 'succeeded') return false;
    return cp.input_digest === inputDigest(step, resolvedInputs);
  }
}
