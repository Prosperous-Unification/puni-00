import type {
  NewWorkPackage,
  RecoveryAuditDetail,
  Step,
  StepAllowanceWritten,
  StepUnitWritten,
  WorkPackage,
  WorkPackageCreationRefusal,
  WorkPackageCreationScope,
  WorkPackageCreatorGrant,
  WorkPackageCrossReference,
  WorkPackagePatch,
  WorkPackageStore,
  WorkPackageWithAccess,
  WorkPackageWithSteps,
  WriteStamp,
} from '@wbs/core';
import {
  authorize,
  authorizePackageSettings,
  readPackageStepValues,
  retainWorkPackageCreation,
  type ScopedPrincipal,
  WorkPackageStepMissing,
} from '@wbs/core';
import { type AllowancePercent, type EstimateUnit } from '@wbs/domain';
import { and, count, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import {
  AccessDecisionRepository,
  type PackageTargetRecord,
  readPackageOrganization,
  readPackageTargetRow,
} from './access-decisions';
import { auditOnCreate, auditOnUpdate } from './audit';
import { isUniqueViolation, UNIQUE_INDEXES } from './constraint';
import { drizzleOuterTransaction } from './db';
import type { Gate } from './gate';
import { OPEN } from './gate';
import { bumpedWorkPackage, bumpWorkPackage } from './revision';
import {
  estimate,
  optimizationGeneration,
  organizationAudit,
  planEvent,
  project,
  solverQueue,
  solverSlot,
  users,
  workItem,
  workPackage,
  workPackageAbbreviation,
  workPackageAccess,
  workPackageOrganization,
  workPackageSolution,
  workPackageStep,
} from './schema';
import {
  PACKAGE_SETTING_PROJECTION,
  projectPackageSettings,
  readSettingTargetIn,
  resolvePackageSettingsIn,
  writeSettingIn,
} from './settings';
import { readCatalogueStepsIn, StepRepository } from './step';
import {
  decodeWorkPackageAbbreviation,
  readWorkPackageAbbreviation,
  writeWorkPackageAbbreviation,
} from './work-package-abbreviation';
import { createWorkPackageIn, readWorkPackageCreationRefusal } from './work-package-creation';
import { fromJoined, scopedSolution, toWorkPackage, WITH_SOLUTION } from './work-package-row';
import { readWorkPackageCrossReferencesIn } from './work-package-step-references';

/**
 * An update instant as SQLite stored it: an integer, or NULL for a work package
 * whose rows all predate the audit columns.
 *
 * @throws when the column holds anything else; it is trusted state, and a
 * text or real instant would sort among the integers wrongly.
 */
function storedInstant(value: unknown, workPackageName: string): number | null {
  if (value === null || (typeof value === 'number' && Number.isSafeInteger(value))) return value;
  throw new Error(`work package "${workPackageName}" has an unreadable update instant`);
}

/**
 * Required creation-actor display metadata from the listing's LEFT JOIN.
 * Missing account state throws instead of hiding the package or inventing a name.
 * Creator metadata is never an access decision.
 *
 * Historical owner-display generation's proof record, retained verbatim:
 * Proof: with the throw replaced by `?? ''`, `fails the list rather than
 * answering a workPackage whose owner is nobody` in `work-package.test.ts` failed —
 * `listFor` resolved with `["Orphan", ""]` beside `["Rewire the shed",
 * "owner"]`. Watched, 2026-08-09.
 */
function withCreatorName<T extends { name: string; createdByName: string | null }>(
  row: T,
): Omit<T, 'createdByName'> & { createdByName: string } {
  if (row.createdByName === null) {
    throw new Error(`work package "${row.name}" has a creation actor naming no account`);
  }
  // Narrowed by the check above, which is the boundary this function exists to be.
  return { ...row, createdByName: row.createdByName };
}

/**
 * `create` writes the work package and its steps in one transaction. A work package that
 * existed briefly without steps would accept an estimate with no step to belong
 * to, and the failure would surface later as a missing join rather than here as
 * a rejected write.
 *
 * Step name uniqueness is left to the schema index: checking first is a race
 * two concurrent additions both win.
 *
 * Proof: retired-helper-classifyWorkPackageWriteIn; reintroduced the retired callable.
 * 'does not expose the retired server role helper classifyWorkPackageWriteIn' (organization-authorization.db.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: retired-method-admitEditInOrganization; reintroduced the retired callable.
 * 'does not expose the retired role-authorized work package admission API' (organization-audit.db.test.ts) failed; restored GREEN, 2026-11-10.
 */
export class WorkPackageRepository implements WorkPackageStore {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
    /** Borrowed catalogs already hold their source's immediate transaction; public edits own one. */
    private readonly writeScope: 'owned' | 'borrowed' = 'owned',
  ) {}

  // `async` is load-bearing rather than decorative: `db.transaction` is
  // synchronous, so a constraint violation would otherwise be thrown before the
  // promise this signature advertises exists — and a caller holding it with
  // `.catch()` would never see the rejection.
  async create(
    toCreate: NewWorkPackage,
    startingSteps: readonly Step[],
    stamp: WriteStamp,
  ): Promise<WorkPackage | WorkPackageCreationRefusal> {
    const born = await this.insert(toCreate, startingSteps, stamp, null);
    return typeof born === 'string' ? born : born.workPackage;
  }

  /**
   * {@link create} plus the work package's organization mapping, in the same
   * transaction. After activation the bridge triggers map nothing, so this row
   * is the only thing that makes the new work package visible to its organization.
   * Before activation the bridge has already mapped the work package to the legacy
   * organization and this insert is refused by the ownership freeze: scoped
   * creation is refused rather than double-mapped.
   *
   * Proof: dropping the mapping insert made `creates a workPackage only its own
   * organization can see` in `work-package-organization.controller.db.test.ts`
   * answer 404 for the creator's own read; watched 2026-09-27.
   */
  async createInOrganization(
    toCreate: NewWorkPackage,
    startingSteps: readonly Step[],
    stamp: WriteStamp,
    organizationId: string,
    creatorGrant: WorkPackageCreatorGrant,
  ): Promise<WorkPackage | WorkPackageCreationRefusal> {
    const born = await this.insert(toCreate, startingSteps, stamp, {
      organizationId,
      creatorGrant,
    });
    return typeof born === 'string' ? born : born.workPackage;
  }

  /** Captures the actual catalogue union inside the same transaction as package and creator authority. */
  async createWithSteps(
    toCreate: NewWorkPackage,
    stamp: WriteStamp,
    scope: WorkPackageCreationScope,
  ): Promise<WorkPackageWithSteps | WorkPackageCreationRefusal> {
    return await this.insert(toCreate, [], stamp, scope.kind === 'legacy' ? null : scope);
  }

  private async insert(
    toCreate: NewWorkPackage,
    startingSteps: readonly Step[],
    stamp: WriteStamp,
    scope: {
      readonly organizationId: string;
      readonly creatorGrant: WorkPackageCreatorGrant;
    } | null,
  ): Promise<WorkPackageWithSteps | WorkPackageCreationRefusal> {
    // Proof: sqlite-queue-retention bypasses this whole retention block; both
    // public Source modes and the scoped queue consume changed caller metadata.
    // This proves complete-input retention as a group, not each field separately.
    if (scope !== null) {
      const retained = retainWorkPackageCreation(
        toCreate,
        startingSteps,
        stamp,
        scope.organizationId,
        scope.creatorGrant,
      );
      toCreate = retained.workPackage;
      startingSteps = retained.steps;
      stamp = retained.stamp;
      scope = { organizationId: retained.organizationId, creatorGrant: retained.creatorGrant };
    } else {
      toCreate = structuredClone(toCreate);
      startingSteps = structuredClone([...startingSteps]);
      stamp = { ...stamp };
    }
    if (typeof toCreate.projectId !== 'string' || toCreate.projectId.trim() === '')
      throw new Error('package creation parent is missing');
    // Proof: writer-suspension adds two awaits here; both actual SQLite refused
    // owners still reject the late reply, but expose a package committed after rollback.
    return await this.gate.enter((): Promise<WorkPackageWithSteps | WorkPackageCreationRefusal> => {
      try {
        return Promise.resolve(
          this.db.transaction(
            (tx) => createWorkPackageIn(tx, toCreate, startingSteps, stamp, scope),
            { behavior: 'immediate' },
          ),
        );
      } catch (refused) {
        const refusal = readWorkPackageCreationRefusal(refused);
        if (refusal !== null) return Promise.resolve(refusal);
        throw refused;
      }
    });
  }

  async findById(id: string): Promise<WorkPackage | null> {
    const rows = await this.db
      .select(WITH_SOLUTION)
      .from(workPackage)
      .leftJoin(workPackageAbbreviation, eq(workPackageAbbreviation.workPackageId, workPackage.id))
      .leftJoin(workPackageOrganization, eq(workPackageOrganization.resourceId, workPackage.id))
      .leftJoin(workPackageSolution, eq(workPackageSolution.workPackageId, workPackage.id))
      .where(eq(workPackage.id, id))
      .limit(1);
    const found = rows.at(0);
    return found === undefined
      ? null
      : fromJoined(found, projectPackageSettings(found.settingsProjection, found.workPackage.id));
  }

  /**
   * {@link findById} confined to one organization: a foreign work package and an
   * absent one are both null, so no caller can tell them apart. Mapping identity
   * is checked before foreign opacity; owned parent/restriction state is checked
   * before decoding the package DTO, on this same LEFT JOIN observation.
   * @throws for an addressed malformed/missing map or an owned incoherent parent.
   *
   * Proof: dropping the organization predicate made `answers 404 alike for a
   * foreign and an absent workPackage, and changes nothing` in
   * `work-package-organization.controller.db.test.ts` answer the foreign work package with
   * 200; watched 2026-09-27.
   */
  // Proof: removing the organization predicate made mounted `foreign organization cannot edit code` receive 403 instead of 404 (2026-10-22).
  async findInOrganization(id: string, organizationId: string): Promise<WorkPackage | null> {
    const rows = await this.db
      .select({
        ...WITH_SOLUTION,
        parentId: project.id,
        parentOrganizationId: project.organizationId,
        targetRestricted: sql<unknown>`${workPackage.restricted}`,
        actualOrganizationId: sql<unknown>`(SELECT id FROM organization WHERE id = ${workPackageOrganization.organizationId})`,
        targetSpaceId: sql<unknown>`${project.spaceId}`,
        actualSpaceId: sql<unknown>`(SELECT id FROM space WHERE id = ${project.spaceId})`,
        spaceOrganizationId: sql<unknown>`(SELECT organization_id FROM space WHERE id = ${project.spaceId})`,
      })
      .from(workPackage)
      .leftJoin(workPackageAbbreviation, eq(workPackageAbbreviation.workPackageId, workPackage.id))
      .leftJoin(workPackageOrganization, eq(workPackageOrganization.resourceId, workPackage.id))
      .leftJoin(project, eq(project.id, workPackage.projectId))
      .leftJoin(workPackageSolution, eq(workPackageSolution.workPackageId, workPackage.id))
      .where(eq(workPackage.id, id))
      .limit(1);
    const found = rows.at(0);
    if (found === undefined) return null;
    const actualOrganizationId = readPackageOrganization(id, found.organization?.organizationId);
    if (actualOrganizationId !== organizationId) return null;
    readPackageTargetRow({
      package_id: found.workPackage.id,
      organization_id: actualOrganizationId,
      project_id: found.workPackage.projectId,
      parent_id: found.parentId,
      parent_organization_id: found.parentOrganizationId,
      actual_organization_id: found.actualOrganizationId,
      space_id: found.targetSpaceId,
      actual_space_id: found.actualSpaceId,
      space_organization_id: found.spaceOrganizationId,
      restricted: found.targetRestricted,
    });
    return fromJoined(
      found,
      projectPackageSettings(found.settingsProjection, found.workPackage.id),
    );
  }

  /**
   * One SQL snapshot captures current shared-definition/package-value fact identity
   * plus every non-step schedule relation. Missing trusted step state throws; genuine
   * foreign facts and unchanged directory/person/parent/capacity arms report crossings.
   * No shared definition invents incoming point ownership.
   *
   * Historical pre117 Proof (not a proof of the current catalogue fact arms):
   * each arm but `work_item_parent` removed alone failed its own
   * `fails the schedule read closed over a crossing <kind>` case in
   * `schedule-organization.controller.db.test.ts`; watched 2026-09-27. The
   * tree read already throws on a parent outside the work package, so that mounted
   * case answers 500 either way; removing the parent arm instead failed
   * `reports a work item whose parent lies in another workPackage` in
   * `work-package.db.test.ts`.
   */
  async findCrossReferences(
    workPackageId: string,
    organizationId: string,
  ): Promise<readonly WorkPackageCrossReference[]> {
    await Promise.resolve();
    const p = workPackageId;
    const o = organizationId;
    const ownerOf = (side: string, column: string) =>
      sql.raw(`(SELECT organization_id FROM ${side} WHERE resource_id = ${column})`);
    const catalogLink = (
      table: string,
      column: string,
      side: string,
      kind: string,
      id: string,
    ) => sql`
      SELECT ${kind} AS kind, ${sql.raw(id)} AS id FROM ${sql.raw(table)} AS l
        JOIN work_item AS w ON w.id = l.work_item_id
        WHERE w.work_package_id = ${p} AND ${ownerOf(side, `l.${column}`)} IS NOT ${o}`;
    const arms = [
      // The executor is nullable, unlike every catalog link above: a null one
      // references nothing, and `NULL IS NOT o` would report it.
      // Proof: this arm and the attempt step arm above removed made `fails the
      // schedule read closed over a crossing step_node_attempt_person` (and
      // `…_step`) in `schedule-organization.controller.db.test.ts` answer 200
      // where 500 was owed; watched 2026-10-12.
      sql`SELECT 'step_node_attempt_person' AS kind,
          l.work_item_id || '/' || l.step_id || '/' || l.attempt_number AS id
        FROM step_node_attempt AS l JOIN work_item AS w ON w.id = l.work_item_id
        WHERE w.work_package_id = ${p} AND l.executor_person_id IS NOT NULL
          AND ${ownerOf('person_organization', 'l.executor_person_id')} IS NOT ${o}`,
      catalogLink(
        'assignment',
        'person_id',
        'person_organization',
        'assignment_person',
        "l.work_item_id || '/' || l.step_id || '/' || l.person_id",
      ),
      // A claim names a person as an assignment does, and fails closed alike.
      // Proof: with this arm removed, `fails the schedule read closed over a
      // crossing claim_person` (schedule-organization.controller.db.test.ts)
      // answered 200 where 500 was owed; watched 2026-10-20.
      catalogLink('claim', 'person_id', 'person_organization', 'claim_person', 'l.id'),
      catalogLink(
        'work_item_tag',
        'tag_id',
        'tag_organization',
        'work_item_tag',
        "l.work_item_id || '/' || l.tag_id",
      ),
      catalogLink(
        'work_item_team',
        'team_id',
        'service_team_organization',
        'work_item_team',
        "l.work_item_id || '/' || l.team_id",
      ),
      catalogLink(
        'work_item_work_item_type',
        'type_id',
        'work_item_type_organization',
        'work_item_type',
        "l.work_item_id || '/' || l.type_id",
      ),
      catalogLink(
        'work_item_service',
        'service_id',
        'service_organization',
        'work_item_service_link',
        "l.work_item_id || '/' || l.service_id",
      ),
      catalogLink(
        'work_item_external_ref',
        'system_id',
        'external_system_organization',
        'work_item_external_ref',
        'l.id',
      ),
      sql`SELECT 'work_item_service_team' AS kind, w.id AS id FROM work_item AS w
        WHERE w.work_package_id = ${p} AND w.service_team_id IS NOT NULL
          AND ${ownerOf('service_team_organization', 'w.service_team_id')} IS NOT ${o}`,
      sql`SELECT 'work_item_service' AS kind, w.id AS id FROM work_item AS w
        WHERE w.work_package_id = ${p} AND w.service_id IS NOT NULL
          AND ${ownerOf('service_organization', 'w.service_id')} IS NOT ${o}`,
      sql`SELECT 'work_item_parent' AS kind, w.id AS id FROM work_item AS w
        JOIN work_item AS parent ON parent.id = w.parent_id
        WHERE w.work_package_id = ${p} AND parent.work_package_id IS NOT ${p}`,
      sql`SELECT 'dependency_endpoint' AS kind, d.id AS id FROM dependency AS d
        JOIN work_item AS pre ON pre.id = d.predecessor_id JOIN work_item AS suc ON suc.id = d.successor_id
        WHERE d.work_package_id = ${p} AND (pre.work_package_id IS NOT ${p} OR suc.work_package_id IS NOT ${p})`,
      sql`SELECT 'work_package_team_capacity' AS kind, c.service_team_id AS id FROM work_package_team_capacity AS c
        WHERE c.work_package_id = ${p} AND ${ownerOf('service_team_organization', 'c.service_team_id')} IS NOT ${o}`,
      // Resources (`wbs-resources`): a demand and a capacity name a resource as
      // a team label and a team capacity name a team, and fail closed alike.
      sql`SELECT 'work_package_resource_capacity' AS kind, c.resource_id AS id FROM work_package_resource_capacity AS c
        WHERE c.work_package_id = ${p} AND ${ownerOf('resource_organization', 'c.resource_id')} IS NOT ${o}`,
      catalogLink(
        'work_item_resource_demand',
        'resource_id',
        'resource_organization',
        'work_item_resource_demand',
        "l.work_item_id || '/' || l.resource_id",
      ),
      // A claim's occupancy names a resource as a demand does (`wbs-resources` R3).
      // Proof: with this arm removed, `reports a demand, a capacity and an
      // occupancy naming another organization’s resource` (work-package.db.test.ts)
      // left the occupancy out; watched 2026-10-20.
      sql`SELECT 'claim_occupancy_resource' AS kind, l.claim_id || '/' || l.resource_id AS id
        FROM claim_occupancy AS l JOIN claim AS c ON c.id = l.claim_id
        JOIN work_item AS w ON w.id = c.work_item_id
        WHERE w.work_package_id = ${p} AND ${ownerOf('resource_organization', 'l.resource_id')} IS NOT ${o}`,
      // Both incoming arms probe indexes from this work package's own work items:
      // `work_item_siblings` (per other work package) for a child, `dependency_pair`
      // and `dependency_by_successor` for an edge. The joins they replace
      // scanned all of `work_item` and `dependency` on every scoped read.
      // Proof: see `searches every arm through an index and scans no table` in
      // `work-package.db.test.ts`, which lists `SCAN w` or `SCAN d` with either
      // arm restored (observed 2026-09-29).
      sql`SELECT 'incoming_parent' AS kind, w.id AS id FROM work_item AS w
        WHERE w.work_package_id IN (SELECT id FROM work_package WHERE id IS NOT ${p})
          AND w.parent_id IN (SELECT id FROM work_item WHERE work_package_id = ${p})`,
      sql`SELECT 'incoming_dependency' AS kind, d.id AS id FROM dependency AS d
        WHERE d.work_package_id IS NOT ${p}
          AND (d.predecessor_id IN (SELECT id FROM work_item WHERE work_package_id = ${p})
            OR d.successor_id IN (SELECT id FROM work_item WHERE work_package_id = ${p}))`,
    ];
    // Typed, not parsed: every `kind` is one of the literals written in the arms
    // above, and `WORK_PACKAGE_CROSS_REFERENCE_KINDS` is their closed list.
    return readWorkPackageCrossReferencesIn(this.db, p, o, sql.join(arms, sql` UNION ALL `));
  }

  async findBySolutionSlug(slug: string): Promise<WorkPackage | null> {
    const rows = await this.db
      .select(WITH_SOLUTION)
      .from(workPackage)
      .leftJoin(workPackageAbbreviation, eq(workPackageAbbreviation.workPackageId, workPackage.id))
      .leftJoin(workPackageOrganization, eq(workPackageOrganization.resourceId, workPackage.id))
      .leftJoin(workPackageSolution, eq(workPackageSolution.workPackageId, workPackage.id))
      .where(eq(workPackage.solutionSlug, slug))
      .limit(1);
    const found = rows.at(0);
    return found === undefined
      ? null
      : fromJoined(found, projectPackageSettings(found.settingsProjection, found.workPackage.id));
  }

  /**
   * Proof: finding the slug deployment-wide and checking ownership afterwards
   * made `answers a foreign solution slug as an absent one, even when its row
   * is unreadable` in `import-export-organization.controller.db.test.ts`
   * answer 500 instead of 404; watched 2026-09-27.
   */
  async findBySolutionSlugInOrganization(
    slug: string,
    organizationId: string,
  ): Promise<WorkPackage | null> {
    const rows = await this.db
      .select(WITH_SOLUTION)
      .from(workPackage)
      .leftJoin(workPackageAbbreviation, eq(workPackageAbbreviation.workPackageId, workPackage.id))
      .innerJoin(
        workPackageOrganization,
        and(
          eq(workPackageOrganization.resourceId, workPackage.id),
          eq(workPackageOrganization.organizationId, organizationId),
        ),
      )
      .leftJoin(workPackageSolution, eq(workPackageSolution.workPackageId, workPackage.id))
      .where(or(eq(workPackageSolution.slug, slug), eq(workPackage.solutionSlug, slug)))
      .limit(2);
    // Proof: matching the legacy column alone made `links a slug only another
    // organization holds` in `work-package-solution.db.test.ts` find nothing for
    // a scoped link; watched 2026-09-28.
    // Proof: letting two matches through made `refuses a lookup two of the
    // organization's work packages answer` return one of them; watched 2026-09-28.
    // Every link write refuses a slug the organization already uses, so a
    // second match is a broken invariant rather than a choice to make.
    if (rows.length > 1) {
      throw new Error(`two work packages of organization ${organizationId} hold one solution slug`);
    }
    const found = rows.at(0);
    return found === undefined
      ? null
      : fromJoined(found, projectPackageSettings(found.settingsProjection, found.workPackage.id));
  }

  async list(): Promise<WorkPackage[]> {
    const rows = await this.db
      .select(WITH_SOLUTION)
      .from(workPackage)
      .leftJoin(workPackageAbbreviation, eq(workPackageAbbreviation.workPackageId, workPackage.id))
      .leftJoin(workPackageOrganization, eq(workPackageOrganization.resourceId, workPackage.id))
      .leftJoin(workPackageSolution, eq(workPackageSolution.workPackageId, workPackage.id))
      .orderBy(desc(workPackage.createdAt));
    return rows.map((row) =>
      fromJoined(row, projectPackageSettings(row.settingsProjection, row.workPackage.id)),
    );
  }

  /**
   * The caller's own order, in one query.
   *
   * The ordering rests on a SQLite fact worth naming: `ORDER BY x DESC` puts
   * NULLs **last**, because NULL sorts below every value. That is exactly the
   * rule this needs — never-opened work packages after opened ones — and it is not
   * portable, so a test watches it rather than a comment claiming it.
   *
   * The join is on both columns: `work_package_access` holds one row per pair, and
   * joining on the work package alone would attach somebody else's history to this
   * caller's list — every work package would then look opened, in the order the
   * busiest account visited them.
   *
   * The owner's name rides in the same statement, so listing fifty work packages
   * still costs one query rather than fifty-one. Both joins are LEFT joins and
   * for opposite reasons: a never-opened work package has no access row and must
   * still be listed, while a missing **user** row is not a work package without an
   * owner — it is a foreign key the database says cannot happen — so the LEFT
   * join is what makes that impossible row visible instead of dropping the
   * work package silently. Seeing it, this throws.
   *
   * Proof: with the owner join replaced by a `select` per row, `costs one
   * statement however many workPackages there are` in `work-package.test.ts` failed on
   * `Expected length: 1 / Received length: 51`. Watched, 2026-08-09.
   *
   * @throws when a listed work package's owner id names no account.
   */
  async listFor(userId: string): Promise<WorkPackageWithAccess[]> {
    return await this.listOrdered(userId, null, null);
  }

  /**
   * {@link listFor} confined to one organization's work packages.
   *
   * Proof: dropping the organization predicate made `lists only the active
   * organization's workPackages` in `work-package-organization.controller.db.test.ts`
   * list the foreign work package; watched 2026-09-27.
   */
  async listForInOrganization(
    userId: string,
    organizationId: string,
  ): Promise<WorkPackageWithAccess[]> {
    return await this.listOrdered(userId, organizationId, null);
  }

  /** Concrete observation projection: authority-selected IDs constrain SQL before private decoding. */
  async listReadableForInOrganization(
    userId: string,
    organizationId: string,
    readableIds: readonly string[],
  ): Promise<WorkPackageWithAccess[]> {
    return await this.listOrdered(userId, organizationId, readableIds);
  }

  private async listOrdered(
    userId: string,
    organizationId: string | null,
    readableIds: readonly string[] | null,
  ): Promise<WorkPackageWithAccess[]> {
    const rows = await this.db
      .select({
        id: workPackage.id,
        settingsProjection: PACKAGE_SETTING_PROJECTION,
        abbreviation: workPackageAbbreviation.abbreviation,
        namespace: workPackageAbbreviation.namespace,
        organizationId: workPackageOrganization.organizationId,
        name: workPackage.name,
        projectId: workPackage.projectId,
        restricted: workPackage.restricted,
        estimateMethod: workPackage.estimateMethod,
        depReach: workPackage.depReach,
        estimateRounding: workPackage.estimateRounding,
        startDate: workPackage.startDate,
        solutionSlug: workPackage.solutionSlug,
        solutionUrl: workPackage.solutionUrl,
        scopedSlug: workPackageSolution.slug,
        scopedUrl: workPackageSolution.url,
        // Listed as well as read one at a time: the picker's rows are
        // `WorkPackageWithAccess`, which extends `WorkPackage`, so a settings column
        // missing here is a listing that cannot type-check rather than one that
        // quietly answers `undefined` (tasks.md 3b.2).
        optimizationEnabled: workPackage.optimizationEnabled,
        scheduleEngine: workPackage.scheduleEngine,
        scheduleObjective: workPackage.scheduleObjective,
        revision: workPackage.revision,
        createdAt: workPackage.createdAt,
        lastOpenedAt: workPackageAccess.lastOpenedAt,
        createdByName: users.username,
        // The work package's update instant (`WorkPackageWithAccess.updatedAt`): the
        // aggregate `max` ignores NULLs and answers NULL when all are NULL.
        // Proof, observed 2026-09-29: without the work-item term `answers the
        // update instant as the newest of its row, its work items and its plan
        // events` in `work-package.db.test.ts` received 10 instead of 20; without
        // the plan-event term it received 20 instead of 30.
        updateInstant: sql<unknown>`(SELECT max(instant) FROM (
          SELECT ${workPackage.updatedAt} AS instant
          UNION ALL SELECT max(${workItem.updatedAt}) FROM ${workItem}
            WHERE ${workItem.workPackageId} = ${workPackage.id}
          UNION ALL SELECT max(${planEvent.createdAt}) FROM ${planEvent}
            WHERE ${planEvent.workPackageId} = ${workPackage.id}))`,
      })
      .from(workPackage)
      .leftJoin(workPackageAbbreviation, eq(workPackageAbbreviation.workPackageId, workPackage.id))
      .leftJoin(workPackageOrganization, eq(workPackageOrganization.resourceId, workPackage.id))
      .leftJoin(
        workPackageAccess,
        and(
          eq(workPackageAccess.workPackageId, workPackage.id),
          eq(workPackageAccess.userId, userId),
        ),
      )
      .leftJoin(users, eq(users.id, workPackage.createdBy))
      .leftJoin(workPackageSolution, eq(workPackageSolution.workPackageId, workPackage.id))
      .where(
        and(
          organizationId === null
            ? undefined
            : inArray(
                workPackage.id,
                this.db
                  .select({ id: workPackageOrganization.resourceId })
                  .from(workPackageOrganization)
                  .where(eq(workPackageOrganization.organizationId, organizationId)),
              ),
          // Proof: omitting this selected-ID predicate made
          // `constructs without acquiring and lists only the current readable subset before private decoding`
          // initially return three DTOs instead of []; later hidden corruption was unreached.
          readableIds === null
            ? undefined
            : sql`${workPackage.id} IN (SELECT value FROM json_each(${JSON.stringify(readableIds)}))`,
        ),
      )
      .orderBy(desc(workPackageAccess.lastOpenedAt), desc(workPackage.createdAt));
    return rows.map(
      ({
        scopedSlug,
        scopedUrl,
        updateInstant,
        namespace,
        organizationId,
        settingsProjection,
        ...row
      }) => ({
        ...toWorkPackage(
          withCreatorName({
            ...row,
            abbreviation: decodeWorkPackageAbbreviation({
              workPackageId: row.id,
              abbreviation: row.abbreviation,
              namespace,
              organizationId,
            }).abbreviation,
          }),
          scopedSolution(scopedSlug, scopedUrl),
          projectPackageSettings(settingsProjection, row.id),
        ),
        updatedAt: storedInstant(updateInstant, row.name),
      }),
    );
  }

  /**
   * Deliberately does **not** move the work package's revision. Which screen a
   * work package is on is one account's navigation history: nobody else's read of
   * the plan differs because of it, so a write that had to be sure the plan had
   * not changed must not be defeated by somebody opening it in another tab.
   *
   * Proof: bumping the work package here fails `opening a workPackage does not move its
   * revision` in `service/revision.test.ts`.
   */
  async recordOpen(workPackageId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await this.db
        .insert(workPackageAccess)
        .values({
          userId: stamp.by,
          workPackageId,
          lastOpenedAt: stamp.at,
          ...auditOnCreate(stamp),
        })
        // The pair is the primary key, so a second open is an update rather than
        // a constraint violation — and the stamp's instant is taken as given
        // rather than maxed: the clock that saw the open happen is the one that
        // stamped the act.
        .onConflictDoUpdate({
          target: [workPackageAccess.userId, workPackageAccess.workPackageId],
          set: { lastOpenedAt: sql`excluded.last_opened_at`, ...auditOnUpdate(stamp) },
        });
    });
  }

  /**
   * {@link recordOpen} only while `organizationId` still owns the work package,
   * checked in the write's own transaction: false, and nothing recorded,
   * otherwise.
   *
   * Proof: skipping the ownership check made `records an open and a write only
   * while the organization owns the workPackage` in `work-package.db.test.ts` answer
   * true for the foreign open; watched 2026-09-27.
   */
  async recordOpenInOrganization(
    workPackageId: string,
    stamp: WriteStamp,
    organizationId: string,
  ): Promise<boolean> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx) => {
        const owned = tx
          .select({ id: workPackageOrganization.resourceId })
          .from(workPackageOrganization)
          .where(
            and(
              eq(workPackageOrganization.resourceId, workPackageId),
              eq(workPackageOrganization.organizationId, organizationId),
            ),
          )
          .get();
        if (owned === undefined) return false;
        tx.insert(workPackageAccess)
          .values({
            userId: stamp.by,
            workPackageId,
            lastOpenedAt: stamp.at,
            ...auditOnCreate(stamp),
          })
          .onConflictDoUpdate({
            target: [workPackageAccess.userId, workPackageAccess.workPackageId],
            set: { lastOpenedAt: sql`excluded.last_opened_at`, ...auditOnUpdate(stamp) },
          })
          .run();
        return true;
      });
    });
  }

  /**
   * Current readable navigation on this exact writer. Valid foreign mappings return false before
   * parent/private decoding; owned malformed targets throw. Caller admission belongs to the
   * surrounding purpose owner; this primitive evaluates actual package.read and stamps its upsert.
   * Inputs are retained before waiting, and a borrowed catalog never acquires another owner.
   */
  async recordReadableOpenInOrganization(
    workPackageId: string,
    stamp: WriteStamp,
    organizationId: string,
    principal: ScopedPrincipal,
  ): Promise<boolean> {
    // Proof: OPEN S1 (2026-11-14), Omitting the stamp copy failed
    // `retains the selected principal and stamp while an owned OPEN waits for its Gate`
    // at the changed-account/99 UPSERT foreign key; whole stamp retention, with later row assertions unreached.
    stamp = { by: stamp.by, at: stamp.at };
    // Proof: OPEN S2 (2026-11-14), Omitting the principal clone failed
    // `retains the selected principal and stamp while an owned OPEN waits for its Gate`
    // with false instead of true after held mutation; whole principal retention, not issuedAt independently.
    principal = structuredClone(principal);
    // Proof: OPEN S3 (2026-11-14), Removing the stamp/principal check failed
    // `rejects a mismatched opening stamp before entering its real owned Gate`
    // when the UPSERT foreign-key error replaced the early mismatch; later no-Gate/write assertions unreached.
    if (stamp.by !== principal.id)
      throw new Error('opening stamp differs from the permission principal');
    const recordOpening = async (): Promise<boolean> => {
      // Proof: OPEN S7 (2026-11-14), Changing the mapping LEFT JOIN to INNER JOIN failed
      // `throws on owned malformed mapping before OPEN even without a grant, with full state unchanged`
      // because the filtered row resolved instead of rejecting; local join preservation only.
      // Proof: OPEN S8 (2026-11-14), Changing the parent LEFT JOIN to INNER JOIN failed
      // `throws on owned malformed parent before OPEN even without a grant, with full state unchanged`
      // because the filtered row resolved instead of rejecting; FK reenabled, deliberate parent corruption retained.
      const row = this.db
        .all<PackageTargetRecord>(
          sql`
        SELECT wp.id AS package_id, mapping.organization_id, wp.project_id,
               parent.id AS parent_id, parent.organization_id AS parent_organization_id,
               (SELECT actual_owner.id FROM organization actual_owner WHERE actual_owner.id =
                 (SELECT organization_id FROM work_package_organization WHERE resource_id = wp.id)) AS actual_organization_id,
               parent.space_id AS space_id,
               (SELECT selected_space.id FROM space selected_space WHERE selected_space.id = parent.space_id) AS actual_space_id,
               (SELECT selected_space.organization_id FROM space selected_space WHERE selected_space.id = parent.space_id) AS space_organization_id,
               wp.restricted
        FROM work_package wp
        LEFT JOIN work_package_organization mapping ON mapping.resource_id = wp.id
        LEFT JOIN project parent ON parent.id = wp.project_id
        WHERE wp.id = ${workPackageId}`,
        )
        .at(0);
      // Proof: OPEN S4 (2026-11-14), Removing the absent-row return failed
      // `conceals absent, foreign and owned unreadable OPEN targets without any physical write`
      // with row.organization_id TypeError on its first absent arm; later opacity/state assertions unreached.
      if (row === undefined) return false;
      // Proof: OPEN S5 (2026-11-14), Comparing the raw mapping instead of validating it failed
      // `throws on owned malformed mapping before OPEN even without a grant, with full state unchanged`
      // because joined SQL NULL resolved as foreign instead of rejecting; later state equality unreached.
      const actualOrganization = readPackageOrganization(workPackageId, row.organization_id);
      // Proof: OPEN S6 (2026-11-14), Removing the foreign-mapping return failed
      // `keeps a valid foreign mapping opaque before malformed parent and restriction decoding`
      // at the parent diagnostic before false returned; restriction decoding and later state equality unreached.
      if (actualOrganization !== organizationId) return false;
      const target = readPackageTargetRow(row);
      const permission = await authorize(
        new AccessDecisionRepository(this.db),
        principal,
        target,
        'package.read',
      );
      // Proof: OPEN S9 (2026-11-14), Removing this permission refusal failed
      // `records a readable viewer opening but conceals a restricted unreadable opening exactly as absent`
      // at hidden204 versus absent404 after real readable/absent controls; later hidden state equality unreached.
      if (!permission.ok) return false;
      this.db
        .insert(workPackageAccess)
        .values({
          userId: stamp.by,
          workPackageId,
          lastOpenedAt: stamp.at,
          ...auditOnCreate(stamp),
        })
        .onConflictDoUpdate({
          target: [workPackageAccess.userId, workPackageAccess.workPackageId],
          set: { lastOpenedAt: sql`excluded.last_opened_at`, ...auditOnUpdate(stamp) },
        })
        .run();
      return true;
    };
    // Proof: OPEN S10 (2026-11-14), Removing the borrowed branch failed
    // `keeps a borrowed OPEN inside the existing transaction without another Gate or native transaction`
    // with the supplied Gate error; the fixture manually rolled back, no nested-transaction necessity claim.
    if (this.writeScope === 'borrowed') return await recordOpening();
    // Proof: OPEN P1 (2026-11-14), Bypassing the supplied Gate failed
    // `retains the selected principal and stamp while an owned OPEN waits for its Gate`
    // when the actual operation settled before Gate entry; owner binding only, not request enqueue or atomicity.
    return await this.gate.enter(async () => {
      const transaction = drizzleOuterTransaction(this.db);
      // Proof: OPEN P2 (2026-11-14), Omitting BEGIN failed
      // `records and restamps only navigation access for a real current package viewer without edit permission`
      // with COMMIT then ROLLBACK no-active-transaction errors; UPSERT may autocommit, later assertions unreached.
      transaction.begin();
      let outcome:
        | { readonly ok: true; readonly recorded: boolean }
        | { readonly ok: false; readonly cause: unknown };
      try {
        const recorded = await recordOpening();
        // Proof: OPEN P3 (2026-11-14), Omitting COMMIT failed
        // `records and restamps only navigation access for a real current package viewer without edit permission`
        // at independent access-row visibility after true returned; fixed query-only close contract, later restamp assertions unreached.
        transaction.commit();
        outcome = { ok: true, recorded };
      } catch (cause: unknown) {
        outcome = { ok: false, cause };
      }
      if (!outcome.ok) {
        let rollbackFailure: { readonly cause: unknown } | undefined;
        try {
          // Proof: OPEN P4 (2026-11-14), Omitting the rollback call failed
          // `retains the actual access error and an independently failed owned rollback before manual repair`
          // at missing AggregateError because rollback injection was not invoked; fixture manual repair ran, no earlier-write rollback claim.
          transaction.rollback();
        } catch (cause: unknown) {
          rollbackFailure = { cause };
        }
        // Proof: OPEN S11 (2026-11-14), Dropping the paired-error AggregateError branch failed
        // `retains the actual access error and an independently failed owned rollback before manual repair`
        // at missing AggregateError after rejected=true; fixture manual repair ran, later error/cause comparisons unreached.
        if (rollbackFailure !== undefined)
          throw new AggregateError(
            [outcome.cause, rollbackFailure.cause],
            'work package opening and rollback failed',
            { cause: outcome.cause },
          );
        throw outcome.cause;
      }
      return outcome.recorded;
    });
  }

  async update(
    id: string,
    patch: WorkPackagePatch,
    stamp: WriteStamp,
  ): Promise<WorkPackage | null | 'abbreviation_taken'> {
    try {
      return await this.write(id, patch, stamp, null);
    } catch (refused) {
      if (isUniqueViolation(refused, UNIQUE_INDEXES.workPackageAbbreviation))
        return 'abbreviation_taken';
      throw refused;
    }
  }

  /**
   * Rechecks current principal grants and membership in the owning write
   * transaction. Missing, foreign and invisible work packages answer null; readable
   * settings denials answer forbidden. Only an authorized exact flag-clear
   * recovery writes an audit alongside the update. The detached editor
   * principal is retained before its queued owner; compatibility labels supply no authority.
   *
   * The ownership predicate remains in the UPDATE itself, so a target outside
   * the addressed organization is left unchanged.
   *
   * Proof: dropping the predicate made `records an open and a write only while
   * the organization owns the workPackage` in `work-package.db.test.ts` answer the
   * renamed foreign work package instead of null; watched 2026-09-27.
   *
   * Historical proof, each watched 2026-09-27: skipping the audit insert made `recovers
   * a restricted workPackage as an audited super-admin edit` in
   * `work-package-organization.controller.db.test.ts` find no record; classifying
   * from the caller's earlier read instead of in the transaction made
   * `audits a recovery the workPackage became after the request read it` in
   * `organization-audit.db.test.ts` write without a record; skipping the
   * refusal made `refuses an actor who is no longer a writing member` write
   * the work package; and continuing past a failed audit insert made `rolls the
   * edit back when its audit record cannot be written` keep the rename.
   */
  async editInOrganization(
    id: string,
    patch: WorkPackagePatch,
    stamp: WriteStamp,
    organizationId: string,
    editor: {
      readonly actorId: string;
      readonly auditId: string;
      readonly principal: ScopedPrincipal;
    },
  ): Promise<WorkPackage | null | 'forbidden' | 'solution_taken' | 'abbreviation_taken'> {
    editor = {
      ...editor,
      principal: structuredClone({
        id: editor.principal.id,
        authentication: editor.principal.authentication,
      }),
    };
    try {
      if (this.writeScope === 'borrowed')
        return await this.write(id, patch, stamp, organizationId, editor);
      return await this.gate.enter(async () => {
        const transaction = drizzleOuterTransaction(this.db);
        transaction.begin();
        try {
          const written = await new WorkPackageRepository(this.db, OPEN, 'borrowed').write(
            id,
            patch,
            stamp,
            organizationId,
            editor,
          );
          transaction.commit();
          return written;
        } catch (failure) {
          try {
            transaction.rollback();
          } catch (rollbackFailure) {
            throw new AggregateError(
              [failure, rollbackFailure],
              'work package edit and rollback failed',
              { cause: rollbackFailure },
            );
          }
          throw failure;
        }
      });
    } catch (refused) {
      // The modeled refusals, raised inside the transaction so it rolls back.
      if (refused instanceof EditRefused) return 'forbidden';
      if (refused instanceof SolutionTaken) return 'solution_taken';
      // Proof: bypassing this translation made mounted `duplicate manual edit is a typed conflict` return 500 instead of 409 (2026-10-22).
      if (isUniqueViolation(refused, UNIQUE_INDEXES.workPackageAbbreviation))
        return 'abbreviation_taken';
      throw refused;
    }
  }

  private async write(
    id: string,
    patch: WorkPackagePatch,
    stamp: WriteStamp,
    organizationId: string | null,
    editor: {
      readonly auditId: string;
      readonly actorId: string;
      readonly principal: ScopedPrincipal;
    } | null = null,
  ): Promise<WorkPackage | null> {
    const addressed =
      organizationId === null
        ? eq(workPackage.id, id)
        : and(
            eq(workPackage.id, id),
            inArray(
              workPackage.id,
              this.db
                .select({ id: workPackageOrganization.resourceId })
                .from(workPackageOrganization)
                .where(eq(workPackageOrganization.organizationId, organizationId)),
            ),
          );
    return await this.gate.enter(async () => {
      let authorization: { recovery: boolean } | null = null;
      if (editor !== null && organizationId !== null) {
        if (editor.principal.id !== editor.actorId)
          throw new Error('work package editor principal differs from its actor');
        const current = readSettingTargetIn(this.db, { level: 'work_package', id }, organizationId);
        if (current === null) return null;
        const decision = await authorizePackageSettings(
          new AccessDecisionRepository(this.db),
          editor.principal,
          current,
          patch,
        );
        // Proof: raw-work-package-current-denial skipped this guard; 'refuses a readable work package without settings permission in the independent writer' returned a written work package instead of forbidden (work-package.db.test.ts); restored GREEN, 2026-11-09.
        if (!decision.ok) {
          // Proof: raw-work-package-hidden-decision removed this arm and 'conceals an owned hidden work package exactly like an absent target in the independent writer' received forbidden instead of null (work-package.db.test.ts); restored GREEN, 2026-11-09.
          if (decision.reason === 'not_found') return null;
          throw new EditRefused();
        }
        authorization = decision;
      }
      // An empty patch would make drizzle emit `SET` with no assignments, which
      // SQLite rejects — so a request that changes nothing reads instead.
      // Read off the patch rather than from a list of its fields: the list was
      // one line per `WorkPackagePatch` key, and a key added without a line here is a
      // patch that silently reads instead of writing. `Object.values` cannot
      // forget a field (tasks.md 3b.2, which added three at once).
      if (Object.values(patch).every((value) => value === undefined)) {
        return organizationId === null
          ? this.findById(id)
          : this.findInOrganization(id, organizationId);
      }
      const { abbreviation, solutionRef, pertWeights, timezone, budgetFactor, ...fields } = patch;
      if (budgetFactor !== undefined)
        throw new Error('budgetFactor is writable only at project settings');
      // The bump rides in the same `SET` as the change it describes, so a patch
      // that lands without moving the revision is not a state this can reach.
      const updates = {
        ...fields,
        // The triple is written as a triple or not at all: a patch holding one
        // weight would leave the other two as they were, and the divisor is
        // their sum — half an answer is a different arithmetic rather than a
        // partial one. `WorkPackagePatch` carries them as one object for that
        // reason, and this is where it becomes three columns.
        // Scalar settings below are committed in setting_value on this same writer.
        // A scoped link moves to `work_package_solution` below, and a legacy pair
        // the work package held is cleared, so it never holds both.
        // Proof: leaving the pair made `moves a legacy pair into the
        // organization link, relinks and unlinks` in
        // `work-package-solution.db.test.ts` throw on the read back; watched
        // 2026-09-28.
        ...(solutionRef === undefined
          ? {}
          : {
              solutionSlug: organizationId === null ? (solutionRef?.slug ?? null) : null,
              solutionUrl: organizationId === null ? (solutionRef?.url ?? null) : null,
            }),
        revision: bumpedWorkPackage,
      };
      return this.db.transaction(
        (tx) => {
          const edit = authorization?.recovery === true ? 'recovery' : 'ordinary';
          if (abbreviation !== undefined) {
            const current = readWorkPackageAbbreviation(tx, id);
            if (current === undefined) return null;
            if (
              abbreviation === current.abbreviation &&
              Object.entries(patch).every(
                ([key, value]) => key === 'abbreviation' || value === undefined,
              )
            ) {
              const reread = tx
                .select(WITH_SOLUTION)
                .from(workPackage)
                .leftJoin(
                  workPackageAbbreviation,
                  eq(workPackageAbbreviation.workPackageId, workPackage.id),
                )
                .leftJoin(
                  workPackageOrganization,
                  eq(workPackageOrganization.resourceId, workPackage.id),
                )
                .leftJoin(
                  workPackageSolution,
                  eq(workPackageSolution.workPackageId, workPackage.id),
                )
                .where(addressed)
                .get();
              return reread === undefined
                ? null
                : fromJoined(
                    reread,
                    projectPackageSettings(reread.settingsProjection, reread.workPackage.id),
                  );
            }
          }
          // After authorization, so only a writer learns that a slug is in use,
          // and only among its own organization's work packages. The write lock is
          // held since `BEGIN IMMEDIATE`, so no other process can take the slug
          // between this read and the insert below.
          // Proof, watched 2026-09-28 in `work-package-solution.db.test.ts`: skipping
          // this check made `refuses a slug another workPackage of the organization
          // holds` throw SQLite's uniqueness error instead of answering
          // `solution_taken`, and dropping the legacy arm made `refuses a slug a
          // work package of the organization kept from before activation` link it.
          if (organizationId !== null && solutionRef != null) {
            const holder = tx
              .select({ id: workPackage.id })
              .from(workPackage)
              .innerJoin(
                workPackageOrganization,
                and(
                  eq(workPackageOrganization.resourceId, workPackage.id),
                  eq(workPackageOrganization.organizationId, organizationId),
                ),
              )
              .leftJoin(workPackageSolution, eq(workPackageSolution.workPackageId, workPackage.id))
              .where(
                and(
                  ne(workPackage.id, id),
                  or(
                    eq(workPackageSolution.slug, solutionRef.slug),
                    eq(workPackage.solutionSlug, solutionRef.slug),
                  ),
                ),
              )
              .get();
            if (holder !== undefined) throw new SolutionTaken();
          }
          // Claim the ON→OFF edge with a write, not a read followed by a write.
          // Two backend processes can PATCH one SQLite file during a blue/green
          // swap; the conditional UPDATE serializes them so exactly one advances
          // every release's cancellation epoch.
          let updated =
            patch.optimizationEnabled === false
              ? tx
                  .update(workPackage)
                  .set({ ...updates, ...auditOnUpdate(stamp) })
                  .where(and(addressed, eq(workPackage.optimizationEnabled, true)))
                  .returning()
                  .all()
                  .at(0)
              : undefined;
          const turnedOff = updated !== undefined;
          // Proof: removing auditOnUpdate here made mounted `abbreviation-only edits stamp the parent workPackage audit and revision` retain updated_at=1 (2026-10-22).
          updated ??= tx
            .update(workPackage)
            .set({ ...updates, ...auditOnUpdate(stamp) })
            .where(addressed)
            .returning()
            .all()
            .at(0);
          if (updated === undefined) return null;
          if (abbreviation !== undefined) writeWorkPackageAbbreviation(tx, id, abbreviation);
          if (organizationId !== null && solutionRef !== undefined) {
            tx.delete(workPackageSolution).where(eq(workPackageSolution.workPackageId, id)).run();
            if (solutionRef !== null)
              tx.insert(workPackageSolution)
                .values({ workPackageId: id, organizationId, ...solutionRef })
                .run();
          }
          if (edit === 'recovery' && editor !== null && organizationId !== null) {
            const detail: RecoveryAuditDetail = {
              fields: Object.entries(patch)
                .filter(([, value]) => value !== undefined)
                .map(([field]) => field)
                .sort(),
            };
            recordRecovery(tx, {
              id: editor.auditId,
              organizationId,
              actorId: editor.actorId,
              workPackageId: id,
              detail,
              at: stamp.at,
            });
          }

          if (turnedOff) {
            tx.update(optimizationGeneration)
              .set({
                cancelEpoch: sql`${optimizationGeneration.cancelEpoch} + 1`,
                updatedAt: stamp.at,
              })
              .where(eq(optimizationGeneration.workPackageId, id))
              .run();
            tx.update(solverSlot)
              .set({ cancelRequestedAt: stamp.at })
              .where(eq(solverSlot.workPackageId, id))
              .run();
            tx.delete(solverQueue).where(eq(solverQueue.workPackageId, id)).run();
          }
          // Proof: without this cleanup, `turns optimization off as an idempotent
          // work-package-scoped cancellation` leaves both epochs, slots and queues live.
          // Read again rather than decoded from `RETURNING`, which cannot carry
          // the `work_package_solution` link written above.
          const settingsTarget = readSettingTargetIn(
            tx,
            { level: 'work_package', id },
            organizationId,
          );
          if (settingsTarget === null)
            throw new Error('settings target vanished inside its writer');
          for (const change of [
            ...(timezone === undefined ? [] : [{ key: 'timezone' as const, value: timezone }]),
            ...(pertWeights === undefined
              ? []
              : [{ key: 'pertWeights' as const, value: pertWeights }]),
          ]) {
            const settingWritten = writeSettingIn(tx, settingsTarget, change, stamp);
            if (!settingWritten.ok)
              throw new Error('validated package setting refused: ' + settingWritten.reason);
          }
          const reread = tx
            .select(WITH_SOLUTION)
            .from(workPackage)
            .leftJoin(
              workPackageAbbreviation,
              eq(workPackageAbbreviation.workPackageId, workPackage.id),
            )
            .leftJoin(
              workPackageOrganization,
              eq(workPackageOrganization.resourceId, workPackage.id),
            )
            .leftJoin(workPackageSolution, eq(workPackageSolution.workPackageId, workPackage.id))
            .where(eq(workPackage.id, id))
            .get();
          if (reread === undefined)
            throw new Error(`work package ${id} vanished inside its transaction`);
          return fromJoined(
            reread,
            projectPackageSettings(reread.settingsProjection, reread.workPackage.id),
          );
        },
        // A scoped write reads the organization's slugs before it writes one.
        // Proof: a deferred transaction made `answers solution_taken to a link
        // racing another process, writing nothing` in
        // `work-package-solution.db.test.ts` fail on SQLite's busy snapshot;
        // watched 2026-09-28.
        organizationId === null ? undefined : { behavior: 'immediate' },
      );
    });
  }

  /**
   * Changes only the addressed current package's explicit unit. Same-unit writes
   * are no-ops even with estimates; a changed unit counts only actual estimates
   * owned by this package, so a shared definition's sibling facts never veto it.
   * Count and update share the supplied immediate writer/UoW; no default or
   * retained unbound row can supply current membership.
   */
  async setStepUnit(
    workPackageId: string,
    stepId: string,
    unit: EstimateUnit,
    stamp: WriteStamp,
  ): Promise<StepUnitWritten> {
    const act = { ...stamp };
    return await this.gate.enter(async () => {
      return await Promise.resolve(
        this.db.transaction(
          (tx): StepUnitWritten => {
            const selected = readCatalogueStepsIn(tx, workPackageId).find(
              (entry) => entry.id === stepId,
            );
            if (selected === undefined) return { ok: false, reason: 'not_found' };
            const held = readPackageValuesIn(tx, workPackageId, stepId);
            if (held.estimateUnit === unit) return { ok: true, step: selected };
            const holdings = tx
              .select({ count: count() })
              .from(estimate)
              .innerJoin(workItem, eq(workItem.id, estimate.workItemId))
              .where(and(eq(workItem.workPackageId, workPackageId), eq(estimate.stepId, stepId)))
              .get();
            if (holdings === undefined) throw new Error('package estimate count returned no row');
            if (holdings.count > 0)
              return { ok: false, reason: 'estimates_present', count: holdings.count };
            const written = tx
              .update(workPackageStep)
              .set({ estimateUnit: unit })
              .where(
                and(
                  eq(workPackageStep.workPackageId, workPackageId),
                  eq(workPackageStep.stepId, stepId),
                ),
              )
              .returning({
                workPackageId: workPackageStep.workPackageId,
                stepId: workPackageStep.stepId,
                estimateUnit: workPackageStep.estimateUnit,
                allowanceBps: sql<unknown>`${workPackageStep.allowancePercent}`,
                allowanceRevision: sql<unknown>`${workPackageStep.allowanceRevision}`,
              })
              .all()
              .at(0);
            // Proof: unit-return-selection breaks .at(0) to .at(1); the real
            // healthy RETURNING write throws WorkPackageStepMissing. The actual
            // ignored-update trigger also preserves the named absence boundary.
            if (written === undefined) throw new WorkPackageStepMissing(workPackageId, stepId);
            const values = readPackageStepValues(written, workPackageId, stepId);
            bumpWorkPackage(tx, workPackageId, act);
            return { ok: true, step: { ...selected, estimateUnit: values.estimateUnit } };
          },
          this.writeScope === 'owned' ? { behavior: 'immediate' } : undefined,
        ),
      );
    });
  }

  /**
   * Reads the held allowance and writes the new one inside one transaction, so
   * the `previousPercent` a journal entry carries is the value this write
   * replaced, and the revision it answers is the one the write left. Only the
   * selected package's explicit values change; global definition defaults and
   * sibling packages remain untouched. Unbound retained rows are not current steps.
   *
   * Historical pre-catalogue proof: with the revision increment removed, `moves the step’s allowance
   * revision on every write, even back to a value it held` failed: the
   * revision stayed at 0 (2026-09-27).
   */
  async setStepAllowance(
    workPackageId: string,
    stepId: string,
    allowancePercent: AllowancePercent,
    stamp: WriteStamp,
  ): Promise<StepAllowanceWritten> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx): StepAllowanceWritten => {
        const selected = readCatalogueStepsIn(tx, workPackageId).find(
          (entry) => entry.id === stepId,
        );
        if (selected === undefined) return { ok: false, reason: 'not_found' };
        const held = readPackageValuesIn(tx, workPackageId, stepId);
        const written = tx
          .update(workPackageStep)
          .set({
            allowancePercent,
            allowanceRevision: sql`${workPackageStep.allowanceRevision} + 1`,
          })
          .where(
            and(
              eq(workPackageStep.workPackageId, workPackageId),
              eq(workPackageStep.stepId, stepId),
            ),
          )
          .returning({
            workPackageId: workPackageStep.workPackageId,
            stepId: workPackageStep.stepId,
            estimateUnit: workPackageStep.estimateUnit,
            allowanceBps: sql<unknown>`${workPackageStep.allowancePercent}`,
            allowanceRevision: sql<unknown>`${workPackageStep.allowanceRevision}`,
          })
          .all()
          .at(0);
        // Proof: allowance-return-selection breaks .at(0) to .at(1); the real
        // healthy allowance update throws at this named absence boundary.
        if (written === undefined) throw new WorkPackageStepMissing(workPackageId, stepId);
        const values = readPackageStepValues(written, workPackageId, stepId);
        bumpWorkPackage(tx, workPackageId, stamp);
        return {
          ok: true,
          step: { ...selected, allowancePercent: values.allowancePercent },
          previousPercent: held.allowancePercent,
          revision: values.allowanceRevision,
        };
      });
    });
  }

  async timezoneOf(workPackageId: string): Promise<string | null> {
    const target = readSettingTargetIn(this.db, { level: 'work_package', id: workPackageId }, null);
    return Promise.resolve(
      target === null ? null : resolvePackageSettingsIn(this.db, workPackageId).timezone,
    );
  }

  /** Writes a package override and its revision atomically; no project/ancestor mutation. */
  async setTimezone(workPackageId: string, timezone: string, stamp: WriteStamp): Promise<boolean> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx) => {
        const target = readSettingTargetIn(tx, { level: 'work_package', id: workPackageId }, null);
        if (target === null) return false;
        const changed = writeSettingIn(tx, target, { key: 'timezone', value: timezone }, stamp);
        if (!changed.ok) throw new Error('invalid internal timezone override: ' + changed.reason);
        tx.update(workPackage)
          .set({ revision: bumpedWorkPackage, ...auditOnUpdate(stamp) })
          .where(eq(workPackage.id, workPackageId))
          .run();
        return true;
      });
    });
  }

  async stepAllowanceRevisions(workPackageId: string): Promise<ReadonlyMap<string, number>> {
    return await Promise.resolve(
      this.db.transaction((tx) => {
        const selected = readCatalogueStepsIn(tx, workPackageId);
        return new Map(
          selected.map((entry) => [
            entry.id,
            readPackageValuesIn(tx, workPackageId, entry.id).allowanceRevision,
          ]),
        );
      }),
    );
  }

  /**
   * The work package's steps, in step order — the same order and the same reason as
   * {@link StepRepository.listByWorkPackage}, which this does not replace: the
   * schedule reads its step order through here.
   *
   * Historical proof for the old step-table query: with the `orderBy` removed, `reads the same order through the
   * workPackage, which is where the schedule asks` fails with `Analysis, Dev, QA`
   * — SQLite answers this from the `(work_package_id, name)` index; watched
   * 2026-08-09.
   */
  stepsOf(workPackageId: string): Promise<Step[]> {
    return new StepRepository(this.db, OPEN).listByWorkPackage(workPackageId);
  }
}

