import { useMemo, useState } from 'react';

import { WorkPackagePage, type WorkPackagePageProps } from '@/components/wbs/work-package-page';
import type { WorkPackageApi } from '@/lib/wbs-api';
import type { WorkPackageStreamDeps } from '@/lib/work-package-stream';
import type { SavedPlanRoutes } from '@/modules/saved-plans/contract';
import { workPackageSourceOver } from '@/modules/work-package/composition';
import type { WorkPackageCatalog } from '@/modules/work-package/contract';
import { createWorkPackageCatalog } from '@/modules/work-package/work-package-catalog.feature';
import type { SessionWorkPackages } from '@/runtime/session-runtime';
import { createWorkPackageOwner, type WorkPackageOwner } from '@/runtime/work-package-runtime';
import { NO_SAVED_PLANS } from '@/testing/no-saved-plans';
import { createRefusingAddressApi } from '@/testing/refusing-address-api';

/** The account every page suite is signed in as; bind a person to it to claim. */
export const VIEWER_ACCOUNT_ID = 'account-viewer';

/**
 * The catalog and the work package owner a session would hand the page, over one
 * client the suite holds and an owner of the suite's own: the session's wiring
 * without the session, which is never withdrawn here.
 *
 * `streamDeps` is the socket's wiring; left out, the stream is the browser's
 * own, as the page's suites have always drawn it. `savedPlanRoutes` is the
 * saved plans' port; left out, the node has none, so no suite asks jsdom for
 * the OpenAPI document or opens a shelf socket it did not hand in.
 */
export function pageWiring(
  owner: WorkPackageOwner,
  api: WorkPackageApi,
  streamDeps?: WorkPackageStreamDeps,
  savedPlanRoutes: SavedPlanRoutes = NO_SAVED_PLANS,
): { catalog: WorkPackageCatalog; workPackages: SessionWorkPackages; viewerAccountId: string } {
  const source = workPackageSourceOver(
    api,
    createRefusingAddressApi(),
    streamDeps,
    savedPlanRoutes,
  );
  return {
    viewerAccountId: VIEWER_ACCOUNT_ID,
    catalog: createWorkPackageCatalog({ routes: api, isCurrent: () => true }),
    workPackages: {
      subscribe: owner.subscribe,
      snapshot: owner.snapshot,
      open: (workPackageId) => owner.open(workPackageId, source),
      leave: owner.leave,
    },
  };
}

/** The page's own props, with the client and the socket a session would hold instead. */
export type WorkPackagePageOverOwnerProps = Omit<
  WorkPackagePageProps,
  'catalog' | 'workPackages' | 'viewerAccountId'
> & {
  viewerAccountId?: string;
  api: WorkPackageApi;
  streamDeps?: WorkPackageStreamDeps;
  savedPlanRoutes?: SavedPlanRoutes;
};

/**
 * The work package page with a work package owner of its own, the way its suites have
 * always drawn it.
 *
 * In the app the catalog and the owner are the signed-in session's, handed down
 * through router context, and the session's retirement retires the work package
 * first. The page's suites draw the page on its own, so this builds one owner
 * per mount and keeps it across a rerender, and wires it over the client the
 * suite hands in — a new client is a new catalog and a new source, as a new
 * session would be. What the session adds is proved by the session runtime's
 * own suites and by the router's, not here.
 */
export function WorkPackagePageOverOwner({
  api,
  streamDeps,
  savedPlanRoutes,
  ...props
}: WorkPackagePageOverOwnerProps): React.JSX.Element {
  const [owner] = useState(createWorkPackageOwner);
  const wiring = useMemo(
    () => pageWiring(owner, api, streamDeps, savedPlanRoutes),
    [owner, api, streamDeps, savedPlanRoutes],
  );
  return <WorkPackagePage {...wiring} {...props} />;
}
