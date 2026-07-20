// In-memory RawEngine implementations. StubEngine is the acceptance harness and
// leak-detection surface; AltStubEngine is a second, internally different
// implementation used to prove engine-swappability (Op 110): the same acceptance
// suite passes on both with no change above L0.
//
// These stand in for the production ElectronCdpEngine (which wraps
// webContents.debugger and Electron session partitions); that adapter lives
// behind the same RawEngine interface and is not exercised in a headless build.

import type { RawEngine, RawEvent, RawImg, RawNode } from './driver.ts';
import type { PartitionId, SurfaceId, WorkspaceId } from './types.ts';

// A RawEngine plus the manipulation and observation hooks the tests use. The
// acceptance scenario is written against this interface so it runs unchanged on
// any implementation.
export interface TestEngine extends RawEngine {
  setNodes(surface: SurfaceId, nodes: readonly RawNode[]): void;
  navigate(surface: SurfaceId, url: string, nodes: readonly RawNode[]): void;
  emitNetwork(surface: SurfaceId, detail: string): void;
  emitMutation(surface: SurfaceId, detail: string): void;
  setCookie(surface: SurfaceId, key: string, value: string): void;
  cookies(surface: SurfaceId): ReadonlyMap<string, string>;
  surfaceIds(): readonly SurfaceId[];
  readonly dispatched: ReadonlyArray<{ surface: SurfaceId; engine_ref: string; kind: string; value: string | null }>;
  readonly streamedSecrets: ReadonlyArray<{ surface: SurfaceId; engine_ref: string; value: string }>;
}

interface SurfaceState {
  readonly surface: SurfaceId;
  readonly partition: PartitionId;
  readonly workspace_id: WorkspaceId;
  url: string;
  nodes: RawNode[];
  events: RawEvent[];
}

export class StubEngine implements TestEngine {
  private readonly surfaces = new Map<SurfaceId, SurfaceState>();
  private readonly cookieJars = new Map<PartitionId, Map<string, string>>();
  private counter = 0;
  readonly dispatched: Array<{ surface: SurfaceId; engine_ref: string; kind: string; value: string | null }> = [];
  readonly streamedSecrets: Array<{ surface: SurfaceId; engine_ref: string; value: string }> = [];

  private state(surface: SurfaceId): SurfaceState {
    const s = this.surfaces.get(surface);
    if (s === undefined) throw new Error('unknown surface ' + surface);
    return s;
  }

  createSurface(partition: PartitionId, url: string, workspace_id: WorkspaceId): SurfaceId {
    const surface: SurfaceId = 'surface#' + String(++this.counter);
    this.surfaces.set(surface, { surface, partition, workspace_id, url, nodes: [], events: [] });
    return surface;
  }

  attach(surface: SurfaceId): void {
    this.state(surface);
  }

  rawNodes(surface: SurfaceId): readonly RawNode[] {
    return this.state(surface).nodes.slice();
  }

  capturePixels(surface: SurfaceId): RawImg {
    const s = this.state(surface);
    return { width: 800, height: 600, bytes: 'stub:' + s.url };
  }

  drainRawEvents(surface: SurfaceId): readonly RawEvent[] {
    const s = this.state(surface);
    const out = s.events.slice();
    s.events.length = 0;
    return out;
  }

  dispatchInput(surface: SurfaceId, engine_ref: string, kind: string, value: string | null): void {
    this.state(surface);
    this.dispatched.push({ surface, engine_ref, kind, value });
  }

  // The dedicated secret channel: the value lands in the field (modeled by
  // replacing the node with a secret_field node holding the value) but is never
  // returned. A snapshot masks the field, so the value never crosses L0.
  streamSecret(surface: SurfaceId, engine_ref: string, value: string): void {
    const s = this.state(surface);
    this.streamedSecrets.push({ surface, engine_ref, value });
    s.nodes = s.nodes.map((n) => (n.engine_ref === engine_ref ? { ...n, secret_field: true, value } : n));
  }

  setNodes(surface: SurfaceId, nodes: readonly RawNode[]): void {
    this.state(surface).nodes = nodes.slice();
  }

  navigate(surface: SurfaceId, url: string, nodes: readonly RawNode[]): void {
    const s = this.state(surface);
    s.url = url;
    s.nodes = nodes.slice();
    s.events.push({ kind: 'nav', detail: url });
  }

  emitNetwork(surface: SurfaceId, detail: string): void {
    this.state(surface).events.push({ kind: 'network', detail });
  }

  emitMutation(surface: SurfaceId, detail: string): void {
    this.state(surface).events.push({ kind: 'mutation', detail });
  }

  setCookie(surface: SurfaceId, key: string, value: string): void {
    const s = this.state(surface);
    let jar = this.cookieJars.get(s.partition);
    if (jar === undefined) {
      jar = new Map<string, string>();
      this.cookieJars.set(s.partition, jar);
    }
    jar.set(key, value);
  }

