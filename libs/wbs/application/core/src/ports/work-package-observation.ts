import type { Permission } from '@wbs/domain';

import type { CommandCaller } from './command-access';
import type { RefusedOrganizationAccess, ResourceAccess } from './organization-access';
import type { PlanEvent, PlanEventFilter } from './plan-event-values';
import type { ResolvedPlanInputReads } from './saved-plan-capture-values';
import type { SavedPlanRow, StoredSavedPlan } from './saved-plan-values';
import type { ScheduleRead } from './scheduler';
import type { LivePlanRead, SharedPeopleRead } from './shared-people-values';
import type { WorkPackageWithSteps, ZonedWorkPackageWithSteps } from './work-package-read';
import type { WorkPackageWithAccess } from './work-package-store';

/** Completed current evidence; local Fast finishes after closure, shared/connected finish on the loan. */
export type SavedCurrentCapture =
  | {
      readonly kind: 'local';
      readonly reads: ResolvedPlanInputReads;
      readonly scheduled: ScheduleRead | { readonly kind: 'cycle' };
    }
  | Exclude<SharedPeopleRead, { readonly kind: 'not_found' }>
  | Extract<LivePlanRead, { readonly kind: 'connected' }>;

/** Completed evidence and current write authority; no reader capability escapes the observation. */
export type SavedPlanCaptureValue =
  | {
      readonly kind: 'captured';
      readonly access: ResourceAccess;
      readonly captured: SavedCurrentCapture;
    }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'forbidden'; readonly permission?: Permission };

/** A detail names one saved ID; comparison also binds that side to its addressed package. */
export type SavedPlanReadAddress =
  | { readonly kind: 'detail'; readonly savedPlanId: string }
  | { readonly kind: 'comparison'; readonly workPackageId: string; readonly savedPlanId: string };

/** Detached exact stored bytes, or the address-specific absence that the route can disclose. */
export type SavedPlanReadValue =
  | { readonly kind: 'stored'; readonly stored: StoredSavedPlan }
  | { readonly kind: 'package_not_found' }
  | { readonly kind: 'saved_plan_not_found' };

/**
 * Ordinary HTTP package reads retain complete caller evidence before acquisition and resolve
 * current mode, credential, membership and grants beside the returned rows in one observation.
 * Preactivation preserves explicit legacy reads; a changed admitted context is a modeled refusal.
 * Scoped invisible detail is null, identical to absence. LIST projects only readable IDs before
 * private metadata decoding and preserves the repository's navigation/creation ordering.
 * The first database read chooses the committed epoch, not request arrival time.
 * @throws on acquisition/settlement failure or unreadable/malformed selected trusted state.
 */
export interface WorkPackageObservation {
  /**
   * Admits package.write and captures its complete saved evidence on one owned read loan.
   * Foreign and invisible targets stay absent; legacy admits only unrestricted packages.
   * Required malformed evidence throws. Local scheduling follows release; shared/connected
   * derivation and non-admitting cache selection finish before release.
   */
  captureSavedPlan(
    caller: Extract<CommandCaller, { readonly kind: 'human' }>,
    id: string,
  ): Promise<
    { readonly ok: true; readonly value: SavedPlanCaptureValue } | RefusedOrganizationAccess
  >;
  /**
   * Checks current package.read admission without decoding any private package fields.
   * False combines absent, valid foreign and denied targets; context refusals stay typed.
   * Legacy checks only addressed existence, independent of private DTO corruption.
   * Owned malformed mapping/parent state and unexpected observation failures throw.
   */
  checkRead(
    caller: CommandCaller,
    id: string,
  ): Promise<{ readonly ok: true; readonly value: boolean } | RefusedOrganizationAccess>;
  /**
   * Lists detached saved headers after current package.read admission in the same observation.
   * Null conceals absent, foreign or denied packages; [] is a readable empty shelf.
   * Owned mapping/parent corruption throws before denial; bodies and private package DTOs stay unread.
   */
  listSaved(
    caller: CommandCaller,
    id: string,
  ): Promise<
    | { readonly ok: true; readonly value: readonly SavedPlanRow[] | null }
    | RefusedOrganizationAccess
  >;
  /**
   * Reads detached exact saved bytes after current package.read on the same observation.
   * Detail conceals missing/foreign saved identities; comparison first admits the package,
   * then distinguishes a missing or wrong-package saved side before private decoding.
   * Scoped owned mapping/header/package orphan state throws; legacy missing packages stay absent.
   * Missing bodies remain null for the
   * existing post-observation integrity verifier, including its typed body_missing refusal.
   */
  readSaved(
    caller: CommandCaller,
    address: SavedPlanReadAddress,
  ): Promise<{ readonly ok: true; readonly value: SavedPlanReadValue } | RefusedOrganizationAccess>;
  /**
   * Captures current comparison evidence under current complete-caller admission.
   * A hidden addressed package or required explicit endpoint is indistinguishable from absence.
   * Shared person influences stay inside the readable universe; required dependencies are retained.
   * No reader/lifetime escapes. Unknown trusted-state or settlement failures throw.
   */
  captureSavedCurrent(
    caller: CommandCaller,
    id: string,
  ): Promise<
    { readonly ok: true; readonly value: SavedCurrentCapture | null } | RefusedOrganizationAccess
  >;
  list(
    caller: CommandCaller,
  ): Promise<
    { readonly ok: true; readonly value: WorkPackageWithAccess[] } | RefusedOrganizationAccess
  >;
  read(
    caller: CommandCaller,
    id: string,
  ): Promise<
    | { readonly ok: true; readonly value: ZonedWorkPackageWithSteps | null }
    | RefusedOrganizationAccess
  >;
  /**
   * Reads matching events after current package.read admission in the same observation.
   * Null conceals an absent or unreadable package; an empty array is readable empty history.
   * Complete caller and filter arrays are retained before acquisition; stored JSON stays opaque.
   */
  readHistory(
    caller: CommandCaller,
    id: string,
    filter: PlanEventFilter,
  ): Promise<{ readonly ok: true; readonly value: PlanEvent[] | null } | RefusedOrganizationAccess>;
  /** Resolves a slug and current package.read on the same observation; success stays non-zoned. */
  readSolution(
    caller: CommandCaller,
    slug: string,
  ): Promise<
    { readonly ok: true; readonly value: WorkPackageWithSteps | null } | RefusedOrganizationAccess
  >;
}
