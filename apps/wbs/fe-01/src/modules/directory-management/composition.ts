import { type DirectoryApi, httpDirectoryApi } from '@/lib/wbs-api';
import { createDirectory } from '@/modules/directory/directory.resource';

import type { DirectoryManagement } from './contract';
import { createDirectoryManagement } from './directory-management.feature';

/**
 * The one place that sees both modules and the client at once.
 *
 * A composition site, which the design lets see everything because it installs
 * and supplies and holds no logic. It is here rather than in the view because
 * rule K2 says delivery imports a feature-service and nothing beneath it. The
 * application, session and project lifetimes of the rollout's last Task 6 row
 * take this over; until then it is two lines.
 */
export function directoryManagementOver(api: DirectoryApi): DirectoryManagement {
  return createDirectoryManagement(createDirectory(api));
}

/** The same over the real client for one token. */
export function directoryManagementFor(token: string): DirectoryManagement {
  return directoryManagementOver(httpDirectoryApi(token));
}
