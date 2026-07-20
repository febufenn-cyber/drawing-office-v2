// P4 — cdp-driver.
//
// The general engine touchpoint. It reads raw nodes from the engine, computes a
// per-node stable digest (the node's identity), stamps nav_epoch and
// workspace_id onto the graph, applies the P6 mask set, injects input addressed
// by the digest-matching node, and captures pixels with the set-of-marks
// overlay. Identical DOM yields identical digests, which is what a ticket binds
// against. A raw selector never resolves to a node and is rejected before any
// input is dispatched.

import { canonical, nodeDigest, sha256hex } from './digest.ts';
import type { RawEngine, RawEvent, RawNode } from './driver.ts';
import type { MaskRegistry } from './secretFill.ts';
import type { HandleId, Img, Mark, PageGraph, PgNode, SurfaceId, WorkspaceId } from './types.ts';

export class CdpDriver {
  constructor(
    private readonly engine: RawEngine,
    private readonly masks: MaskRegistry,
  ) {}

  attach(surface: SurfaceId): void {
    this.engine.attach(surface);
  }

  private digestOf(raw: RawNode): string {
    return nodeDigest({
      tag: raw.tag,
      role: raw.role,
      name: raw.name,
      testid: raw.testid,
      aria: raw.aria,
      path: raw.path,
    });
  }

  pullGraph(
    surface: SurfaceId,
    workspace_id: WorkspaceId,
    nav_epoch: number,
    handle_id: HandleId,
  ): PageGraph {
    const raws = this.engine.rawNodes(surface);
    const nodes: PgNode[] = raws.map((raw) => {
      const node_id = this.digestOf(raw);
      const masked = raw.secret_field || this.masks.isMasked(handle_id, node_id);
      return { node_id, role: raw.role, name: raw.name, masked, value: masked ? null : raw.value };
    });
    const digest_root = sha256hex(canonical(nodes.map((n) => n.node_id)));
    return { nav_epoch, workspace_id, nodes, digest_root };
  }

  // Map a stable node_id back to the engine ref of the digest-matching node.
  // Returns null when no current node matches (a raw selector, or a node that
  // has since mutated), which is how selector-addressed and stale actions are
  // rejected before any input is dispatched.
  resolveRef(surface: SurfaceId, node_id: string): string | null {
    for (const raw of this.engine.rawNodes(surface)) {
      if (this.digestOf(raw) === node_id) return raw.engine_ref;
    }
    return null;
  }

  inject(surface: SurfaceId, node_id: string, kind: string, value: string | null): 'ok' | 'unknown_node' {
    const ref = this.resolveRef(surface, node_id);
    if (ref === null) return 'unknown_node';
    this.engine.dispatchInput(surface, ref, kind, value);
    return 'ok';
  }

  capture(surface: SurfaceId, marked: boolean): Img {
    const img = this.engine.capturePixels(surface);
    const marks: Mark[] = [];
    if (marked) {
      const raws = this.engine.rawNodes(surface);
      raws.forEach((raw, i) => marks.push({ mark: i + 1, node_id: this.digestOf(raw) }));
    }
    return { width: img.width, height: img.height, bytes: img.bytes, marks };
  }

  drainEvents(surface: SurfaceId): readonly RawEvent[] {
    return this.engine.drainRawEvents(surface);
  }
}
