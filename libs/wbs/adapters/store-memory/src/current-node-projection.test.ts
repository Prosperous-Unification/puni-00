import { withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { assertCurrentNodeProjection } from '@wbs/core/testing/current-node-projection';
import { test } from 'bun:test';

import { openMemoryStepCatalogueSourceFixture } from './testing/step-catalogue-fixture';

for (const hasDistinctSets of [false, true])
  for (const isHeld of [false, true])
    for (const purpose of ['readings', 'resources'] as const)
      test(
        'current Memory node ' +
          purpose +
          ' own sets=' +
          String(hasDistinctSets) +
          ' held=' +
          String(isHeld),
        async () => {
          const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
          await withinClaimFixture(
            () => fixture.source.close(),
            () =>
              assertCurrentNodeProjection(fixture.source, seed, hasDistinctSets, isHeld, purpose),
          );
        },
      );
