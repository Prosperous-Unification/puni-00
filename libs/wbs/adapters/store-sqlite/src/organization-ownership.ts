import { eq, isNull, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import { readOrganizationActivation } from './organization-activation';
import {
  externalSystem,
  externalSystemOrganization,
  organization,
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

/** Root kinds whose side table carries the organization-scoped display name. */
export const CATALOG_ROOT_KINDS = [
  'person',
  'service_team',
  'service',
  'tag',
  'work_item_type',
  'external_system',
] as const satisfies readonly OwnedRootKind[];

type CatalogRootKind = (typeof CATALOG_ROOT_KINDS)[number];

/** Why the legacy backfill refused; nothing was written. */
export class LegacyBackfillRefused extends Error {}

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

function isCatalogKind(kind: OwnedRootKind): kind is CatalogRootKind {
  return (CATALOG_ROOT_KINDS as readonly OwnedRootKind[]).includes(kind);
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

  /**
   * Maps every unmapped root to the legacy organization, copying catalog names, in one
   * immediate transaction, and returns how many rows each kind gained. Repeatable while the
   * outgoing release still writes: an existing mapping is never overwritten, and a conflicting
   * name fails the whole pass instead of being skipped. Run explicitly, never at boot.
   *
   * @throws {LegacyBackfillRefused} after activation, when no legacy organization exists, or when
   * any root is already owned by another organization, which cannot happen before activation.
   * @throws {OrganizationActivationRefused} when the marker is absent, unreadable or malformed.
   */
  async backfillLegacyOwnership(): Promise<ReadonlyMap<OwnedRootKind, number>> {
    await Promise.resolve();
    return this.db.transaction(
      (tx) => {
        // Proof: 2026-09-27, with this read removed `refuses to backfill after activation` mapped
        // roots after activation and `refuses backfill over a broken marker` resolved.
        if (readOrganizationActivation(tx) !== 'pre_activation')
          throw new LegacyBackfillRefused(
            'legacy backfill refused: organization isolation is activated',
          );
        const legacy = tx
          .select({ id: organization.id })
          .from(organization)
          .where(eq(organization.legacy, true))
          .get();
        // Proof: 2026-09-27, returning empty counts here made `maps nothing and refuses backfill
        // while no legacy organization exists` resolve instead of refusing.
        if (legacy === undefined)
          throw new LegacyBackfillRefused('legacy backfill refused: no legacy organization exists');
        const foreign = OWNED_ROOT_KINDS.filter(
          (kind) =>
            tx.all(
              sql`SELECT 1 FROM ${sql.identifier(`${kind}_organization`)}
                WHERE organization_id != ${legacy.id} LIMIT 1`,
            ).length > 0,
        );
        // Proof: 2026-09-27, with this check removed `refuses to backfill over a root another
        // organization owns` mapped the other roots and kept the foreign owner.
        if (foreign.length > 0)
          throw new LegacyBackfillRefused(
            `legacy backfill refused: ${foreign.join(', ')} roots are owned by another organization before activation`,
          );
        const counts = new Map<OwnedRootKind, number>();
        for (const kind of OWNED_ROOT_KINDS) {
          const side = sql.identifier(`${kind}_organization`);
          const root = sql.identifier(kind);
          const statement = isCatalogKind(kind)
            ? sql`INSERT INTO ${side} (resource_id, organization_id, name)
                SELECT id, ${legacy.id}, name FROM ${root}
                WHERE id NOT IN (SELECT resource_id FROM ${side})`
            : sql`INSERT INTO ${side} (resource_id, organization_id)
                SELECT id, ${legacy.id} FROM ${root}
                WHERE id NOT IN (SELECT resource_id FROM ${side})`;
          counts.set(kind, tx.run(statement).changes);
        }
        return counts;
      },
      { behavior: 'immediate' },
    );
  }

  /**
   * Catalog roots whose legacy-organization side row no longer carries the root's name, by kind
   * then id. Before activation the bridge keeps them equal, so any answer means a rename the
   * name trigger missed (a rebuilt table, a dropped trigger); activation must refuse it.
   *
   * Proof: `WHERE 0` in place of the name comparison failed `organization-bridge.db.test.ts`
   * `reports catalog name drift the bridge missed`. Observed 2026-09-27.
   */
  async findCatalogNameDrift(): Promise<UnmappedRoot[]> {
    await Promise.resolve();
    return CATALOG_ROOT_KINDS.flatMap((kind) =>
      this.db
        .all<{ id: unknown }>(
          sql`SELECT r.id AS id FROM ${sql.identifier(kind)} AS r
            JOIN ${sql.identifier(`${kind}_organization`)} AS s ON s.resource_id = r.id
            JOIN organization AS o ON o.id = s.organization_id AND o.legacy = 1
            WHERE s.name != r.name ORDER BY r.id`,
        )
        .map((row) => {
          // Raw SQL rows arrive unknown; every root id is a text primary key.
          if (typeof row.id !== 'string') throw new Error(`${kind} has a non-text id`);
          return { kind, id: row.id };
        }),
    );
  }
}
