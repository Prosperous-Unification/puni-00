import { stepCatalogueFixtureFromSource } from '@wbs/conformance';
import {
  CATALOGUE_USAGE_READ_CASES,
  runCatalogueUsageReadCase,
} from '@wbs/conformance/stores/catalogue-usage-read';
import { test } from 'bun:test';

import { openMemoryStepCatalogueCase } from './step-catalogue-fixture';

for (const selected of CATALOGUE_USAGE_READ_CASES) {
  test(
    'catalogue usage memory ' + selected,
    async () => {
      const fixture = await openMemoryStepCatalogueCase(
        'stepCatalogue.unbindStep:estimate-refusal-and-preview',
        stepCatalogueFixtureFromSource,
      );
      await runCatalogueUsageReadCase(fixture, selected);
    },
    30000,
  );
}
