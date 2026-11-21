import { CLAIM_PERSON, withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { assertCurrentExecution } from '@wbs/core/testing/current-execution';
import { test } from 'bun:test';

import { openMemoryStepCatalogueSourceFixture } from './testing/step-catalogue-fixture';
for (const hasDistinctSets of [false, true])
  for (const purpose of ['startable', 'claim', 'person', 'claim-conflict'] as const)
    test(
      'current Memory ' + purpose + ' uses own execution ' + String(hasDistinctSets),
      async () => {
        const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
        await withinClaimFixture(
          () => fixture.source.close(),
          () =>
            assertCurrentExecution(
              fixture.source,
              seed,
              { kind: 'legacy' },
              hasDistinctSets,
              purpose,
              () => {
                fixture.ownPersonInOrganization(CLAIM_PERSON, seed.organizationId, [seed.stamp.by]);
              },
            ),
        );
      },
    );
