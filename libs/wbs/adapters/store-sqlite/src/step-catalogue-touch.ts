import { compareStepUsageIds, readCatalogueId, type StepScope, type WriteStamp } from '@wbs/core';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import { readSettingTargetIn } from './settings';

export interface CatalogueTargets {
  readonly workPackageIds: readonly string[];
  readonly projectIds: readonly string[];
}

/** Projects are captured independently of packages, so an empty project participates in manifest freshness. */
export function captureCatalogueProjectIdsIn(
  db: Pick<Drizzle, 'all'>,
  organizationId: string,
  scope: StepScope,
): readonly string[] {
  const selected =
    scope.scopeKind === 'organization'
      ? sql`p.organization_id=${organizationId}`
      : scope.scopeKind === 'space'
        ? sql`p.space_id=${scope.scopeId}`
        : sql`p.id=${scope.scopeId}`;
  const ids: string[] = [];
  for (const row of db.all<{ id: unknown }>(
    sql`SELECT p.id FROM project p WHERE ${selected} ORDER BY p.id COLLATE BINARY`,
  )) {
    const id = readCatalogueId(row.id, 'affected project');
    const target = readSettingTargetIn(db, { level: 'project', id }, organizationId);
    if (target === null) throw new Error('catalogue reached project is absent or foreign');
    ids.push(id);
  }
  return ids;
}

/** Scope overlaps touch one actual row once; callers supply only decoded actual targets on this writer. */
export function mergeCatalogueTargets(targets: readonly CatalogueTargets[]): CatalogueTargets {
  return {
    workPackageIds: [...new Set(targets.flatMap((target) => target.workPackageIds))].sort(
      compareStepUsageIds,
    ),
    projectIds: [...new Set(targets.flatMap((target) => target.projectIds))].sort(
      compareStepUsageIds,
    ),
  };
}

/**
 * Definition and binding changes advance explicit package and project cache tokens,
 * never package values. Raw counters are validated before increment and actual
 * RETURNING evidence must match; the enclosing method rolls back any partial touch.
 */
export function touchCatalogueTargetsIn(
  db: Pick<Drizzle, 'all' | 'run'>,
  targets: CatalogueTargets,
  stamp: WriteStamp,
): void {
  for (const workPackageId of targets.workPackageIds) {
    const before = db.all<{ id: unknown; revision: unknown }>(
      sql`SELECT id,revision FROM work_package WHERE id=${workPackageId}`,
    );
    const row = before.at(0);
    // Proof: omitting the nonnegative term accepted persisted -1 after native
    // checks were restored; the actual negative-package writer owner failed,
    // then passed after exact restore (verification-catalogue-negative-revisions-20261119.json).
    if (
      before.length !== 1 ||
      row?.id !== workPackageId ||
      typeof row.revision !== 'number' ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 0 ||
      !Number.isSafeInteger(row.revision + 1)
    )
      throw new Error('catalogue affected package revision is absent or malformed');
    const written = db.all<{ id: unknown; revision: unknown }>(
      sql`UPDATE work_package SET revision=revision+1,updated_at=${stamp.at} WHERE id=${workPackageId} RETURNING id,revision`,
    );
    const advanced = written.at(0);
    if (
      written.length !== 1 ||
      advanced?.id !== workPackageId ||
      advanced.revision !== row.revision + 1
    )
      throw new Error('catalogue affected package revision did not advance');
  }
  for (const projectId of targets.projectIds) {
    const before = db.all<{ id: unknown; revision: unknown }>(
      sql`SELECT id,revision FROM project WHERE id=${projectId}`,
    );
    const row = before.at(0);
    // Proof: omitting the nonnegative term accepted persisted -1 after native
    // checks were restored; the actual negative-project writer owner failed,
    // then passed after exact restore (verification-catalogue-negative-revisions-20261119.json).
    if (
      before.length !== 1 ||
      row?.id !== projectId ||
      typeof row.revision !== 'number' ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 0 ||
      !Number.isSafeInteger(row.revision + 1)
    )
      throw new Error('catalogue affected project revision is absent or malformed');
    const written = db.all<{ id: unknown; revision: unknown }>(
      sql`UPDATE project SET revision=revision+1,updated_at=${stamp.at} WHERE id=${projectId} RETURNING id,revision`,
    );
    const advanced = written.at(0);
    // Proof: omission made a native trigger-suppressed second project UPDATE resolve
    // instead of rejecting in the actual caught-map owner; first oracle only,
    // restored green (verification-project-manifest-20261119.json).
    if (
      written.length !== 1 ||
      advanced?.id !== projectId ||
      advanced.revision !== row.revision + 1
    )
      throw new Error('catalogue affected project revision did not advance');
  }
}
