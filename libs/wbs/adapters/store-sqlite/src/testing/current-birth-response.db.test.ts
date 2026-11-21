import {
  assertBirthLoanExpiry,
  assertCurrentBirth,
  assertPendingBirthExpiry,
  assertQueuedBirth,
  BIRTH_ACTOR,
  BIRTH_PROJECT,
  createBirthDraft,
  expectBirthFailure,
  seedCurrentBirth,
  withinBirthFixture,
} from '@wbs/core/testing/current-birth-response';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { expect, test } from 'bun:test';

import { openScopedServiceFixture } from './scoped-service-fixture';

async function withinSeeded(
  exercise: (fixture: ReturnType<typeof openScopedServiceFixture>) => Promise<void>,
): Promise<void> {
  const fixture = openScopedServiceFixture('wbs-current-birth-lifetime-');
  await withinBirthFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentBirth(fixture.source, true);
      await exercise(fixture);
    },
  );
}

for (const hasBindings of [false, true])
  test(
    'current SQLite service birth returns actual catalogue steps (catalogue=' +
      String(hasBindings) +
      ')',
    async () => {
      const fixture = openScopedServiceFixture('wbs-current-birth-response-');
      await withinBirthFixture(
        () => fixture.close(),
        async () => {
          await seedCurrentBirth(fixture.source, hasBindings);
          await assertCurrentBirth(fixture.source, hasBindings);
          expect(
            fixture.source.db.all(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='step'",
            ),
          ).toEqual([]);
        },
      );
    },
  );

test('current SQLite service birth preserves its reply across an actual later catalogue rename', async () => {
  const fixture = openScopedServiceFixture('wbs-current-birth-coherence-');
  await withinBirthFixture(
    () => fixture.close(),
    async () => {
      await seedCurrentBirth(fixture.source, true);
      await assertCurrentBirth(fixture.source, true, true);
    },
  );
});

for (const bound of [false, true])
  for (const settlement of ['commit', 'rollback', 'repair'] as const)
    test(
      'current SQLite birth expires its ' +
        settlement +
        ' loan (' +
        (bound ? 'bound' : 'plain') +
        ')',
      async () => {
        await withinSeeded(async (fixture) => {
          const source = bound
            ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
            : fixture.source;
          await assertBirthLoanExpiry(source, settlement);
        });
      },
    );

for (const bound of [false, true])
  test(
    'current SQLite birth refuses a retained public capability after Source close (' +
      (bound ? 'bound' : 'plain') +
      ')',
    async () => {
      await withinSeeded(async (fixture) => {
        const source = bound
          ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
          : fixture.source;
        const create = source.stores.workPackages.createWithSteps.bind(source.stores.workPackages);
        await source.close();
        await expectBirthFailure(
          () =>
            create(
              createBirthDraft('closed-birth'),
              { at: 100, by: BIRTH_ACTOR },
              { kind: 'legacy' },
            ),
          'closed',
        );
      });
    },
  );

for (const bound of [false, true])
  test(
    'current SQLite birth refuses a pending reply after rollback (' +
      (bound ? 'bound' : 'plain') +
      ')',
    async () => {
      await withinSeeded(async (fixture) => {
        const source = bound
          ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
          : fixture.source;
        await assertPendingBirthExpiry(source);
      });
    },
  );

for (const bound of [false, true])
  test(
    'current SQLite public birth retains complete queued legacy input (' +
      (bound ? 'bound' : 'plain') +
      ')',
    async () => {
      await withinSeeded(async (fixture) => {
        const source = bound
          ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
          : fixture.source;
        await assertQueuedBirth(source, BIRTH_PROJECT, BIRTH_ACTOR, { kind: 'legacy' });
      });
    },
  );
