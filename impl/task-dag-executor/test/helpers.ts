// Shared fixtures: a fixed clock, a persistent workspace-store stub (durable KV +
// append log, surviving controller restarts), recording stubs for the control
// plane / RenderSurface / model router / skill library, a five-step graph that
// exercises every kind, and a wiring helper. Not a test file.

import { CheckpointStore } from '../src/checkpointStore.ts';
import { StepDispatcher } from '../src/dispatcher.ts';
import { RunLog } from '../src/runLog.ts';
import { ResumeController } from '../src/controller.ts';
import type {
  ActionControlPlane, ActionDecision, ActionProposal, Clock, ModelResult, ModelRouter,
  PerceptionSnapshot, PutAck, RenderSurface, Skill, SkillLibrary, WorkspaceStore,
} from '../src/seams.ts';
import type { Edge, Expr, Step, StepKind, TaskGraph } from '../src/types.ts';

export const WS = 'ws-1';
export const HANDLE = 'h1';
export const SNAPSHOT_REF = 'skills@rev7';
export const FIXED_CLOCK: Clock = { now: () => '2026-07-20T00:00:00Z' };

// A durable KV + append log that survives across controller instances. A durable
// write flushes to stable storage before returning its ack.
export class FakeWorkspaceStore implements WorkspaceStore {
  private readonly kv = new Map<string, string>();
  private readonly logs = new Map<string, string[]>();
  flushes = 0;
  nonDurableWrites = 0;

  put(key: string, value: string, durable: boolean): PutAck {
    if (durable) this.flushes++; else this.nonDurableWrites++;
    this.kv.set(key, value);
    return { durable };
  }
  get(key: string): string | null {
    return this.kv.get(key) ?? null;
  }
  append(key: string, value: string, durable: boolean): PutAck {
    if (durable) this.flushes++; else this.nonDurableWrites++;
    const arr = this.logs.get(key) ?? [];
    arr.push(value);
    this.logs.set(key, arr);
    return { durable };
  }
  readAll(key: string): readonly string[] {
    return [...(this.logs.get(key) ?? [])];
  }
}

export class FakeControlPlane implements ActionControlPlane {
  readonly submissions: ActionProposal[] = [];
  constructor(
    private readonly outputsByStep: Readonly<Record<string, Record<string, unknown>>>,
    private readonly denySteps: ReadonlySet<string> = new Set(),
  ) {}
  submit(proposal: ActionProposal): ActionDecision {
    this.submissions.push(proposal);
    return {
      decision: this.denySteps.has(proposal.step_id) ? 'deny' : 'allow',
      outputs: this.outputsByStep[proposal.step_id] ?? {},
      proposal_ref: 'pr:' + proposal.step_id,
    };
  }
  countFor(step_id: string): number {
    return this.submissions.filter((p) => p.step_id === step_id).length;
  }
}

// Read-only perception. `act` exists only so a test can prove it is never called.
export class FakeRenderSurface implements RenderSurface {
  snapshots = 0;
  acts = 0;
  constructor(private readonly values: Readonly<Record<string, unknown>>) {}
  snapshot(handle: string): PerceptionSnapshot {
    this.snapshots++;
    return { snapshot_ref: 'snap:' + handle, values: this.values };
  }
  observe(handle: string): PerceptionSnapshot {
    return this.snapshot(handle);
  }
  act(): void {
    this.acts++;
  }
}

export class FakeModelRouter implements ModelRouter {
  calls = 0;
  constructor(private readonly outputs: Readonly<Record<string, unknown>> = { verdict: 'yes' }) {}
  call(role: string, inputs: Readonly<Record<string, unknown>>): ModelResult {
    void role; void inputs;
    this.calls++;
    return { outputs: this.outputs };
  }
}

export class FakeSkillLibrary implements SkillLibrary {
  constructor(
    private readonly exact: ReadonlySet<string> = new Set(),
    private readonly nearest: ReadonlySet<string> = new Set(),
  ) {}
  lookup_exact(signature: string, snapshot_ref: string): Skill | null {
    return this.exact.has(signature) ? { signature, snapshot_ref } : null;
  }
  lookup_nearest(signature: string): Skill | null {
    return this.nearest.has(signature) ? { signature, snapshot_ref: 'near' } : null;
  }
}

