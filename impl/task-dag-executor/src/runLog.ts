// P6 — run-log. Append-only, strictly-sequenced event log persisted under the
// workspace key through the workspace store, one log per workspace. A durable
// append flushes before it returns, so a pre-dispatch record can never be lost
// behind the effect it records. read_all yields entries in sequence order for
// resume reconstruction and replay.

import { canonical } from './canonical.ts';
import type { Clock, WorkspaceStore } from './seams.ts';
import type { RunEntry, RunEventName } from './types.ts';

export class RunLog {
  private headSeq: number;

  constructor(
    private readonly ws: WorkspaceStore,
    private readonly clock: Clock,
    private readonly workspaceId: string,
  ) {
    this.headSeq = this.readAll().reduce((m, e) => Math.max(m, e.seq), 0);
  }

  private key(): string {
    return 'log:' + this.workspaceId;
  }

  append(event: RunEventName, data: Readonly<Record<string, unknown>>, durable: boolean): RunEntry {
    const seq = this.headSeq + 1;
    const entry: RunEntry = { seq, ts: this.clock.now(), event, data };
    const ack = this.ws.append(this.key(), canonical(entry), durable);
    if (durable && !ack.durable) throw new Error('durable append not flushed');
    this.headSeq = seq;
    return entry;
  }

  readAll(): RunEntry[] {
    return this.ws.readAll(this.key()).map((s) => JSON.parse(s) as RunEntry);
  }

  head(): number {
    return this.headSeq;
  }
}
