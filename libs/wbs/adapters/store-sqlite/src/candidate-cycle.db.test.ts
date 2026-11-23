import { assertCandidateCycle, CANDIDATE_CYCLE_CASES } from '@wbs/core/testing/candidate-cycle';
import { withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { test } from 'bun:test';

import { openSqliteStepCatalogueCase } from './testing/step-catalogue-fixture';
for (const purpose of CANDIDATE_CYCLE_CASES)
  test('actual SQLite candidate cycle ' + purpose, async () => {
    const fixture = await openSqliteStepCatalogueCase(
      'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    );
    await withinClaimFixture(
      () => fixture.close(),
      () => assertCandidateCycle(fixture.source, fixture.seed, purpose),
    );
  });
