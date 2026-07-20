// P6 — cost-meter. Integer arithmetic in minor units, never floating point, so
// totals are exact and reproducible. The price table gives minor units per one
// thousand tokens; each bucket rounds up to the next minor unit so a metered total
// never understates spend. The meter reports spend and never enforces a ceiling.

import type { CostEstimate, CostRecord, ModelBinding, Policy, Role, Usage } from './types.ts';

function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

export class CostMeter {
  constructor(private readonly policy: () => Policy | null) {}

  private price(model_id: string) {
    return this.policy()?.prices[model_id] ?? null;
  }

  estimate(binding: ModelBinding, prompt_tokens: number, max_output: number): CostEstimate | null {
    const price = this.price(binding.model_id);
    if (price === null) return null;
    const cost = ceilDiv(prompt_tokens * price.input_minor_per_ktok, 1000) + ceilDiv(max_output * price.output_minor_per_ktok, 1000);
    return { model_id: binding.model_id, cost_minor: cost, currency: price.currency };
  }

  meter(
    binding: ModelBinding,
    usage: Usage,
    ctx: { workspace_id: string; call_id: string; role: Role; ts: string },
  ): CostRecord | null {
    const price = this.price(binding.model_id);
    if (price === null) return null;
    const in_cost = ceilDiv(usage.input_tokens * price.input_minor_per_ktok, 1000);
    const out_cost = ceilDiv(usage.output_tokens * price.output_minor_per_ktok, 1000);
    return {
      workspace_id: ctx.workspace_id,
      call_id: ctx.call_id,
      role: ctx.role,
      model_id: binding.model_id,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_minor: in_cost + out_cost,
      currency: price.currency,
      ts: ctx.ts,
    };
  }
}
