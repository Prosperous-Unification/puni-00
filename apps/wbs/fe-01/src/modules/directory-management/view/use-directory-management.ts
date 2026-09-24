import { useEffect, useSyncExternalStore } from 'react';

import type { DirectoryManagement, DirectorySnapshot } from '../contract';

/**
 * The session's directory as a page shows it: its current snapshot, and the
 * read that fires on arrival.
 *
 * `useSyncExternalStore` and not a `useState` an effect writes: the snapshot is
 * owned outside React, and a getter React compares is the contract for that.
 *
 * **The directory is the session's, not the page's.** It is built once per
 * signed-in user by the session runtime and handed down through router
 * context, so a page that is left and entered again finds what the directory
 * already held and reads again on arrival, rather than starting empty. Nothing
 * here builds, replaces or gives one back.
 */
export function useDirectoryManagement(management: DirectoryManagement): DirectorySnapshot {
  const shown = useSyncExternalStore(management.subscribe, management.snapshot);

  useEffect(() => {
    void management.read().catch(management.reportFailedRead);
  }, [management]);

  return shown;
}
