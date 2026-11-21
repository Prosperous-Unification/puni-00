import { runCases, stepCatalogueRegistrations } from '@wbs/conformance';
import { expect, test } from 'bun:test';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

for (const registration of stepCatalogueRegistrations(openSqliteStepCatalogueCase)) {
  test('sqlite ' + registration.caseId, async () => {
    const report = await runCases([registration]);
    const failure = report.cases.find(({ status }) => status === 'failed');
    if (failure?.status === 'failed') throw new Error(failure.failure);
    expect(report.cases.map(({ caseId, status }) => ({ caseId, status }))).toEqual([
      { caseId: registration.caseId, status: 'passed' },
    ]);
  });
}
