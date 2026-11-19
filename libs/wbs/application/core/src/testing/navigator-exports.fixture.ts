import { PlanDocumentService } from '../module/plan-document/plan-document.resource';
import type { PlanDocumentReads } from '../ports/shared-people-values';
import { workPackageConnectedTree } from '../service/connected-tree';
import {
  createConnectedBlockageRead,
  createConnectedBlockageTree,
} from './connected-blockage.fixture';

/** Constructed current serializer fixtures; no store or source authority is modeled. */
export function navigatorExports() {
  const exporter = new PlanDocumentService({
    clock: { now: () => Date.parse('2026-11-11T00:00:00.000Z') },
  });
  const captured = createConnectedBlockageRead('clear');
  const tree = createConnectedBlockageTree('clear');
  Reflect.deleteProperty(tree, 'undoable');
  Reflect.deleteProperty(tree, 'redoable');
  for (const row of tree.workItems) Reflect.deleteProperty(row, 'createdAt');
  for (const step of tree.steps) step.code = 'build';
  const owner = captured.metadataByWorkPackage.get('C');
  if (owner === undefined) throw Error('fixture C metadata absent');
  const workPackage = {
    ...owner.workPackage,
    projectId: 'navigator-constructed-parent',
    timezone: workPackageConnectedTree(captured, 'C').reads.workPackage.timezone,
  };
  const reads: PlanDocumentReads = {
    project: { id: workPackage.projectId, name: 'Constructed fixture parent' },
    stepParallels: [],
    directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
    markers: [],
    resources: { resources: [], capacities: [], demands: [] },
    measures: { definitions: null, facts: [], estimates: [], budgets: [] },
  };
  const ordinary = exporter.exportCaptured(workPackage, tree, reads);
  const connected = exporter.exportConnectedCaptured(workPackage, tree, {
    ...captured,
    workPackageId: 'C',
    document: reads,
  });
  if (!ordinary.ok || !connected.ok) throw Error('current fixture exporter refused');
  return [ordinary.value, connected.value];
}
