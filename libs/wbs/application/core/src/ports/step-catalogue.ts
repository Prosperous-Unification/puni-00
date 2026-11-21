import type {
  AllowancePercent,
  EstimateUnit,
  ResolvedStep,
  StepBinding,
  StepFactKind,
  WorkPackageChain,
} from '@wbs/domain';
export type { StepFactKind } from '@wbs/domain';
export { STEP_FACT_KINDS } from '@wbs/domain';

import type { ProjectStepManifest } from './step-manifest';
import type { StepUsageSnapshot } from './step-usage';
import type { WriteStamp } from './write-stamp';

/** Organization-wide identity and defaults; no package's authored values belong here. */
export interface NewStepDefinition {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly defaultEstimateUnit: EstimateUnit;
  readonly defaultAllowancePercent: AllowancePercent;
  /** Catalogue definition order, independent of every scope binding position. */
  readonly position: number;
}

/** One actual organization/space/project scope, never a work-package scope. */
export interface StepScope {
  readonly scopeKind: StepBinding['scopeKind'];
  readonly scopeId: string;
}

export interface StepDefinition extends NewStepDefinition {
  readonly organizationId: string;
  readonly definedAt: StepScope;
  readonly origin: 'migration' | 'authored';
}

/** NULL means every type; identity uniqueness includes that NULL through type_key. */
export interface NewStepBinding extends StepScope {
  readonly bindingId: string;
  readonly stepId: string;
  readonly workItemTypeId: string | null;
  readonly position: number;
}

export interface CatalogueStepBinding extends NewStepBinding {
  readonly organizationId: string;
  readonly origin: 'migration' | 'authored';
}

/** Complete active own-organization metadata, detached from the source's read lifetime; retired physical identities remain historical storage. */
export interface StepCatalogueRows {
  readonly definitions: readonly StepDefinition[];
  readonly bindings: readonly CatalogueStepBinding[];
}

/** Package-specific explicit values over the ordered any-type union and all reached provenance. */
export interface PackageStep extends ResolvedStep {
  readonly estimateUnit: EstimateUnit;
  readonly allowancePercent: AllowancePercent;
  readonly allowanceRevision: number;
}

export interface PackageSteps {
  readonly chain: WorkPackageChain;
  readonly steps: readonly PackageStep[];
}

/** Only explicit definition metadata is changed; package-authored values are not defaults. */
export interface StepDefinitionPatch {
  readonly name?: string;
  readonly defaultEstimateUnit?: EstimateUnit;
  readonly defaultAllowancePercent?: AllowancePercent;
}

export type StepDefinitionPatched =
  | {
      readonly ok: true;
      readonly definition: StepDefinition;
      readonly workPackageIds: readonly string[];
      readonly projectIds: readonly string[];
    }
  | { readonly ok: false; readonly reason: 'not_found' | 'name_taken' };

export type StepDefinitionRetired =
  { readonly ok: true } | { readonly ok: false; readonly reason: 'not_found' | 'step_bound' };

export type StepDefinedAndBound =
  | {
      readonly ok: true;
      readonly definition: StepDefinition;
      readonly binding: CatalogueStepBinding;
      readonly workPackageIds: readonly string[];
      readonly projectIds: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: 'not_found' | 'code_taken' | 'name_taken' | 'duplicate_binding';
    };

export type StepBound =
  | {
      readonly ok: true;
      readonly binding: CatalogueStepBinding;
      readonly workPackageIds: readonly string[];
      readonly projectIds: readonly string[];
    }
  | { readonly ok: false; readonly reason: 'not_found' | 'duplicate_binding' };

export type StepBindingsReordered =
  | {
      readonly ok: true;
      readonly workPackageIds: readonly string[];
      readonly projectIds: readonly string[];
    }
  | { readonly ok: false; readonly reason: 'not_found' | 'stale_order' };

/** One leaf/step that would vanish; facts are distinct and follow STEP_FACT_KINDS order. */
export interface StepInUsePair {
  readonly id: string;
  readonly name: string;
  readonly stepId: string;
  readonly workPackageId: string;
  readonly facts: readonly StepFactKind[];
}

export interface StepNodesInUse {
  /** Total distinct protected vanishing pairs, before the response cap. */
  readonly count: number;
  /** At most 200, ordered by binary package id, tree rank, then resolved step order. */
  readonly pairs: readonly StepInUsePair[];
}

/** Explicit mode is required; neither omission nor a prior authority answer selects apply. */
export interface StepUnbindOptions {
  readonly dryRun: boolean;
}

export type StepUnbindOutcome =
  | {
      readonly kind: 'unbound';
      readonly workPackageIds: readonly string[];
      readonly projectIds: readonly string[];
    }
  | { readonly kind: 'not_found' }
  | ({ readonly kind: 'step_nodes_in_use' } & StepNodesInUse)
  | { readonly kind: 'preview'; readonly wouldRefuse: null }
  | ({ readonly kind: 'preview'; readonly wouldRefuse: 'step_nodes_in_use' } & StepNodesInUse);

/**
 * Required catalogue operations on the source/catalog owner's existing lifetime.
 * Application-facing callers admit the retained actual scope inside the same
 * serialized write loan before mutation/materialization. Public source integration
 * must enter that current admitted owner under its coordinator, never reuse an
 * earlier permission answer. organizationId/stamp are addressing/audit, never
 * permission tokens; direct conformance calls exercise persistence only.
 * Public source writes serialize on its coordinator, borrowed writes join its
 * already-owned transaction. Implementations never open a second writer.
 * Definition/binding changes and missing package-row materialization are atomic.
 * Existing package values and allowance revisions are never reset by a bind.
 * All returned arrays and nested definition/binding/provenance/value records are
 * detached; no source/loan callback escapes. Borrowed methods require an active
 * owner before work and after any awaited dependency before exposing a value.
 * A settled owner throws rather than acquiring a replacement; already returned
 * detached values remain usable after closure. Readonly types alone prove none
 * of these runtime/lifetime properties.
 * @throws on malformed/missing owned trusted metadata or unexpected storage failure.
 */
