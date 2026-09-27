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

/**
 * A dependent relation whose two ends resolve to different owners, or an event stream that
 * resolves to no project. Dependents carry no ownership row: each derives its organization from
 * the root it hangs off, so these are what activation must refuse beside unmapped roots.
 */
export const OWNERSHIP_CONFLICT_KINDS = [
  'saved_plan_project',
  'dependency_endpoint',
  'work_item_parent',
  'work_item_service_team',
  'work_item_service',
  'work_item_tag',
  'work_item_team',
  'work_item_type',
  'work_item_service_link',
  'work_item_external_ref',
  'assignment_person',
  'assignment_step',
  'estimate_step',
  'actual_step',
  'step_progress_step',
  'step_measure_step',
  'person_team',
  'team_service',
  'project_team_capacity',
  'plan_event_subject',
  'event_stream',
] as const;

export type OwnershipConflictKind = (typeof OWNERSHIP_CONFLICT_KINDS)[number];

/** One conflicting row: `id` is the dependent's key, joined with `/` when composite. */
export interface OwnershipConflict {
  readonly kind: OwnershipConflictKind;
  readonly id: string;
}

/** The organization owning the project in `projectColumn`, as a scalar subquery. */
function buildProjectOwnerSql(projectColumn: string): string {
  return `(SELECT organization_id FROM project_organization WHERE resource_id = ${projectColumn})`;
}

function buildCatalogOwnerSql(kind: CatalogRootKind, idColumn: string): string {
  return `(SELECT organization_id FROM ${kind}_organization WHERE resource_id = ${idColumn})`;
}

/**
 * A work-item link to a catalog entry whose owner differs from the work item's project owner.
 * Unmapped ends compare as NULL and are left to {@link OrganizationOwnershipRepository.findUnmappedRoots}.
 */
function buildWorkItemCatalogConflictSql(
  table: string,
  column: string,
  kind: CatalogRootKind,
  id: string,
): string {
  return `SELECT ${id} AS id FROM ${table} AS l JOIN work_item AS w ON w.id = l.work_item_id
    WHERE ${buildProjectOwnerSql('w.project_id')} != ${buildCatalogOwnerSql(kind, `l.${column}`)}`;
}

/** A per-step row whose step lies in another project than its work item. */
function buildWorkItemStepConflictSql(table: string, id: string): string {
  return `SELECT ${id} AS id FROM ${table} AS l
    JOIN work_item AS w ON w.id = l.work_item_id JOIN step AS st ON st.id = l.step_id
    WHERE st.project_id != w.project_id`;
}

/**
 * Every conflict query, keyed so a kind added to {@link OWNERSHIP_CONFLICT_KINDS} without a
 * query here is a type error. Each selects the conflicting rows' `id`.
 *
 * Proof: each of the twenty-one queries replaced alone by one selecting nothing failed its own
 * `reports a <kind> conflict` case in `organization-reconciliation.db.test.ts`. Observed
 * 2026-09-27.
 */
