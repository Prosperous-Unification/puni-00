import { stepParallelConformance } from '@wbs/conformance';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe } from 'bun:test';

import type { SqliteSource } from './source';
import { createScopePackage, openScopedServiceFixture } from './testing/scoped-service-fixture';

let fixture: ReturnType<typeof openScopedServiceFixture> | undefined;
let source: SqliteSource;
const stamp = { at: 1, by: 'u' };
beforeEach(async () => {
  fixture = openScopedServiceFixture('step-parallel-');
  source = fixture.source;
  const { stores } = source;
  await stores.users.create({ id: 'u', username: 'u', passwordHash: 'x', createdAt: 1 }, stamp);
  for (const [id, stepId, name] of [
    ['p', 'dev', 'Dev'],
    ['foreign', 'foreign', 'Foreign'],
  ] as const)
    await createScopePackage(
      source,
      workPackageRow({ id, projectId: 'fixture-project' }),
      {
        id: stepId,
        code: stepId,
        name,
        position: 10,
        defaultAllowancePercent: 0,
        defaultEstimateUnit: 'workdays',
      },
      stamp,
    );
  const qa = await stores.stepCatalogue.defineAndBindStep(
    'fixture-legacy-org',
    {
      id: 'qa',
      code: 'qa',
      name: 'QA',
      position: 20,
      defaultAllowancePercent: 0,
      defaultEstimateUnit: 'workdays',
    },
    {
      bindingId: 'qa:binding',
      scopeKind: 'project',
      scopeId: 'p:project',
      workItemTypeId: null,
      position: 20,
    },
    stamp,
  );
  if (!qa.ok) throw new Error('QA conformance binding refused: ' + qa.reason);
  for (const [id, parentId] of [
    ['a', null],
    ['parent', null],
    ['child', 'parent'],
  ] as const)
    await stores.workItems.insert(workItemRow({ id, parentId, workPackageId: 'p' }), [], stamp);
});
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});
describe('store-sqlite sparse step parallelism', () => {
  stepParallelConformance(() => ({ source, stamp }));
});
