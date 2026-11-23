import { CLAIM_PERSON, withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import { assertCurrentExecution } from '@wbs/core/testing/current-execution';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteStepCatalogueCase } from './testing/step-catalogue-fixture';
for (const hasDistinctSets of [false, true])
  for (const purpose of ['execution', 'startable', 'claim', 'person', 'claim-conflict'] as const)
    for (const isBound of [false, true]) {
      if (purpose === 'execution' && !isBound) continue;
      test(
        'current SQLite ' +
          purpose +
          ' uses own execution ' +
          String(hasDistinctSets) +
          ' bound=' +
          String(isBound),
        async () => {
          const fixture = await openSqliteStepCatalogueCase(
            'stepCatalogue.unbindStep:estimate-refusal-and-preview',
            undefined,
            undefined,
            {
              maxAgentPersons: 50,
              maxConcurrentClaims: 200,
              maxCapacityUnitsPerResource: 10_000,
            },
          );
          const source = isBound
            ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
            : fixture.source;
          await withinClaimFixture(
            () => fixture.close(),
            () =>
              assertCurrentExecution(
                source,
                fixture.seed,
                {
                  kind: 'scoped',
                  scope: {
                    organizationId: fixture.seed.organizationId,
                    userId: fixture.seed.stamp.by,
                    cap: null,
                  },
                  principal: { id: fixture.seed.stamp.by },
                },
                hasDistinctSets,
                purpose,
                () =>
                  fixture.source.db.run(
                    sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES(${CLAIM_PERSON},${fixture.seed.organizationId},'Claim person')`,
                  ),
              ),
          );
        },
      );
    }
