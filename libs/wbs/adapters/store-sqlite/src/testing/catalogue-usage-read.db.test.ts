import {
  CATALOGUE_USAGE_READ_CASES,
  runCatalogueUsageReadCase,
} from '@wbs/conformance/stores/catalogue-usage-read';
import { test } from 'bun:test';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

for (const selected of CATALOGUE_USAGE_READ_CASES) {
  test(
    'catalogue usage sqlite ' + selected,
    async () => {
      const fixture = await openSqliteStepCatalogueCase(
        'stepCatalogue.unbindStep:estimate-refusal-and-preview',
      );
      await runCatalogueUsageReadCase(fixture, selected);
    },
    30000,
  );
}
