/** Reported dispositions and separately authorized runtime cleanup attestations. */
export type ResourceUseState =
  'active' | 'cleanup_pending' | 'blocked' | 'retained' | 'release_reported' | 'release_verified';
export type ResourceUseEventKind =
  'cleanup_requested' | 'cleanup_blocked' | 'retained' | 'release_reported';
export interface ResourceUseRegistration {
  requestId: string;
  resourceId: string;
  workItemId: string;
  stepId?: string;
  attemptNumber?: number;
  agentRun: string;
  responsiblePersonId: string;
  locator: string;
  units: number;
}
export interface ResourceUseEventDraft {
  eventId: string;
  expectedRevision: number;
  kind: ResourceUseEventKind;
  reason: string;
  evidence?: string;
  ownerPersonId?: string;
  reviewAt?: number;
}
export interface ResourceUse {
  id: string;
  source: 'reported' | 'runtime';
  organizationId: string | null;
  projectId: string;
  projectName: string;
  resourceId: string;
  resourceName: string;
  unitLabel: string;
  providerId: string | null;
  providerName: string | null;
  workItemId: string;
  workItemName: string;
  stepId: string | null;
  attemptNumber: number | null;
  agentRun: string;
  responsiblePersonId: string;
  responsiblePersonName: string;
  locator: string;
  units: number;
  state: ResourceUseState;
  revision: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  updatedBy: string;
  runtimeId?: string;
  runtimeRevision?: number;
  incarnation?: string;
  pendingCleanupRequest?: boolean;
  reclaimedBytes?: null;
  retention: { ownerPersonId: string; reason: string; reviewAt: number } | null;
}
export interface ResourceUseEvent {
  id: string;
  useId: string;
  revision: number;
  kind: 'registered' | 'cleanup_pending' | 'blocked' | 'release_verified' | ResourceUseEventKind;
  source: 'reported' | 'runtime';
  actorId: string;
  actorPersonId: string | null;
  actorName: string;
  evidenceDigest?: string;
  observedAt?: number;
  at: number;
  reason: string;
  evidence: string | null;
  ownerPersonId: string | null;
  reviewAt: number | null;
}
/** Validates reported disposition metadata and the revisioned, terminal lifecycle. */
export function transitionResourceUse(
  use: ResourceUse,
  draft: ResourceUseEventDraft,
  actorId: string,
  at: number,
): ResourceUse | 'conflict' | 'invalid_body' {
  // Proof: evidence and retention-deadline mutants made the composed pending-cleanup and retention tests fail (2026-10-25).
  if (
    !draft.reason.trim() ||
    (draft.kind === 'release_reported' && !draft.evidence?.trim()) ||
    (draft.kind === 'retained' &&
      (!draft.ownerPersonId?.trim() || draft.reviewAt === undefined || draft.reviewAt <= at))
  )
    return 'invalid_body';
  // Proof: removing revision comparison made the composed stale-revision test accept a stale write (2026-10-25).
  if (use.revision !== draft.expectedRevision) return 'conflict';
  const permitted =
    draft.kind === 'cleanup_requested'
      ? ['active', 'blocked', 'retained'].includes(use.state)
      : draft.kind === 'retained'
        ? ['active', 'cleanup_pending'].includes(use.state)
        : use.state === 'cleanup_pending';
  // Proof: permitting release_reported re-entry failed the composed terminal-lifecycle assertion (2026-10-25).
  if (!permitted) return 'conflict';
  const state =
    draft.kind === 'cleanup_requested'
      ? 'cleanup_pending'
      : draft.kind === 'cleanup_blocked'
        ? 'blocked'
        : draft.kind;
  return {
    ...use,
    state,
    revision: use.revision + 1,
    updatedAt: at,
    updatedBy: actorId,
    retention:
      draft.kind === 'retained' && draft.ownerPersonId !== undefined && draft.reviewAt !== undefined
        ? { ownerPersonId: draft.ownerPersonId, reason: draft.reason, reviewAt: draft.reviewAt }
        : null,
  };
}
