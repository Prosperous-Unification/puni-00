import { stepCatalogueFixtureFromSource } from '@wbs/conformance';
import { CURRENT_UNIT_ASSERTIONS, runCurrentUnitCase } from '@wbs/conformance/stores/current-unit';
import { test } from 'bun:test';

import { openMemoryStepCatalogueCase } from './step-catalogue-fixture';

for (const owner of CURRENT_UNIT_ASSERTIONS) {
  test(
    'current unit memory ' + owner.caseId,
    async () => {
      const fixture = await openMemoryStepCatalogueCase(
        owner.caseId,
        stepCatalogueFixtureFromSource,
      );
      await runCurrentUnitCase(fixture, owner.assert);
    },
    30000,
  );
}
