import type { AllowancePercent, EstimateUnit } from '@wbs/domain';

import type { ScopedPrincipal } from './access-decisions';
import { retainAccessAct } from './access-grants';
import type { Step, StepAllowanceWritten, StepUnitWritten } from './step-store';
import type { WorkPackageWithSteps } from './work-package-read';
import type {
  NewWorkPackage,
  WorkPackage,
  WorkPackageCrossReference,
  WorkPackagePatch,
  WorkPackageWithAccess,
} from './work-package-values';
import type { WriteStamp } from './write-stamp';
export type {
  NewWorkPackage,
  RecoveryAuditDetail,
  WorkPackage,
  WorkPackageCrossReference,
  WorkPackageCrossReferenceKind,
  WorkPackagePatch,
  WorkPackageWithAccess,
} from './work-package-values';
export { WORK_PACKAGE_CROSS_REFERENCE_KINDS } from './work-package-values';

/** Creation refusals roll back the entire work package, ownership, steps and allocator advance. */
export type WorkPackageCreationRefusal =
  'abbreviation_taken' | 'abbreviation_exhausted' | 'not_found';

/** Distinct identities supplied by the package birth's existing Clock; actor/time are its WriteStamp. */
export interface WorkPackageCreatorGrant {
  readonly id: string;
  readonly auditId: string;
}

/** Current birth explicitly retains the applicable existing creation authority. */
export type WorkPackageCreationScope =
  | { readonly kind: 'legacy' }
  | {
      readonly kind: 'scoped';
      readonly organizationId: string;
      readonly creatorGrant: WorkPackageCreatorGrant;
    };

/** Retains all scoped creation values before any writer waits, including nested settings and steps. */
export function retainWorkPackageCreation(
  workPackage: NewWorkPackage,
  steps: readonly Step[],
  stamp: WriteStamp,
  organizationId: string,
  creatorGrant: WorkPackageCreatorGrant,
) {
  if (typeof workPackage.projectId !== 'string' || workPackage.projectId.trim() === '')
    throw new Error('package creation parent is missing');
  const act = retainAccessAct({
    actor: { kind: 'user', userId: stamp.by },
    at: stamp.at,
    auditId: creatorGrant.auditId,
  });
  const identities = [workPackage.id, creatorGrant.id, creatorGrant.auditId];
  if (
    identities.some((id) => typeof id !== 'string' || id === '') ||
    new Set(identities).size !== identities.length
  )
    throw new Error('package, creator grant and audit identities must be present and distinct');
  if (typeof organizationId !== 'string' || organizationId === '')
    throw new Error('package creation organization is missing');
  if (!Number.isFinite(act.at)) throw new Error('package creation instant is malformed');
  return {
    workPackage: structuredClone(workPackage),
    steps: structuredClone([...steps]),
    stamp: { by: stamp.by, at: act.at },
    organizationId,
    creatorGrant: { id: creatorGrant.id, auditId: act.auditId },
  };
}

