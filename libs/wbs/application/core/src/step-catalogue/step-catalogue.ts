import {
  allowanceHundredthsOf,
  isEstimateUnit,
  isReservedStepCode,
  isStepCode,
  resolvePackageSteps,
  type StepBinding,
  type WorkPackageChain,
} from '@wbs/domain';

import type {
  CatalogueStepBinding,
  CatalogueWriteObservation,
  NewStepBinding,
  NewStepDefinition,
  PackageStep,
  PackageSteps,
  StepCatalogue,
  StepDefinition,
  StepScope,
  StepUnbindOptions,
} from '../ports/step-catalogue';
import { WorkPackageStepMissing } from '../ports/step-store';
import type { WriteStamp } from '../ports/write-stamp';

export interface StepDefinitionRecord {
  readonly id: unknown;
  readonly organizationId: unknown;
  readonly code: unknown;
  readonly name: unknown;
  readonly defaultEstimateUnit: unknown;
  readonly defaultAllowanceBps: unknown;
  readonly position: unknown;
  readonly definedAtScopeKind: unknown;
  readonly definedAtScopeId: unknown;
  readonly origin: unknown;
}
export interface StepBindingRecord {
  readonly bindingId: unknown;
  readonly organizationId: unknown;
  readonly scopeKind: unknown;
  readonly scopeId: unknown;
  readonly stepId: unknown;
  readonly workItemTypeId: unknown;
  readonly position: unknown;
  readonly origin: unknown;
}
export interface PackageStepRecord {
  readonly workPackageId: unknown;
  readonly stepId: unknown;
  readonly estimateUnit: unknown;
  readonly allowanceBps: unknown;
  readonly allowanceRevision: unknown;
}
export type StepIdentity = Pick<StepDefinition, 'id' | 'organizationId' | 'code' | 'name'>;
export type PackageStepValues = Pick<
  PackageStep,
  'estimateUnit' | 'allowancePercent' | 'allowanceRevision'
>;

/** One trusted scalar identity boundary, with no trimming or grammar invented for historical identities. */
export function readCatalogueId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '')
    throw new Error('catalogue ' + label + ' is absent or malformed');
  return value;
}
function readPosition(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('catalogue position is malformed');
  return value;
}
function readScopeKind(value: unknown): 'organization' | 'space' | 'project' {
  if (value !== 'organization' && value !== 'space' && value !== 'project')
    throw new Error('catalogue scope kind is malformed');
  return value;
}
function readOrigin(value: unknown): 'migration' | 'authored' {
  if (value !== 'migration' && value !== 'authored')
    throw new Error('catalogue origin is malformed');
  return value;
}
export function readCatalogueAllowance(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100000)
    throw new Error('catalogue allowance is malformed');
  return value;
}
/** Existing codes are historical values; only new definitions use the current authoring grammar. */
export function readStepIdentity(
  row: Pick<StepDefinitionRecord, 'id' | 'organizationId' | 'code' | 'name'>,
): StepIdentity {
  return {
    id: readCatalogueId(row.id, 'step identity'),
    organizationId: readCatalogueId(row.organizationId, 'step organization'),
    code: readCatalogueId(row.code, 'step code'),
    name: readCatalogueId(row.name, 'step name'),
  };
}
/** Decodes only the definition projection; definedAt is provenance, not a live scope authority. */
export function readStepDefinition(row: StepDefinitionRecord): StepDefinition {
  const identity = readStepIdentity(row);
  if (!isEstimateUnit(row.defaultEstimateUnit))
    throw new Error('catalogue default estimate unit is malformed');
  return {
    ...identity,
    defaultEstimateUnit: row.defaultEstimateUnit,
    defaultAllowancePercent: readCatalogueAllowance(row.defaultAllowanceBps) / 100,
    position: readPosition(row.position),
    definedAt: {
      scopeKind: readScopeKind(row.definedAtScopeKind),
      scopeId: readCatalogueId(row.definedAtScopeId, 'definition scope'),
    },
    origin: readOrigin(row.origin),
  };
}
export function readStepBinding(row: StepBindingRecord): CatalogueStepBinding {
  const typeId =
    row.workItemTypeId === null ? null : readCatalogueId(row.workItemTypeId, 'binding type');
  return {
    bindingId: readCatalogueId(row.bindingId, 'binding identity'),
    organizationId: readCatalogueId(row.organizationId, 'binding organization'),
    scopeKind: readScopeKind(row.scopeKind),
    scopeId: readCatalogueId(row.scopeId, 'binding scope'),
    stepId: readCatalogueId(row.stepId, 'binding step'),
    workItemTypeId: typeId,
    position: readPosition(row.position),
    origin: readOrigin(row.origin),
  };
}
export function readPackageStepValues(
  row: PackageStepRecord,
  workPackageId: string,
  stepId: string,
): PackageStepValues {
  if (row.workPackageId === null && row.stepId === null)
    throw new WorkPackageStepMissing(workPackageId, stepId);
  if (row.workPackageId !== workPackageId || row.stepId !== stepId)
    throw new Error('catalogue explicit package row is inconsistent');
  if (!isEstimateUnit(row.estimateUnit))
    throw new Error('catalogue package estimate unit is malformed');
  if (
    typeof row.allowanceRevision !== 'number' ||
    !Number.isSafeInteger(row.allowanceRevision) ||
    row.allowanceRevision < 0
  )
    throw new Error('catalogue allowance revision is malformed');
  return {
    estimateUnit: row.estimateUnit,
    allowancePercent: readCatalogueAllowance(row.allowanceBps) / 100,
    allowanceRevision: row.allowanceRevision,
  };
}
export interface RetainedStepDefinition {
  readonly definition: NewStepDefinition;
  readonly defaultAllowanceBps: number;
}