  cookies(surface: SurfaceId): ReadonlyMap<string, string> {
    const s = this.state(surface);
    return this.cookieJars.get(s.partition) ?? new Map<string, string>();
  }

  surfaceIds(): readonly SurfaceId[] {
    return [...this.surfaces.keys()];
  }
}

// A second implementation with a different internal representation: surfaces are
// keyed by a different scheme, nodes live in a Map keyed by engine_ref plus an
// order list, and pixels use a different byte encoding. If the RenderSurface
// contract holds on this too, the boundary does not leak engine internals.
export class AltStubEngine implements TestEngine {
  private readonly parts = new Map<SurfaceId, PartitionId>();
  private readonly wss = new Map<SurfaceId, WorkspaceId>();
  private readonly urls = new Map<SurfaceId, string>();
  private readonly order = new Map<SurfaceId, string[]>();
  private readonly byRef = new Map<SurfaceId, Map<string, RawNode>>();
  private readonly evs = new Map<SurfaceId, RawEvent[]>();
  private readonly cookieJars = new Map<PartitionId, Map<string, string>>();
  private counter = 0;
  readonly dispatched: Array<{ surface: SurfaceId; engine_ref: string; kind: string; value: string | null }> = [];
  readonly streamedSecrets: Array<{ surface: SurfaceId; engine_ref: string; value: string }> = [];

  private assert(surface: SurfaceId): void {
    if (!this.parts.has(surface)) throw new Error('unknown surface ' + surface);
  }

  createSurface(partition: PartitionId, url: string, workspace_id: WorkspaceId): SurfaceId {
    const surface: SurfaceId = 'alt-surf-' + String(++this.counter);
    this.parts.set(surface, partition);
    this.wss.set(surface, workspace_id);
    this.urls.set(surface, url);
    this.order.set(surface, []);
    this.byRef.set(surface, new Map());
    this.evs.set(surface, []);
    return surface;
  }

  attach(surface: SurfaceId): void {
    this.assert(surface);
  }

  rawNodes(surface: SurfaceId): readonly RawNode[] {
    this.assert(surface);
    const order = this.order.get(surface) ?? [];
    const map = this.byRef.get(surface) ?? new Map<string, RawNode>();
    const out: RawNode[] = [];
    for (const ref of order) {
      const n = map.get(ref);
      if (n !== undefined) out.push(n);
    }
    return out;
  }

  capturePixels(surface: SurfaceId): RawImg {
    this.assert(surface);
    const url = this.urls.get(surface) ?? '';
    return { width: 1024, height: 768, bytes: 'altpx|' + url + '|1024x768' };
  }

  drainRawEvents(surface: SurfaceId): readonly RawEvent[] {
    this.assert(surface);
    const q = this.evs.get(surface) ?? [];
    const out = q.slice();
    q.length = 0;
    return out;
  }

  dispatchInput(surface: SurfaceId, engine_ref: string, kind: string, value: string | null): void {
    this.assert(surface);
    this.dispatched.push({ surface, engine_ref, kind, value });
  }

  streamSecret(surface: SurfaceId, engine_ref: string, value: string): void {
    this.assert(surface);
    this.streamedSecrets.push({ surface, engine_ref, value });
    const map = this.byRef.get(surface);
    const n = map?.get(engine_ref);
    if (map !== undefined && n !== undefined) map.set(engine_ref, { ...n, secret_field: true, value });
  }

  setNodes(surface: SurfaceId, nodes: readonly RawNode[]): void {
    this.assert(surface);
    const order: string[] = [];
    const map = new Map<string, RawNode>();
    for (const n of nodes) {
      order.push(n.engine_ref);
      map.set(n.engine_ref, n);
    }
    this.order.set(surface, order);
    this.byRef.set(surface, map);
  }

  navigate(surface: SurfaceId, url: string, nodes: readonly RawNode[]): void {
    this.assert(surface);
    this.urls.set(surface, url);
    this.setNodes(surface, nodes);
    (this.evs.get(surface) ?? []).push({ kind: 'nav', detail: url });
  }

  emitNetwork(surface: SurfaceId, detail: string): void {
    this.assert(surface);
    (this.evs.get(surface) ?? []).push({ kind: 'network', detail });
  }

  emitMutation(surface: SurfaceId, detail: string): void {
    this.assert(surface);
    (this.evs.get(surface) ?? []).push({ kind: 'mutation', detail });
  }

  setCookie(surface: SurfaceId, key: string, value: string): void {
    this.assert(surface);
    const partition = this.parts.get(surface) as PartitionId;
    let jar = this.cookieJars.get(partition);
    if (jar === undefined) {
      jar = new Map<string, string>();
      this.cookieJars.set(partition, jar);
    }
    jar.set(key, value);
  }

  cookies(surface: SurfaceId): ReadonlyMap<string, string> {
    this.assert(surface);
    const partition = this.parts.get(surface) as PartitionId;
    return this.cookieJars.get(partition) ?? new Map<string, string>();
  }

  surfaceIds(): readonly SurfaceId[] {
    return [...this.parts.keys()];
  }
}
