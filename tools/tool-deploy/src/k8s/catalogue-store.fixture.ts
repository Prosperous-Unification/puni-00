import { resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';

/** Prepares a current scratch store in the backend subprocess that owns the migration code. */
export function migrateCatalogueStore(path: string): void {
  const setup = `
    import { migrateEmptyCatalogueFixture } from '@wbs/store-sqlite/testing/catalogue-database';
    const [, path, directory] = process.argv;
    migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, { hasUnknownOwner: false });
  `;
  const child = Bun.spawnSync(
    [process.execPath, '-e', setup, path, scratchSync('k8s-catalogue-migrations-')],
    {
      cwd: resolve(import.meta.dir, '../../../../apps/wbs/be-01'),
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
}
