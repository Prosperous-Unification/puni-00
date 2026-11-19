import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { stepParallelConformance } from '@wbs/conformance';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, beforeEach, describe } from 'bun:test';

import { runMigrations } from './migrate';
import { openSqliteSource } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { seedLegacyPackageParent } from './testing/legacy-package-parent';

let directory: string;
let source: ReturnType<typeof openSqliteSource>;
const stamp = { at: 1, by: 'u' };
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'step-parallel-'));
  const path = join(directory, 'plan.db');
  runMigrations(path, new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname);
  seedLegacyPackageParent(path, 'fixture-legacy-org', 'fixture-project');
  source = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
  });
  const { stores } = source;
  await stores.users.create({ id: 'u', username: 'u', passwordHash: 'x', createdAt: 1 }, stamp);
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
  rmSync(directory, { recursive: true, force: true });
});
describe('store-sqlite sparse step parallelism', () => {
  stepParallelConformance(() => ({ source, stamp }));
});
