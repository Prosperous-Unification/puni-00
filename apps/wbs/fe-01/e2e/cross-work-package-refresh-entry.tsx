import '@/styles.css';

import { createRoot } from 'react-dom/client';

import { WorkPackagePage } from '@/components/wbs/work-package-page';
import { me } from '@/lib/api';
import { httpWorkPackageAddressApi, httpWorkPackageApi } from '@/lib/wbs-api';
import { workPackageSourceOver } from '@/modules/work-package/composition';
import { createWorkPackageCatalog } from '@/modules/work-package/work-package-catalog.feature';
import { acquireApplicationRuntime, applicationSlot } from '@/runtime/application-runtime';
import { ApplicationServicesProvider } from '@/runtime/application-services-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import { createWorkPackageOwner } from '@/runtime/work-package-runtime';
import { NO_SAVED_PLANS } from '@/testing/no-saved-plans';

await applicationSlot.replace(acquireApplicationRuntime);
const session = await me();
if (session.kind !== 'success') throw new Error('Browser fixture session could not be read');
if (session.body.user === null) throw new Error('Browser fixture has no signed-in account');
const owner = createWorkPackageOwner();
const organizationId = new URLSearchParams(window.location.search).get('organization');
const scope =
  organizationId === null
    ? undefined
    : {
        organization: { kind: 'active' as const, organizationId },
        isCurrent: () => true,
        refuse: () => {
          throw new Error('Browser fixture organization refused');
        },
      };
const api = httpWorkPackageApi('', scope);
const source = workPackageSourceOver(
  api,
  httpWorkPackageAddressApi('', scope),
  undefined,
  NO_SAVED_PLANS,
);
const wiring = {
  catalog: createWorkPackageCatalog({ routes: api, isCurrent: () => true }),
  workPackages: {
    subscribe: owner.subscribe,
    snapshot: owner.snapshot,
    open: (workPackageId: string) => owner.open(workPackageId, source),
    leave: owner.leave,
  },
};
let stopPlan: (() => void) | undefined;
// Read-only fixture evidence: this is the same delivered store the production table selects.
owner.subscribe(() => {
  stopPlan?.();
  const selected = owner.snapshot();
  if (selected.status !== 'live') return;
  const record = () => {
    const plan = selected.services.plan.snapshot();
    if (plan.tree !== null) document.body.dataset['installedSeq'] = String(plan.tree.value.seq);
  };
  stopPlan = selected.services.plan.subscribe(record);
  record();
});
const root = document.getElementById('root');
if (root === null) throw new Error('browser fixture root missing');
createRoot(root).render(
  <ApplicationServicesProvider>
    <OrganizationResourcesProvider
      scope={
        scope ?? {
          organization: { kind: 'legacy' },
          isCurrent: () => true,
          refuse: () => {
            throw new Error('Browser fixture organization refused');
          },
        }
      }
    >
      <WorkPackagePage {...wiring} viewerAccountId={session.body.user.id} />
    </OrganizationResourcesProvider>
  </ApplicationServicesProvider>,
);
