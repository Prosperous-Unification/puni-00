import { withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { assertCurrentStatus, CURRENT_STATUS_CASES } from '@wbs/core/testing/current-status';
import { test } from 'bun:test';

import { openSqliteStepCatalogueCase } from './testing/step-catalogue-fixture';

for (const hasDistinctSets of [false, true])
  for (const purpose of CURRENT_STATUS_CASES)
    test(
      'current SQLite status ' + purpose + ' own steps distinct=' + String(hasDistinctSets),
      async () => {
        const fixture = await openSqliteStepCatalogueCase(
          'stepCatalogue.unbindStep:estimate-refusal-and-preview',
        );
        await withinClaimFixture(
          () => fixture.close(),
          () =>
            assertCurrentStatus(
              fixture.source,
              fixture.seed,
              {
                kind: 'scoped',
                scope: {
                  organizationId: fixture.seed.organizationId,
                  userId: fixture.seed.stamp.by,
                  cap: null,
                },
                principal: { id: fixture.seed.stamp.by },
              },
              hasDistinctSets,
              purpose,
            ),
        );
      },
    );
