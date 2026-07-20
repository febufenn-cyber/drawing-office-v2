// Shared fixtures: a mutable epoch-seconds clock, a persistent workspace-store stub,
// stub ledger / executor / router / action-control-plane, and task/trigger builders.
// Not a test file.

import { BudgetManager } from '../src/budget.ts';
import { FanoutScheduler } from '../src/fanout.ts';
import { TriggerStore } from '../src/triggerStore.ts';
import { BackgroundRunner } from '../src/runner.ts';
import type {
  AcpDecision, AcpProposal, ActionControlPlane, Clock, ExecResult, Executor, Ledger,
  PutAck, Router, WorkspaceStore,
} from '../src/seams.ts';
import type {
  Actual, Ceiling, Claim, Request, ResearchTask, SubAgentDag, TaskTemplate, Trigger,
} from '../src/types.ts';

export const WS = 'w1';
const ZERO: Actual = { tokens: 0, seconds: 0, money_minor: 0 };

export class MutableClock implements Clock {
  constructor(public t = 0) {}
  now(): number { return this.t; }
  set(t: number): void { this.t = t; }
}

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
  get(key: string): string | null { return this.kv.get(key) ?? null; }
  append(key: string, value: string, durable: boolean): PutAck {
    if (durable) this.flushes++; else this.nonDurableWrites++;
    const arr = this.logs.get(key) ?? [];
    arr.push(value);
    this.logs.set(key, arr);
    return { durable };
  }
  readAll(key: string): readonly string[] { return [...(this.logs.get(key) ?? [])]; }
}

export class StubLedger implements Ledger {
  constructor(public spent = 0, public cap = 1_000_000) {}
  month_spent(_ws: string): number { return this.spent; }
  workspace_cap(_ws: string): number { return this.cap; }
}

export class StubRouter implements Router {
  constructor(private readonly unsupported: ReadonlySet<string> = new Set(), private readonly role = 'verifier') {}
  verify_role(producing: readonly string[]): string {
    return producing.includes(this.role) ? this.role + '-alt' : this.role;
  }
  supported(_role: string, claim: Claim): boolean {
    return !this.unsupported.has(claim.key);
  }
}

export class StubAcp implements ActionControlPlane {
  readonly submits: AcpProposal[] = [];
  constructor(private readonly decision: AcpDecision = { decision: 'gate' }) {}
  submit(proposal: AcpProposal): AcpDecision {
    this.submits.push(proposal);
    return this.decision;
  }
}

export interface ExecutorOpts {
  gapAgents?: ReadonlySet<string>;
  acp?: ActionControlPlane;
  monetaryPages?: ReadonlySet<string>;
  perPageActual?: Actual;
}

export class StubExecutor implements Executor {
  readonly submits: Array<{ dag: SubAgentDag; budget_hook: Request }> = [];
  constructor(private readonly opts: ExecutorOpts = {}) {}
  submit(dag: SubAgentDag, budget_hook: Request): ExecResult {
    this.submits.push({ dag, budget_hook });
    if (this.opts.gapAgents?.has(dag.agent_id)) {
      return { partial: { agent_id: dag.agent_id, claims: [], gap: true }, actual: ZERO };
    }
    // A monetary page still crosses the action control plane's human gate.
    if (this.opts.acp !== undefined) {
      for (const p of dag.pages) {
        if (this.opts.monetaryPages?.has(p)) {
          this.opts.acp.submit({ workspace_id: WS, task_id: dag.agent_id, tier: 'transact', amount_minor: 100 });
        }
      }
    }
    const claims: Claim[] = dag.pages.map((p) => ({ key: 'claim:' + p, statement: 'about ' + p, sources: [p] }));
    const per = this.opts.perPageActual ?? { tokens: 10, seconds: 1, money_minor: 0 };
    const actual: Actual = {
      tokens: per.tokens * dag.pages.length,
      seconds: per.seconds * dag.pages.length,
      money_minor: per.money_minor * dag.pages.length,
    };
    return { partial: { agent_id: dag.agent_id, claims, gap: false }, actual };
  }
}

// ---- Builders --------------------------------------------------------------

export function ceiling(over: Partial<Ceiling> = {}): Ceiling {
  return { tokens: over.tokens ?? 100000, seconds: over.seconds ?? 100000, money_minor: over.money_minor ?? 0, currency: 'USD' };
}

export function researchTask(pages: string[], over: Partial<ResearchTask> = {}): ResearchTask {
  return {
    id: over.id ?? 'task-1',
    workspace: WS,
    page_set: pages,
    ceiling: over.ceiling ?? ceiling(),
    per_page: over.per_page ?? { tokens: 10, seconds: 1, money_max: 0 },
    producing_roles: over.producing_roles ?? ['agent-0', 'agent-1'],
  };
}

export function scheduledTrigger(over: Partial<Trigger> = {}): Trigger {
  const template: TaskTemplate = over.task_template ?? {
    fans_out: false, task: null, width: 1, dag: { agent_id: 'a', pages: ['p1'] }, request: { tokens: 10, seconds: 1, money_max: 0 },
  };
  return {
    trigger_id: over.trigger_id ?? 'trig-1',
    workspace_id: WS,
    kind: 'scheduled',
    schedule: over.schedule ?? { interval_seconds: 60, anchor: 0 },
    event_sub: null,
    task_template: template,
    ceiling: over.ceiling ?? ceiling(),
    next_fire_at: over.next_fire_at ?? 60,
    state: over.state ?? 'armed',
    expires_at: over.expires_at ?? null,
  };
}

export function eventTrigger(event_type: string, over: Partial<Trigger> = {}): Trigger {
  return {
    ...scheduledTrigger(over),
    trigger_id: over.trigger_id ?? 'trig-ev',
    kind: 'event',
    schedule: null,
    event_sub: { event_type },
    next_fire_at: null,
  };
}

export interface Wired {
  ws: FakeWorkspaceStore;
  clock: MutableClock;
  ledger: StubLedger;
  executor: StubExecutor;
  router: StubRouter;
  budget: BudgetManager;
  fanout: FanoutScheduler;
  store: TriggerStore;
  runner: BackgroundRunner;
}

export interface WireOpts {
  ws?: FakeWorkspaceStore;
  clock?: MutableClock;
  ledger?: StubLedger;
  executor?: StubExecutor;
  router?: StubRouter;
}

export function wire(opts: WireOpts = {}): Wired {
  const ws = opts.ws ?? new FakeWorkspaceStore();
  const clock = opts.clock ?? new MutableClock();
  const ledger = opts.ledger ?? new StubLedger();
  const executor = opts.executor ?? new StubExecutor();
  const router = opts.router ?? new StubRouter();
  const budget = new BudgetManager(ledger);
  const fanout = new FanoutScheduler({ budget, executor, router });
  const store = new TriggerStore(ws, clock, WS);
  const runner = new BackgroundRunner({ store, budget, fanout, executor });
  return { ws, clock, ledger, executor, router, budget, fanout, store, runner };
}
