import { DiBag } from 'di-bag';

import type { Clock } from '../../ports/clock';
import type { DirectoryStore } from '../../ports/directory-store';
import type { Broadcaster } from '../../ports/project-event';
import { DIRECTORY_LABEL } from './contract';
import { DirectoryService, type DirectoryServiceOptions } from './directory.resource';

/**
 * Directory as a sealed DI Bag module.
 *
 * Only `directory` is exported. `directoryOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
 * reported against `application.directory/directoryOptions` rather than
 * against an anonymous binding. The store is required as `directoryStore`
 * because the host graph's `directory` key is this module's export.
 *
 * The module registers no disposer: `DirectoryService` holds the borrowed
 * store of one scope, a clock and a broadcaster, and no handle of its own.
 */
export const directoryModule = DiBag.createBuilder()
  .withServices({
    directoryOptions: DiBag.createProvider(
      ({
        directoryStore,
        broadcast,
        clock,
      }: {
        directoryStore: DirectoryStore;
        broadcast: Broadcaster;
        clock: Clock;
        // Proof (2026-09-24): handing the resource `{ ...clock, newId: () => 'unsupplied' }`
        // instead of the supplied clock left `names a new team with the clock installDirectory
        // wires` failing (4 pass, 1 fail): the team's id read "unsupplied".
      }): DirectoryServiceOptions => ({ directory: directoryStore, broadcast, clock }),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    directory: DiBag.createProvider(
      ({ directoryOptions }: { directoryOptions: DirectoryServiceOptions }): DirectoryService =>
        new DirectoryService(directoryOptions),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof (2026-09-24): widening the key tuple to `['directory', 'directoryOptions']` left the
  // private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
  // `resolve('directoryOptions')` did not throw, `inspectGraph()` reported bare `directoryOptions`,
  // and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-24): dropping `{ label: DIRECTORY_LABEL }` left only the two label assertions
  // failing (3 pass, 2 fail): `inspectGraph()` reported `directoryOptions` unlabelled, and the
  // missing-requirement message named `directoryOptions` instead of
  // `application.directory/directoryOptions`.
  .buildModule({ exportedServiceKeys: ['directory'], moduleLabel: DIRECTORY_LABEL });