/** Reads the complete explicit package values on the supplied snapshot, without a definition-default fallback. */
function readPackageValuesIn(
  db: Pick<SQLiteBunDatabase, 'select'>,
  workPackageId: string,
  stepId: string,
) {
  const row = db
    .select({
      workPackageId: workPackageStep.workPackageId,
      stepId: workPackageStep.stepId,
      estimateUnit: workPackageStep.estimateUnit,
      allowanceBps: sql<unknown>`${workPackageStep.allowancePercent}`,
      allowanceRevision: sql<unknown>`${workPackageStep.allowanceRevision}`,
    })
    .from(workPackageStep)
    .where(
      and(eq(workPackageStep.workPackageId, workPackageId), eq(workPackageStep.stepId, stepId)),
    )
    .get();
  if (row === undefined) throw new WorkPackageStepMissing(workPackageId, stepId);
  return readPackageStepValues(row, workPackageId, stepId);
}

type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];

/** Appends one recovery record to `tx`, so it commits or rolls back with the write. */
export function recordRecovery(
  tx: Transaction,
  record: {
    id: string;
    organizationId: string;
    actorId: string;
    workPackageId: string;
    detail: RecoveryAuditDetail;
    at: number;
  },
): void {
  tx.insert(organizationAudit)
    .values({
      id: record.id,
      organizationId: record.organizationId,
      actorId: record.actorId,
      action: 'restricted_work_package_recovery',
      subjectKind: 'work_package',
      subjectId: record.workPackageId,
      detail: JSON.stringify(record.detail),
      createdAt: record.at,
    })
    .run();
}

/** A readable organization edit refused by its current grant check; rolls back the write. */
class EditRefused extends Error {
  constructor() {
    super('the edit is not permitted to this member now');
    this.name = 'EditRefused';
  }
}

/** A scoped link naming a slug another work package of the organization holds; rolls the write back. */
class SolutionTaken extends Error {
  constructor() {
    super('another work package of this organization holds that solution slug');
    this.name = 'SolutionTaken';
  }
}