export interface WorkPackageStore {
  /**
   * Creates a current package and captures its header and actual inherited catalogue
   * steps inside that same birth owner. Empty catalogues answer an explicit empty list.
   * No local step seed is accepted. Refusal rolls back all birth writes, including
   * values, allocator, creator grant and audit. Returned arrays are detached.
   */
  createWithSteps(
    workPackage: NewWorkPackage,
    stamp: WriteStamp,
    scope: WorkPackageCreationScope,
  ): Promise<WorkPackageWithSteps | WorkPackageCreationRefusal>;
  /**
   * Writes the work package and its explicit current catalogue values together. Every
   * binding reaching its project, including typed bindings without current leaves,
   * contributes a value row copied from its definition's defaults at that instant.
   *
   * `steps` retains the pre-catalogue fixture/import shape during caller cutover;
   * those legacy rows do not author current definitions or change project bindings.
   * Legacy table fixtures retain them separately and cannot certify a current Source.
   */
  create(
    workPackage: NewWorkPackage,
    steps: readonly Step[],
    stamp: WriteStamp,
  ): Promise<WorkPackage | WorkPackageCreationRefusal>;
  /**
   * {@link create} plus the work package's organization mapping, in one transaction.
   * Only an activated deployment's scoped creation calls it. A `solutionRef`
   * is written as the organization's own link.
   * The actual creator's package-manager grant (creation origin) and its
   * access_granted event use the same stamp and transaction. Complete inputs
   * are detached before waiting; a borrowed grant refusal throws through the
   * owner so neither package nor any grant/audit survives it.
   *
   * @throws when another of the organization's work packages holds the slug; the
   * caller checks {@link findBySolutionSlugInOrganization} under its write lock.
   */
  createInOrganization(
    workPackage: NewWorkPackage,
    steps: readonly Step[],
    stamp: WriteStamp,
    organizationId: string,
    creatorGrant: WorkPackageCreatorGrant,
  ): Promise<WorkPackage | WorkPackageCreationRefusal>;
  findById(id: string): Promise<WorkPackage | null>;
  /** {@link findById} confined to one organization; null alike for a foreign or absent id. */
  findInOrganization(id: string, organizationId: string): Promise<WorkPackage | null>;
  /**
   * Current scoped admission follows each fact's actual work-item package and shared
   * definition organization. All eleven point families and both typed/external endpoint
   * columns require the addressed package's explicit step values; sharing a definition
   * with another package never creates incoming point ownership. A nullable subtree
   * claim carries no point, and parent-issued allocator history remains identity-only.
   *
   * Foreign definitions retain precise crossing kinds. Missing/malformed trusted
   * definitions or organization attribution throw; missing explicit values throw
   * WorkPackageStepMissing for that package/step pair. An unrelated sibling's missing
   * values are checked when that sibling is addressed, not through shared identity.
   *
   * Typed/external relationships retain declared package, work-item location and scope.
   * Existing directory/person/capacity references, work-item parent and legacy dependency
   * endpoints, including genuine incoming parent/dependency references, remain guarded.
   * The historical incoming_step_row kind does not grant a global definition an owner.
   * Empty means the addressed references are coherent; this read writes nothing.
   */
  findCrossReferences(
    workPackageId: string,
    organizationId: string,
  ): Promise<readonly WorkPackageCrossReference[]>;
  findBySolutionSlug(slug: string): Promise<WorkPackage | null>;
  /**
   * {@link findBySolutionSlug} confined to one organization, filtered before
   * any row is decoded: a foreign work package is null exactly like an absent slug,
   * even when its row could not be read. Matches the organization's own links
   * and the legacy links its work packages kept from before activation.
   */
  findBySolutionSlugInOrganization(
    slug: string,
    organizationId: string,
  ): Promise<WorkPackage | null>;
  /** Every work package, newest first. Readable by any account, so it is not filtered by owner. */
  list(): Promise<WorkPackage[]>;
  /**
   * Every work package in `userId`'s own order: the ones that account has opened
   * first, most recent before less recent, then the ones it never opened,
   * newest created first.
   *
   * Not a filter — every account still sees every work package, because reading is
   * open. Only the order and the extra `lastOpenedAt` differ per caller; the
   * owner's name on each entry is the same for everybody asking.
   *
   * @throws when a listed work package's owner id names no account. Every
   * implementation, the in-memory fixture included: a store that answered a
   * blank owner here would let a test pass against a list production refuses.
   */
  listFor(userId: string): Promise<WorkPackageWithAccess[]>;
  /** {@link listFor} confined to one organization's work packages. */
  listForInOrganization(userId: string, organizationId: string): Promise<WorkPackageWithAccess[]>;
  /**
   * Records the acting account as having opened `workPackageId` at the stamp's
   * instant, replacing whatever moment was recorded before. Idempotent by the
   * primary key rather than by asking first: two tabs opening one work package at
   * once would both see "no row" and both insert.
   *
   * The stamp carries both halves this used to take separately — it was
   * `recordOpen(userId, workPackageId, at)` — because the account that opened the
   * work package is the acting user and the moment it was opened is the instant of
   * the act. Two names for one fact is how the two drift apart.
   */
  recordOpen(workPackageId: string, stamp: WriteStamp): Promise<void>;
  /**
   * {@link recordOpen} only while `organizationId` owns the work package, checked in
   * the write's own transaction; false, and nothing recorded, otherwise.
   */
  recordOpenInOrganization(
    workPackageId: string,
    stamp: WriteStamp,
    organizationId: string,
  ): Promise<boolean>;
  /**
   * Current package.read and the navigation upsert on one writer, without private DTO decoding.
   * The purpose owner revalidates complete caller/context before passing its actual principal.
   * A borrowed catalog takes no additional owner; absent/foreign/unreadable is false.
   * @throws on incoherent stamp/principal, unavailable authority or malformed selected state.
   */
  recordReadableOpenInOrganization(
    workPackageId: string,
    stamp: WriteStamp,
    organizationId: string,
    principal: ScopedPrincipal,
  ): Promise<boolean>;
  /** Returns null when the work package is gone. */
  update(
    id: string,
    patch: WorkPackagePatch,
    stamp: WriteStamp,
  ): Promise<WorkPackage | null | 'abbreviation_taken'>;
  /**
   * {@link update} by `editor.actorId` in `organizationId`, authorized against
   * the current authenticated principal's grants and membership in the write's
   * own transaction. A missing, foreign or invisible work package is null; a readable
   * work package without settings authority is `forbidden`. Neither writes.
   *
   * The only restricted recovery is an authorized exact flag-clear
   * {@link WorkPackagePatch}; it writes one `organization_audit` record
   * ({@link RecoveryAuditDetail}) in the same transaction. Other settings need
   * their ordinary grant. Even an empty patch requires current authority,
   * then writes and records nothing. Missing or unreadable trusted grant state
   * throws rather than becoming a refusal.
   *
   * A `solutionRef` is the organization's own (see `work_package_solution`): a slug
   * another of the organization's work packages holds, by either representation, is
   * `solution_taken` and writes nothing; other organizations' slugs are never
   * consulted. A legacy pair the work package held is cleared by any link write.
   */
  editInOrganization(
    id: string,
    patch: WorkPackagePatch,
    stamp: WriteStamp,
    organizationId: string,
    editor: {
      readonly actorId: string;
      readonly auditId: string;
      readonly principal: ScopedPrincipal;
    },
  ): Promise<WorkPackage | null | 'forbidden' | 'solution_taken' | 'abbreviation_taken'>;
  stepsOf(workPackageId: string): Promise<Step[]>;
  /**
   * Changes the current addressed package's explicit unit in the supplied writer.
   * Same-unit is a no-op. A changed unit refuses with this package's estimate-row
   * count; shared-definition sibling rows never veto it. Selected missing values
   * throw WorkPackageStepMissing; unbound/foreign/absent membership is not_found.
   * Definition defaults and allowance revisions remain untouched.
   */
  setStepUnit(
    workPackageId: string,
    stepId: string,
    unit: EstimateUnit,
    stamp: WriteStamp,
  ): Promise<StepUnitWritten>;
  /**
   * Sets one step's allowance, moves that step's allowance revision by one and
   * moves the work package's revision, in one transaction, answering the allowance
   * it replaced. Membership is the current any-type project-chain union; a
   * pair outside that set is `not_found`. A selected pair missing its explicit
   * package values throws `WorkPackageStepMissing`, never using definition defaults.
   * The same definition can have independent allowances in sibling packages.
   *
   * Here rather than on `StepStore` because the journalled edit is applied by
   * `WorkItemService`, which reads steps through this store already — see
   * `holdsStep`.
   */
  setStepAllowance(
    workPackageId: string,
    stepId: string,
    allowancePercent: AllowancePercent,
    stamp: WriteStamp,
  ): Promise<StepAllowanceWritten>;
  /**
   * Each current package step's explicit allowance revision, by step id.
   * Retained unbound rows are excluded, so they cannot revive a stale replay.
   *
   * What an allowance undo is conditioned on. A revision rather than the value,
   * because a value can come back: 30% edited to 50% and back to 30% by
   * somebody else is still somebody else's work, and an undo compared on the
   * value would overwrite it.
   */
  stepAllowanceRevisions(workPackageId: string): Promise<ReadonlyMap<string, number>>;
  /**
   * The IANA zone the work package reads instants as days in (`step-node-attempts`
   * design D3), or null when there is no such work package.
   *
   * Not a field of {@link WorkPackage} yet: the read and the PATCH that publish it
   * arrive with the timezone route.
   *
   * @throws on a stored value `isTimezone` refuses: the column is trusted state.
   */
  timezoneOf(workPackageId: string): Promise<string | null>;
  /**
   * Stores the zone and moves the work package's revision, answering false when
   * there is no such work package. The caller validated the zone at its boundary.
   */
  setTimezone(workPackageId: string, timezone: string, stamp: WriteStamp): Promise<boolean>;
}
