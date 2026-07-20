// DO-012 Browser OS Action Control Plane — public surface.

export { ApprovalGate } from './gate.ts';
export type { SubmitResult, SubmitStatus } from './gate.ts';
export { validateProposal, actionDigest, stateBinding, decision, finding } from './contract.ts';
export { resolve } from './resolver.ts';
export { evaluate } from './engine.ts';
export type { BudgetSnapshot, TokenState } from './engine.ts';
export { PolicyStore } from './policyStore.ts';
export type { Policy, PolicyDraft, OriginGrant, Caps, RateLimits } from './policyStore.ts';
export { CapabilityVault } from './vault.ts';
export type { CapabilityToken, LedgerEntry, WorkspaceKeySource } from './vault.ts';
export { AuditLog, GENESIS_PREV, EVENT_TAXONOMY } from './audit.ts';
export type { AuditEntry, VerifyReport } from './audit.ts';
export { canonical, digest, sha256hex, hmacHex, hexEqual } from './canonical.ts';
export { mintTicket, ticketBody } from './boundary.ts';
export type {
  ApprovalRequest, ApprovalResponse, ApprovalSheet, ActResult, ExecutionTicket,
  FillResult, Perception, RenderSurface, SurfaceAction,
} from './boundary.ts';
export {
  TIER_ORDER, CONSEQUENCE_ORDER, VERDICT_ORDER, maxTier, maxConsequence,
} from './types.ts';
export type {
  ActionKind, ActionProposal, Consequence, DeclaredIntent, Decision, Finding,
  PayloadField, ResolvedAction, Snapshot, SnapForm, SnapNode, SnapshotRef, Tier, Verdict, FieldClass,
} from './types.ts';
