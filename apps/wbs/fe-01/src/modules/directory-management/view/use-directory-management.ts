import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { type DirectoryApi, httpDirectoryApi } from '@/lib/wbs-api';

import { directoryManagementOver } from '../composition';
import type { DirectoryManagement, DirectorySnapshot } from '../contract';

/**
 * One directory for the life of a mount, its current snapshot, and the read that
 * fires on arrival and again whenever the client is replaced.
 *
 * `useSyncExternalStore` and not a `useState` an effect writes: the snapshot is
 * owned outside React, and a getter React compares is the contract for that.
 *
 * **Built once per mount, on purpose.** The page has always kept its
 * vocabularies in component state and its generation counter in a ref, so
 * replacing the injected client changed which client the next call used and
 * cleared nothing on screen. `useState` with a lazy initialiser reproduces that;
 * a `useMemo` keyed on the client would hand back an empty directory for the
 * length of the replacement's first read. The effect below installs the new
 * client and re-reads, which is what the page's own "Arrival." effect did when
 * its `read` callback changed identity.
 *
 * The client is `api` where one is handed in and the real one otherwise — the
 * page's bargain since the directory page shipped, kept here so tests go on
 * injecting a fake through the page's `api` prop.
 */
export function useDirectoryManagement(
  token: string,
  api?: DirectoryApi,
): { management: DirectoryManagement; shown: DirectorySnapshot } {
  const client = useMemo(() => api ?? httpDirectoryApi(token), [api, token]);
  const [management] = useState(() => directoryManagementOver(client));
  const shown = useSyncExternalStore(management.subscribe, management.snapshot);

  useEffect(() => {
    management.replaceClient(client);
    void management.read().catch(management.reportFailedRead);
  }, [management, client]);

  return { management, shown };
}
