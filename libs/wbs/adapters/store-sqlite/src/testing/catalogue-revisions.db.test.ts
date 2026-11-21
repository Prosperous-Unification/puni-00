import { STEP_CATALOGUE_SEED } from '@wbs/conformance';
import {
  CATALOGUE_REVISION_ASSERTIONS,
  runCatalogueRevisionCase,
} from '@wbs/conformance/stores/catalogue-revisions';
import { test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

for (const owner of CATALOGUE_REVISION_ASSERTIONS) {
  test(
    'catalogue revisions sqlite ' + owner.caseId,
    async () => {
      const fixture = await openSqliteStepCatalogueCase(
        'stepCatalogue.unbindStep:estimate-refusal-and-preview',
        undefined,
        STEP_CATALOGUE_SEED.projectId + ':empty',
      );
      await runCatalogueRevisionCase(fixture, owner.assert, (projectId) => {
        const rows = fixture.source.db.all<{ id: unknown; revision: unknown }>(
          sql`SELECT id,revision FROM project WHERE id=${projectId}`,
        );
        const row = rows.at(0);
        if (
          rows.length !== 1 ||
          row?.id !== projectId ||
          typeof row.revision !== 'number' ||
          !Number.isSafeInteger(row.revision)
        )
          throw new Error('required actual project revision is absent or malformed');
        return row.revision;
      });
    },
    30_000,
  );
}
