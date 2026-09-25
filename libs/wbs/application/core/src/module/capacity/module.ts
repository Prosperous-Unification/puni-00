import { DiBag } from 'di-bag';

import type { CapacityStore } from '../../ports/capacity-store';
import type { Clock } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';
import { CapacityService, type CapacityServiceOptions } from './capacity.resource';
import { CAPACITY_LABEL } from './contract';

/**
 * Capacity as a sealed DI Bag module.
 *
 * Only `capacity` is exported. `capacityOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
 * reported against `application.capacity/capacityOptions` rather than against
 * an anonymous binding. The two stores are required as `projectStore` and
 * `capacityStore` because the host graph's `capacity` key is this module's
 * export.
 *
 * The module registers no disposer: `CapacityService` holds the borrowed
 * stores of one scope, a clock and a broadcaster, and no handle of its own.
 */
export const capacityModule = DiBag.createBuilder()
  .withServices({
    capacityOptions: DiBag.createProvider(
      ({
        projectStore,
        capacityStore,
        broadcast,
        clock,
      }: {
        projectStore: ProjectStore;
        capacityStore: CapacityStore;
        broadcast: Broadcaster;
        clock: Clock;
      }): CapacityServiceOptions => ({
        projects: projectStore,
        capacity: capacityStore,
        // Proof (2026-09-24): handing the resource
        // `{ ...broadcast, publish: () => Promise.resolve() }` instead of the supplied
        // broadcaster left `announces a capacity write through the broadcaster installCapacity wires`
        // failing (4 pass, 1 fail): it received `[]`.
        broadcast,
        clock,
      }),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    capacity: DiBag.createProvider(
      ({ capacityOptions }: { capacityOptions: CapacityServiceOptions }): CapacityService =>
        new CapacityService(capacityOptions),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof (2026-09-24): widening the key tuple to `['capacity', 'capacityOptions']` left the
  // private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
  // `resolve('capacityOptions')` did not throw, `inspectGraph()` reported bare `capacityOptions`,
  // and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-24): dropping `{ label: CAPACITY_LABEL }` left only the two label assertions
  // failing (3 pass, 2 fail): `inspectGraph()` reported `capacityOptions` unlabelled, and the
  // missing-requirement message named `capacityOptions` instead of
  // `application.capacity/capacityOptions`.
  .buildModule({ exportedServiceKeys: ['capacity'], moduleLabel: CAPACITY_LABEL });
