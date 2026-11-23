import { stepCatalogueFixtureFromSource } from '@wbs/conformance';
import {
  CURRENT_ALLOWANCE_ASSERTIONS,
  runCurrentAllowanceCase,
} from '@wbs/conformance/stores/current-allowance';
import { test } from 'bun:test';

import { openMemoryStepCatalogueCase } from './step-catalogue-fixture';

for (const owner of CURRENT_ALLOWANCE_ASSERTIONS) {
  test(
    'current allowance memory ' + owner.caseId,
    async () => {
      const fixture = await openMemoryStepCatalogueCase(
        owner.caseId,
        stepCatalogueFixtureFromSource,
      );
      await runCurrentAllowanceCase(fixture, owner.assert);
    },
    30000,
  );
}
