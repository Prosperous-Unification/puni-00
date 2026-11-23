import type { NewStepDefinition, WriteStamp } from '@wbs/core';
import { sql } from 'drizzle-orm';

import { openSqliteSource, type SqliteSource } from '../source';
import { type CatalogueFixtureCustody, migrateEmptyCatalogueFixture } from './catalogue-database';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './dependency-capability';

interface CurrentProjectSeed {
  readonly path: string;
  readonly directory: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly stamp: WriteStamp;
  readonly definitions: readonly NewStepDefinition[];
}

/**
 * Migrates one exclusively owned current fixture and authors exactly its stated
 * project defaults through a real Source. Preactivation legacy callers retain
 * their existing organization, while every step is a current authored definition
 * and project binding.
 * The seeding Source closes before the caller acquires its measured/test owner;
 * uncertain lower acquisition or close retains the caller's namespace custody.
 * Arbitrary operation and close failures stay paired in their original order.
 * @throws for migration, actor/project seed, authored definition refusal or Source settlement failure.
 */
export async function seedCurrentProjectFixture(
  seed: CurrentProjectSeed,
  custody: CatalogueFixtureCustody,
): Promise<void> {
  migrateEmptyCatalogueFixture(
    { path: seed.path, directory: seed.directory, reportedAt: seed.stamp.at },
    custody,
  );
  let source: SqliteSource;
  try {
    source = openSqliteSource({
      dbPath: seed.path,
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    });
  } catch (cause: unknown) {
    // Proof: omitting this latch made the acquisition-refusal helper test observe
    // false instead of true; sqlite-current-fixture-v133-proof-acquisition.
    custody.hasUnknownOwner = true;
    throw new Error('current project fixture acquisition failed; retained ' + seed.directory, {
      cause,
    });
  }
  let primary: { cause: unknown } | undefined;
  try {
    await source.stores.users.create(
      {
        id: seed.stamp.by,
        username: seed.stamp.by,
        passwordHash: 'x',
        createdAt: seed.stamp.at,
      },
      seed.stamp,
    );
    source.db.transaction((db) => {
      db.run(
        sql`INSERT INTO organization(id,name,legacy,created_at) VALUES(${seed.organizationId},${seed.organizationId},1,${seed.stamp.at})`,
      );
      db.run(
        sql`INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES(${seed.projectId},${seed.organizationId},${seed.projectId},${seed.stamp.at},${seed.stamp.by})`,
      );
    });
    for (const definition of seed.definitions) {
      const defined = await source.stores.stepCatalogue.defineAndBindStep(
        seed.organizationId,
        definition,
        {
          bindingId: definition.id + ':binding',
          scopeKind: 'project',
          scopeId: seed.projectId,
          workItemTypeId: null,
          position: definition.position,
        },
        seed.stamp,
      );
      // Proof: omitting this refusal made the actual duplicate-code helper test fail
      // with Missing expected rejection; sqlite-current-fixture-v133-proof-definition.
      if (!defined.ok)
        throw new Error('current project fixture definition refused: ' + defined.reason);
    }
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await source.close();
  } catch (cleanup: unknown) {
    // Proof: omitting this latch made the actual close-refusal helper test observe
    // false instead of true; sqlite-current-fixture-v133-proof-close-custody.
    custody.hasUnknownOwner = true;
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'current project fixture seed and close failed; retained ' + seed.directory,
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}
