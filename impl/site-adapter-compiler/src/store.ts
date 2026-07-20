// P4 — adapter-store. Versioned, per-origin, append-only, with a single atomic
// current-version pointer. New versions append; prior versions and their source
// trajectories stay for rollback and provenance. In production the store is
// local and encrypted at rest; here it is in-memory behind the same interface.

import type { SiteAdapter, Trajectory } from './types.ts';

interface VersionEntry {
  readonly adapter: SiteAdapter;
  readonly trajectory: Trajectory;
  degraded: boolean;
}
interface OriginEntry {
  readonly versions: Map<number, VersionEntry>;
  pointer: number | null;
}

export class AdapterStore {
  private readonly origins = new Map<string, OriginEntry>();

  private entry(origin: string): OriginEntry {
    let o = this.origins.get(origin);
    if (o === undefined) {
      o = { versions: new Map(), pointer: null };
      this.origins.set(origin, o);
    }
    return o;
  }

  // Appends a new version; the current pointer is unchanged. Returns the version.
  put(origin: string, adapter: SiteAdapter, trajectory: Trajectory): number {
    const o = this.entry(origin);
    const version = (o.versions.size === 0 ? 0 : Math.max(...o.versions.keys())) + 1;
    o.versions.set(version, { adapter: { ...adapter, version }, trajectory, degraded: false });
    return version;
  }

  // Atomic in single-threaded JS: a reader observes exactly one live version.
  swap(origin: string, version: number): boolean {
    const o = this.origins.get(origin);
    if (o === undefined || !o.versions.has(version)) return false;
    o.pointer = version;
    return true;
  }

  current(origin: string): SiteAdapter | null {
    const o = this.origins.get(origin);
    if (o === undefined || o.pointer === null) return null;
    return o.versions.get(o.pointer)?.adapter ?? null;
  }

  currentVersion(origin: string): number | null {
    return this.origins.get(origin)?.pointer ?? null;
  }

  get(origin: string, version: number): SiteAdapter | null {
    return this.origins.get(origin)?.versions.get(version)?.adapter ?? null;
  }

  trajectory(origin: string, version: number): Trajectory | null {
    return this.origins.get(origin)?.versions.get(version)?.trajectory ?? null;
  }

  markDegraded(origin: string, version: number): void {
    const e = this.origins.get(origin)?.versions.get(version);
    if (e !== undefined) e.degraded = true;
  }

  isDegraded(origin: string, version: number): boolean {
    return this.origins.get(origin)?.versions.get(version)?.degraded ?? false;
  }
}
