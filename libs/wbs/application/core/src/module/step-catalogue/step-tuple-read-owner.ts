import type { MeasureEstimateStore } from '../../ports/measure-estimate-store';
import type { MeasureStore } from '../../ports/measure-store';
import type { StepNodeAttemptStore } from '../../ports/step-node-attempt-store';
import type { StepFactReadLifetime } from './step-write';
import { guardStepFactReads } from './step-write';

async function observeRead<Value>(
  lifetime: StepFactReadLifetime,
  observe: () => Promise<Value>,
): Promise<Value> {
  lifetime.assertOpen();
  const observed = await observe();
  if (lifetime.kind === 'borrowed') lifetime.assertOpen();
  return observed;
}

/** The existing Source/loan owner fences the trio reader; every native writer keeps its original receiver and gate. */
export function guardMeasureEstimateReads<Store extends MeasureEstimateStore>(
  store: Store,
  lifetime: StepFactReadLifetime,
): Store {
  return new Proxy(store, {
    get(target, key, receiver) {
      if (key === 'listByWorkPackage')
        return (workPackageId: string) =>
          observeRead(lifetime, () => target.listByWorkPackage(workPackageId));
      const member: unknown = Reflect.get(target, key, receiver);
      return typeof member === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
        : member;
    },
  });
}

/** Public snapshots may finish after acquisition; retained borrowed/repair attempt and counter reads cannot revive after expiry. */
export function guardAttemptReads<Store extends StepNodeAttemptStore>(
  store: Store,
  lifetime: StepFactReadLifetime,
): Store {
  return new Proxy(store, {
    get(target, key, receiver) {
      switch (key) {
        case 'listByWorkPackage':
          return (workPackageId: string) =>
            observeRead(lifetime, () => target.listByWorkPackage(workPackageId));
        case 'listByWorkItems':
          return (workPackageId: string, ids: readonly string[]) => {
            const retained = [...ids];
            return observeRead(lifetime, () => target.listByWorkItems(workPackageId, retained));
          };
        case 'listOfWorkItem':
          return (workItemId: string) =>
            observeRead(lifetime, () => target.listOfWorkItem(workItemId));
        case 'listIssued':
          return (workPackageId: string, ids: readonly string[]) => {
            const retained = [...ids];
            return observeRead(lifetime, () => target.listIssued(workPackageId, retained));
          };
      }
      const member: unknown = Reflect.get(target, key, receiver);
      return typeof member === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
        : member;
    },
  });
}

/** Measures' definition read shares the same existing owner as their full/targeted/placement observations. */
export function guardMeasureReads<Store extends MeasureStore>(
  store: Store,
  lifetime: StepFactReadLifetime,
): Store {
  const guarded = guardStepFactReads(store, lifetime);
  return new Proxy(guarded, {
    get(target, key, receiver) {
      if (key === 'definitionsFor')
        return (workPackageId: string) =>
          observeRead(lifetime, () => store.definitionsFor(workPackageId));
      const member: unknown = Reflect.get(target, key, receiver);
      return typeof member === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
        : member;
    },
  });
}

interface SparseStepReads {
  listByWorkPackage(
    workPackageId: string,
  ): Promise<readonly { readonly workItemId: string; readonly stepId: string }[]>;
  listByWorkItems(
    workPackageId: string,
    ids: readonly string[],
  ): Promise<readonly { readonly workItemId: string; readonly stepId: string }[]>;
}

/**
 * Sparse values retain the exact Source/loan assertion. Public calls fence new
 * acquisition (even empty selection); an acquired public snapshot may finish.
 * Borrowed/repair reads also fence return after suspension, so a fresh loan cannot
 * revive an old reader. Every native write method keeps its actual receiver/gate.
 */
export function guardSparseStepReads<Store extends SparseStepReads>(
  store: Store,
  lifetime: StepFactReadLifetime,
): Store {
  const { kind, assertOpen } = lifetime;
  // Proof: S06 bypassed this whole wrapper; the actual expired ordinary SQLite
  // blockage loan resolved. Baseline/after passed1 each; entry and return checks
  // were omitted together, so neither check is proved independently.
  const read = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    assertOpen();
    const observed = await operation();
    if (kind === 'borrowed') assertOpen();
    return observed;
  };
  return new Proxy(store, {
    get(target, key, receiver) {
      switch (key) {
        case 'listByWorkPackage':
          return (workPackageId: string) => read(() => target.listByWorkPackage(workPackageId));
        case 'listByWorkItems':
          return (workPackageId: string, ids: readonly string[]) => {
            const retained = [...ids];
            return read(() => target.listByWorkItems(workPackageId, retained));
          };
      }
      const member: unknown = Reflect.get(target, key, receiver);
      return typeof member === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
        : member;
    },
  });
}
