import { withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { assertCurrentSavedPlan } from '@wbs/core/testing/current-saved-plan';
import { test } from 'bun:test';

import { openSqliteStepCatalogueCase } from './testing/step-catalogue-fixture';

for (const hasDistinctSets of [false, true])
  for (const purpose of ['schedule', 'save'] as const)
    test(
      'current SQLite ' +
        purpose +
        ' retains actual own leaf sets and order ' +
        String(hasDistinctSets),
      async () => {
        const fixture = await openSqliteStepCatalogueCase(
          'stepCatalogue.unbindStep:estimate-refusal-and-preview',
        );
        await withinClaimFixture(
          () => fixture.close(),
          () =>
            assertCurrentSavedPlan(
              fixture.source,
              fixture.seed,
              hasDistinctSets,
              purpose,
              'scoped',
            ),
        );
      },
    );

for (const purpose of ['refuse-missing', 'refuse-parent', 'refuse-foreign'] as const)
  test('current SQLite inventory ' + purpose, async () => {
    const fixture = await openSqliteStepCatalogueCase(
      'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    );
    await withinClaimFixture(
      () => fixture.close(),
      () => assertCurrentSavedPlan(fixture.source, fixture.seed, false, purpose, 'scoped'),
    );
  });
