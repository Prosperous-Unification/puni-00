import { useEffect, useState } from 'react';

import { DirectoryPage, type DirectoryPageProps } from '@/components/directory/directory-page';
import type { DirectoryApi } from '@/lib/wbs-api';
import { createDirectory } from '@/modules/directory/directory.resource';
import { createDirectoryManagement } from '@/modules/directory-management/directory-management.feature';

/** The page's own props, with the client it is drawn over in place of a session's directory. */
export interface DirectoryPageOverClientProps extends Omit<DirectoryPageProps, 'directory'> {
  api: DirectoryApi;
}

/**
 * The directory page over one client, the way its suite has always drawn it.
 *
 * In the app the directory is the signed-in session's, built by the session
 * runtime and handed down through router context. The page's suite draws the
 * page on its own, so this builds one directory per mount over the client it is
 * handed — never withdrawn, because no session owns it — and points it at a
 * replacement client, keeping what it holds, when the suite rerenders with one.
 * What a session adds, withdrawal above all, is proved by the session runtime's
 * own suites, not here.
 */
export function DirectoryPageOverClient({
  api,
  ...page
}: DirectoryPageOverClientProps): React.JSX.Element {
  const [directory] = useState(() => createDirectoryManagement(createDirectory(api, () => true)));
  useEffect(() => {
    directory.replaceClient(api);
  }, [directory, api]);
  return <DirectoryPage directory={directory} {...page} />;
}
