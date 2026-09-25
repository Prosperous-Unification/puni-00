import { DiBag } from 'di-bag';

import type { DirectoryApi } from '@/lib/wbs-api';
import type { DirectoryResource } from '@/modules/directory/contract';
import { createDirectory } from '@/modules/directory/directory.resource';

import { DIRECTORY_MANAGEMENT_LABEL, type DirectoryManagement } from './contract';
import { createDirectoryManagement } from './directory-management.feature';

/**
 * Directory management as a sealed DI Bag module: the one export delivery is
 * allowed to see, over a directory resource no host can name.
 *
 * `directory` stays private, so rule K2 holds by construction: resolving it
 * from a host answers `DI_BAG_UNKNOWN_SERVICE_KEY`, and the page reaches the
 * snapshot, the reads and the writes only through {@link DirectoryManagement}.
 * Its two host requirements are named in `DirectoryManagementRequirements`; a
 * host that forgets one is told which module asked, under
 * {@link DIRECTORY_MANAGEMENT_LABEL}.
 *
 * Nothing here is disposable. The directory holds no socket and no timer; what
 * makes it safe to leave behind is its host's `isActiveReader`, which withdraws
 * it — nothing sent, nothing shown — the instant its session is.
 */
export const directoryManagementModule = DiBag.createBuilder()
  .withServices({
    directory: DiBag.createProvider(
      ({
        directoryApi,
        isActiveReader,
      }: {
        directoryApi: DirectoryApi;
        isActiveReader: () => boolean;
      }): DirectoryResource => createDirectory(directoryApi, isActiveReader),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    directoryManagement: DiBag.createProvider(
      ({ directory }: { directory: DirectoryResource }): DirectoryManagement =>
        createDirectoryManagement(directory),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof: on 2026-09-24, building the module without its label (l1) failed `names itself when a
  // host omits the client`: the message was `DI_BAG_MISSING_DEPENDENCY: Cannot res…`, naming no
  // module. Exporting `directory` beside the feature (l2) failed `keeps its directory resource out
  // of a host graph`: `expected [Function] to throw an error`, the resource resolved from the host.
  .buildModule({
    exportedServiceKeys: ['directoryManagement'],
    moduleLabel: DIRECTORY_MANAGEMENT_LABEL,
  });
