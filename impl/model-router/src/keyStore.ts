// P3 — key-store. Holds BYO provider keys encrypted under a per-workspace key,
// and selects an opaque KeyHandle by workspace and provider. The plaintext key
// never crosses the KeyStore boundary; only the provider-adapter resolves a handle
// to key material through the KeySource, at transport, inside one call.

import { open, seal } from './crypto.ts';
import type { Sealed } from './crypto.ts';
import type { KeyHandle, SourceKind } from './types.ts';

// Supplies the per-workspace encryption key (from DO-019). Kept an interface so a
// real workspace store slots in unchanged.
export interface WorkspaceKeySource {
  keyFor(workspace_id: string): Buffer | null;
}

// The managed-tier seam. resolve returns key material for one transport call.
// v0 ships only LocalByokSource; a ManagedKeySource returns a broker token behind
// the identical signature.
export interface KeySource {
  readonly kind: SourceKind;
  resolve(workspace_id: string, provider: string): Buffer | null;
}

export class KeyStore {
  // provider keys at rest: workspace_id -> provider -> sealed blob.
  private readonly vault = new Map<string, Map<string, Sealed>>();

  constructor(private readonly wsKeys: WorkspaceKeySource) {}

  private provisioned(workspace_id: string, provider: string): boolean {
    return this.vault.get(workspace_id)?.has(provider) ?? false;
  }

  put(workspace_id: string, provider: string, key_bytes: Buffer): boolean {
    const wsKey = this.wsKeys.keyFor(workspace_id);
    if (wsKey === null) return false;
    let byProvider = this.vault.get(workspace_id);
    if (byProvider === undefined) {
      byProvider = new Map<string, Sealed>();
      this.vault.set(workspace_id, byProvider);
    }
    byProvider.set(provider, seal(wsKey, key_bytes));
    return true;
  }

  rotate(workspace_id: string, provider: string, key_bytes: Buffer): boolean {
    return this.put(workspace_id, provider, key_bytes);
  }

  // Opaque handle for a provisioned pair; null otherwise. Carries no key bytes.
  select(workspace_id: string, provider: string): KeyHandle | null {
    if (!this.provisioned(workspace_id, provider)) return null;
    return { workspace_id, provider, source: 'byok' };
  }

  // A KeySource over this store's local BYO keys. The adapter calls resolve at
  // transport; the plaintext lives only for that call.
  localSource(): KeySource {
    return {
      kind: 'byok',
      resolve: (workspace_id: string, provider: string): Buffer | null => {
        const sealed = this.vault.get(workspace_id)?.get(provider);
        const wsKey = this.wsKeys.keyFor(workspace_id);
        if (sealed === undefined || wsKey === null) return null;
        return open(wsKey, sealed);
      },
    };
  }
}
