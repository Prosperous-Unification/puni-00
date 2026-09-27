import { eq, isNull } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import {
  externalSystem,
  externalSystemOrganization,
  person,
  personOrganization,
  project,
  projectOrganization,
  savedPlan,
  savedPlanOrganization,
  service,
  serviceOrganization,
  serviceTeam,
  serviceTeamOrganization,
  tag,
  tagOrganization,
  workItemType,
  workItemTypeOrganization,
} from './schema';

/** The root resources an organization owns; dependents inherit through them. */
export const OWNED_ROOT_KINDS = [
  'project',
  'person',
  'service_team',
  'service',
  'tag',
  'work_item_type',
  'external_system',
  'saved_plan',
] as const;

export type OwnedRootKind = (typeof OWNED_ROOT_KINDS)[number];

/** A root resource with no ownership row. */
export interface UnmappedRoot {
  readonly kind: OwnedRootKind;
  readonly id: string;
}

interface OwnershipPair {
  readonly root: SQLiteTable;
  readonly rootId: SQLiteColumn;
  readonly side: SQLiteTable;
  readonly sideResourceId: SQLiteColumn;
}

/**
 * Every root kind with its side table, keyed so adding a kind to
 * {@link OWNED_ROOT_KINDS} without a pair here is a type error.
 */
const OWNERSHIP_PAIRS: Record<OwnedRootKind, OwnershipPair> = {
  project: pair(project, project.id, projectOrganization, projectOrganization.resourceId),
  person: pair(person, person.id, personOrganization, personOrganization.resourceId),
  service_team: pair(
    serviceTeam,
    serviceTeam.id,
    serviceTeamOrganization,
    serviceTeamOrganization.resourceId,
  ),
  service: pair(service, service.id, serviceOrganization, serviceOrganization.resourceId),
  tag: pair(tag, tag.id, tagOrganization, tagOrganization.resourceId),
  work_item_type: pair(
    workItemType,
    workItemType.id,
    workItemTypeOrganization,
    workItemTypeOrganization.resourceId,
  ),
  external_system: pair(
    externalSystem,
    externalSystem.id,
    externalSystemOrganization,
    externalSystemOrganization.resourceId,
  ),
  saved_plan: pair(
    savedPlan,
    savedPlan.id,
    savedPlanOrganization,
    savedPlanOrganization.resourceId,
  ),
};

function pair(
  root: SQLiteTable,
  rootId: SQLiteColumn,
  side: SQLiteTable,
  sideResourceId: SQLiteColumn,
): OwnershipPair {
  return { root, rootId, side, sideResourceId };
}

/**
 * Reads organization ownership of root resources. Inert until the bridge
 * (task 2.1) writes mappings and activation preflight (task 7.1) requires
 * {@link findUnmappedRoots} to answer empty.
 */
export class OrganizationOwnershipRepository {
  constructor(private readonly db: SQLiteBunDatabase) {}

  /**
   * Every root of every kind with no ownership row, by kind then id.
   *
   * Proof: `saved_plan` filtered out of the kinds walked failed
   * `organization-ownership.db.test.ts` `reports an unmapped root of every
   * kind` (`- "saved_plan"`). Observed 2026-09-27.
   */
  async findUnmappedRoots(): Promise<UnmappedRoot[]> {
    await Promise.resolve();
    return OWNED_ROOT_KINDS.flatMap((kind) => {
      const { root, rootId, side, sideResourceId } = OWNERSHIP_PAIRS[kind];
      return this.db
        .select({ id: rootId })
        .from(root)
        .leftJoin(side, eq(sideResourceId, rootId))
        .where(isNull(sideResourceId))
        .orderBy(rootId)
        .all()
        .map((row) => {
          // `rootId` is typed as any column, so the value arrives unknown; every
          // root id is a text primary key, and anything else is corrupt state.
          if (typeof row.id !== 'string') throw new Error(`${kind} has a non-text id`);
          return { kind, id: row.id };
        });
    });
  }
}
