import {
  resolveSteps,
  type StepBinding,
  type StepTypeState,
  type WorkPackageChain,
} from '@wbs/domain';

import type { EstimateStore, ValueGroupPlacement } from '../../ports/estimate-store';
import type { StepWriteOutcome } from '../../ports/estimate-store';
import { WorkPackageStepMissing } from '../../ports/step-store';
import type { PackageStepValues, StepIdentity } from './step-catalogue';
import { readCatalogueId } from './step-catalogue';
import { compareStepUsageIds, type StepUsageTypeRecord } from './step-usage-capture';

/** Current noninherited memberships from the actual writer; missing/foreign headers never become untyped. */
export function readStepWriteType(
  organizationId: string,
  workItemId: string,
  memberships: readonly StepUsageTypeRecord[],
): StepTypeState {
  const types = new Set<string>();
  for (const membership of memberships) {
    const typeId = readCatalogueId(membership.typeId, 'work item type');
    if (
      membership.workItemId !== workItemId ||
      membership.actualTypeId !== typeId ||
      membership.organizationId !== organizationId ||
      membership.actualOrganizationId !== organizationId
    )
      throw new Error('step write work item type ownership is inconsistent');
    if (types.has(typeId)) throw new Error('step write duplicate type membership');
    types.add(typeId);
  }
  if (types.size === 0) return { kind: 'untyped' };
  const typeIds = [...types].sort(compareStepUsageIds);
  const typeId = typeIds.at(0);
  if (typeId === undefined) throw new Error('step write selected type is absent');
  return types.size === 1 ? { kind: 'typed', typeId } : { kind: 'conflict', typeIds };
}

export type StepWriteDecision =
  | { readonly kind: Exclude<StepWriteOutcome, 'written'> }
  | {
      readonly kind: 'resolved';
      readonly step: ReturnType<typeof resolveSteps>[number];
      readonly values: PackageStepValues;
    };

/**
 * Resolves one addressed leaf on its retained writer snapshot. Foreign/absent identity is opaque;
 * direct type conflict and an owned unresolved step are modeled refusals. A selected step must
 * have explicit package values; defaults and archived values never confer applicability.
 */
export function decideStepWrite(
  chain: WorkPackageChain,
  typeState: StepTypeState,
  stepId: string,
  identity: StepIdentity | null,
  bindings: readonly StepBinding[],
  values: ReadonlyMap<string, PackageStepValues>,
): StepWriteDecision {
  if (identity?.organizationId !== chain.organizationId) return { kind: 'unknown_step' };
  if (identity.id !== stepId) throw new Error('step write addressed identity is inconsistent');
  const resolved = resolveSteps(chain, typeState, bindings);
  if (typeState.kind === 'conflict') return { kind: 'type_conflict' };
  const step = resolved.find((candidate) => candidate.stepId === stepId);
  if (step === undefined) return { kind: 'step_not_resolved' };
  const explicit = values.get(stepId);
  // Proof: S01 omitted this whole missing-values refusal; the actual SQLite blockage
  // missing-pair owner resolved instead of rejecting. Selected baseline/after passed1 each.
  if (explicit === undefined) throw new WorkPackageStepMissing(chain.workPackageId, stepId);
  return { kind: 'resolved', step, values: structuredClone(explicit) };
}

/** Binds only the required target read to the Source's existing public/borrowed/repair lifetime. Existing write coordinator semantics are delegated unchanged.
 * Proof: L_CORE removes both checks; actual borrowed-after-COMMIT owners in both stores resolve instead of rejecting. This does not prove the checks independently.
 */
export function guardEstimateTarget(store: EstimateStore, assertOpen: () => void): EstimateStore {
  return {
    async readTarget(workItemId, stepId) {
      assertOpen();
      const target = await store.readTarget(workItemId, stepId);
      assertOpen();
      return target;
    },
    listByWorkPackage: (workPackageId) => store.listByWorkPackage(workPackageId),
    listByWorkItems: (workPackageId, ids) => store.listByWorkItems(workPackageId, ids),
    listPlacements: (workPackageId, ids) => store.listPlacements(workPackageId, ids),
    set: (value, stamp) => store.set(value, stamp),
    remove: (workItemId, stepId, stamp) => store.remove(workItemId, stepId, stamp),
    moveAll: (fromWorkItemId, toWorkItemId, stamp) =>
      store.moveAll(fromWorkItemId, toWorkItemId, stamp),
  };
}

/** Ownership is supplied only by Source composition; this references its existing lifetime, not caller permission or a new token. */
export type StepFactReadLifetime =
  | { readonly kind: 'public'; readonly assertOpen: () => void }
  | { readonly kind: 'borrowed'; readonly assertOpen: () => void };

/**
 * Fences full/targeted/placement reads with the actual Source or loan assertion.
 * Public calls refuse new acquisition after close; an already owned public
 * snapshot may finish. Borrowed/repair calls also recheck their retained owner
 * after suspension. Target preflight keeps its existing stricter guard unchanged.
 */
export function guardEstimateReads(store: EstimateStore, lifetime: StepFactReadLifetime): EstimateStore {
  const { kind, assertOpen } = lifetime;
  const read = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    assertOpen();
    const observed = await operation();
    if (kind === 'borrowed') assertOpen();
    return observed;
  };
  return {
    ...guardEstimateTarget(store, assertOpen),
    listByWorkPackage: (workPackageId) => read(() => store.listByWorkPackage(workPackageId)),
    listByWorkItems: (workPackageId, ids) => read(() => store.listByWorkItems(workPackageId, ids)),
    listPlacements: (workPackageId, ids) => read(() => store.listPlacements(workPackageId, ids)),
  };
}

interface StepFactReads {
  listByWorkPackage(workPackageId: string): Promise<readonly { readonly workItemId: string; readonly stepId: string }[]>;
  listByWorkItems(workPackageId: string, ids: readonly string[]): Promise<readonly { readonly workItemId: string; readonly stepId: string }[]>;
  listPlacements(workPackageId: string, ids: readonly string[]): Promise<readonly ValueGroupPlacement[]>;
}

/**
 * Shares Source ownership across point-fact queries while preserving each store's
 * precise values and native write methods. Public snapshots acquired before close
 * may finish; an admitted loan must still be open after every suspension.
 */
export function guardStepFactReads<Store extends StepFactReads>(store: Store, lifetime: StepFactReadLifetime): Store {
  const { kind, assertOpen } = lifetime;
  const read = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    assertOpen();
    const observed = await operation();
    if (kind === 'borrowed') assertOpen();
    return observed;
  };
  return new Proxy(store, {
    get(target, key, receiver) {
      switch (key) {
        case 'listByWorkPackage': return (workPackageId: string) => read(() => target.listByWorkPackage(workPackageId));
        case 'listByWorkItems': return (workPackageId: string, ids: readonly string[]) => {
          const retained = [...ids];
          return read(() => target.listByWorkItems(workPackageId, retained));
        };
        case 'listPlacements': return (workPackageId: string, ids: readonly string[]) => {
          const retained = [...ids];
          return read(() => target.listPlacements(workPackageId, retained));
        };
      }
      const member: unknown = Reflect.get(target, key, receiver);
      return typeof member === 'function' ? (...args: unknown[]): unknown => Reflect.apply(member, target, args) : member;
    },
  });
}
