import {
  assertStepRetirementEpoch,
  readStepRetirement,
  STEP_RETIREMENT_MIGRATION,
  type StepRetirement,
  type StepRetirementEpochRecord,
  type StepRetirementRecord,
} from '@wbs/core/module/step-catalogue/step-retirement';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';

type Reader = Pick<Drizzle, 'all'>;

/** Required current119 profile projected in the same statement as package metadata. */
export const stepRetirementEpochColumns = {
  relationKind: sql<unknown>`(SELECT type FROM sqlite_master WHERE name='step_retirement')`,
  migrationCount: sql<unknown>`(SELECT count(*) FROM __drizzle_migrations WHERE name=${STEP_RETIREMENT_MIGRATION})`,
  migrationName: sql<unknown>`(SELECT name FROM __drizzle_migrations WHERE name=${STEP_RETIREMENT_MIGRATION})`,
  migrationHash: sql<unknown>`(SELECT hash FROM __drizzle_migrations WHERE name=${STEP_RETIREMENT_MIGRATION})`,
  migrationCreatedAt: sql<unknown>`(SELECT created_at FROM __drizzle_migrations WHERE name=${STEP_RETIREMENT_MIGRATION})`,
};

/** Captures required119 profile on the supplied current snapshot; no filesystem, legacy relation or schema fallback. */
export function assertStepRetirementProfileIn(db: Reader): void {
  const rows = db.all<StepRetirementEpochRecord>(sql`SELECT
    (SELECT type FROM sqlite_master WHERE name='step_retirement') AS "relationKind",
    (SELECT count(*) FROM __drizzle_migrations WHERE name=${STEP_RETIREMENT_MIGRATION}) AS "migrationCount",
    (SELECT name FROM __drizzle_migrations WHERE name=${STEP_RETIREMENT_MIGRATION}) AS "migrationName",
    (SELECT hash FROM __drizzle_migrations WHERE name=${STEP_RETIREMENT_MIGRATION}) AS "migrationHash",
    (SELECT created_at FROM __drizzle_migrations WHERE name=${STEP_RETIREMENT_MIGRATION}) AS "migrationCreatedAt"`);
  const row = rows.at(0);
  if (rows.length !== 1 || row === undefined)
    throw new Error('catalogue retirement profile capture is absent');
  assertStepRetirementEpoch(row);
}

/**
 * Own declared or actual-definition organization rows survive mismatches for strict
 * decoding. A wholly unattributable retirement survives too. A foreign retirement
 * with an independently existing declared organization stays in that organization's
 * census even if its definition was corrupted away; it does not veto unrelated owners.
 */
export function captureStepRetirementsIn(
  db: Reader,
  organizationId: string,
): ReadonlyMap<string, StepRetirement> {
  assertStepRetirementProfileIn(db);
  const rows =
    db.all<StepRetirementRecord>(sql`SELECT retirement.step_id AS "stepId",retirement.organization_id AS "organizationId",retirement.retired_at AS "retiredAt",retirement.retired_by AS "retiredBy",
    definition.id AS "definitionId",definition.organization_id AS "definitionOrganizationId",organization.id AS "actualOrganizationId",actor.id AS "actualActorId"
    FROM step_retirement retirement LEFT JOIN step_definition definition ON definition.id=retirement.step_id
    LEFT JOIN organization ON organization.id=retirement.organization_id LEFT JOIN users actor ON actor.id=retirement.retired_by
    WHERE retirement.organization_id=${organizationId} OR definition.organization_id=${organizationId} OR (definition.id IS NULL AND organization.id IS NULL)
    ORDER BY retirement.step_id COLLATE BINARY`);
  const retirements = new Map<string, StepRetirement>();
  for (const row of rows) {
    const retirement = readStepRetirement(row);
    if (retirements.has(retirement.stepId))
      throw new Error('catalogue retirement identity is duplicated');
    retirements.set(retirement.stepId, retirement);
  }
  return retirements;
}
