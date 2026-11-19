import {
  CATALOGUE_MANIFEST_READ_CASES,
  runCatalogueManifestReadCase,
} from '@wbs/conformance/stores/catalogue-manifest-read';
import { sql } from 'drizzle-orm';
import { expect, test } from 'bun:test';
import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

const openFixture = () =>
  openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    undefined,
    'manifest-read-empty',
  );
for (const selected of CATALOGUE_MANIFEST_READ_CASES) {
  test(
    'catalogue manifest sqlite ' + selected,
    async () => {
      await runCatalogueManifestReadCase(await openFixture(), selected);
    },
    30000,
  );
}
type Fixture = Awaited<ReturnType<typeof openFixture>>;
async function withinFixture(use: (fixture: Fixture) => Promise<void>) {
  const fixture = await openFixture();
  let primary: { cause: unknown } | undefined;
  try {
    await use(fixture);
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await fixture.close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'manifest fault owner and close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}

for (const [label, revision] of [
  ['text', 'bad'],
  ['fractional', 1.5],
  ['unsafe', 9007199254740992],
  ['negative', -1],
] as const) {
  test(
    'catalogue manifest sqlite stored-revision-' + label,
    async () =>
      withinFixture(async (fixture) => {
        const { source, port, seed } = fixture;
        expect(
          (await port.readManifest(seed.organizationId, seed.projectId))?.project.id,
        ).toBe(seed.projectId);
        expect(source.db.all(sql`PRAGMA ignore_check_constraints`)).toEqual([
          { ignore_check_constraints: 0 },
        ]);
        if (label === 'negative') source.db.run(sql`PRAGMA ignore_check_constraints=ON`);
        try {
          source.db.run(
            sql`UPDATE project SET revision=${revision} WHERE id=${seed.projectId}`,
          );
        } finally {
          if (label === 'negative') source.db.run(sql`PRAGMA ignore_check_constraints=OFF`);
        }
        expect(source.db.all(sql`PRAGMA ignore_check_constraints`)).toEqual([
          { ignore_check_constraints: 0 },
        ]);
        const before = source.db.all(sql`SELECT id,revision FROM project ORDER BY id`);
        expect(before).toContainEqual({ id: seed.projectId, revision });
        await expect(port.readManifest(seed.organizationId, seed.projectId)).rejects.toThrow(
          /manifest project revision/,
        );
        expect(source.db.all(sql`SELECT id,revision FROM project ORDER BY id`)).toEqual(
          before,
        );
      }),
    30000,
  );
}
test(
  'catalogue manifest sqlite foreign-malformed-revision',
  async () =>
    withinFixture(async (fixture) => {
      const { source, port, seed } = fixture;
      const own = await port.readManifest(seed.organizationId, seed.projectId);
      expect(own?.project.id).toBe(seed.projectId);
      source.db.run(sql`UPDATE project SET revision='bad' WHERE id=${seed.foreignProjectId}`);
      expect(await port.readManifest(seed.organizationId, seed.foreignProjectId)).toBeNull();
      expect(await port.readManifest(seed.organizationId, seed.projectId)).toEqual(own);
      await expect(
        port.readManifest(seed.foreignOrganizationId, seed.foreignProjectId),
      ).rejects.toThrow(/manifest project revision/);
    }),
  30000,
);
test(
  'catalogue manifest sqlite missing-owned-type-header',
  async () =>
    withinFixture(async (fixture) => {
      const { source, port, seed } = fixture;
      expect((await port.readManifest(seed.organizationId, seed.projectId))?.project.id).toBe(
        seed.projectId,
      );
      expect(source.db.all(sql`PRAGMA foreign_keys`)).toEqual([{ foreign_keys: 1 }]);
      source.db.run(sql`PRAGMA foreign_keys=OFF`);
      try {
        source.db.run(
          sql`INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES('manifest-missing-header',${seed.organizationId},'Missing header')`,
        );
      } finally {
        source.db.run(sql`PRAGMA foreign_keys=ON`);
      }
      expect(source.db.all(sql`PRAGMA foreign_keys`)).toEqual([{ foreign_keys: 1 }]);
      expect(
        source.db
          .all<{ table: string }>(sql`PRAGMA foreign_key_check`)
          .some((row) => row.table === 'work_item_type_organization'),
      ).toBe(true);
      await expect(port.readManifest(seed.organizationId, seed.projectId)).rejects.toThrow(
        /owned type header/,
      );
    }),
  30000,
);
