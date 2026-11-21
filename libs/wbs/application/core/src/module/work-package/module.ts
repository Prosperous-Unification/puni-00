import { DiBag } from 'di-bag';

import type { Clock } from '../../ports/clock';
import type { OptimizerAvailability } from '../../ports/scheduler';
import type { Broadcaster } from '../../ports/work-package-event';
import { WORK_PACKAGE_LABEL } from './contract';
import { WorkPackageService, type WorkPackageServiceOptions } from './work-package.resource';

/**
 * Work package as a sealed DI Bag module.
 *
 * Only `workPackages` is exported. `workPackageOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
 * reported against `application.work-package/workPackageOptions` rather than against
 * an anonymous binding. The store is required as `workPackageStore` because the
 * host graph's `workPackages` key is this module's export. `optimizerAvailable`
 * is registered even when absent, as `undefined`, the way Saved plans
 * registers its optional quota: the resource then refuses to switch an
 * optimizer on, as it always has.
 *
 * The module registers no disposer: `WorkPackageService` holds the borrowed store
 * of one scope, a clock, a broadcaster, a predicate and a dependency graph guard, and no handle of its
 * own.
 */
export const workPackageModule = DiBag.createBuilder()
  .withServices({
    workPackageOptions: DiBag.createProvider(
      ({
        workPackageStore,
        accessDecisions,
        clock,
        broadcast,
        optimizerAvailable,
        dependencyContext,
        beforeUpdate,
      }: {
        workPackageStore: WorkPackageServiceOptions['workPackages'];
        accessDecisions: WorkPackageServiceOptions['accessDecisions'];
        clock: Clock;
        broadcast: Broadcaster;
        optimizerAvailable: OptimizerAvailability | undefined;
        dependencyContext: WorkPackageServiceOptions['dependencyContext'];
        beforeUpdate: WorkPackageServiceOptions['beforeUpdate'];
      }): WorkPackageServiceOptions => ({
        workPackages: workPackageStore,
        accessDecisions,
        clock,
        broadcast,
        // Proof (2026-09-24): leaving `optimizerAvailable` out of the returned options left
        // `switches the optimizer on through the availability installWorkPackage wires` failing
        // (4 pass, 1 fail): the update answered `optimizer_unavailable`.
        optimizerAvailable,
        dependencyContext,
        beforeUpdate,
      }),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    workPackages: DiBag.createProvider(
      ({
        workPackageOptions,
      }: {
        workPackageOptions: WorkPackageServiceOptions;
      }): WorkPackageService => new WorkPackageService(workPackageOptions),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof (2026-09-24): widening the key tuple to `['workPackages', 'workPackageOptions']` left the
  // private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
  // `resolve('workPackageOptions')` did not throw, `inspectGraph()` reported bare `workPackageOptions`,
  // and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-24): dropping `{ label: WORK_PACKAGE_LABEL }` left only the two label assertions
  // failing (3 pass, 2 fail): `inspectGraph()` reported `workPackageOptions` unlabelled, and the
  // missing-requirement message named `workPackageOptions` instead of
  // `application.work-package/workPackageOptions`.
  .buildModule({ exportedServiceKeys: ['workPackages'], moduleLabel: WORK_PACKAGE_LABEL });
