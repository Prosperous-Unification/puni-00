import { useEffect, useState } from 'react';

import { SavedPlansPanel } from '@/components/wbs/saved-plans-panel';
import type { SavedPlanRoutes } from '@/modules/saved-plans/contract';
import { openSavedPlans } from '@/modules/saved-plans/saved-plans.feature';

/**
 * The panel over saved plans opened for this mount alone, the way its suites
 * have always drawn it: in the app they are the work package runtime's, opened when
 * the work package is and given back when it is left. Closed when this unmounts.
 */
export function SavedPlansPanelOver({
  workPackageId,
  routes,
}: {
  workPackageId: string;
  routes: SavedPlanRoutes;
}): React.JSX.Element {
  const [opened] = useState(() => openSavedPlans({ workPackageId, routes, isCurrent: () => true }));
  useEffect(
    () => () => {
      opened.close();
    },
    [opened],
  );
  return <SavedPlansPanel workPackageId={workPackageId} savedPlans={opened.savedPlans} />;
}
