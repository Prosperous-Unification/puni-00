import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import {
  assertSpaceDirectoryLabels,
  assertSpaceDirectoryRefusal,
  assertSpaceDirectoryRemoval,
  removeSpaceDirectory,
  seedSpaceDirectory,
} from '@wbs/core/testing/space-directory';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

test('actual SQLite team deletion clears primary and secondary work-item labels', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  try {
    const own = async (kind: 'person' | 'team', id: string) => {
      await fixture.source.stores.directory.mapInOrganization(
        kind === 'person' ? 'people' : 'teams',
        id,
        fixture.seed.organizationId,
        id,
        fixture.seed.stamp,
      );
    };
    await seedSpaceDirectory(fixture.source, fixture.seed, own);
    await assertSpaceDirectoryLabels(fixture.source, fixture.seed, own);
  } finally {
    await fixture.close();
  }
}, 60000);

for (const bound of [false, true])
  for (const kind of ['person', 'team'] as const)
    for (const cascade of [false, true])
      for (const settlement of ['public', 'commit', 'rollback'] as const) {
        test(
          'actual SQLite directory deletion updates space memberships ' +
            [bound, kind, cascade, settlement].join(' '),
          async () => {
            const fixture = await openSqliteStepCatalogueCase(
              'stepCatalogue.unbindStep:estimate-refusal-and-preview',
            );
            try {
              const source = bound
                ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
                : fixture.source;
              await seedSpaceDirectory(source, fixture.seed, async (selected, id) => {
                await source.stores.directory.mapInOrganization(
                  selected === 'person' ? 'people' : 'teams',
                  id,
                  fixture.seed.organizationId,
                  id,
                  fixture.seed.stamp,
                );
              });
              await assertSpaceDirectoryRemoval(source, fixture.seed, kind, cascade, settlement);
            } finally {
              await fixture.close();
            }
          },
          60000,
        );
      }

for (const kind of ['person', 'team'] as const) {
  test(
    'actual SQLite directory deletion rolls back when a surviving space revision is ignored ' +
      kind,
    async () => {
      const fixture = await openSqliteStepCatalogueCase(
        'stepCatalogue.unbindStep:estimate-refusal-and-preview',
      );
      try {
        await seedSpaceDirectory(fixture.source, fixture.seed, async (selected, id) => {
          await fixture.source.stores.directory.mapInOrganization(
            selected === 'person' ? 'people' : 'teams',
            id,
            fixture.seed.organizationId,
            id,
            fixture.seed.stamp,
          );
        });
        const before = fixture.readEvidence();
        fixture.source.db.run(
          sql`CREATE TRIGGER ignore_directory_space_revision BEFORE UPDATE ON space WHEN OLD.id='space-second' BEGIN SELECT RAISE(IGNORE); END`,
        );
        const answer = await removeSpaceDirectory(
          fixture.source.stores,
          fixture.seed,
          kind,
          true,
        ).then(
          () => ({ kind: 'answered' }) as const,
          (cause: unknown) => ({ kind: 'failed', cause }) as const,
        );
        expect(answer.kind).toBe('failed');
        fixture.source.db.run(sql`DROP TRIGGER ignore_directory_space_revision`);
        expect(fixture.readEvidence()).toEqual(before);
      } finally {
        await fixture.close();
      }
    },
    60000,
  );
}

test('actual SQLite team refusal preserves its space memberships until cascade consent', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  try {
    await seedSpaceDirectory(fixture.source, fixture.seed, async (kind, id) => {
      await fixture.source.stores.directory.mapInOrganization(
        kind === 'person' ? 'people' : 'teams',
        id,
        fixture.seed.organizationId,
        id,
        fixture.seed.stamp,
      );
    });
    await assertSpaceDirectoryRefusal(fixture.source, fixture.seed);
  } finally {
    await fixture.close();
  }
}, 60000);
