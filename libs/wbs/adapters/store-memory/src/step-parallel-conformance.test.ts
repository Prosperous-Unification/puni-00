import { stepParallelConformance } from '@wbs/conformance';
import { seedLegacyPackageParent } from '@wbs/core/testing/legacy-package-source-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { afterEach, beforeEach, describe } from 'bun:test';

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
  for (const id of ['p', 'foreign']) {
    await stores.workPackages.create(
      workPackageRow({ id, projectId: 'fixture-project' }),
      [],
      stamp,
    );
  }
  for (const [id, workPackageId, name] of [
    ['dev', 'p', 'Dev'],
    ['qa', 'p', 'QA'],
    ['foreign', 'foreign', 'Foreign'],
  ] as const)
    await stores.steps.add(
      { id, workPackageId, name, allowancePercent: 0, estimateUnit: 'workdays' },
      stamp,
    );
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
