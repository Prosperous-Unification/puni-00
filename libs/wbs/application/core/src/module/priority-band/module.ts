import { DiBag } from 'di-bag';

import type { Clock } from '../../ports/clock';
import type { PriorityBandStore } from '../../ports/priority-band-store';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';
import { PRIORITY_BAND_LABEL } from './contract';
import { PriorityBandService, type PriorityBandServiceOptions } from './priority-band.resource';

/**
 * Priority band as a sealed DI Bag module.
 *
 * Only `priorityBands` is exported. `priorityBandOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
 * reported against `application.priority-band/priorityBandOptions` rather than
 * against an anonymous binding. The two stores are required as `projectStore`
 * and `priorityBandStore`, the naming every resource module here shares so
 * that no host key can collide with a module's export.
 *
 * The module registers no disposer: `PriorityBandService` holds the borrowed
 * stores of one scope, a clock and a broadcaster, and no handle of its own.
 */
export const priorityBandModule = DiBag.createBuilder()
  .withServices({
    priorityBandOptions: DiBag.createProvider(
      ({
        projectStore,
        priorityBandStore,
        broadcast,
        clock,
      }: {
        projectStore: ProjectStore;
        priorityBandStore: PriorityBandStore;
        broadcast: Broadcaster;
        clock: Clock;
      }): PriorityBandServiceOptions => ({
        projects: projectStore,
        bands: priorityBandStore,
        // Proof (2026-09-24): handing the resource
        // `{ ...broadcast, publish: () => Promise.resolve() }` instead of the supplied
        // broadcaster left `announces a ladder write through the broadcaster installPriorityBand wires`
        // failing (4 pass, 1 fail): it received `[]`.
        broadcast,
        clock,
      }),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    priorityBands: DiBag.createProvider(
      ({
        priorityBandOptions,
      }: {
        priorityBandOptions: PriorityBandServiceOptions;
      }): PriorityBandService => new PriorityBandService(priorityBandOptions),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof (2026-09-24): widening the key tuple to `['priorityBands', 'priorityBandOptions']`
  // left the private-binding, graph-label and missing-requirement assertions failing (2 pass,
  // 3 fail): `resolve('priorityBandOptions')` did not throw, `inspectGraph()` reported bare
  // `priorityBandOptions`, and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-24): dropping `{ label: PRIORITY_BAND_LABEL }` left only the two label
  // assertions failing (3 pass, 2 fail): `inspectGraph()` reported `priorityBandOptions`
  // unlabelled, and the missing-requirement message named `priorityBandOptions` instead of
  // `application.priority-band/priorityBandOptions`.
  .buildModule({ exportedServiceKeys: ['priorityBands'], moduleLabel: PRIORITY_BAND_LABEL });
