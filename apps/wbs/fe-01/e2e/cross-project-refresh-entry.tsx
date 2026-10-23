import '@/styles.css';

import { createRoot } from 'react-dom/client';

import { ProjectPage } from '@/components/wbs/project-page';
import { httpProjectApi } from '@/lib/wbs-api';
import { acquireApplicationRuntime, applicationSlot } from '@/runtime/application-runtime';
import { ApplicationServicesProvider } from '@/runtime/application-services-context';
import { createProjectOwner } from '@/runtime/project-runtime';
import { pageWiring } from '@/testing/project-page-over-owner';

await applicationSlot.replace(acquireApplicationRuntime);
const owner = createProjectOwner();
const wiring = pageWiring(owner, httpProjectApi(''));
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
    <ProjectPage {...wiring} />
  </ApplicationServicesProvider>,
);