const CONFLICT_QUERIES: Record<OwnershipConflictKind, string> = {
  saved_plan_project: `SELECT sp.id AS id FROM saved_plan AS sp
    WHERE (SELECT organization_id FROM saved_plan_organization WHERE resource_id = sp.id)
      != ${buildProjectOwnerSql('sp.project_id')}`,
  dependency_endpoint: `SELECT d.id AS id FROM dependency AS d
    JOIN work_item AS p ON p.id = d.predecessor_id JOIN work_item AS s ON s.id = d.successor_id
    WHERE p.project_id != d.project_id OR s.project_id != d.project_id`,
  work_item_parent: `SELECT w.id AS id FROM work_item AS w JOIN work_item AS parent ON parent.id = w.parent_id
    WHERE parent.project_id != w.project_id`,
  work_item_service_team: `SELECT w.id AS id FROM work_item AS w
    WHERE ${buildProjectOwnerSql('w.project_id')} != ${buildCatalogOwnerSql('service_team', 'w.service_team_id')}`,
  work_item_service: `SELECT w.id AS id FROM work_item AS w
    WHERE ${buildProjectOwnerSql('w.project_id')} != ${buildCatalogOwnerSql('service', 'w.service_id')}`,
  work_item_tag: buildWorkItemCatalogConflictSql(
    'work_item_tag',
    'tag_id',
    'tag',
    "l.work_item_id || '/' || l.tag_id",
  ),
  work_item_team: buildWorkItemCatalogConflictSql(
    'work_item_team',
    'team_id',
    'service_team',
    "l.work_item_id || '/' || l.team_id",
  ),
  work_item_type: buildWorkItemCatalogConflictSql(
    'work_item_work_item_type',
    'type_id',
    'work_item_type',
    "l.work_item_id || '/' || l.type_id",
  ),
  work_item_service_link: buildWorkItemCatalogConflictSql(
    'work_item_service',
    'service_id',
    'service',
    "l.work_item_id || '/' || l.service_id",
  ),
  work_item_external_ref: buildWorkItemCatalogConflictSql(
    'work_item_external_ref',
    'system_id',
    'external_system',
    'l.id',
  ),
  assignment_person: buildWorkItemCatalogConflictSql(
    'assignment',
    'person_id',
    'person',
    "l.work_item_id || '/' || l.step_id || '/' || l.person_id",
  ),
  assignment_step: buildWorkItemStepConflictSql(
    'assignment',
    "l.work_item_id || '/' || l.step_id || '/' || l.person_id",
  ),
  estimate_step: buildWorkItemStepConflictSql('estimate', "l.work_item_id || '/' || l.step_id"),
  actual_step: buildWorkItemStepConflictSql('actual', "l.work_item_id || '/' || l.step_id"),
  step_progress_step: buildWorkItemStepConflictSql(
    'step_progress',
    "l.work_item_id || '/' || l.step_id",
  ),
  step_measure_step: buildWorkItemStepConflictSql(
    'step_measure',
    "l.work_item_id || '/' || l.step_id || '/' || l.metric",
  ),
  person_team: `SELECT pt.person_id || '/' || pt.service_team_id AS id FROM person_team AS pt
    WHERE ${buildCatalogOwnerSql('person', 'pt.person_id')} != ${buildCatalogOwnerSql('service_team', 'pt.service_team_id')}`,
  team_service: `SELECT ts.team_id || '/' || ts.service_id AS id FROM team_service AS ts
    WHERE ${buildCatalogOwnerSql('service_team', 'ts.team_id')} != ${buildCatalogOwnerSql('service', 'ts.service_id')}`,
  project_team_capacity: `SELECT c.project_id || '/' || c.service_team_id AS id FROM project_team_capacity AS c
    WHERE ${buildProjectOwnerSql('c.project_id')} != ${buildCatalogOwnerSql('service_team', 'c.service_team_id')}`,
  plan_event_subject: `SELECT e.id AS id FROM plan_event AS e
    WHERE EXISTS (SELECT 1 FROM work_item AS w WHERE w.id = e.work_item_id AND w.project_id != e.project_id)
      OR EXISTS (SELECT 1 FROM step AS st WHERE st.id = e.step_id AND st.project_id != e.project_id)`,
  event_stream: `SELECT subscription AS id FROM (
      SELECT subscription FROM event_sequencer UNION SELECT subscription FROM event_log)
    WHERE subscription NOT IN (SELECT 'project:' || resource_id FROM project_organization)`,
};

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

  /**
   * Every dependent whose ends resolve to different owners, and every event stream that resolves
   * to no mapped project, by kind then id. Activation must refuse any answer (task 7.1); a deleted
   * project's retained stream is reported too, because deriving its owner would be a guess.
   * Journal payloads and captured schedule bodies are not parsed here.
   */
  async findOwnershipConflicts(): Promise<OwnershipConflict[]> {
    await Promise.resolve();
    return OWNERSHIP_CONFLICT_KINDS.flatMap((kind) =>
      this.db.all<{ id: unknown }>(sql.raw(`${CONFLICT_QUERIES[kind]} ORDER BY id`)).map((row) => {
        // Raw SQL rows arrive unknown; every key selected above is text.
        if (typeof row.id !== 'string') throw new Error(`${kind} conflict has a non-text id`);
        return { kind, id: row.id };
      }),
    );
  }
}
