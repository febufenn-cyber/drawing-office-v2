// P7 — route-dispatcher. The sole path to a provider call, so every guarantee on
// this sheet holds at one choke point. It fails closed at each step: an invalid
// request, an empty selection, a missing key, or a budget denial each return
// before any provider call. Exactly one provider call runs per admitted request,
// and exactly one cost record reaches the budget manager per completed call.

import { randomUUID } from 'node:crypto';
import type { ProviderAdapter } from './providerAdapter.ts';
import type { CostMeter } from './costMeter.ts';
import { assertIndependent, exclusionFor, macValid, stampProducerTag } from './independence.ts';
import type { KeyStore } from './keyStore.ts';
import { classify } from './roleClassifier.ts';
import type { RoutingPolicy } from './policy.ts';
import { MODEL_CLASSES, ROLES } from './types.ts';
import type { BudgetManager, ModelBinding, ModelClass, RouteRequest, RouteResult } from './types.ts';

function fail(status: RouteResult['status']): RouteResult {
  return { status };
}

function validRequest(r: RouteRequest): boolean {
  return (
    typeof r.workspace_id === 'string' && r.workspace_id.length > 0 &&
    ROLES.has(r.role) &&
    typeof r.prompt_bundle === 'string' &&
    Number.isInteger(r.prompt_tokens) && r.prompt_tokens >= 0 &&
    Number.isInteger(r.max_output) && r.max_output >= 0
  );
}

export class RouteDispatcher {
  constructor(
    private readonly policy: RoutingPolicy,
    private readonly keys: KeyStore,
    private readonly adapter: ProviderAdapter,
    private readonly meter: CostMeter,
    private readonly budget: BudgetManager,
    private readonly sessionKey: Buffer,
    private readonly now: () => Date,
  ) {}

  private allBindings(): ModelBinding[] {
    const pol = this.policy.current();
    if (pol === null) return [];
    const out: ModelBinding[] = [];
    for (const c of MODEL_CLASSES) for (const b of pol.pools[c] ?? []) out.push(b);
    return out;
  }

  route(request: RouteRequest): RouteResult {
    if (!validRequest(request)) return fail('invalid_request');
    const pol = this.policy.current();
    if (pol === null) return fail('invalid_request');

    const cls = classify(request.role);
    if ('rejected' in cls) return fail('invalid_request');

    let class_req: ModelClass;
    let exclusion = new Set<string>();
    if (request.role === 'verify') {
      const tag = request.producer_tag;
      if (tag === undefined || !macValid(this.sessionKey, tag)) return fail('invalid_request');
      class_req = tag.model_class;
      exclusion = exclusionFor(tag, pol.independence_axis, this.allBindings());
    } else if (cls.deferred === false) {
      class_req = cls.model_class;
    } else {
      return fail('invalid_request');
    }

    const binding = this.policy.select(class_req, exclusion);
    if (binding === null) {
      return fail(request.role === 'verify' ? 'independence_unsatisfiable' : 'invalid_request');
    }
    if (request.role === 'verify' && assertIndependent(binding.model_id, exclusion) === 'violation') {
      return fail('independence_unsatisfiable');
    }

    const handle = this.keys.select(request.workspace_id, binding.provider);
    if (handle === null) return fail('key_missing');

    const estimate = this.meter.estimate(binding, request.prompt_tokens, request.max_output);
    if (estimate === null) return fail('invalid_request');
    if (this.budget.admit(request.workspace_id, estimate) === 'deny') return fail('budget_denied');

    const outcome = this.adapter.call(binding, handle, request.prompt_bundle, request.max_output);
    if (!outcome.ok) return fail('provider_error');

    const call_id = randomUUID();
    const record = this.meter.meter(binding, outcome.usage, {
      workspace_id: request.workspace_id,
      call_id,
      role: request.role,
      ts: this.now().toISOString(),
    });
    if (record === null) return fail('invalid_request');
    this.budget.record(record);

    const producer_tag = stampProducerTag(this.sessionKey, binding);
    return {
      status: 'routed',
      binding,
      completion: outcome.completion,
      usage: outcome.usage,
      cost: record,
      producer_tag,
      policy_rev: pol.policy_rev,
    };
  }
}
