import type { TransactionalStores } from '@wbs/core';
import type { TypedDependencyStore } from '@wbs/core/ports/typed-dependency-store';

type PromiseStore<Store> = {
  [Key in keyof Store]: (...args: never[]) => Promise<unknown>;
};

/**
 * Public repository admission is checked at method invocation, even on retained
 * methods. The underlying call starts synchronously with its original receiver,
 * so its own pre-await stamp capture and exact returned Promise are preserved.
 * Optional absent methods remain absent; assertion and synchronous call failures
 * become rejected Promises under the declared asynchronous store protocol.
 */
function guardStore<Store extends object & PromiseStore<Store>>(
  store: Store,
  assertOpen: () => void,
): Store {
  return new Proxy(store, {
    get(target, key) {
      const operation: unknown = Reflect.get(target, key, target);
      if (typeof operation !== 'function') return operation;
      return (...args: unknown[]): unknown => {
        try {
          // Proof: omitting admission makes the held-writer plain/bound public users tests resolve after close.
          assertOpen();
          return Reflect.apply(operation, target, args);
        } catch (cause: unknown) {
          return Promise.reject(cause);
        }
      };
    },
  });
}

/** The incidents property is a declared nested port, not an arbitrary object traversal. */
function guardTypedDependencies(
  store: TypedDependencyStore,
  assertOpen: () => void,
): TypedDependencyStore {
  const methods = guardStore<Omit<TypedDependencyStore, 'incidents'>>(store, assertOpen);
  const incidents = guardStore(store.incidents, assertOpen);
  return new Proxy(store, {
    get(_target, key) {
      return key === 'incidents' ? incidents : Reflect.get(methods, key, methods);
    },
  });
}

/**
 * Fences only the actual public TransactionalStores graph, in plain and bound
 * Source composition. Optional own-property presence is preserved, including an
 * explicitly undefined port. Borrowed scope graphs retain their existing lifetimes.
 * The public synchronous writer-authority refusal is deliberately unchanged;
 * it is not a Promise-store protocol. History and adapter-owned db are separate
 * capabilities and are not recursively interpreted by this boundary.
 */
export function guardPublicStores(
  stores: TransactionalStores,
  assertOpen: () => void,
): TransactionalStores {
  return {
    settings: guardStore(stores.settings, assertOpen),
    externalDependencyAuthoring: stores.externalDependencyAuthoring,
    ...(Object.hasOwn(stores, 'livePlans') ? { livePlans: stores.livePlans === undefined ? undefined : guardStore(stores.livePlans, assertOpen) } : {}),
    workPackages: guardStore(stores.workPackages, assertOpen),
    ...(Object.hasOwn(stores, 'spaces') ? { spaces: stores.spaces === undefined ? undefined : guardStore(stores.spaces, assertOpen) } : {}),
    ...(Object.hasOwn(stores, 'workPackageRanks') ? { workPackageRanks: stores.workPackageRanks === undefined ? undefined : guardStore(stores.workPackageRanks, assertOpen) } : {}),
    directory: guardStore(stores.directory, assertOpen),
    ...(Object.hasOwn(stores, 'accessDecisions') ? { accessDecisions: stores.accessDecisions === undefined ? undefined : guardStore(stores.accessDecisions, assertOpen) } : {}),
    ...(Object.hasOwn(stores, 'organizationLimits') ? { organizationLimits: stores.organizationLimits === undefined ? undefined : guardStore(stores.organizationLimits, assertOpen) } : {}),
    capacity: guardStore(stores.capacity, assertOpen),
    resourceCapacity: guardStore(stores.resourceCapacity, assertOpen),
    priorityBands: guardStore(stores.priorityBands, assertOpen),
    calendarMarkers: guardStore(stores.calendarMarkers, assertOpen),
    eventLog: guardStore(stores.eventLog, assertOpen),
    planEvents: guardStore(stores.planEvents, assertOpen),
    stepCatalogue: guardStore(stores.stepCatalogue, assertOpen),
    steps: guardStore(stores.steps, assertOpen),
    workItems: guardStore(stores.workItems, assertOpen),
    estimates: guardStore(stores.estimates, assertOpen),
    actuals: guardStore(stores.actuals, assertOpen),
    measures: guardStore(stores.measures, assertOpen),
    measureEstimates: guardStore(stores.measureEstimates, assertOpen),
    budgets: guardStore(stores.budgets, assertOpen),
    progress: guardStore(stores.progress, assertOpen),
    blockages: guardStore(stores.blockages, assertOpen),
    stepParallels: guardStore(stores.stepParallels, assertOpen),
    attempts: guardStore(stores.attempts, assertOpen),
    claims: guardStore(stores.claims, assertOpen),
    runtimeCommands: guardStore(stores.runtimeCommands, assertOpen),
    demands: guardStore(stores.demands, assertOpen),
    dependencies: guardStore(stores.dependencies, assertOpen),
    typedDependencies: guardTypedDependencies(stores.typedDependencies, assertOpen),
    subtrees: guardStore(stores.subtrees, assertOpen),
    journal: guardStore(stores.journal, assertOpen),
    users: guardStore(stores.users, assertOpen),
  };
}
