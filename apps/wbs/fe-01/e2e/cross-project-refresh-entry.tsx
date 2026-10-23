import '@/styles.css';

import { createRoot } from 'react-dom/client';

import { ProjectPage } from '@/components/wbs/project-page';
import { httpProjectAddressApi, httpProjectApi } from '@/lib/wbs-api';
import { projectSourceOver } from '@/modules/project/composition';
import { createProjectCatalog } from '@/modules/project/project-catalog.feature';
import { acquireApplicationRuntime, applicationSlot } from '@/runtime/application-runtime';
import { ApplicationServicesProvider } from '@/runtime/application-services-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import { createProjectOwner } from '@/runtime/project-runtime';
import { NO_SAVED_PLANS } from '@/testing/no-saved-plans';

await applicationSlot.replace(acquireApplicationRuntime);
const owner = createProjectOwner();
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
const api = httpProjectApi('', scope);
const source = projectSourceOver(api, httpProjectAddressApi('', scope), undefined, NO_SAVED_PLANS);
const wiring = {
  catalog: createProjectCatalog({ routes: api, isCurrent: () => true }),
  projects: {
    subscribe: owner.subscribe,
    snapshot: owner.snapshot,
    open: (projectId: string) => owner.open(projectId, source),
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
      <ProjectPage {...wiring} />
    </OrganizationResourcesProvider>
  </ApplicationServicesProvider>,
);
