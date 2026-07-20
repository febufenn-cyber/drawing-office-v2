// Shared fixtures: a fixed clock, a persistent workspace-store stub, recording
// stubs for RenderSurface and the model router (with distinct generalizer/verifier
// identities), a search trajectory that compiles cleanly, matching sandbox nodes,
// and a wiring helper. Not a test file.

import { canonical } from '../src/canonical.ts';
import { SkillLibrary } from '../src/library.ts';
import { ReplayMonitor } from '../src/monitor.ts';
import { PromotionController } from '../src/controller.ts';
import type {
  ActResult, Clock, LiftResult, ModelRouter, OpenContext, PutAck, RenderSurface,
  SandboxAction, Snapshot, SnapshotNode, WorkspaceStore,
} from '../src/seams.ts';
import type { Trajectory } from '../src/types.ts';

export const WS = 'ws-1';
export const SANDBOX = 'sandbox';
export const FIXED_CLOCK: Clock = { now: () => '2026-07-20T00:00:00Z' };

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

export class FakeSurface implements RenderSurface {
  readonly opens: OpenContext[] = [];
  readonly acts: Array<{ partition: string; action: SandboxAction }> = [];
  private readonly partitionByHandle = new Map<string, string>();
  private h = 0;
  constructor(private readonly nodes: readonly SnapshotNode[]) {}
  open(ctx: OpenContext): string {
    this.opens.push(ctx);
    const handle = 'h' + String(this.h++);
    this.partitionByHandle.set(handle, ctx.partition);
    return handle;
  }
  snapshot(handle: string): Snapshot {
    return { snapshot_ref: 'snap:' + handle, nodes: this.nodes };
  }
  act(handle: string, action: SandboxAction): ActResult {
    this.acts.push({ partition: this.partitionByHandle.get(handle) ?? '?', action });
    return { ok: true };
  }
  actedIds(): string[] {
    return this.acts.map((a) => a.action.stable_id);
  }
}

export const DEFAULT_IDS: Record<string, string> = { generalizer: 'model-A', verifier: 'model-B' };

export function defaultLift(): LiftResult {
  return { parameters: [{ name: 'query', type: 'string', required: true }], param_binding: { 0: 'query' } };
}

export class FakeModel implements ModelRouter {
  liftCalls = 0;
  gradeCalls = 0;
  constructor(
    private readonly ids: Record<string, string> = DEFAULT_IDS,
    private readonly liftFn: () => LiftResult = defaultLift,
    private readonly verdict: 'reproduced' | 'diverged' = 'reproduced',
  ) {}
  identity(role: string): string {
    return this.ids[role] ?? role;
  }
  lift(): LiftResult {
    this.liftCalls++;
    return this.liftFn();
  }
  grade(): 'reproduced' | 'diverged' {
    this.gradeCalls++;
    return this.verdict;
  }
}

// ---- Fixtures --------------------------------------------------------------

export function searchTrajectory(): Trajectory {
  return {
    trajectory_id: 'traj-1',
    signature: 'shop.search',
    source_inputs: { query: 'widget' },
    actions: [
      { index: 0, kind: 'type', node_id: 'n-box', role: 'textbox', name: 'Search', structural_path: 'form/input[0]', field: 'text', value: 'widget', commit: 'none' },
      { index: 1, kind: 'submit', node_id: 'n-submit', role: 'button', name: 'Search', structural_path: 'form/button[0]', field: null, value: null, commit: 'none' },
    ],
    outputs: { results: 3 },
    postconditions: ['results non-empty'],
  };
}

// A payment trajectory whose terminal step is a monetary submit.
export function paymentTrajectory(): Trajectory {
  return {
    trajectory_id: 'traj-pay',
    signature: 'shop.pay',
    source_inputs: { query: 'widget' },
    actions: [
      { index: 0, kind: 'type', node_id: 'n-amt', role: 'textbox', name: 'Amount', structural_path: 'form/input[0]', field: 'text', value: 'widget', commit: 'none' },
      { index: 1, kind: 'submit', node_id: 'n-pay', role: 'button', name: 'Pay', structural_path: 'form/button[0]', field: null, value: null, commit: 'monetary' },
    ],
    outputs: { charged: true },
    postconditions: ['charge recorded'],
  };
}

export function searchNodes(): SnapshotNode[] {
  return [
    { stable_id: 'sb-box', role: 'textbox', name: 'Search', structural_path: 'form/input[0]' },
    { stable_id: 'sb-submit', role: 'button', name: 'Search', structural_path: 'form/button[0]' },
  ];
}

export function paymentNodes(): SnapshotNode[] {
  return [
    { stable_id: 'sb-amt', role: 'textbox', name: 'Amount', structural_path: 'form/input[0]' },
    { stable_id: 'sb-pay', role: 'button', name: 'Pay', structural_path: 'form/button[0]' },
  ];
}

export function putSnapshot(ws: FakeWorkspaceStore, ref: string, nodes: readonly SnapshotNode[]): void {
  ws.put(ref, canonical({ snapshot_ref: ref, nodes }), false);
}

export interface Wired {
  ws: FakeWorkspaceStore;
  surface: FakeSurface;
  model: FakeModel;
  library: SkillLibrary;
  monitor: ReplayMonitor;
  controller: PromotionController;
}

export interface WireOpts {
  ws?: FakeWorkspaceStore;
  nodes?: readonly SnapshotNode[];
  model?: FakeModel;
  windowSize?: number;
  threshold?: number;
}

export function wire(opts: WireOpts = {}): Wired {
  const ws = opts.ws ?? new FakeWorkspaceStore();
  const surface = new FakeSurface(opts.nodes ?? searchNodes());
  const model = opts.model ?? new FakeModel();
  const library = new SkillLibrary(ws, WS);
  const monitor = new ReplayMonitor(ws, WS, opts.windowSize ?? 5, opts.threshold ?? 3);
  const controller = new PromotionController({
    library, monitor, model, surface, ws, clock: FIXED_CLOCK, workspaceId: WS, sandboxPartition: SANDBOX,
  });
  return { ws, surface, model, library, monitor, controller };
}
