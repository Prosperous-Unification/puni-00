import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  STEP_CATALOGUE_SEED,
  type StepCatalogueCaseId,
  type StepCatalogueFixture,
  stepCatalogueFixtureFromSource,
  type StepFactCorruption,
  type StepTupleEvidence,
} from '@wbs/conformance';
import type { PackageStepRecord, StoredActual, StoredEstimate, StoredProgress } from '@wbs/core';
import type { OrganizationLimitValues } from '@wbs/domain';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect } from 'bun:test';
import { type Logger, sql } from 'drizzle-orm';

import { rowsChanged } from '../changes';
import { type Drizzle, openExistingConnection } from '../db';
import { openSqliteSource, type SqliteSource } from '../source';
import { migrateEmptyCatalogueFixture } from './catalogue-database';
import { CAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './dependency-capability';

/** Direct physical tuple extraction; the only boolean presentation conversion preserves every non-0/1 value verbatim. */
function readTupleEvidence(db: Drizzle): StepTupleEvidence {
  const trios = db.all<StepTupleEvidence['measureEstimates'][number]>(
    sql`SELECT work_item_id AS "workItemId",step_id AS "stepId",measure_key AS "key",optimistic,realistic,pessimistic,single_point AS "singlePoint",currency,rate_card_digest AS "rateCardDigest" FROM measure_estimate ORDER BY work_item_id COLLATE BINARY,step_id COLLATE BINARY,measure_key COLLATE BINARY`,
  );
  return {
    measures: db.all<StepTupleEvidence['measures'][number]>(
      sql`SELECT f.work_item_id AS "workItemId",f.step_id AS "stepId",coalesce(f.metric,m.key) AS "metric",f.value,f.recorded_at AS "recordedAt",f.currency,f.rate_card_digest AS "rateCardDigest" FROM step_measure f LEFT JOIN measure m ON m.id=f.measure_id ORDER BY f.work_item_id COLLATE BINARY,f.step_id COLLATE BINARY,coalesce(f.metric,m.key) COLLATE BINARY`,
    ),
    measureEstimates: trios.map((row) => ({
      ...row,
      singlePoint: row.singlePoint === 0 ? false : row.singlePoint === 1 ? true : row.singlePoint,
    })),
    attempts: db.all<StepTupleEvidence['attempts'][number]>(
      sql`SELECT work_item_id AS "workItemId",step_id AS "stepId",attempt_number AS "attemptNumber",started_at AS "startedAt",ended_at AS "endedAt",outcome,executor_person_id AS "executorPersonId",reference,note FROM step_node_attempt ORDER BY work_item_id COLLATE BINARY,step_id COLLATE BINARY,attempt_number`,
    ),
    issued: db.all<StepTupleEvidence['issued'][number]>(
      sql`SELECT work_item_id AS "workItemId",step_id AS "stepId",issued FROM step_node_attempt_issued ORDER BY work_item_id COLLATE BINARY,step_id COLLATE BINARY`,
    ),
  };
}

/** Reads the actual exclusively fixture-owned writer; no legacy step join, fabricated fact or extra connection. */
function readCatalogueEvidence(db: Drizzle) {
  const schema = db.all<Record<string, unknown>>(
    sql`SELECT type, name, tbl_name, rootpage, sql FROM sqlite_master ORDER BY type COLLATE BINARY, name COLLATE BINARY`,
  );
  const names = db.all<{ name: unknown }>(
    sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name COLLATE BINARY`,
  );
  const tables = names.map(({ name }) => {
    if (typeof name !== 'string' || name === '')
      throw new Error('catalogue fixture table identity is malformed');
    const rows = db.all<Record<string, unknown>>(
      sql.raw('SELECT * FROM "' + name.replaceAll('"', '""') + '"'),
    );
    rows.sort((left, right) =>
      Buffer.compare(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right))),
    );
    return { name, rows };
  });
  return {
    snapshot: { schema, tables },
    tuples: readTupleEvidence(db),
    estimates: db.all<StoredEstimate>(
      sql`SELECT work_item_id AS "workItemId", step_id AS "stepId", optimistic, realistic, pessimistic FROM estimate ORDER BY work_item_id COLLATE BINARY, step_id COLLATE BINARY`,
    ),
    actuals: db.all<Readonly<Record<keyof StoredActual, unknown>>>(
      sql`SELECT work_item_id AS "workItemId",step_id AS "stepId",days,recorded_at AS "recordedAt" FROM actual ORDER BY work_item_id COLLATE BINARY,step_id COLLATE BINARY`,
    ),
    progress: db.all<Readonly<Record<keyof StoredProgress, unknown>>>(
      sql`SELECT work_item_id AS "workItemId",step_id AS "stepId",state,stated_at AS "statedAt" FROM step_progress ORDER BY work_item_id COLLATE BINARY,step_id COLLATE BINARY`,
    ),
    packageValues: db.all<PackageStepRecord>(
      sql`SELECT work_package_id AS "workPackageId", step_id AS "stepId", estimate_unit AS "estimateUnit", allowance_bps AS "allowanceBps", allowance_revision AS "allowanceRevision" FROM work_package_step ORDER BY work_package_id COLLATE BINARY, step_id COLLATE BINARY`,
    ),
  };
}

/** Changes one actual existing raw column; non-STRICT stated_at admits TEXT without touching checks/triggers/FKs. */
function corruptStepFact(db: Drizzle, corruption: StepFactCorruption): () => void {
  const table = sql.raw(
    corruption.kind === 'actual_days' || corruption.kind === 'actual_step'
      ? 'actual'
      : 'step_progress',
  );
  const column = sql.raw(
    corruption.kind === 'actual_days'
      ? 'days'
      : corruption.kind === 'progress_time'
        ? 'stated_at'
        : 'step_id',
  );
  const row = db.get<{ value: unknown } | undefined>(
    sql`SELECT ${column} AS value FROM ${table} WHERE work_item_id=${corruption.workItemId} AND step_id=${corruption.stepId}`,
  );
  if (row === undefined) throw new Error('point corruption target is absent');
  const numeric = corruption.kind === 'actual_days' || corruption.kind === 'progress_time';
  if (
    numeric
      ? typeof row.value !== 'number' || !Number.isFinite(row.value)
      : typeof row.value !== 'string' || row.value === ''
  )
    throw new Error('point corruption requires the original healthy column');
  const original = row.value;
  db.run(
    sql`UPDATE ${table} SET ${column}=${corruption.value} WHERE work_item_id=${corruption.workItemId} AND step_id=${corruption.stepId}`,
  );
  const currentStepId =
    corruption.kind === 'actual_step' || corruption.kind === 'progress_step'
      ? corruption.value
      : corruption.stepId;
  return () => {
    db.run(
      sql`UPDATE ${table} SET ${column}=${original} WHERE work_item_id=${corruption.workItemId} AND step_id=${currentStepId}`,
    );
    if (rowsChanged(db, 'point corruption restoration') !== 1)
      throw new Error('point corruption restoration did not restore exactly one row');
  };
}

/**
 * Real116 predecessor, private117 atomic writer and actual additive118, with no
 * default-discovery bypass for the catalogue transition.
 * Uses actual immutable folder bytes, full name/hash ledger and E37 data evidence;
 * this exclusively owned fixture supplies no host/session/barrier authority.
 */
export async function openSqliteStepCatalogueCase(
  caseId: StepCatalogueCaseId,
  logger?: Logger,
  emptyProjectId?: string,
  organizationDefaultLimits?: OrganizationLimitValues,
  isActivated = true,
): Promise<StepCatalogueFixture<SqliteSource>> {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-catalogue-conformance-'));
  const path = join(directory, 'source.db'),
    seed = STEP_CATALOGUE_SEED;
  let source: SqliteSource | undefined;
  const custody = { hasUnknownOwner: false };
  function withinConnection<T>(use: (db: Drizzle) => T): T {
    let connection: ReturnType<typeof openExistingConnection>;
    try {
      connection = openExistingConnection(path);
    } catch (cause: unknown) {
      custody.hasUnknownOwner = true;
      throw cause;
    }
    let outcome: { ok: true; value: T } | { ok: false; cause: unknown };
    try {
      outcome = { ok: true, value: use(connection.db) };
    } catch (cause: unknown) {
      outcome = { ok: false, cause };
    }
    try {
      connection.close();
    } catch (cleanup: unknown) {
      custody.hasUnknownOwner = true;
      if (!outcome.ok)
        throw new AggregateError(
          [outcome.cause, cleanup],
          'catalogue fixture operation and close failed',
          { cause: cleanup },
        );
      throw cleanup;
    }
    if (!outcome.ok) throw outcome.cause;
    return outcome.value;
  }
  try {
    migrateEmptyCatalogueFixture({ path, directory, reportedAt: seed.stamp.at }, custody);
    withinConnection((db) => {
      db.run(
        "INSERT INTO users(id,username,created_at) VALUES('catalogue-author','catalogue-author',100)",
      );
      db.run(
        "INSERT INTO organization(id,name,created_at) VALUES('catalogue-org','Catalogue organization',100),('catalogue-foreign-org','Foreign catalogue organization',100)",
      );
      db.run(
        "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('catalogue-org','catalogue-author','member',100),('catalogue-foreign-org','catalogue-author','member',100)",
      );
      if (isActivated)
        db.run(
          "UPDATE organization_activation SET state='activated',activated_at=100 WHERE singleton=1",
        );
      db.run(
        "INSERT INTO space(id,organization_id,name,revision,created_at,created_by) VALUES('catalogue-space','catalogue-org','Catalogue space',0,100,'catalogue-author')",
      );
      db.run(
        "INSERT INTO project(id,organization_id,name,revision,created_at,created_by,space_id,space_position) VALUES('catalogue-project','catalogue-org','Catalogue project',0,100,'catalogue-author','catalogue-space',10),('catalogue-sibling-project','catalogue-org','Sibling project',0,100,'catalogue-author',NULL,NULL),('catalogue-foreign-project','catalogue-foreign-org','Foreign project',0,100,'catalogue-author',NULL,NULL)",
      );
      if (emptyProjectId !== undefined)
        db.run(
          sql`INSERT INTO project(id,organization_id,name,revision,created_at,created_by,space_id,space_position) VALUES(${emptyProjectId},${seed.organizationId},${emptyProjectId},0,${seed.stamp.at},${seed.stamp.by},${seed.spaceId},20)`,
        );
      db.run(
        "INSERT INTO work_item_type(id,name) VALUES('catalogue-type','Catalogue type'),('catalogue-second-type','Second catalogue type'),('catalogue-foreign-type','Foreign catalogue type')",
      );
      db.run(
        "INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES('catalogue-type','catalogue-org','Catalogue type'),('catalogue-second-type','catalogue-org','Second catalogue type'),('catalogue-foreign-type','catalogue-foreign-org','Foreign catalogue type')",
      );
      expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    });
    let opened: SqliteSource;
    try {
      opened = openSqliteSource({
        dbPath: path,
        dependencyCapability: CAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
        ...(logger === undefined ? {} : { logger }),
        ...(organizationDefaultLimits === undefined ? {} : { organizationDefaultLimits }),
      });
    } catch (cause: unknown) {
      custody.hasUnknownOwner = true;
      throw cause;
    }
    source = opened;
    for (const [id, organizationId, projectId] of [
      [seed.workPackageId, seed.organizationId, seed.projectId],
      [seed.siblingWorkPackageId, seed.organizationId, seed.siblingProjectId],
      [seed.foreignWorkPackageId, seed.foreignOrganizationId, seed.foreignProjectId],
    ]) {
      const created = await opened.stores.workPackages.createInOrganization(
        workPackageRow({ id, projectId, name: id }),
        [],
        seed.stamp,
        organizationId,
        { id: id + ':creator-grant', auditId: id + ':creator-audit' },
      );
      expect(typeof created).toBe('object');
      if (typeof created === 'string')
        throw new Error('Catalogue fixture empty package refused: ' + created);
    }
    return await stepCatalogueFixtureFromSource(
      'sqlite:' + caseId,
      opened,
      seed,
      async () => {
        try {
          await opened.close();
        } catch (cause: unknown) {
          custody.hasUnknownOwner = true;
          throw cause;
        }
        rmSync(directory, { recursive: true });
      },
      () => readCatalogueEvidence(opened.db),
      (corruption) => corruptStepFact(opened.db, corruption),
    );
  } catch (primary: unknown) {
    if (source !== undefined) {
      try {
        await source.close();
      } catch (cleanup: unknown) {
        throw new AggregateError(
          [primary, cleanup],
          'SQLite catalogue fixture setup and source close failed; retained ' + directory,
          { cause: cleanup },
        );
      }
    }
    if (!custody.hasUnknownOwner) {
      try {
        rmSync(directory, { recursive: true });
      } catch (cleanup: unknown) {
        throw new AggregateError(
          [primary, cleanup],
          'SQLite catalogue fixture setup and directory removal failed',
          { cause: cleanup },
        );
      }
    }
    throw primary;
  }
}
