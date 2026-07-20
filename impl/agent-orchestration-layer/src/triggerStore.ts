// P4 — trigger-store. Persists trigger definitions, schedules, and run records
// durably across restarts. A put or update returns only after the record is durable,
// so an acknowledged trigger survives a process restart. load_armed returns every
// armed trigger with next_fire_at recomputed from the schedule and the current time,
// so a downtime that spanned scheduled instants surfaces as a single due instant.
// Run records are append-only per trigger and ordered by firing.

import { canonical } from './canonical.ts';
import { largestLE } from './schedule.ts';
import type { Clock, WorkspaceStore } from './seams.ts';
import type { RunRecord, RunState, Trigger, TriggerState } from './types.ts';

export class TriggerStore {
  private readonly triggers = new Map<string, Trigger>();

  constructor(
    private readonly ws: WorkspaceStore,
    private readonly clock: Clock,
    private readonly workspaceId: string,
  ) {
    for (const id of this.ws.readAll(this.indexKey())) {
      const raw = this.ws.get(this.trigKey(id));
      if (raw !== null) this.triggers.set(id, JSON.parse(raw) as Trigger);
    }
  }

  private indexKey(): string { return 'trig-index:' + this.workspaceId; }
  private trigKey(id: string): string { return 'trigger:' + this.workspaceId + ':' + id; }
  private runsKey(id: string): string { return 'runs:' + this.workspaceId + ':' + id; }

  put(trigger: Trigger): void {
    const isNew = !this.triggers.has(trigger.trigger_id);
    this.triggers.set(trigger.trigger_id, trigger);
    const ack = this.ws.put(this.trigKey(trigger.trigger_id), canonical(trigger), true);
    if (!ack.durable) throw new Error('durable put not flushed');
    if (isNew) this.ws.append(this.indexKey(), trigger.trigger_id, true);
  }

  update(trigger: Trigger, state: TriggerState): void {
    trigger.state = state;
    this.triggers.set(trigger.trigger_id, trigger);
    const ack = this.ws.put(this.trigKey(trigger.trigger_id), canonical(trigger), true);
    if (!ack.durable) throw new Error('durable update not flushed');
  }

  // Every armed trigger, with a scheduled trigger's next_fire_at recomputed: if a
  // fire came due during downtime, it is coalesced to the most recent due instant.
  load_armed(now: number): Trigger[] {
    const armed: Trigger[] = [];
    for (const t of this.triggers.values()) {
      if (t.state !== 'armed') continue;
      if (t.kind === 'scheduled' && t.schedule !== null && t.next_fire_at !== null && t.next_fire_at <= now) {
        t.next_fire_at = largestLE(t.schedule, now);
      }
      armed.push(t);
    }
    return armed;
  }

  record_run(trigger_id: string, run_id: string, state: RunState, artifact_ref: string | null = null): void {
    const rec: RunRecord = { run_id, trigger_id, started_at: this.clock.now(), state, artifact_ref };
    const ack = this.ws.append(this.runsKey(trigger_id), canonical(rec), true);
    if (!ack.durable) throw new Error('durable run record not flushed');
  }

  runs(trigger_id: string): RunRecord[] {
    return this.ws.readAll(this.runsKey(trigger_id)).map((s) => JSON.parse(s) as RunRecord);
  }

  // A run is active when it has a `started` record and no later terminal record for
  // the same run_id.
  has_active_run(trigger_id: string): boolean {
    return this.orphanedRun(trigger_id) !== null;
  }

  orphanedRun(trigger_id: string): string | null {
    const recs = this.runs(trigger_id);
    const terminal = new Set(recs.filter((r) => r.state !== 'started').map((r) => r.run_id));
    for (const r of recs) if (r.state === 'started' && !terminal.has(r.run_id)) return r.run_id;
    return null;
  }

  get(trigger_id: string): Trigger | null {
    return this.triggers.get(trigger_id) ?? null;
  }
}