export interface StepCatalogue {
  /**
   * Reorders exactly the complete binding set of one actual same-organization scope,
   * across every type. Missing, extra, duplicate and out-of-scope ids are stale_order;
   * foreign/absent scope is not_found. No definition, fact or package value changes.
   * Same total order (position then binary binding id), including empty, is a no-op.
   * A changed order gets positions10,20,... and advances each reached package/project
   * once, including empty projects. Both sorted unique ID lists are returned.
   * Retain ids/scope/stamp before queueing; permission admission belongs on this same
   * writer and borrowed methods cannot outlive their current owner.
   */
  reorderBindings(
    organizationId: string,
    scope: StepScope,
    ids: readonly string[],
    stamp: WriteStamp,
  ): Promise<StepBindingsReordered>;

  /** Actual organization metadata; null only for an absent organization. Arrays are detached; no package settings are guessed. */
  readCatalogue(organizationId: string): Promise<StepCatalogueRows | null>;
  /** Reserved retired codes on this actual owner; null only for an absent organization. Validates retained retirement ownership, keeps retired rows out of the active catalogue, and returns a detached list. */
  readRetiredCodes(organizationId: string): Promise<readonly string[] | null>;
  /** Complete decoded organization usage on this same owner, including both external endpoints; null only for absent organization. Detached evidence grants no authority and must pass the pure semantic projector before response selection. */
  readUsage(organizationId: string): Promise<StepUsageSnapshot | null>;
  /** Actual project revision, owned type IDs and matching bindings on this same owner; foreign/absent project is null before private decode. Empty projects resolve without package materialization. */
  readManifest(organizationId: string, projectId: string): Promise<ProjectStepManifest | null>;
  /**
   * Actual addressed package's project-chain union for any binding type, independent
   * of leaves. Steps and every via entry follow SC18; explicit values come from
   * that package, never current definition defaults. Foreign/absent packages are
   * null before private metadata decoding. Owned corrupt ancestry throws.
   * @throws {WorkPackageStepMissing} for a reached definition without explicit values.
   */
  readPackage(organizationId: string, workPackageId: string): Promise<PackageSteps | null>;
  /**
   * Creates an organization definition and its first binding on one writer.
   * definedAt comes from binding's actual scope, origin is authored. Scope/type
   * must belong to organizationId; foreign/absent references are not_found.
   * Names/codes remain unique across active and retired definitions. Every reached existing package,
   * including an empty one, receives missing defaults with allowanceRevision0.
   * Every modeled refusal preserves the entire definition/binding/value change.
   * Success advances actual reached package/project revisions once, including empty
   * projects, and returns their sorted unique IDs for refresh/manifest concurrency.
   */
  defineAndBindStep(
    organizationId: string,
    definition: NewStepDefinition,
    binding: Omit<NewStepBinding, 'stepId'>,
    stamp: WriteStamp,
  ): Promise<StepDefinedAndBound>;
  /**
   * Binds an existing same-organization definition at an actual scope and
   * materializes missing package values on the same writer. The duplicate tuple
   * is (scopeKind,scopeId,stepId,type_key), including every-type NULL. Retired ids
   * are not_found. Success advances actual reached package/project revisions once
   * even for provenance-only changes and returns both sorted unique ID lists.
   */
  bindStep(organizationId: string, binding: NewStepBinding, stamp: WriteStamp): Promise<StepBound>;
  /**
   * Changes an active own-organization definition on the same writer. Retired,
   * foreign and absent addresses are not_found; retained names remain reserved.
   * Defaults edits never consult package estimates or alter explicit package values.
   * Changed name/default metadata advances every currently reaching project,
   * including empty projects, and package once; returned IDs are sorted/unique.
   * An exact no-op advances none and returns both ID lists empty.
   */
  patchStepDefinition(
    organizationId: string,
    stepId: string,
    patch: StepDefinitionPatch,
    stamp: WriteStamp,
  ): Promise<StepDefinitionPatched>;
  /**
   * Adds only the required retirement record for an active unbound definition.
   * Physical identity/defaults, namespace, package values and history remain exact.
   * Any live binding is step_bound. Foreign/absent/already-retired is not_found.
   * The final binding check and record insertion share this method's transaction
   * or savepoint; retirement itself touches no package/project revision.
   */
  retireStepDefinition(
    organizationId: string,
    stepId: string,
    stamp: WriteStamp,
  ): Promise<StepDefinitionRetired>;
  /**
   * Removes only the addressed binding on the existing current writer. A protected
   * leaf/step that loses its final matching binding refuses with total count and
   * first200 pairs. Preview evaluates the same proposed state then rolls it back;
   * it writes/announces nothing. Explicit package values are never deleted.
   * Current scope permission admission is required inside the same write loan;
   * organizationId and stamp are not authority. All nested returns are detached.
   * Foreign/absent binding addresses are not_found before private metadata.
   * Only actual unbound success advances pre-removal reached package/project
   * revisions once and returns both sorted ID lists; preview/refusal advances none.
   */
  unbindStep(
    organizationId: string,
    bindingId: string,
    options: StepUnbindOptions,
    stamp: WriteStamp,
  ): Promise<StepUnbindOutcome>;
}
