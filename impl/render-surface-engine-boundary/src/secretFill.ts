// P6 — secret-fill-channel (plus the mask registry it owns).
//
// fillSecret streams a vault secret into a field over the engine's dedicated
// channel, records the field masked, and returns only a boolean. The secret
// value appears in no return value, snapshot, event, or log field. A masked field
// stays masked in every later snapshot until a committed navigation clears it.

import type { RawEngine } from './driver.ts';
import type { HandleId, NodeId, SecretRef, SurfaceId } from './types.ts';

// Resolves a SecretRef to its value over a channel the model never sees. Stands
// in for the DO-012 capability-vault stream; the RenderSurface never holds the
// value, only forwards the resolver's bytes straight into the engine channel.
export interface SecretResolver {
  resolve(ref: SecretRef): string | null; // null when out of scope / unknown
}

export class MaskRegistry {
  private readonly masked = new Map<HandleId, Set<NodeId>>();

  mark(handle_id: HandleId, node_id: NodeId): void {
    let set = this.masked.get(handle_id);
    if (set === undefined) {
      set = new Set<NodeId>();
      this.masked.set(handle_id, set);
    }
    set.add(node_id);
  }

  isMasked(handle_id: HandleId, node_id: NodeId): boolean {
    return this.masked.get(handle_id)?.has(node_id) ?? false;
  }

  // A committed navigation clears the page, so filled fields are gone.
  clear(handle_id: HandleId): void {
    this.masked.delete(handle_id);
  }
}

export class SecretFillChannel {
  constructor(
    private readonly engine: RawEngine,
    private readonly masks: MaskRegistry,
    private readonly resolver: SecretResolver,
  ) {}

  // Caller (P1) has already verified the ticket. Returns true iff the secret was
  // in scope and streamed. Never returns, logs, or otherwise exposes the value.
  fill(
    surface: SurfaceId,
    handle_id: HandleId,
    node_id: NodeId,
    engine_ref: string,
    secret_ref: SecretRef,
  ): boolean {
    const value = this.resolver.resolve(secret_ref);
    if (value === null) return false; // out of scope; nothing streamed
    this.engine.streamSecret(surface, engine_ref, value);
    this.masks.mark(handle_id, node_id);
    return true;
  }
}
