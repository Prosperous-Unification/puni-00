import { withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { assertCurrentSavedPlan } from '@wbs/core/testing/current-saved-plan';
import { test } from 'bun:test';

import { openMemoryStepCatalogueSourceFixture } from './testing/step-catalogue-fixture';

for (const hasDistinctSets of [false, true])
  for (const purpose of ['schedule', 'save'] as const)
    test(
      'current Memory ' +
        purpose +
        ' retains actual own leaf sets and order ' +
        String(hasDistinctSets),
      async () => {
        const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
        await withinClaimFixture(
          () => fixture.source.close(),
          () => assertCurrentSavedPlan(fixture.source, seed, hasDistinctSets, purpose, 'legacy'),
        );
      },
    );

for (const purpose of ['refuse-missing', 'refuse-parent', 'refuse-foreign'] as const)
  test('current Memory inventory ' + purpose, async () => {
    const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
    await withinClaimFixture(
      () => fixture.source.close(),
      () => assertCurrentSavedPlan(fixture.source, seed, false, purpose, 'legacy'),
    );
  });
