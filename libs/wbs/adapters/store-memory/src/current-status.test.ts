import { withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { assertCurrentStatus, CURRENT_STATUS_CASES } from '@wbs/core/testing/current-status';
import { test } from 'bun:test';

import { openMemoryStepCatalogueSourceFixture } from './testing/step-catalogue-fixture';

for (const hasDistinctSets of [false, true])
  for (const purpose of CURRENT_STATUS_CASES)
    test(
      'current Memory status ' + purpose + ' own steps distinct=' + String(hasDistinctSets),
      async () => {
        const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
        await withinClaimFixture(
          () => fixture.source.close(),
          () =>
            assertCurrentStatus(fixture.source, seed, { kind: 'legacy' }, hasDistinctSets, purpose),
        );
      },
    );
