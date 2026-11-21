import type { Permission, StepIdentityRead } from '@wbs/domain';

import type { ScopedPrincipal } from './access-decisions';

/** The saved-plan header exactly as a source returns it. */
export interface SavedPlanRow {
  readonly id: string;
  readonly workPackageId: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdById: string | null;
  readonly createdAt: number;
  readonly inputSchemaVersion: number;
  readonly inputBytes: number;
  readonly inputSha256: string;
  readonly scheduleSchemaVersion: number | null;
  readonly scheduleBytes: number | null;
  readonly scheduleSha256: string | null;
  readonly scheduleInputSha256: string | null;
  readonly schedulerAlgorithmId: string | null;
  readonly scheduleAbsentReason: string | null;
}

/** One stored body and the digest taken over its exact bytes. */
export interface SavedPlanBodyWrite {
  readonly schemaVersion: number;
  readonly bytes: string;
  readonly sha256: string;
}

/** The schedule side is either wholly present or absent with a reason. */
export type SavedPlanScheduleWrite =
  | {
      readonly present: true;
      readonly body: SavedPlanBodyWrite;
      readonly inputSha256: string;
      readonly algorithmId: string;
    }
  | { readonly present: false; readonly absentReason: string };

/** One immutable saved-plan write. */
export interface SavedPlanWrite {
  readonly id: string;
  readonly workPackageId: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdById: string | null;
  readonly createdAt: number;
  readonly input: SavedPlanBodyWrite;
  readonly schedule: SavedPlanScheduleWrite;
}

/** Actual scoped principal, rechecked against current grants in the writer's transaction. */
export interface ScopedSavedPlanWrite {
  readonly principal: ScopedPrincipal;
  readonly organizationId: string;
  readonly actorId: string;
  readonly operation: 'save' | 'rename' | 'delete';
}

/** Explicit retained legacy admission; a current marker recheck remains the writer's obligation. */
export interface LegacySavedPlanTouch {
  readonly kind: 'legacy';
  readonly actorId: string;
  readonly source: 'human' | 'internal';
  readonly operation: 'rename' | 'delete';
}

/** Touch writers never infer legacy authority from an omitted scoped argument. */
export type SavedPlanTouchWrite = ScopedSavedPlanWrite | LegacySavedPlanTouch;

/** A private writer mutation never interprets an absent rename payload as deletion. */
export type SavedPlanTouchMutation =
  { readonly operation: 'rename'; readonly name: string } | { readonly operation: 'delete' };

/** What the source did while trying to acquire and perform a saved-plan write. */
export type SavedPlanWriteOutcome<Refusal> =
  | { readonly outcome: 'written' }
  | { readonly outcome: 'refused'; readonly refusal: Refusal }
  | { readonly outcome: 'snapshot_busy' }
  | { readonly outcome: 'forbidden' | 'not_found'; readonly permission?: Permission };

/** A stored header and its independently stored bodies. */
export interface StoredSavedPlanBytes {
  readonly header: SavedPlanRow;
  readonly bodies: {
    readonly input: string | null;
    readonly schedule: string | null;
  };
}

/** Required current identity evidence joins the immutable bytes only when a source reads them. */
export interface StoredSavedPlan extends StoredSavedPlanBytes {
  readonly stepIdentity: StepIdentityRead;
}

/** What a work package holds at the instant a write checks its quota. */
export interface SavedPlanHoldingRow {
  readonly plans: number;
  readonly bytes: number;
}

export type SavedPlanTouchOutcome =
  | 'touched'
  | 'no_such_plan'
  | 'snapshot_busy'
  | 'forbidden'
  | 'no_active_organization'
  | 'organization_context_changed'
  | { readonly outcome: 'forbidden'; readonly permission: Permission };

/** The identities used to authorize a rename or deletion. */
export interface SavedPlanPrincipals {
  readonly savedPlanId: string;
  readonly workPackageId: string;
  readonly createdById: string | null;
}
