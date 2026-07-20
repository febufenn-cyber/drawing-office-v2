// DO-017 Model Router — public surface.

export { RoutingPolicy } from './policy.ts';
export { classify } from './roleClassifier.ts';
export type { ClassRequirement } from './roleClassifier.ts';
export { KeyStore } from './keyStore.ts';
export type { KeySource, WorkspaceKeySource } from './keyStore.ts';
export { ProviderAdapter } from './providerAdapter.ts';
export type { ProviderTransport, ProviderResponse, CallOutcome } from './providerAdapter.ts';
export { exclusionFor, assertIndependent, stampProducerTag, macValid, tagBody } from './independence.ts';
export { CostMeter } from './costMeter.ts';
export { RouteDispatcher } from './dispatcher.ts';
export { canonical, hmacHex, seal, open } from './crypto.ts';
export { isRejection, reject } from './types.ts';
export type {
  Axis,
  BudgetManager,
  Completion,
  CostEstimate,
  CostRecord,
  KeyHandle,
  ModelBinding,
  ModelClass,
  Policy,
  PriceEntry,
  ProducerTag,
  Rejection,
  Role,
  RouteRequest,
  RouteResult,
  RouteStatus,
  SourceKind,
  Usage,
} from './types.ts';
