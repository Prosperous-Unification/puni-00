import { withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { assertCurrentNodeProjection } from '@wbs/core/testing/current-node-projection';
import { test } from 'bun:test';

import { openSqliteStepCatalogueCase } from './testing/step-catalogue-fixture';

for (const hasDistinctSets of [false, true])
  for (const isHeld of [false, true])
    for (const purpose of ['readings', 'resources'] as const)
      test(
        'current SQLite node ' +
          purpose +
          ' own sets=' +
          String(hasDistinctSets) +
          ' held=' +
          String(isHeld),
        async () => {
          const fixture = await openSqliteStepCatalogueCase(
            'stepCatalogue.unbindStep:estimate-refusal-and-preview',
          );
          await withinClaimFixture(
            () => fixture.close(),
            () =>
              assertCurrentNodeProjection(
                fixture.source,
                fixture.seed,
                hasDistinctSets,
                isHeld,
                purpose,
              ),
          );
        },
      );
