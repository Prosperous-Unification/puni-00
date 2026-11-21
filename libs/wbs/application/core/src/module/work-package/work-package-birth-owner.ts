import type { WorkPackageStore } from '../../ports/work-package-store';

/**
 * Binds current birth to its actual ordinary/repair Source loan. Birth stores retain
 * inputs before queueing. The SQLite writer body runs synchronously once admitted;
 * the reply rechecks its loan after suspension. Other methods retain their receiver.
 */
export function guardWorkPackageBirth<Store extends Pick<WorkPackageStore, 'createWithSteps'>>(
  store: Store,
  assertOpen: () => void,
): Store {
  return new Proxy(store, {
    get(target, key) {
      if (key === 'createWithSteps')
        return async (...args: Parameters<WorkPackageStore['createWithSteps']>) => {
          // Proof: loan-entry omits this call; six actual SQLite expiry owners
          // expose a committed package at their physical absence oracle.
          assertOpen();
          const born = await target.createWithSteps(...args);
          // Proof: loan-return omits this call; both actual SQLite pending-reply
          // owners answer after rollback instead of rejecting their expired loan.
          assertOpen();
          return born;
        };
      const operation: unknown = Reflect.get(target, key, target);
      return typeof operation === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(operation, target, args)
        : operation;
    },
  });
}
