// DO-015 Site Adapter Compiler — public surface. Compiles one exploration
// trajectory of an origin into typed, self-testing tools that replay with no
// model call, self-test on a schedule, and hot-swap on drift.

export * from './types.ts';
export {
  type Clock, type ExploreCommand, type ExploreDriver, type ExploreTarget,
  type GraphNode, type GraphSnapshot, type LearnResult, type ModelRouter,
  type PageGraph, type RenderSurface, type ToolStructure, resolveAnchor,
} from './seams.ts';
export { canonical, sha256hex, validateParams, validateSchema } from './canonical.ts';
export { AdapterStore } from './store.ts';
export { invoke, provenance, replay, replayDigest, tools, type InvokeResult } from './contract.ts';
export { ExplorationRecorder, explore, type RecordResult } from './recorder.ts';
export { synthesize, type SynthesisResult } from './synthesizer.ts';
export { allHealthy, health, HealthScheduler } from './health.ts';
export { DriftDetector, DRIFT_THRESHOLD, worstStatus } from './drift.ts';
export { HotSwapper, type SwapOutcome } from './hotswap.ts';

import { explore } from './recorder.ts';
import { synthesize } from './synthesizer.ts';
import type { AdapterStore } from './store.ts';
import type { Clock, ExploreCommand, ModelRouter, PageGraph, RenderSurface } from './seams.ts';
import type { SiteAdapter } from './types.ts';

// The end-to-end first-compile flow: explore an origin once, synthesize a
// versioned adapter, and promote it live with an atomic swap.
export function compile(
  store: AdapterStore,
  surface: RenderSurface,
  graph: PageGraph,
  model: ModelRouter,
  clock: Clock,
  origin: string,
  handle: string,
  script: readonly ExploreCommand[],
): { readonly version: number; readonly adapter: SiteAdapter } {
  const trajectory = explore(surface, graph, clock, origin, handle, script);
  const { version, adapter } = synthesize(trajectory, model, store, clock);
  store.swap(origin, version);
  return { version, adapter };
}