// ---- Fixture graph: navigate -> extract -> compare -> fill -> verify --------

function port(name: string, type = 'string') {
  return { name, type };
}
function step(step_id: string, kind: StepKind, inputs: Array<[string, string]>, outputs: Array<[string, string]>, post: Expr, signature: string): Step {
  return {
    step_id, kind,
    inputs: inputs.map(([n, t]) => port(n, t)),
    outputs: outputs.map(([n, t]) => port(n, t)),
    precondition: { op: 'always' },
    postcondition: post,
    signature,
  };
}

export function linearGraph(): TaskGraph {
  const steps: Step[] = [
    step('s1', 'navigate', [], [['page', 'string']], { op: 'present', port: 'page' }, 'sig-nav'),
    step('s2', 'extract', [['page', 'string']], [['title', 'string']], { op: 'non_empty', port: 'title' }, 'sig-ext'),
    step('s3', 'compare', [['title', 'string']], [['verdict', 'string']], { op: 'present', port: 'verdict' }, 'sig-cmp'),
    step('s4', 'fill', [['verdict', 'string']], [['done', 'boolean']], { op: 'equals', port: 'done', value: true }, 'sig-fill'),
    step('s5', 'verify', [['done', 'boolean']], [['ok', 'boolean']], { op: 'present', port: 'ok' }, 'sig-ver'),
  ];
  const edges: Edge[] = [
    { from_step: 's1', from_port: 'page', to_step: 's2', to_port: 'page' },
    { from_step: 's2', from_port: 'title', to_step: 's3', to_port: 'title' },
    { from_step: 's3', from_port: 'verdict', to_step: 's4', to_port: 'verdict' },
    { from_step: 's4', from_port: 'done', to_step: 's5', to_port: 'done' },
  ];
  return { graph_id: 'g1', workspace_id: WS, steps, edges };
}

// Happy-path stub outputs so every postcondition holds.
export const CONTROL_OUTPUTS = { s1: { page: 'p1' }, s4: { done: true } };
export const PERCEPTION_VALUES = { title: 'Widget', ok: true };

export interface Wired {
  ws: FakeWorkspaceStore;
  control: FakeControlPlane;
  surface: FakeRenderSurface;
  model: FakeModelRouter;
  skills: FakeSkillLibrary;
  checkpoints: CheckpointStore;
  dispatcher: StepDispatcher;
  log: RunLog;
  controller: ResumeController;
}

export interface WireOpts {
  ws?: FakeWorkspaceStore;
  denySteps?: ReadonlySet<string>;
  exact?: ReadonlySet<string>;
  nearest?: ReadonlySet<string>;
  model?: FakeModelRouter;
  control?: FakeControlPlane; // share the external control plane across resume cycles
}

// Wire a fresh controller. Pass an existing ws to simulate a restart/resume over
// the same durable storage, and an existing control plane to count submissions
// across a crash and its resume (the real control plane survives process death).
export function wire(opts: WireOpts = {}): Wired {
  const ws = opts.ws ?? new FakeWorkspaceStore();
  const control = opts.control ?? new FakeControlPlane(CONTROL_OUTPUTS, opts.denySteps ?? new Set());
  const surface = new FakeRenderSurface(PERCEPTION_VALUES);
  const model = opts.model ?? new FakeModelRouter();
  const skills = new FakeSkillLibrary(opts.exact ?? new Set(), opts.nearest ?? new Set());
  const checkpoints = new CheckpointStore(ws, WS);
  const dispatcher = new StepDispatcher(skills, control, surface, model, SNAPSHOT_REF);
  const log = new RunLog(ws, FIXED_CLOCK, WS);
  const controller = new ResumeController(checkpoints, dispatcher, log, FIXED_CLOCK);
  return { ws, control, surface, model, skills, checkpoints, dispatcher, log, controller };
}
