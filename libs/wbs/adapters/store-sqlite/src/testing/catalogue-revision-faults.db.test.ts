import { rejects } from 'node:assert';

import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type Fixture = Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
async function withinFixture(use: (fixture: Fixture) => Promise<void>) {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
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
        'negative revision observation and close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}

/** Persists one corrupt counter, then restores native checks before the real writer runs. */
function corruptRevision(fixture: Fixture, target: 'package' | 'project') {
  const { source, seed } = fixture;
  const table = sql.raw(target === 'package' ? 'work_package' : 'project');
  const id = target === 'package' ? seed.siblingWorkPackageId : seed.siblingProjectId;
  const rows = source.db.all<{ revision: unknown }>(
    sql`SELECT revision FROM ${table} WHERE id=${id}`,
  );
  const revision = rows.at(0)?.revision;
  if (
    rows.length !== 1 ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  )
    throw Error('healthy actual revision specimen absent');
  expect(source.db.all(sql`PRAGMA ignore_check_constraints`)).toEqual([
    { ignore_check_constraints: 0 },
  ]);
  source.db.run(sql`PRAGMA ignore_check_constraints=ON`);
  try {
    source.db.run(sql`UPDATE ${table} SET revision=-1 WHERE id=${id}`);
  } finally {
    source.db.run(sql`PRAGMA ignore_check_constraints=OFF`);
  }
  expect(source.db.all(sql`PRAGMA ignore_check_constraints`)).toEqual([
    { ignore_check_constraints: 0 },
  ]);
  expect(source.db.all(sql`SELECT revision FROM ${table} WHERE id=${id}`)).toEqual([
    { revision: -1 },
  ]);
  return () => source.db.run(sql`UPDATE ${table} SET revision=${revision} WHERE id=${id}`);
}

for (const target of ['package', 'project'] as const) {
  test(
    'catalogue revision fault sqlite negative-' + target,
    async () =>
      withinFixture(async (fixture) => {
        const { seed, port } = fixture;
        const define = (id: string) =>
          port.defineAndBindStep(
            seed.organizationId,
            {
              id,
              code: id,
              name: id,
              defaultEstimateUnit: 'workdays',
              defaultAllowancePercent: 0,
              position: 10,
            },
            {
              bindingId: id + ':binding',
              scopeKind: 'organization',
              scopeId: seed.organizationId,
              workItemTypeId: null,
              position: 10,
            },
            seed.stamp,
          );
        expect(await define('revision-negative-healthy')).toMatchObject({ ok: true });
        const restore = corruptRevision(fixture, target);
        const before = fixture.readEvidence();
        await rejects(define('revision-negative-retry'), (cause: unknown) => {
          expect(() => {
            throw cause;
          }).toThrow('catalogue affected ' + target + ' revision is absent or malformed');
          return true;
        });
        expect(fixture.readEvidence()).toEqual(before);
        restore();
        expect(await define('revision-negative-retry')).toMatchObject({ ok: true });
      }),
    30000,
  );
}

for (const operation of ['map', 'remove'] as const) {
  test(
    'catalogue revision fault sqlite negative-project-type-' + operation,
    async () =>
      withinFixture(async (fixture) => {
        const { source, seed } = fixture;
        const typeId = 'revision-negative-type';
        expect(
          await source.stores.directory.addWorkItemType({ id: typeId, name: typeId }, seed.stamp),
        ).toEqual({ id: typeId, name: typeId });
        if (operation === 'remove')
          await source.stores.directory.mapInOrganization(
            'workItemTypes',
            typeId,
            seed.organizationId,
            typeId,
            seed.stamp,
          );
        const restore = corruptRevision(fixture, 'project');
        const before = fixture.readEvidence();
        await source.uow.run(async ({ stores }) => {
          const write = () =>
            operation === 'map'
              ? stores.directory.mapInOrganization(
                  'workItemTypes',
                  typeId,
                  seed.organizationId,
                  typeId,
                  seed.stamp,
                )
              : stores.directory.removeWorkItemType(typeId, false, seed.stamp);
          await rejects(write(), (cause: unknown) => {
            expect(() => {
              throw cause;
            }).toThrow('catalogue affected project revision is absent or malformed');
            return true;
          });
          expect(
            await stores.directory.addTag(
              { id: 'revision-negative-tag', name: 'Unrelated committed' },
              seed.stamp,
            ),
          ).toEqual({ id: 'revision-negative-tag', name: 'Unrelated committed' });
          return { commit: true, value: undefined };
        });
        expect(
          (await source.stores.directory.listTags()).some(
            (tag) => tag.id === 'revision-negative-tag',
          ),
        ).toBe(true);
        expect(
          await source.stores.directory.removeTag('revision-negative-tag', false, seed.stamp),
        ).toMatchObject({ ok: true });
        expect(fixture.readEvidence()).toEqual(before);
        restore();
        if (operation === 'map')
          await source.stores.directory.mapInOrganization(
            'workItemTypes',
            typeId,
            seed.organizationId,
            typeId,
            seed.stamp,
          );
        else
          expect(
            await source.stores.directory.removeWorkItemType(typeId, false, seed.stamp),
          ).toMatchObject({ ok: true });
      }),
    30000,
  );
}
