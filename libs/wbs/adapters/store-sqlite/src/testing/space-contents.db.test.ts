import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

async function expectClosed(operation: () => Promise<unknown>): Promise<void> {
  const answer = await operation().then(
    () => ({ kind: 'answered' }) as const,
    (cause: unknown) => ({ kind: 'failed', cause }) as const,
  );
  expect(answer.kind).toBe('failed');
  if (answer.kind === 'failed') expect(String(answer.cause)).toContain('closed');
}

for (const bound of [false, true]) {
  for (const settlement of ['commit', 'rollback', 'repair'] as const) {
    test(
      'actual SQLite space contents expire the ' + settlement + ' owner ' + String(bound),
      async () => {
        const fixture = await openSqliteStepCatalogueCase(
          'stepCatalogue.unbindStep:estimate-refusal-and-preview',
        );
        try {
          const source = bound
            ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
            : fixture.source;
          let retainedRepair: typeof source.stores.spaces;
          const borrowed = await source.uow.run(async ({ stores }) => {
            if (stores.spaces === undefined) throw new Error('actual SQLite loan lacks spaces');
            const selected = stores.spaces;
            expect(
              await selected.readContents(fixture.seed.organizationId, fixture.seed.spaceId),
            ).toMatchObject({ space: { id: fixture.seed.spaceId } });
            return {
              commit: settlement === 'commit',
              value: selected,
              ...(settlement === 'repair'
                ? {
                    afterRollback: async (repair: { stores: typeof stores }) => {
                      if (repair.stores.spaces === undefined)
                        throw new Error('actual SQLite repair lacks spaces');
                      retainedRepair = repair.stores.spaces;
                      expect(
                        await retainedRepair.readContents(
                          fixture.seed.organizationId,
                          fixture.seed.spaceId,
                        ),
                      ).toMatchObject({ space: { id: fixture.seed.spaceId } });
                    },
                  }
                : {}),
            };
          });
          await expectClosed(() =>
            borrowed.readContents(fixture.seed.organizationId, fixture.seed.spaceId),
          );
          if (settlement === 'repair') {
            const repair = retainedRepair;
            if (repair === undefined) throw new Error('actual SQLite repair did not run');
            await expectClosed(() =>
              repair.readContents(fixture.seed.organizationId, fixture.seed.spaceId),
            );
          }
        } finally {
          await fixture.close();
        }
      },
      60000,
    );
  }
  test(
    'actual SQLite space contents stay committed and expire their loan ' + String(bound),
    async () => {
      const fixture = await openSqliteStepCatalogueCase(
        'stepCatalogue.unbindStep:estimate-refusal-and-preview',
      );
      try {
        const source = bound
          ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
          : fixture.source;
        const spaces = source.stores.spaces;
        if (spaces === undefined) throw new Error('actual SQLite Source lacks spaces');
        const stamp = fixture.seed.stamp;
        fixture.source.db.run(sql`INSERT INTO person(id,name) VALUES('contents-person','Person')`);
        fixture.source.db.run(
          sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES('contents-person',${fixture.seed.organizationId},'Person')`,
        );
        expect(
          await spaces.create(
            {
              id: 'space-contents',
              organizationId: fixture.seed.organizationId,
              name: 'Department',
            },
            stamp,
          ),
        ).toMatchObject({ ok: true });
        const before = await spaces.readContents(fixture.seed.organizationId, 'space-contents');
        expect(before).toMatchObject({
          space: { revision: 0 },
          projects: [],
          personIds: [],
          serviceTeamIds: [],
        });
        const borrowed = await source.uow.run(async ({ stores }) => {
          if (stores.spaces === undefined) throw new Error('actual SQLite loan lacks spaces');
          expect(
            await stores.spaces.addPerson(
              fixture.seed.organizationId,
              'space-contents',
              'contents-person',
              stamp,
            ),
          ).toBe(true);
          expect(
            await stores.spaces.readContents(fixture.seed.organizationId, 'space-contents'),
          ).toMatchObject({ space: { revision: 1 }, personIds: ['contents-person'] });
          expect(await spaces.readContents(fixture.seed.organizationId, 'space-contents')).toEqual(
            before,
          );
          return { commit: false, value: stores.spaces };
        });
        expect(await spaces.readContents(fixture.seed.organizationId, 'space-contents')).toEqual(
          before,
        );
        await expectClosed(() =>
          borrowed.readContents(fixture.seed.organizationId, 'space-contents'),
        );
        const read = spaces.readContents.bind(spaces);
        await source.close();
        await expectClosed(() => read(fixture.seed.organizationId, 'space-contents'));
      } finally {
        await fixture.close();
      }
    },
    60000,
  );
}
