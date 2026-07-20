// Shared fixtures: a sample policy, stub providers, a stub budget manager (the
// DO-020 feedback edge), and a wired router. Not a test file.

import { CostMeter } from '../src/costMeter.ts';
import { RouteDispatcher } from '../src/dispatcher.ts';
import { KeyStore } from '../src/keyStore.ts';
import type { WorkspaceKeySource } from '../src/keyStore.ts';
import { ProviderAdapter } from '../src/providerAdapter.ts';
import type { ProviderResponse, ProviderTransport } from '../src/providerAdapter.ts';
import { RoutingPolicy } from '../src/policy.ts';
import type { BudgetManager, CostRecord, ModelBinding, Policy, Usage } from '../src/types.ts';

export const SESSION_KEY = Buffer.alloc(32, 3);
export const now = (): Date => new Date('2026-07-20T00:00:00Z');
export const WORKSPACE = 'w1';

export const OPENAI_KEY = 'OPENAI-SECRET-KEY';
export const ANTHROPIC_KEY = 'ANTHROPIC-SECRET-KEY';

export const F1: ModelBinding = { model_id: 'openai:gpt5:1', provider: 'openai', endpoint: 'https://o/v1', model_class: 'frontier', family: 'gpt5' };
export const F2: ModelBinding = { model_id: 'anthropic:opus:1', provider: 'anthropic', endpoint: 'https://a/v1', model_class: 'frontier', family: 'opus' };
export const G1: ModelBinding = { model_id: 'openai:mini:1', provider: 'openai', endpoint: 'https://o/v1', model_class: 'fast', family: 'gpt5' };
export const G2: ModelBinding = { model_id: 'anthropic:haiku:1', provider: 'anthropic', endpoint: 'https://a/v1', model_class: 'fast', family: 'haiku' };

export function samplePolicy(over: Partial<Policy> = {}): Policy {
  return {
    policy_rev: 0,
    workspace_id: over.workspace_id ?? WORKSPACE,
    role_class: over.role_class ?? { plan: 'frontier', extract: 'fast', classify: 'fast' },
    pools: over.pools ?? { frontier: [F1, F2], fast: [G1, G2] },
    prices: over.prices ?? {
      'openai:gpt5:1': { input_minor_per_ktok: 30, output_minor_per_ktok: 60, currency: 'USD' },
      'anthropic:opus:1': { input_minor_per_ktok: 30, output_minor_per_ktok: 60, currency: 'USD' },
      'openai:mini:1': { input_minor_per_ktok: 1, output_minor_per_ktok: 2, currency: 'USD' },
      'anthropic:haiku:1': { input_minor_per_ktok: 1, output_minor_per_ktok: 2, currency: 'USD' },
    },
    independence_axis: over.independence_axis ?? 'model',
    provider_timeout_ms: over.provider_timeout_ms ?? 30000,
  };
}

export class StubProvider implements ProviderTransport {
  callCount = 0;
  lastBody = '';
  lastAuth = Buffer.alloc(0);
  constructor(
    public duration_ms = 1,
    public usage: Usage = { input_tokens: 1500, output_tokens: 500 },
  ) {}
  send(endpoint: string, body: string, auth: Buffer): ProviderResponse {
    void endpoint;
    this.callCount++;
    this.lastBody = body;
    this.lastAuth = Buffer.from(auth); // copy before the adapter zeroizes the original
    return { ok: true, completion: { text: 'completion' }, usage: this.usage, duration_ms: this.duration_ms };
  }
}

export class StubBudget implements BudgetManager {
  verdict: 'admit' | 'deny' = 'admit';
  records: CostRecord[] = [];
  admit(): 'admit' | 'deny' {
    return this.verdict;
  }
  record(rec: CostRecord): void {
    this.records.push(rec);
  }
}

const wsKeys: WorkspaceKeySource = {
  keyFor: (workspace_id: string) => Buffer.from(workspace_id.padEnd(32, 'x').slice(0, 32)),
};

export interface Wired {
  dispatcher: RouteDispatcher;
  policy: RoutingPolicy;
  keys: KeyStore;
  budget: StubBudget;
  openai: StubProvider;
  anthropic: StubProvider;
}

export function makeRouter(over: { policy?: Policy; openaiDuration?: number } = {}): Wired {
  const policy = new RoutingPolicy();
  policy.load(over.policy ?? samplePolicy());
  const keys = new KeyStore(wsKeys);
  keys.put(WORKSPACE, 'openai', Buffer.from(OPENAI_KEY));
  keys.put(WORKSPACE, 'anthropic', Buffer.from(ANTHROPIC_KEY));
  const openai = new StubProvider(over.openaiDuration ?? 1);
  const anthropic = new StubProvider(1);
  const transports = new Map<string, ProviderTransport>([['openai', openai], ['anthropic', anthropic]]);
  const pol = policy.current();
  const adapter = new ProviderAdapter(keys.localSource(), transports, pol?.provider_timeout_ms ?? 30000);
  const meter = new CostMeter(() => policy.current());
  const budget = new StubBudget();
  const dispatcher = new RouteDispatcher(policy, keys, adapter, meter, budget, SESSION_KEY, now);
  return { dispatcher, policy, keys, budget, openai, anthropic };
}
