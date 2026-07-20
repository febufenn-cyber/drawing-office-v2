// The single engine seam. Everything Chromium/CDP/Electron-specific lives behind
// RawEngine; P3 (partitioner) and P4 (cdp-driver) are engine-neutral logic built
// over it. Swapping the RawEngine implementation swaps the driver with no change
// above L0 (Op 110). The production implementation wraps Electron's
// webContents.debugger; the StubEngine is an in-memory implementation used as the
// acceptance harness and the Op 110 second driver.

import type { PartitionId, SurfaceId, WorkspaceId } from './types.ts';

// A raw node as the engine reports it, before any digest/mask/stamp logic. The
// engine_ref is the engine's own opaque handle to the node; it never crosses L0.
export interface RawNode {
  readonly engine_ref: string;
  readonly tag: string;
  readonly role: string;
  readonly name: string;
  readonly testid: string;
  readonly aria: string;
  readonly path: string;
  readonly value: string | null;
  readonly secret_field: boolean; // filled via the dedicated secret channel
}

export interface RawEvent {
  readonly kind: 'nav' | 'network' | 'mutation';
  readonly detail: string;
}

export interface RawImg {
  readonly width: number;
  readonly height: number;
  readonly bytes: string;
}

// The one interface the engine sits behind.
export interface RawEngine {
  // Session/surface lifecycle. createSurface is called only through P3, which
  // enforces one partition per workspace.
  createSurface(partition: PartitionId, url: string, workspace_id: WorkspaceId): SurfaceId;
  attach(surface: SurfaceId): void;

  // Perception primitives.
  rawNodes(surface: SurfaceId): readonly RawNode[];
  capturePixels(surface: SurfaceId): RawImg;
  drainRawEvents(surface: SurfaceId): readonly RawEvent[];

  // Action primitive: dispatch input to a specific engine node.
  dispatchInput(surface: SurfaceId, engine_ref: string, kind: string, value: string | null): void;

  // The dedicated secret channel, separate from dispatchInput, so a secret value
  // never transits the general input path.
  streamSecret(surface: SurfaceId, engine_ref: string, value: string): void;
}