export function retainStepDefinition(definition: NewStepDefinition): RetainedStepDefinition {
  const kept = structuredClone(definition);
  readCatalogueId(kept.id, 'new definition identity');
  readCatalogueId(kept.name, 'new definition name');
  if (typeof kept.code !== 'string' || !isStepCode(kept.code) || isReservedStepCode(kept.code))
    throw new Error('catalogue new step code is malformed or reserved');
  if (!isEstimateUnit(kept.defaultEstimateUnit))
    throw new Error('catalogue new default unit is malformed');
  const defaultAllowanceBps = allowanceHundredthsOf(kept.defaultAllowancePercent);
  if (defaultAllowanceBps === null) throw new Error('catalogue new default allowance is malformed');
  readPosition(kept.position);
  return {
    definition: { ...kept, defaultAllowancePercent: defaultAllowanceBps / 100 },
    defaultAllowanceBps,
  };
}
export function retainStepBinding(binding: NewStepBinding): NewStepBinding {
  const kept = structuredClone(binding);
  readCatalogueId(kept.bindingId, 'new binding identity');
  readCatalogueId(kept.stepId, 'new binding step');
  readScopeKind(kept.scopeKind);
  readCatalogueId(kept.scopeId, 'new binding scope');
  if (kept.workItemTypeId !== null) readCatalogueId(kept.workItemTypeId, 'new binding type');
  readPosition(kept.position);
  return kept;
}
export function retainCatalogueStamp(stamp: WriteStamp): WriteStamp {
  const kept = { ...stamp };
  readCatalogueId(kept.by, 'write author');
  if (!Number.isSafeInteger(kept.at)) throw new Error('catalogue write instant is malformed');
  return kept;
}
/** Joins already-decoded catalogue bindings to retained same-organization identities for both leaf and package resolution. */
export function projectCatalogueBindings(
  organizationId: string,
  bindings: readonly CatalogueStepBinding[],
  identities: ReadonlyMap<string, StepIdentity>,
): readonly StepBinding[] {
  return bindings.map((binding) => {
    const identity = identities.get(binding.stepId);
    if (identity?.organizationId !== organizationId || binding.organizationId !== organizationId)
      throw new Error('catalogue reached binding definition is inconsistent');
    return {
      bindingId: binding.bindingId,
      organizationId: binding.organizationId,
      scopeKind: binding.scopeKind,
      scopeId: binding.scopeId,
      workItemTypeId: binding.workItemTypeId,
      position: binding.position,
      step: { id: identity.id, code: identity.code, name: identity.name },
    };
  });
}

