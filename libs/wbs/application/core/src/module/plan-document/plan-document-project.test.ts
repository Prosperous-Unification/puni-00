import { planDocument, requestSchema, validateSchema, type WorkItemTree } from '@wbs/contracts';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect, test } from 'bun:test';

import { workPackageConnectedTree } from '../../service/connected-tree';
import { testClock } from '../../testing/clock-fixture';
import { createConnectedBlockageRead } from '../../testing/connected-blockage.fixture';
import { presentConnectedTree } from '../work-item/work-item.resource';
import { PlanDocumentService } from './plan-document.resource';

function fixture() {
  const options = { clock: testClock };
  const workPackage = {
    ...workPackageRow({ id: 'exported-package', projectId: 'captured-parent' }),
    timezone: 'UTC',
  };
  const tree: WorkItemTree = {
    workItems: [],
    steps: [],
    typedDependencies: [],
    seq: -1,
    scheduleError: null,
    waitingForPerson: 0,
    waitingForCapacity: 0,
    slices: [],
    assignedPeople: [],
    teamCapacities: [],
    priorityBands: [],
    estimateMethod: workPackage.estimateMethod,
    pertWeights: workPackage.pertWeights,
    estimateRounding: workPackage.estimateRounding,
    depReach: workPackage.depReach,
    startDate: workPackage.startDate,
    workPackageRevision: workPackage.revision,
  };
  const reads = {
    project: { id: 'captured-parent', name: 'Captured parent name' },
    directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
    markers: [],
    stepParallels: [],
    resources: { resources: [], capacities: [], demands: [] },
    measures: { definitions: null, facts: [], estimates: [], budgets: [] },
  };
  return { serializer: new PlanDocumentService(options), workPackage, tree, reads };
}

test('pure current export carries detached parent metadata and explicit ownerless package fields', () => {
  const { serializer, workPackage, tree, reads } = fixture();
  Reflect.set(workPackage, 'ownerId', 'retired-owner');
  Reflect.set(workPackage, 'createdBy', 'audit-creator');
  Reflect.set(workPackage, 'unrelatedStorageColumn', 'private');
  const exported = serializer.exportCaptured(workPackage, tree, reads);
  expect(exported.ok).toBe(true);
  if (!exported.ok) throw new Error('empty current export refused');
  expect(exported.value.project).toEqual(reads.project);
  expect(exported.value.workPackage.projectId).toBe(reads.project.id);
  expect(exported.value.workPackage).not.toHaveProperty('ownerId');
  expect(exported.value.workPackage).not.toHaveProperty('createdBy');
  expect(exported.value.workPackage).not.toHaveProperty('unrelatedStorageColumn');
  expect(planDocument.allows(exported.value)).toBe(true);
  reads.project.name = 'Changed after serialization';
  expect(exported.value.project.name).toBe('Captured parent name');
});

test('pure current export refuses separately supplied package and project identities that disagree', () => {
  const { serializer, workPackage, tree, reads } = fixture();
  reads.project.id = 'another-parent';
  expect(() => serializer.exportCaptured(workPackage, tree, reads)).toThrow(
    'plan export parent mismatch',
  );
});

test('pure serializer requires only its clock and exposes no asynchronous IO exporter', () => {
  const serializer = new PlanDocumentService({ clock: testClock });
  expect('export' in serializer).toBe(false);
  expect('readDocumentReads' in serializer).toBe(false);
});

test.each([15, 16] as const)(
  'constructed metadata-bearing capture exports strict current%i without row audit columns',
  async (version) => {
    const captured = createConnectedBlockageRead('clear');
    const metadata = captured.metadataByWorkPackage.get('C');
    if (metadata === undefined) throw new Error('constructed target metadata missing');
    const projection = workPackageConnectedTree(captured, 'C');
    const shown = presentConnectedTree(projection);
    const workPackage = {
      ...metadata.workPackage,
      timezone: projection.reads.workPackage.timezone,
    };
    const row = shown.workItems.at(0);
    if (row === undefined) throw new Error('constructed target row missing');
    // The constructed capture explicitly supplies this audit field; this is not a SQLite column-selection claim.
    expect(Reflect.get(row, 'createdAt')).toBe(0);
    const tree: WorkItemTree = {
      ...shown,
      steps: shown.steps.map((step) => ({ ...step, code: 'build' })),
      ...(version === 15 ? { typedDependencies: [] } : {}),
    };
    const { reads } = fixture();
    const serializer = new PlanDocumentService({ clock: testClock });
    const exported =
      version === 15
        ? serializer.exportCaptured(workPackage, tree, reads)
        : serializer.exportConnectedCaptured(workPackage, tree, {
            ...captured,
            workPackageId: 'C',
            document: reads,
          });
    if (!exported.ok) throw new Error('constructed coded export refused: ' + exported.error);
    const checked = await validateSchema(
      requestSchema(planDocument),
      JSON.parse(JSON.stringify(exported.value)),
    );
    expect(checked.issues).toBeUndefined();
    expect(exported.value.document.version).toBe(version);
    expect(exported.value.workItems[0]).not.toHaveProperty('createdAt');
    expect(exported.value.workItems[0]).toMatchObject({
      id: row.id,
      name: row.name,
      estimates: row.estimates,
    });
    expect(exported.value.workPackage.projectId).toBe('captured-parent');
    expect(exported.value.project).toEqual(reads.project);
    expect(Reflect.get(row, 'createdAt')).toBe(0);
  },
);
