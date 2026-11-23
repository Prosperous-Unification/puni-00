import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { importServiceSourceContract } from '@wbs/core/testing/import-service-source-contract';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';

import { openSqliteSource } from './source';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { seedLegacyPackageParent, seedPackageParent } from './testing/legacy-package-parent';
import { activateTestStepBlockages } from './testing/step-blockage-activation';

importServiceSourceContract(
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'wbs-plan-import-'));
    const path = join(directory, 'source.db');
    const custody = { hasUnknownOwner: false };
    let closeSource: (() => Promise<void>) | undefined;
    try {
      migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, custody);
      activateTestStepBlockages(path);
      seedLegacyPackageParent(path, 'fixture-legacy-org', 'fixture-project');
      seedPackageParent(path, 'fixture-legacy-org', 'holding-project');
      let opened: ReturnType<typeof openSqliteSource>;
      try {
        opened = openSqliteSource({
          dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
          dbPath: path,
        });
      } catch (cause: unknown) {
        custody.hasUnknownOwner = true;
        throw cause;
      }
      closeSource = opened.close.bind(opened);
      const source = opened.bindLivePlans({ schedulerOf: () => fastScheduler });
      await source.stores.users.create(
        { id: 'import-owner', username: 'import-owner', passwordHash: 'x', createdAt: 1 },
        { at: 1, by: 'import-owner' },
      );
      return {
        ...source,
        async close() {
          try {
            await source.close();
          } catch (cause: unknown) {
            custody.hasUnknownOwner = true;
            throw cause;
          }
          rmSync(directory, { recursive: true });
        },
      };
    } catch (primary: unknown) {
      if (closeSource !== undefined) {
        try {
          await closeSource();
        } catch (cleanup: unknown) {
          throw new AggregateError(
            [primary, cleanup],
            'import fixture setup and Source close failed; retained ' + directory,
            { cause: cleanup },
          );
        }
      }
      if (!custody.hasUnknownOwner) {
        try {
          rmSync(directory, { recursive: true });
        } catch (cleanup: unknown) {
          throw new AggregateError(
            [primary, cleanup],
            'import fixture setup and directory removal failed',
            { cause: cleanup },
          );
        }
      }
      throw primary;
    }
  },
  'fixture-project',
  (source) => source.planExports,
  'holding-project',
);