/** Same SC18 grouping/order as leaf resolution, without filtering the any-type package union. */
export function projectPackageSteps(
  chain: WorkPackageChain,
  bindings: readonly CatalogueStepBinding[],
  identities: ReadonlyMap<string, StepIdentity>,
  values: ReadonlyMap<string, PackageStepValues>,
): PackageSteps {
  const captured = projectCatalogueBindings(chain.organizationId, bindings, identities);
  return {
    chain: { ...chain },
    steps: resolvePackageSteps(chain, captured).map((step) => {
      const explicit = values.get(step.stepId);
      if (explicit === undefined)
        throw new WorkPackageStepMissing(chain.workPackageId, step.stepId);
      return { ...step, ...explicit };
    }),
  };
}
/** Retains the complete explicit unbind mode before queueing; IDs, mode and audit have one precise boundary and no authority default. */
export function retainStepUnbind(
  organizationId: string,
  bindingId: string,
  options: StepUnbindOptions,
  stamp: WriteStamp,
) {
  const kept = structuredClone({ organizationId, bindingId, options, stamp });
  readCatalogueId(kept.organizationId, 'unbind organization');
  readCatalogueId(kept.bindingId, 'unbind binding');
  if (typeof kept.options.dryRun !== 'boolean')
    throw new Error('catalogue unbind mode is malformed');
  return { ...kept, stamp: retainCatalogueStamp(kept.stamp) };
}

/** Retains the explicit scope, complete requested census and audit at the public write boundary. */
export function retainStepReorder(
  organizationId: string,
  scope: StepScope,
  ids: readonly string[],
  stamp: WriteStamp,
) {
  const kept = structuredClone({ organizationId, scope, ids, stamp });
  readCatalogueId(kept.organizationId, 'reorder organization');
  readScopeKind(kept.scope.scopeKind);
  readCatalogueId(kept.scope.scopeId, 'reorder scope');
  // Proof: omitting array admission let actual malformed-boundary calls resolve in both adapters; exact restore passed (verification-reorder-lifetime-20261119.json).
  if (!Array.isArray(kept.ids)) throw new Error('catalogue reorder identities are malformed');
  // Proof: omitting this ID boundary let actual malformed-boundary calls resolve in both adapters; exact restore passed (verification-reorder-lifetime-20261119.json).
  for (const id of kept.ids) readCatalogueId(id, 'reorder binding');
  return { ...kept, stamp: retainCatalogueStamp(kept.stamp) };
}

/** Exact own-scope census includes every type; unchanged total order retains its existing positions. */
export function planStepBindingOrder(
  bindings: readonly CatalogueStepBinding[],
  scope: StepScope,
  ids: readonly string[],
):
  | { readonly kind: 'stale_order' }
  | { readonly kind: 'unchanged' }
  | {
      readonly kind: 'changed';
      readonly positions: readonly { readonly bindingId: string; readonly position: number }[];
    } {
  const own = bindings
    .filter((binding) => binding.scopeKind === scope.scopeKind && binding.scopeId === scope.scopeId)
    .sort(
      (left, right) =>
        left.position - right.position ||
        (left.bindingId < right.bindingId ? -1 : left.bindingId > right.bindingId ? 1 : 0),
    );
  const actual = new Set(own.map((binding) => binding.bindingId));
  // Proof: omitting census denial made the mounted project reorder accept[]as204instead of409; exact restore passed (verification-reorder-20261119.json).
  if (
    ids.length !== own.length ||
    new Set(ids).size !== own.length ||
    ids.some((id) => !actual.has(id))
  )
    return { kind: 'stale_order' };
  // Proof: omitting unchanged classification made actual MemorySource empty-scope reorder touch/report a project instead ofno targets; exact restore passed (verification-reorder-20261119.json).
  if (own.every((binding, index) => binding.bindingId === ids[index])) return { kind: 'unchanged' };
  return {
    kind: 'changed',
    positions: ids.map((bindingId, index) => ({ bindingId, position: (index + 1) * 10 })),
  };
}

