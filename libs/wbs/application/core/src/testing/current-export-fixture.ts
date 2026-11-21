import type { PlanDocument, WorkItemTree } from '@wbs/contracts';

import { PlanDocumentService } from '../module/plan-document/plan-document.resource';
import { presentConnectedTree } from '../module/work-item/work-item.resource';
import type { PlanDocumentReads } from '../ports/shared-people-values';
import { workPackageConnectedTree } from '../service/connected-tree';
import { createConnectedBlockageRead } from './connected-blockage.fixture';

/** Actual current serializer over constructed detached evidence; no stored capture or historical header is retagged. */
export function currentExportFixture(version: 15 | 16): PlanDocument {
  const captured = createConnectedBlockageRead('clear');
  const metadata = captured.metadataByWorkPackage.get('C');
  if (metadata === undefined) throw new Error('constructed current target metadata is absent');
  const projection = workPackageConnectedTree(captured, 'C');
  const workPackage = { ...metadata.workPackage, timezone: projection.reads.workPackage.timezone };
  const presented = presentConnectedTree(projection);
  const tree: WorkItemTree = {
    ...presented,
    steps: presented.steps.map((step) => ({ ...step, code: 'build' })),
    ...(version === 15 ? { typedDependencies: [] } : {}),
  };
  const document: PlanDocumentReads = {
    project: { id: workPackage.projectId, name: 'Captured engagement parent' },
    directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
    markers: [],
    stepParallels: [],
    resources: { resources: [], capacities: [], demands: [] },
    measures: { definitions: null, facts: [], estimates: [], budgets: [] },
  };
  const serializer = new PlanDocumentService({
    clock: { now: () => Date.parse('2026-11-13T11:00:00.000Z') },
  });
  const exported =
    version === 15
      ? serializer.exportCaptured(workPackage, tree, document)
      : serializer.exportConnectedCaptured(workPackage, tree, {
          ...captured,
          workPackageId: workPackage.id,
          document,
        });
  if (!exported.ok) throw new Error('constructed current evidence refused: ' + exported.error);
  if (exported.value.document.version !== version)
    throw new Error('current producer version disagrees');
  return exported.value;
}
