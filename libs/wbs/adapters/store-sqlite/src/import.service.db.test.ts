import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { seedLegacyPackageParent } from './testing/legacy-package-parent';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { importServiceSourceContract } from '@wbs/core/testing/import-service-source-contract';

import { runMigrations } from './migrate';
import { openSqliteSource } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { activateTestStepBlockages } from './testing/step-blockage-activation';

const MIGRATIONS = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;

importServiceSourceContract(
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wbs-plan-import-'));
    const path = join(dir, 'source.db');
    runMigrations(path, MIGRATIONS);
    activateTestStepBlockages(path);
    seedLegacyPackageParent(path, 'fixture-legacy-org', 'fixture-project');
    const source = openSqliteSource({
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
    }).bindLivePlans({ schedulerOf: () => fastScheduler });
    await source.stores.users.create(
      { id: 'import-owner', username: 'import-owner', passwordHash: 'x', createdAt: 1 },
      { at: 1, by: 'import-owner' },
    );
    const close = source.close.bind(source);
    return {
      ...source,
      async close() {
        await close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  },
  'fixture-project',
  (source) => source.planExports,
);
