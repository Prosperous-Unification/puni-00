import { stepParallelConformance } from '@wbs/conformance';
import { seedLegacyPackageParent } from '@wbs/core/testing/legacy-package-source-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { afterEach, beforeEach, describe, expect } from 'bun:test';

import type { openMemorySource } from './source';
import { openMemorySourceFixture } from './source';
import { workPackageRow } from './work-package-fixture';

let source: ReturnType<typeof openMemorySource>;
const stamp = { at: 1, by: 'u' };
beforeEach(async () => {
  const fixture = openMemorySourceFixture();
  source = fixture.source;
  const { stores } = source;
  await stores.users.create({ id: 'u', username: 'u', passwordHash: 'x', createdAt: 1 }, stamp);
  seedLegacyPackageParent(fixture, {
    organizationId: 'fixture-legacy-org',
    projectId: 'fixture-project',
    creator: 'u',
  });
  fixture.seedPackageParent({
    id: 'foreign-project',
    organizationId: 'fixture-legacy-org',
    name: 'Foreign project',
    spaceId: null,
    spacePosition: null,
    revision: 0,
    createdAt: 1,
    createdBy: 'u',
    updatedAt: null,
  });
  for (const id of ['p', 'foreign']) {
    await stores.workPackages.create(
      workPackageRow({ id, projectId: id === 'p' ? 'fixture-project' : 'foreign-project' }),
      [],
      stamp,
    );
  }
  for (const [id, projectId, name, position] of [
    ['dev', 'fixture-project', 'Dev', 10],
    ['qa', 'fixture-project', 'QA', 20],
    ['foreign', 'foreign-project', 'Foreign', 10],
  ] as const) {
    const defined = await stores.stepCatalogue.defineAndBindStep(
      'fixture-legacy-org',
      { id, code: id, name, position, defaultAllowancePercent: 0, defaultEstimateUnit: 'workdays' },
      {
        bindingId: id + ':binding',
        scopeKind: 'project',
        scopeId: projectId,
        workItemTypeId: null,
        position,
      },
      stamp,
    );
    expect(defined.ok).toBe(true);
  }
  for (const [id, parentId] of [
    ['a', null],
    ['parent', null],
    ['child', 'parent'],
  ] as const)
    await stores.workItems.insert(workItemRow({ id, parentId, workPackageId: 'p' }), [], stamp);
});
afterEach(async () => {
  await source.close();
});
describe('store-memory sparse step parallelism', () => {
  stepParallelConformance(() => ({ source, stamp }));
});
