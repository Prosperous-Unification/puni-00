import { resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';

export const LAB_PROJECT_ID = 'k3s-rehearsal-project';

/** The lab seed owns a new SQLite file, the explicit catalogue apply, and one legacy Project. */
export const CATALOGUE_LAB_SEED = [
  'bun',
  '--no-env-file',
  '--config=/dev/null',
  '-e',
  `
    import { closeSync, mkdtempSync, openSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import { openDatabase } from '@wbs/store-sqlite/db';
    import { migrateEmptyCatalogueFixture } from '@wbs/store-sqlite/testing/catalogue-database';

    const path = process.env.DB_PATH;
    // Proof: omitting this guard lost the explicit DB_PATH refusal in the generated-seed test.
    if (typeof path !== 'string' || path === '') throw Error('lab seed requires DB_PATH');
    // Proof: omitting this exclusive reservation let the actual seed migrate a pre-existing file.
    closeSync(openSync(path, 'wx', 0o600));
    const directory = mkdtempSync(join(tmpdir(), 'step-catalogue-lab-'));
    migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, { hasUnknownOwner: false });
    const organizationId = 'k3s-rehearsal-organization';
    const projectId = ${JSON.stringify(LAB_PROJECT_ID)};
    const sqlite = openDatabase(path);
    try {
      sqlite.transaction(() => {
        sqlite.run('INSERT INTO organization(id,name,legacy,created_at) VALUES(?,?,1,1)', [
          organizationId, organizationId,
        ]);
        sqlite.run('INSERT INTO project(id,organization_id,name,created_at) VALUES(?,?,?,1)', [
          projectId, organizationId, projectId,
        ]);
      })();
    } finally {
      sqlite.close(true);
    }
  `,
] as const;

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
