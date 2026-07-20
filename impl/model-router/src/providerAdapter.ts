// P4 — provider-adapter. Uniform call surface over heterogeneous providers. The
// prompt bundle is forwarded to the provider body unmodified; the resolved key is
// placed only in the transport authorization, never in the body, the returned
// Completion, a log, or a cost record. A call slower than provider_timeout_ms is
// abandoned as a provider_error with no usage; a failed call invents no counts.

import type { KeySource } from './keyStore.ts';
import type { Completion, KeyHandle, ModelBinding, Usage } from './types.ts';

// The provider seam. A real provider implementation performs the HTTP call with
// the key in the transport auth argument, never in body. duration_ms lets the
// adapter enforce the timeout deterministically in tests.
export interface ProviderResponse {
  readonly ok: boolean;
  readonly completion?: Completion;
  readonly usage?: Usage;
  readonly duration_ms: number;
}
export interface ProviderTransport {
  // body is the prompt bundle; auth is the resolved key material, transport-only.
  send(endpoint: string, body: string, auth: Buffer): ProviderResponse;
}

export type CallOutcome =
  | { readonly ok: true; readonly completion: Completion; readonly usage: Usage }
  | { readonly ok: false; readonly error: 'provider_error' };

export class ProviderAdapter {
  constructor(
    private readonly source: KeySource,
    // provider name -> transport
    private readonly transports: ReadonlyMap<string, ProviderTransport>,
    private readonly timeoutMs: number,
  ) {}

  call(binding: ModelBinding, handle: KeyHandle, prompt_bundle: string, max_output: number): CallOutcome {
    void max_output;
    const transport = this.transports.get(binding.provider);
    if (transport === undefined) return { ok: false, error: 'provider_error' };
    const key = this.source.resolve(handle.workspace_id, handle.provider);
    if (key === null) return { ok: false, error: 'provider_error' };

    const resp = transport.send(binding.endpoint, prompt_bundle, key);
    // Zeroize the plaintext key copy as soon as the call returns.
    key.fill(0);

    if (!resp.ok || resp.duration_ms > this.timeoutMs || resp.completion === undefined || resp.usage === undefined) {
      return { ok: false, error: 'provider_error' };
    }
    return { ok: true, completion: resp.completion, usage: resp.usage };
  }
}
