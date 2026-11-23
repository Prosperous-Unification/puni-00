import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertCatalogueImport,
  CATALOGUE_IMPORT_CASES,
  IMPORT_CATALOGUE_ORGANIZATION,
  IMPORT_CATALOGUE_PROJECT,
  IMPORT_CATALOGUE_SIBLING,
  IMPORT_CATALOGUE_STAMP,
} from '@wbs/core/testing/catalogue-import';
import { withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteSource, type SqliteSource } from '../source';
import { migrateEmptyCatalogueFixture } from './catalogue-database';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './dependency-capability';

/** Complete physical snapshot of this fixture's exclusively owned current writer. */
function evidence(source: SqliteSource) {
  const schema = source.db.all<Record<string, unknown>>(
    sql`SELECT * FROM sqlite_master ORDER BY type COLLATE BINARY, name COLLATE BINARY`,
  );
  const names = source.db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name COLLATE BINARY`,
  );
  return {
    schema,
    tables: names.map(({ name }) => ({
      name,
      rows: source.db
        .all<Record<string, unknown>>(sql.raw('SELECT * FROM "' + name.replaceAll('"', '""') + '"'))
        .toSorted((left, right) =>
          Buffer.compare(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right))),
        ),
    })),
  };
}

for (const purpose of CATALOGUE_IMPORT_CASES)
  test(
    'actual SQLite catalogue import ' + purpose,
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'wbs-import-catalogue-'));
      const path = join(directory, 'source.db');
      const custody = { hasUnknownOwner: false };
      migrateEmptyCatalogueFixture({ path, directory, reportedAt: 100 }, custody);
      // Failed acquisition retains the namespace; only an acquired Source's successful close permits removal.
      const source = openSqliteSource({
        dbPath: path,
        dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      });
      await withinClaimFixture(
        async () => {
          await source.close();
          if (custody.hasUnknownOwner)
            throw new Error('Retain import fixture with uncertain migration owner: ' + directory);
          rmSync(directory, { recursive: true });
        },
        async () => {
          const stamp = IMPORT_CATALOGUE_STAMP;
          await source.stores.users.create(
            { id: stamp.by, username: stamp.by, passwordHash: null, createdAt: stamp.at },
            stamp,
          );
          source.db.run(
            sql`INSERT INTO organization(id,name,legacy,created_at) VALUES(${IMPORT_CATALOGUE_ORGANIZATION},${IMPORT_CATALOGUE_ORGANIZATION},1,100)`,
          );
          for (const id of [IMPORT_CATALOGUE_PROJECT, IMPORT_CATALOGUE_SIBLING])
            source.db.run(
              sql`INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES(${id},${IMPORT_CATALOGUE_ORGANIZATION},${id},100,${stamp.by})`,
            );
          expect(source.db.all('PRAGMA foreign_key_check')).toEqual([]);
          await assertCatalogueImport(
            source,
            () => evidence(source),
            purpose,
            async (id, name) => {
              await source.stores.directory.addWorkItemType({ id, name }, stamp);
              expect(
                await source.stores.directory.listInOrganization(
                  'workItemTypes',
                  IMPORT_CATALOGUE_ORGANIZATION,
                ),
              ).toContainEqual({ id, name });
            },
            () => {
              // Raw retained-code boundary control, not an immutable historical producer certificate.
              source.db.run(sql`UPDATE step_definition SET code='s1-impl' WHERE id='global-impl'`);
              expect(source.db.get<{ count: number }>(sql`SELECT changes() AS count`)).toEqual({
                count: 1,
              });
            },
          );
        },
      );
    },
    60000,
  );
