// DO-013 Render Surface Engine Boundary — public surface.
//
// Above L0, callers see only RenderSurface and the engine-neutral types. The
// RawEngine seam and stub engines are exported for wiring a driver and for tests;
// no engine or Electron symbol appears here.

export { RenderSurface } from './renderSurface.ts';
export type { Outcome } from './renderSurface.ts';
export type { RawEngine, RawNode, RawEvent, RawImg } from './driver.ts';
export type { SecretResolver } from './secretFill.ts';
export { StubEngine, AltStubEngine } from './stubEngine.ts';
export type { TestEngine } from './stubEngine.ts';
export { mintTicket } from './ticket.ts';
export { actionDigest, nodeDigest, canonical, sha256hex } from './digest.ts';
export type {
  Action,
  ActionKind,
  ExecutionTicket,
  FillResult,
  Img,
  Mark,
  PageEvent,
  PageGraph,
  PageHandle,
  PgNode,
  SecretRef,
  WorkspaceCtx,
} from './types.ts';
