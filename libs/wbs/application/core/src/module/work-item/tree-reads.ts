import type { WorkItemStepProjection, WorkItemStore } from '../../ports/work-item-store';
import type { StepFactReadLifetime } from '../step-catalogue/step-write';

/** Tree observations borrow Source admission; only a loan rechecks authority after return. */
export function guardTreeReads(
  store: WorkItemStore,
  lifetime: StepFactReadLifetime,
): WorkItemStore {
  return new Proxy(store, {
    get(target, key) {
      if (key === 'resolveStepOrders')
        return async (workPackageId: string, projection: WorkItemStepProjection) => {
          // Proof: omitting entry admission let the retained public Memory method answer after Source close.
          lifetime.assertOpen();
          const retained = structuredClone(projection);
          const orders = await target.resolveStepOrders(workPackageId, retained);
          // Proof: omitting return admission released actual captured orders after the controlled borrowed boundary expired.
          if (lifetime.kind === 'borrowed') lifetime.assertOpen();
          return orders;
        };
      if (key === 'listTreeByWorkPackage')
        return async (workPackageId: string) => {
          // Proof: omitting entry admission let the retained Memory tree method answer after Source close.
          lifetime.assertOpen();
          const rows = await target.listTreeByWorkPackage(workPackageId);
          // Proof: omitting return admission released actual captured rows after the controlled borrowed boundary expired.
          if (lifetime.kind === 'borrowed') lifetime.assertOpen();
          return rows;
        };
      const operation: unknown = Reflect.get(target, key, target);
      return typeof operation === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(operation, target, args)
        : operation;
    },
  });
}
