// DO-014 PageGraph Perception Model — public surface.

export { build } from './builder.ts';
export { normalize } from './normalizer.ts';
export { assign } from './stableId.ts';
export { digestAll, digestRoot } from './digest.ts';
export { inventory } from './affordance.ts';
export { extract } from './content.ts';
export { parse } from './structuredData.ts';
export { buildFromMarks, domQuality } from './vision.ts';
export { validate } from './schema.ts';
export { canonical, sha256hex } from './canonical.ts';
export { isRejection, reject } from './types.ts';
export type {
  Affordance,
  AffordanceKind,
  Entity,
  FieldClass,
  GeometryBucket,
  Node,
  NodeRole,
  PageGraph,
  Provenance,
  RawAxNode,
  RawStructuredBlock,
  Rejection,
  Snapshot,
  SourceChannel,
  Spine,
  VisionMark,
  WorkingNode,
} from './types.ts';
