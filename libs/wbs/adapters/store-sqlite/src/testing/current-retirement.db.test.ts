import {
  CURRENT_RETIREMENT_ASSERTIONS,
  runCurrentRetirementCase,
} from '@wbs/conformance/stores/current-retirement';
import { test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

for (const owner of CURRENT_RETIREMENT_ASSERTIONS) {
  test(
    'current retirement sqlite ' + owner.caseId,
    async () => {
      const current = await openSqliteStepCatalogueCase(
        'stepCatalogue.unbindStep:estimate-refusal-and-preview',
      );
      await runCurrentRetirementCase(
        {
          current,
          readDefinitions() {
            return current.source.db.all(
              sql`SELECT * FROM step_definition ORDER BY id COLLATE BINARY`,
            );
          },
        },
        owner.assert,
      );
    },
    30000,
  );
}
