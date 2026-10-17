import { stepParallelConformance } from '@wbs/conformance';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { afterEach, beforeEach, describe } from 'bun:test';

import { projectRow } from './project-fixture';
import { openMemorySource } from './source';

let source: ReturnType<typeof openMemorySource>;
const stamp = { at: 1, by: 'u' };
beforeEach(async () => {
  source = openMemorySource();
  const { stores } = source;
  await stores.users.create({ id: 'u', username: 'u', passwordHash: 'x', createdAt: 1 }, stamp);
  for (const id of ['p', 'foreign']) {
    await stores.projects.create(projectRow({ id, ownerId: 'u' }), [], stamp);
  }
  for (const [id, projectId, name] of [
    ['dev', 'p', 'Dev'],
    ['qa', 'p', 'QA'],
    ['foreign', 'foreign', 'Foreign'],
  ] as const)
    await stores.steps.add(
      { id, projectId, name, allowancePercent: 0, estimateUnit: 'workdays' },
      stamp,
    );
  for (const [id, parentId] of [
    ['a', null],
    ['parent', null],
    ['child', 'parent'],
  ] as const)
    await stores.workItems.insert(workItemRow({ id, parentId, projectId: 'p' }), [], stamp);
});
afterEach(async () => {
  await source.close();
});
describe('store-memory sparse step parallelism', () => {
  stepParallelConformance(() => ({ source, stamp }));
});
