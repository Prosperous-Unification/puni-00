import { CURRENT_ALLOWANCE_ASSERTIONS, runCurrentAllowanceCase } from '@wbs/conformance/stores/current-allowance';
import { test } from 'bun:test';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

for (const owner of CURRENT_ALLOWANCE_ASSERTIONS) {
  test('current allowance sqlite ' + owner.caseId, async () => {
    const fixture = await openSqliteStepCatalogueCase('stepCatalogue.unbindStep:estimate-refusal-and-preview');
    await runCurrentAllowanceCase(fixture, owner.assert);
  }, 30000);
}
