import { assertCandidateCycle, CANDIDATE_CYCLE_CASES } from '@wbs/core/testing/candidate-cycle';
import { withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { test } from 'bun:test';

import { openMemoryStepCatalogueSourceFixture } from './testing/step-catalogue-fixture';
for (const purpose of CANDIDATE_CYCLE_CASES)
  test('actual Memory candidate cycle ' + purpose, async () => {
    const { fixture, seed } = await openMemoryStepCatalogueSourceFixture();
    await withinClaimFixture(
      () => fixture.source.close(),
      () => assertCandidateCycle(fixture.source, seed, purpose),
    );
  });
