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
 * from a host answers `DI_BAG_MISSING_REGISTRATION`, and the page reaches the
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
  .register({
    directory: DiBag.fromSyncFactory(
      ({
        directoryApi,
        isActiveReader,
      }: {
        directoryApi: DirectoryApi;
        isActiveReader: () => boolean;
      }): DirectoryResource => createDirectory(directoryApi, isActiveReader),
    ),
  })
  .register({
    directoryManagement: DiBag.fromSyncFactory(
      ({ directory }: { directory: DirectoryResource }): DirectoryManagement =>
        createDirectoryManagement(directory),
    ),
  })
  .buildModule(['directoryManagement'], { label: DIRECTORY_MANAGEMENT_LABEL });