/** Uses the actual Source/loan expiry callback; no parallel token, authority decision or escaped callback is introduced. */
export function guardStepCatalogue(port: StepCatalogue, assertOpen: () => void): StepCatalogue {
  const guard = (beforeWrite: CatalogueWriteObservation | undefined) => {
    if (beforeWrite === undefined) return undefined;
    const capture = beforeWrite.capture.bind(beforeWrite);
    const assertUpstreamOpen = beforeWrite.assertOpen?.bind(beforeWrite);
    return {
      capture: () => {
        assertOpen();
        return capture();
      },
      assertOpen: () => {
        // Proof: dropping the outer fence let held reorder mutate after the working plan closed.
        assertUpstreamOpen?.();
        assertOpen();
      },
    };
  };
  return {
    // Proof: neutralizing both fences admitted ordinary and repair expired reads in both Sources (catalogue-import-retirement-fault-retirement-loan-v2); combined guard evidence, not individual fences.
    async readRetiredCodes(organizationId) {
      assertOpen();
      const codes = await port.readRetiredCodes(organizationId);
      assertOpen();
      return structuredClone(codes);
    },
    async reorderBindings(organizationId, scope, ids, stamp, beforeWrite) {
      // Proof: REORDER_LOAN_GUARD neutralized both admission calls in this method; actual Memory ordinary/repair expired loans resolved. Exact restore passed; entry/post-await are not individually certified (verification-reorder-lifetime-20261119.json).
      assertOpen();
      const kept = retainStepReorder(organizationId, scope, ids, stamp);
      const written = await port.reorderBindings(
        kept.organizationId,
        kept.scope,
        kept.ids,
        kept.stamp,
        guard(beforeWrite),
      );
      assertOpen();
      return structuredClone(written);
    },
    async patchStepDefinition(organizationId, stepId, patch, stamp, beforeWrite) {
      assertOpen();
      const kept = structuredClone({ organizationId, stepId, patch, stamp });
      const written = await port.patchStepDefinition(
        kept.organizationId,
        kept.stepId,
        kept.patch,
        kept.stamp,
        guard(beforeWrite),
      );
      assertOpen();
      return structuredClone(written);
    },
    async retireStepDefinition(organizationId, stepId, stamp) {
      assertOpen();
      const kept = structuredClone({ organizationId, stepId, stamp });
      const written = await port.retireStepDefinition(kept.organizationId, kept.stepId, kept.stamp);
      assertOpen();
      return structuredClone(written);
    },
    // Proof: disabling both new-method assertions admitted expired ordinary/repair
    // loans in both actual Sources; four owners failed, then exact restore passed.
    // Whole dependency only (verification-project-usage-read-20261119.json).
    async readUsage(organizationId) {
      assertOpen();
      const kept = organizationId;
      const captured = await port.readUsage(kept);
      assertOpen();
      return structuredClone(captured);
    },
    // Proof: omitting both new-method assertions admitted expired ordinary/repair
    // manifest reads in both actual Sources;4owners failed then restored green.
    // Whole dependency only (verification-project-manifest-20261119.json).
    async readManifest(organizationId, projectId) {
      assertOpen();
      const kept = { organizationId, projectId };
      const manifest = await port.readManifest(kept.organizationId, kept.projectId);
      assertOpen();
      return structuredClone(manifest);
    },
    async readCatalogue(organizationId) {
      assertOpen();
      const kept = organizationId;
      const rows = await port.readCatalogue(kept);
      assertOpen();
      return structuredClone(rows);
    },
    async readPackage(organizationId, workPackageId) {
      assertOpen();
      const keptOrganization = organizationId,
        keptPackage = workPackageId;
      const rows = await port.readPackage(keptOrganization, keptPackage);
      assertOpen();
      return structuredClone(rows);
    },
    async defineAndBindStep(organizationId, definition, binding, stamp, beforeWrite) {
      assertOpen();
      const kept = structuredClone({ organizationId, definition, binding, stamp });
      const written = await port.defineAndBindStep(
        kept.organizationId,
        kept.definition,
        kept.binding,
        kept.stamp,
        guard(beforeWrite),
      );
      assertOpen();
      return structuredClone(written);
    },
    async bindStep(organizationId, binding, stamp, beforeWrite) {
      assertOpen();
      const kept = structuredClone({ organizationId, binding, stamp });
      const written = await port.bindStep(
        kept.organizationId,
        kept.binding,
        kept.stamp,
        guard(beforeWrite),
      );
      assertOpen();
      return structuredClone(written);
    },
    async unbindStep(organizationId, bindingId, options, stamp, beforeWrite) {
      assertOpen();
      const kept = structuredClone({ organizationId, bindingId, options, stamp });
      const written = await port.unbindStep(
        kept.organizationId,
        kept.bindingId,
        kept.options,
        kept.stamp,
        guard(beforeWrite),
      );
      assertOpen();
      return structuredClone(written);
    },
  };
}
