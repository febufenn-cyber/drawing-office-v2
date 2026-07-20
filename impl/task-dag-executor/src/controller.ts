// P5 — resume-controller. The single entry point for a run. On start it loads the
// checkpoints and run-log for the workspace (a fresh workspace reconstructs to an
// empty state) and drives the loop: ask the scheduler for the next ready step,
// dispatch it, write the checkpoint durably, and append the lifecycle event before
// advancing. A step whose checkpoint is honored is skipped, so no completed step
// re-executes across a resume. A consequential step whose log holds a pre-dispatch
// record but no settle record is in-doubt: the controller halts and never
// auto-resubmits, because a duplicated payment or send is worse than a stall.
// Replay reconstructs the run from the log alone, with no side-effecting call.

import { inputDigest } from './schema.ts';
import { resolveInputs } from './resolve.ts';
import { allTerminal, next } from './scheduler.ts';
import { CONSEQUENTIAL } from './types.ts';
import type { CheckpointStore } from './checkpointStore.ts';
import type { Dispatcher } from './dispatcher.ts';
import type { RunLog } from './runLog.ts';
import type { Clock } from './seams.ts';
import type { Checkpoint, RunEntry, Step, StepStatus, TaskGraph } from './types.ts';

export interface RunRequest {
  readonly workspace_id: string;
  readonly handle: string;
}

export type RunOutcome =
  | { readonly status: 'completed'; readonly executed: number }
  | { readonly status: 'blocked'; readonly step_id: string }
  | { readonly status: 'halted_in_doubt'; readonly step_id: string };

function byStepId(a: Step, b: Step): number {
  return a.step_id < b.step_id ? -1 : a.step_id > b.step_id ? 1 : 0;
}

export class ResumeController {
  constructor(
    private readonly checkpoints: CheckpointStore,
    private readonly dispatcher: Dispatcher,
    private readonly log: RunLog,
    private readonly clock: Clock,
  ) {}

  run(graph: TaskGraph, request: RunRequest): RunOutcome {
    const resuming = this.log.head() > 0;
    if (resuming) this.log.append('run.resumed', { graph_id: graph.graph_id, from_seq: this.log.head() }, false);
    else this.log.append('run.started', { graph_id: graph.graph_id, workspace_id: request.workspace_id }, false);

    // Skip already-honored steps once, so a completed step never re-executes.
    for (const step of [...graph.steps].sort(byStepId)) {
      const resolved = resolveInputs(graph, step, this.checkpoints);
      if (this.checkpoints.honored(step, resolved) && !this.alreadySkipped(step.step_id)) {
        this.log.append('step.skipped', { step_id: step.step_id, input_digest: inputDigest(step, resolved) }, false);
      }
    }

    let executed = 0;
    for (;;) {
      const step = next(graph, this.checkpoints);
      if (step === null) {
        const outcome: RunOutcome = allTerminal(graph, this.checkpoints)
          ? { status: 'completed', executed }
          : { status: 'blocked', step_id: this.firstFailed(graph) ?? '' };
        this.log.append('run.completed', { graph_id: graph.graph_id, outcome: outcome.status }, false);
        return outcome;
      }

      const inputs = resolveInputs(graph, step, this.checkpoints);
      const digest = inputDigest(step, inputs);
      const attempt = (this.checkpoints.latest(step.step_id)?.attempt ?? 0) + 1;
      const idem = step.step_id + ':' + digest;
      this.log.append('step.ready', { step_id: step.step_id, attempt }, false);

      if (CONSEQUENTIAL.has(step.kind)) {
        if (this.preDispatchedWithoutSettle(step.step_id, digest)) {
          this.log.append('step.in_doubt', { step_id: step.step_id, idempotency_key: idem }, true);
          return { status: 'halted_in_doubt', step_id: step.step_id };
        }
        // Durable pre-dispatch before the effect, so the submission is bounded to
        // at most one across any number of resume cycles.
        this.log.append('step.pre_dispatch', { step_id: step.step_id, input_digest: digest, idempotency_key: idem }, true);
      }

      const result = this.dispatcher.dispatch(
        { workspace_id: request.workspace_id, graph_id: graph.graph_id, handle: request.handle }, step, inputs, idem,
      );

      this.log.append('step.strategy_chosen', { step_id: step.step_id, strategy: result.strategy, snapshot_ref: result.snapshot_ref }, false);
      if (result.boundary === 'control_plane') this.log.append('action.submitted', { step_id: step.step_id, proposal_ref: result.proposal_ref }, false);
      else if (result.boundary === 'perception') this.log.append('perception.read', { step_id: step.step_id, snapshot_ref: result.snapshot_ref }, false);

      const cp: Checkpoint = {
        step_id: step.step_id, input_digest: digest, status: result.status,
        outputs: result.outputs, attempt, ts: this.clock.now(),
      };
      this.checkpoints.write(cp, true);

      if (result.status === 'succeeded') {
        this.log.append('step.succeeded', { step_id: step.step_id, input_digest: digest, output_ref: digest }, false);
        executed++;
      } else {
        this.log.append('step.failed', { step_id: step.step_id, reason: result.detail }, false);
      }
    }
  }

  replay(): ReplayState {
    return replay(this.log.readAll());
  }

  private alreadySkipped(step_id: string): boolean {
    return this.log.readAll().some((e) => e.event === 'step.skipped' && e.data['step_id'] === step_id);
  }

  private preDispatchedWithoutSettle(step_id: string, digest: string): boolean {
    const entries = this.log.readAll();
    let preSeq = -1;
    for (const e of entries) {
      if (e.event === 'step.pre_dispatch' && e.data['step_id'] === step_id && e.data['input_digest'] === digest) preSeq = e.seq;
    }
    if (preSeq < 0) return false;
    const settled = entries.some((e) =>
      e.seq > preSeq && (e.event === 'step.succeeded' || e.event === 'step.failed') && e.data['step_id'] === step_id);
    return !settled;
  }

  private firstFailed(graph: TaskGraph): string | null {
    for (const s of [...graph.steps].sort(byStepId)) {
      if (this.checkpoints.latest(s.step_id)?.status === 'failed') return s.step_id;
    }
    return null;
  }
}

export interface ReplayState {
  readonly events: readonly RunEntry[];
  readonly steps: ReadonlyArray<{ step_id: string; strategy: string | null; status: StepStatus }>;
}

// Reconstruct the ordered run from the log alone — no control-plane, RenderSurface,
// model, or skill call. Pure over the entries.
export function replay(entries: readonly RunEntry[]): ReplayState {
  const strat = new Map<string, string>();
  const status = new Map<string, StepStatus>();
  for (const e of entries) {
    const id = String(e.data['step_id'] ?? '');
    if (e.event === 'step.strategy_chosen') strat.set(id, String(e.data['strategy']));
    else if (e.event === 'step.succeeded') status.set(id, 'succeeded');
    else if (e.event === 'step.failed') status.set(id, 'failed');
    else if (e.event === 'step.in_doubt') status.set(id, 'in_doubt');
    else if (e.event === 'step.skipped') { if (!status.has(id)) status.set(id, 'skipped'); }
  }
  const steps = [...status.keys()].sort().map((id) => ({ step_id: id, strategy: strat.get(id) ?? null, status: status.get(id) as StepStatus }));
  return { events: entries, steps };
}
