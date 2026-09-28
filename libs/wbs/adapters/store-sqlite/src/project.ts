import type {
  NewProject,
  Project,
  ProjectCrossReference,
  ProjectPatch,
  ProjectStore,
  ProjectWithAccess,
  RecoveryAuditDetail,
  Step,
  StepAllowanceWritten,
  WriteStamp,
} from '@wbs/core';
import {
  type AllowancePercent,
  classifyProjectEdit,
  type DependencyReach,
  type EstimateMethod,
  type EstimateRounding,
  isDependencyReach,
  isEstimateMethod,
  isEstimateRounding,
  ORGANIZATION_ROLES,
  type OrganizationRole,
  PertWeights,
} from '@wbs/domain';
import { type } from '@wbs/validation';
import { and, desc, eq, inArray, ne, or, type SQL, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import {
  auditOnCreate,
  auditOnCreateBesidesCreatedAt,
  auditOnUpdate,
  withoutAuditColumns,
} from './audit';
import type { Gate } from './gate';
import { isScheduleEngine, isSolverObjective, unknownStoredValue } from './optimizer-rows';
import { bumpedProject, bumpProject } from './revision';
import {
  optimizationGeneration,
  organizationAudit,
  organizationMembership,
  project,
  projectAccess,
  projectOrganization,
  projectSolution,
  type ScheduleEngine,
  type SolverObjectiveName,
  solverQueue,
  solverSlot,
  step,
  users,
} from './schema';
import { STEP_COLUMNS } from './step';

/**
 * One {@link PertWeights} as the three columns that hold it.
 *
 * Written once and used by both the insert and the update, so a project created
 * with weights and a project patched to them cannot land in different columns.
 */
function weightColumns(weights: PertWeights): {
  pertWeightOptimistic: number;
  pertWeightRealistic: number;
  pertWeightPessimistic: number;
} {
  return {
    pertWeightOptimistic: weights.optimistic,
    pertWeightRealistic: weights.realistic,
    pertWeightPessimistic: weights.pessimistic,
  };
}

/**
 * A stored row as a {@link Project}, checking the two columns SQLite cannot
 * constrain.
 *
 * `estimate_method` is text, so the database will hold `median` as happily as
 * `pert`. Reading one is malformed trusted data and it throws rather than
 * falling back to PERT: a project silently planned by a method nobody chose is
 * a wrong answer delivered confidently, and R5 exists to stop exactly that.
 *
 * `dep_reach` is the same shape of column and the same refusal. Its two values
 * differ by every date behind a multi-step predecessor, so reading an
 * unrecognised one as `whole-item` would schedule a plan by a rule nobody
 * chose and say nothing about it. The case is not hypothetical: an older colour
 * reading a value a newer release wrote arrives here mid-swap.
 *
 * `estimate_rounding` and the three `pert_weight_*` columns are the same
 * refusal a third and fourth time, and the weights are checked as a **triple**
 * rather than one column at a time: a single weight says nothing on its own,
 * and what makes a set of them unusable is a property of all three — they must
 * sum to a finite number above zero to divide by. `PertWeights`'s own narrow is
 * that rule, so this boundary and the PATCH boundary refuse the same triples
 * without either restating the arithmetic.
 *
 * Proof: with the two guards replaced by casts, `refuses a stored rounding it
 * does not know` failed on `expected [Function] to throw` — a project rounding
 * by `nearest` read back happily, and `roundDays` then charged every step by
 * `ceil` because that is its last branch; watched 2026-08-30, with `refuses
 * stored weights that cannot average a triple` failing beside it on the same
 * assertion.
 */
/**
 * Columns of `project` that are stored and never published.
 *
 * `optimizationDeletePendingAt` is the optimizer drain's cross-process fence
 * (tasks.md 3.1b): internal state, not a field of a project, and no boundary
 * returns it.
 */
const INTERNAL_PROJECT_COLUMNS = ['optimizationDeletePendingAt'] as const;

/**
 * What a project created without stating its settings gets — the same three
 * values `20260904140000_add_project_settings` writes into its `ADD COLUMN`
 * defaults (tasks.md 3b.1, 3b.2).
 *
 * Two statements of one fact, which is a drift risk and is therefore proved
 * rather than trusted: `create` writes these explicitly instead of omitting the
 * columns, and `a project created without settings agrees with the columns'
 * own defaults` in `project.db.test.ts` inserts a row **around** this constant
 * and reads both back. If the migration and this list ever disagree, that case
 * is the one that says so.
 *
 * OFF, `fast` and `pri` are not arbitrary: OFF is what makes an existing
 * project spend no solver time on deploy, and `fast`/`pri` are the engine and
 * the order every plan already had, so a project created today schedules
 * exactly as it did yesterday.
 */
const DEFAULT_PROJECT_SETTINGS = {
  enabled: false,
  engine: 'fast',
  objective: 'pri',
} as const satisfies { enabled: boolean; engine: ScheduleEngine; objective: SolverObjectiveName };

/**
 * A row with {@link INTERNAL_PROJECT_COLUMNS} taken off, for
 * {@link withoutAuditColumns}' reason and by its method.
 *
 * {@link toProject} is generic over its row and spreads whatever is left of it,
 * so a column added to `project` is published **by default** and has to be
 * taken off deliberately — the trap `createdBy` sprang on 2026-09-02, caught
 * both times by the same guard in `project.db.test.ts`.
 */
function withoutInternalColumns<T extends object>(
  row: T,
): Omit<T, (typeof INTERNAL_PROJECT_COLUMNS)[number]> {
  const dropped = new Set<string>(INTERNAL_PROJECT_COLUMNS);
  return Object.fromEntries(Object.entries(row).filter(([name]) => !dropped.has(name))) as Omit<
    T,
    (typeof INTERNAL_PROJECT_COLUMNS)[number]
  >;
}

/** The stored columns {@link toProject} turns into a `Project`'s fields. */
interface ProjectColumns {
  estimateMethod: string;
  depReach: string;
  estimateRounding: string;
  pertWeightOptimistic: number;
  pertWeightRealistic: number;
  pertWeightPessimistic: number;
  solutionSlug: string | null;
  solutionUrl: string | null;
  scheduleEngine: string;
  scheduleObjective: string;
  optimizationDeletePendingAt?: number | null;
}

/** A project read beside its `project_solution` link, if it has one. */
const WITH_SOLUTION = { project, solution: projectSolution };

/** A row read through {@link WITH_SOLUTION}, decoded. */
function fromJoined(row: {
  project: typeof project.$inferSelect;
  solution: typeof projectSolution.$inferSelect | null;
}) {
  return toProject(
    row.project,
    row.solution === null ? null : { slug: row.solution.slug, url: row.solution.url },
  );
}

/** A `project_solution` row as a LEFT JOIN answers it: absent, or whole. */
type ScopedSolutionRow = { slug: string; url: string } | null;

/**
 * A LEFT JOIN's two nullable `project_solution` columns as one link.
 *
 * @throws when only one of them is null, which the table's `NOT NULL`s forbid.
 */
function scopedSolution(slug: string | null, url: string | null): ScopedSolutionRow {
  if (slug === null && url === null) return null;
  if (slug === null || url === null) throw new Error('project_solution has a partial link');
  return { slug, url };
}

/**
 * The two settings columns that are stored as text and refused on the way out
 * (tasks.md 3b.2, 3b.8).
 *
 * `optimization_enabled` is not among them and needs no validator: drizzle
 * reads it through `{ mode: 'boolean' }`, so the only values it can produce are
 * `true` and `false`. Its `CHECK (optimization_enabled IN (0,1))` is what keeps
 * a `2` out of the column in the first place, and `refuses a value outside each
 * column vocabulary` in `project-settings.db.test.ts` proves that half.
 *
 * `scoped` is the project's `project_solution` link, read beside the row; it
 * becomes `solutionRef` in place of the legacy pair.
 *
 * Proof: answering the legacy pair when both were present made `refuses a
 * project holding both a legacy and a scoped reference` in
 * `project-solution.db.test.ts` read the project instead of throwing;
 * watched 2026-09-28.
 *
 * @throws when the project holds both a legacy pair and a scoped link.
 */
function toProject<T extends ProjectColumns>(
  row: T,
  scoped: ScopedSolutionRow,
  // Nested rather than one union of keys, because that is what the body
  // produces and TypeScript does not prove `Omit<Omit<T, A>, B>` equals
  // `Omit<T, A | B>` for a generic `T`.
): Omit<
  Omit<
    Omit<
      T,
      | 'estimateMethod'
      | 'depReach'
      | 'estimateRounding'
      | 'pertWeightOptimistic'
      | 'pertWeightRealistic'
      | 'pertWeightPessimistic'
      | 'solutionSlug'
      | 'solutionUrl'
      | 'scheduleEngine'
      | 'scheduleObjective'
    >,
    'createdBy' | 'updatedAt' | 'updatedBy'
  >,
  // The list rather than the one name it held until run 33, so a column added
  // to {@link INTERNAL_PROJECT_COLUMNS} is a column this signature stops
  // declaring — the body already stopped returning it.
  (typeof INTERNAL_PROJECT_COLUMNS)[number]
> & {
  estimateMethod: EstimateMethod;
  depReach: DependencyReach;
  estimateRounding: EstimateRounding;
  pertWeights: PertWeights;
  solutionRef: { slug: string; url: string } | null;
  scheduleEngine: ScheduleEngine;
  scheduleObjective: SolverObjectiveName;
} {
  const {
    estimateMethod,
    depReach,
    estimateRounding,
    pertWeightOptimistic,
    pertWeightRealistic,
    pertWeightPessimistic,
    solutionSlug,
    solutionUrl,
    scheduleEngine,
    scheduleObjective,
    ...rest
  } = row;
  if (!isEstimateMethod(estimateMethod)) {
    throw new Error(`unknown estimate method in the database: ${estimateMethod}`);
  }
  if (!isDependencyReach(depReach)) {
    throw new Error(`unknown dependency reach in the database: ${depReach}`);
  }
  if (!isEstimateRounding(estimateRounding)) {
    throw new Error(`unknown estimate rounding in the database: ${estimateRounding}`);
  }
  const weights = PertWeights({
    optimistic: pertWeightOptimistic,
    realistic: pertWeightRealistic,
    pessimistic: pertWeightPessimistic,
  });
  if (weights instanceof type.errors) {
    throw new Error(`unusable PERT weights in the database: ${weights.summary}`);
  }
  if ((solutionSlug === null) !== (solutionUrl === null)) {
    throw new Error('project has a partial solution reference');
  }
  if (scoped !== null && solutionSlug !== null) {
    throw new Error('project has both a legacy and a scoped solution reference');
  }
  if (!isScheduleEngine(scheduleEngine)) {
    throw unknownStoredValue('project', 'schedule_engine', scheduleEngine);
  }
  if (!isSolverObjective(scheduleObjective)) {
    throw unknownStoredValue('project', 'schedule_objective', scheduleObjective);
  }
  return {
    // Named by {@link withoutAuditColumns} rather than spread whole: this
    // mapper is generic over its row, so it has no column list of its own, and
    // `...rest` published `createdBy` and `updatedAt` until 2026-09-02.
    ...withoutInternalColumns(withoutAuditColumns(rest)),
    estimateMethod,
    depReach,
    estimateRounding,
    pertWeights: weights,
    solutionRef:
      scoped ??
      (solutionSlug === null || solutionUrl === null
        ? null
        : { slug: solutionSlug, url: solutionUrl }),
    scheduleEngine,
    scheduleObjective,
  };
}

/**
 * A listed row as one whose owner is known, checking the one column a LEFT JOIN
 * can leave empty.
 *
 * The join answers null in exactly one case: a `project.owner_id` naming no
 * `users` row. The foreign key says that cannot happen, so meeting it is
 * malformed trusted data — and the two ways to carry on are both wrong
 * answers delivered confidently. Dropping the project hides it from its own
 * owner's picker; blanking the name puts `( · 1 Jun)` on screen and calls the
 * list complete.
 *
 * Proof: with the throw replaced by `?? ''`, `fails the list rather than
 * answering a project whose owner is nobody` in `project.test.ts` failed —
 * `listFor` resolved with `["Orphan", ""]` beside `["Rewire the shed",
 * "owner"]`. Watched, 2026-08-09.
 */
function withOwnerName<T extends { name: string; ownerName: string | null }>(
  row: T,
): Omit<T, 'ownerName'> & { ownerName: string } {
  if (row.ownerName === null) {
    throw new Error(`project "${row.name}" has an owner id naming no account`);
  }
  // Narrowed by the check above, which is the boundary this function exists to be.
  return { ...row, ownerName: row.ownerName };
}

/**
 * `create` writes the project and its steps in one transaction. A project that
 * existed briefly without steps would accept an estimate with no step to belong
 * to, and the failure would surface later as a missing join rather than here as
 * a rejected write.
 *
 * Step name uniqueness is left to the schema index: checking first is a race
 * two concurrent additions both win.
 */
export class ProjectRepository implements ProjectStore {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  // `async` is load-bearing rather than decorative: `db.transaction` is
  // synchronous, so a constraint violation would otherwise be thrown before the
  // promise this signature advertises exists — and a caller holding it with
  // `.catch()` would never see the rejection.
  async create(
    toCreate: NewProject,
    startingSteps: readonly Step[],
    stamp: WriteStamp,
  ): Promise<Project> {
    return await this.insert(toCreate, startingSteps, stamp, null);
  }

  /**
   * {@link create} plus the project's organization mapping, in the same
   * transaction. After activation the bridge triggers map nothing, so this row
   * is the only thing that makes the new project visible to its organization.
   * Before activation the bridge has already mapped the project to the legacy
   * organization and this insert is refused by the ownership freeze: scoped
   * creation is refused rather than double-mapped.
   *
   * Proof: dropping the mapping insert made `creates a project only its own
   * organization can see` in `project-organization.controller.db.test.ts`
   * answer 404 for the creator's own read; watched 2026-09-27.
   */
  async createInOrganization(
    toCreate: NewProject,
    startingSteps: readonly Step[],
    stamp: WriteStamp,
    organizationId: string,
  ): Promise<Project> {
    return await this.insert(toCreate, startingSteps, stamp, organizationId);
  }

  private async insert(
    toCreate: NewProject,
    startingSteps: readonly Step[],
    stamp: WriteStamp,
    organizationId: string | null,
  ): Promise<Project> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      // Stated here rather than left to the column defaults, because this method
      // answers with the project it wrote and a caller comparing that answer to a
      // later read must see the same three values. Leaving them out of the INSERT
      // and guessing them in the return would be two sources for one row.
      const settings = {
        optimizationEnabled: toCreate.optimizationEnabled ?? DEFAULT_PROJECT_SETTINGS.enabled,
        scheduleEngine: toCreate.scheduleEngine ?? DEFAULT_PROJECT_SETTINGS.engine,
        scheduleObjective: toCreate.scheduleObjective ?? DEFAULT_PROJECT_SETTINGS.objective,
      };
      const written: Project = { ...toCreate, ...settings };
      this.db.transaction((tx) => {
        const { solutionRef, pertWeights, ...fields } = written;
        tx.insert(project)
          .values({
            ...fields,
            ...weightColumns(pertWeights),
            // A scoped project's link lives in `project_solution`, unique
            // within its organization. Only a legacy one uses these columns.
            solutionSlug: organizationId === null ? (solutionRef?.slug ?? null) : null,
            solutionUrl: organizationId === null ? (solutionRef?.url ?? null) : null,
            ...auditOnCreateBesidesCreatedAt(stamp),
          })
          .run();
        if (organizationId !== null) {
          tx.insert(projectOrganization).values({ resourceId: written.id, organizationId }).run();
          if (solutionRef !== null)
            tx.insert(projectSolution)
              .values({ projectId: written.id, organizationId, ...solutionRef })
              .run();
        }
        if (startingSteps.length > 0)
          tx.insert(step)
            .values(startingSteps.map((starting) => ({ ...starting, ...auditOnCreate(stamp) })))
            .run();
      });
      return written;
    });
  }

  async findById(id: string): Promise<Project | null> {
    const rows = await this.db
      .select(WITH_SOLUTION)
      .from(project)
      .leftJoin(projectSolution, eq(projectSolution.projectId, project.id))
      .where(eq(project.id, id))
      .limit(1);
    const found = rows.at(0);
    return found === undefined ? null : fromJoined(found);
  }

  /**
   * {@link findById} confined to one organization: a foreign project and an
   * absent one are both null, so no caller can tell them apart.
   *
   * Proof: dropping the organization predicate made `answers 404 alike for a
   * foreign and an absent project, and changes nothing` in
   * `project-organization.controller.db.test.ts` answer the foreign project with
   * 200; watched 2026-09-27.
   */
  async findInOrganization(id: string, organizationId: string): Promise<Project | null> {
    const rows = await this.db
      .select(WITH_SOLUTION)
      .from(project)
      .innerJoin(
        projectOrganization,
        and(
          eq(projectOrganization.resourceId, project.id),
          eq(projectOrganization.organizationId, organizationId),
        ),
      )
      .leftJoin(projectSolution, eq(projectSolution.projectId, project.id))
      .where(eq(project.id, id))
      .limit(1);
    const found = rows.at(0);
    return found === undefined ? null : fromJoined(found);
  }

  /**
   * One UNION over every relation the schedule read follows. Owners compare
   * with `IS NOT`, so an unmapped catalog entry counts as crossing: after
   * activation nothing may be read that the organization does not own.
   *
   * Proof: each arm but `work_item_parent` removed alone failed its own
   * `fails the schedule read closed over a crossing <kind>` case in
   * `schedule-organization.controller.db.test.ts`; watched 2026-09-27. The
   * tree read already throws on a parent outside the project, so that mounted
   * case answers 500 either way; removing the parent arm instead failed
   * `reports a work item whose parent lies in another project` in
   * `project.db.test.ts`.
   */
  async findCrossReferences(
    projectId: string,
    organizationId: string,
  ): Promise<readonly ProjectCrossReference[]> {
    await Promise.resolve();
    const p = projectId;
    const o = organizationId;
    const ownerOf = (side: string, column: string) =>
      sql.raw(`(SELECT organization_id FROM ${side} WHERE resource_id = ${column})`);
    const stepRow = (table: string, kind: string, id: string) => sql`
      SELECT ${kind} AS kind, ${sql.raw(id)} AS id FROM ${sql.raw(table)} AS l
        JOIN work_item AS w ON w.id = l.work_item_id JOIN step AS st ON st.id = l.step_id
        WHERE w.project_id = ${p} AND st.project_id IS NOT ${p}`;
    const catalogLink = (
      table: string,
      column: string,
      side: string,
      kind: string,
      id: string,
    ) => sql`
      SELECT ${kind} AS kind, ${sql.raw(id)} AS id FROM ${sql.raw(table)} AS l
        JOIN work_item AS w ON w.id = l.work_item_id
        WHERE w.project_id = ${p} AND ${ownerOf(side, `l.${column}`)} IS NOT ${o}`;
    const arms = [
      stepRow('estimate', 'estimate_step', "l.work_item_id || '/' || l.step_id"),
      stepRow('actual', 'actual_step', "l.work_item_id || '/' || l.step_id"),
      stepRow('step_progress', 'step_progress_step', "l.work_item_id || '/' || l.step_id"),
      stepRow(
        'step_measure',
        'step_measure_step',
        "l.work_item_id || '/' || l.step_id || '/' || l.metric",
      ),
      stepRow(
        'assignment',
        'assignment_step',
        "l.work_item_id || '/' || l.step_id || '/' || l.person_id",
      ),
      catalogLink(
        'assignment',
        'person_id',
        'person_organization',
        'assignment_person',
        "l.work_item_id || '/' || l.step_id || '/' || l.person_id",
      ),
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
        WHERE w.project_id = ${p} AND w.service_team_id IS NOT NULL
          AND ${ownerOf('service_team_organization', 'w.service_team_id')} IS NOT ${o}`,
      sql`SELECT 'work_item_service' AS kind, w.id AS id FROM work_item AS w
        WHERE w.project_id = ${p} AND w.service_id IS NOT NULL
          AND ${ownerOf('service_organization', 'w.service_id')} IS NOT ${o}`,
      sql`SELECT 'work_item_parent' AS kind, w.id AS id FROM work_item AS w
        JOIN work_item AS parent ON parent.id = w.parent_id
        WHERE w.project_id = ${p} AND parent.project_id IS NOT ${p}`,
      sql`SELECT 'dependency_endpoint' AS kind, d.id AS id FROM dependency AS d
        JOIN work_item AS pre ON pre.id = d.predecessor_id JOIN work_item AS suc ON suc.id = d.successor_id
        WHERE d.project_id = ${p} AND (pre.project_id IS NOT ${p} OR suc.project_id IS NOT ${p})`,
      sql`SELECT 'project_team_capacity' AS kind, c.service_team_id AS id FROM project_team_capacity AS c
        WHERE c.project_id = ${p} AND ${ownerOf('service_team_organization', 'c.service_team_id')} IS NOT ${o}`,
      // References into the project. Proof: each of the three kinds below
      // disabled alone made `fails closed on a project another project reaches
      // into, changing neither` in `command-organization.controller.db.test.ts`
      // answer 200 instead of 500; watched 2026-09-27.
      ...(
        [
          ['estimate', "l.work_item_id || '/' || l.step_id"],
          ['actual', "l.work_item_id || '/' || l.step_id"],
          ['step_progress', "l.work_item_id || '/' || l.step_id"],
          ['step_measure', "l.work_item_id || '/' || l.step_id || '/' || l.metric"],
          ['assignment', "l.work_item_id || '/' || l.step_id || '/' || l.person_id"],
        ] as const
      ).map(
        ([table, id]) => sql`
      SELECT 'incoming_step_row' AS kind, ${sql.raw(id)} AS id FROM ${sql.raw(table)} AS l
        JOIN work_item AS w ON w.id = l.work_item_id JOIN step AS st ON st.id = l.step_id
        WHERE st.project_id = ${p} AND w.project_id IS NOT ${p}`,
      ),
      sql`SELECT 'incoming_parent' AS kind, w.id AS id FROM work_item AS w
        JOIN work_item AS parent ON parent.id = w.parent_id
        WHERE parent.project_id = ${p} AND w.project_id IS NOT ${p}`,
      sql`SELECT 'incoming_dependency' AS kind, d.id AS id FROM dependency AS d
        JOIN work_item AS pre ON pre.id = d.predecessor_id JOIN work_item AS suc ON suc.id = d.successor_id
        WHERE d.project_id IS NOT ${p} AND (pre.project_id = ${p} OR suc.project_id = ${p})`,
    ];
    // Typed, not parsed: every `kind` is one of the literals written in the arms
    // above, and `PROJECT_CROSS_REFERENCE_KINDS` is their closed list.
    return this.db.all<ProjectCrossReference>(sql.join(arms, sql` UNION ALL `));
  }

  async findBySolutionSlug(slug: string): Promise<Project | null> {
    const rows = await this.db
      .select(WITH_SOLUTION)
      .from(project)
      .leftJoin(projectSolution, eq(projectSolution.projectId, project.id))
      .where(eq(project.solutionSlug, slug))
      .limit(1);
    const found = rows.at(0);
    return found === undefined ? null : fromJoined(found);
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
  ): Promise<Project | null> {
    const rows = await this.db
      .select(WITH_SOLUTION)
      .from(project)
      .innerJoin(
        projectOrganization,
        and(
          eq(projectOrganization.resourceId, project.id),
          eq(projectOrganization.organizationId, organizationId),
        ),
      )
      .leftJoin(projectSolution, eq(projectSolution.projectId, project.id))
      .where(or(eq(projectSolution.slug, slug), eq(project.solutionSlug, slug)))
      .limit(2);
    // Proof: matching the legacy column alone made `links a slug only another
    // organization holds` in `project-solution.db.test.ts` find nothing for
    // a scoped link; watched 2026-09-28.
    // Proof: letting two matches through made `refuses a lookup two of the
    // organization's projects answer` return one of them; watched 2026-09-28.
    // Every link write refuses a slug the organization already uses, so a
    // second match is a broken invariant rather than a choice to make.
    if (rows.length > 1) {
      throw new Error(`two projects of organization ${organizationId} hold one solution slug`);
    }
    const found = rows.at(0);
    return found === undefined ? null : fromJoined(found);
  }

  async list(): Promise<Project[]> {
    const rows = await this.db
      .select(WITH_SOLUTION)
      .from(project)
      .leftJoin(projectSolution, eq(projectSolution.projectId, project.id))
      .orderBy(desc(project.createdAt));
    return rows.map(fromJoined);
  }

  /**
   * The caller's own order, in one query.
   *
   * The ordering rests on a SQLite fact worth naming: `ORDER BY x DESC` puts
   * NULLs **last**, because NULL sorts below every value. That is exactly the
   * rule this needs — never-opened projects after opened ones — and it is not
   * portable, so a test watches it rather than a comment claiming it.
   *
   * The join is on both columns: `project_access` holds one row per pair, and
   * joining on the project alone would attach somebody else's history to this
   * caller's list — every project would then look opened, in the order the
   * busiest account visited them.
   *
   * The owner's name rides in the same statement, so listing fifty projects
   * still costs one query rather than fifty-one. Both joins are LEFT joins and
   * for opposite reasons: a never-opened project has no access row and must
   * still be listed, while a missing **user** row is not a project without an
   * owner — it is a foreign key the database says cannot happen — so the LEFT
   * join is what makes that impossible row visible instead of dropping the
   * project silently. Seeing it, this throws.
   *
   * Proof: with the owner join replaced by a `select` per row, `costs one
   * statement however many projects there are` in `project.test.ts` failed on
   * `Expected length: 1 / Received length: 51`. Watched, 2026-08-09.
   *
   * @throws when a listed project's owner id names no account.
   */
  async listFor(userId: string): Promise<ProjectWithAccess[]> {
    return await this.listOrdered(userId, null);
  }

  /**
   * {@link listFor} confined to one organization's projects.
   *
   * Proof: dropping the organization predicate made `lists only the active
   * organization's projects` in `project-organization.controller.db.test.ts`
   * list the foreign project; watched 2026-09-27.
   */
  async listForInOrganization(
    userId: string,
    organizationId: string,
  ): Promise<ProjectWithAccess[]> {
    return await this.listOrdered(userId, organizationId);
  }

  private async listOrdered(
    userId: string,
    organizationId: string | null,
  ): Promise<ProjectWithAccess[]> {
    const rows = await this.db
      .select({
        id: project.id,
        name: project.name,
        ownerId: project.ownerId,
        restricted: project.restricted,
        estimateMethod: project.estimateMethod,
        depReach: project.depReach,
        estimateRounding: project.estimateRounding,
        pertWeightOptimistic: project.pertWeightOptimistic,
        pertWeightRealistic: project.pertWeightRealistic,
        pertWeightPessimistic: project.pertWeightPessimistic,
        startDate: project.startDate,
        solutionSlug: project.solutionSlug,
        solutionUrl: project.solutionUrl,
        scopedSlug: projectSolution.slug,
        scopedUrl: projectSolution.url,
        // Listed as well as read one at a time: the picker's rows are
        // `ProjectWithAccess`, which extends `Project`, so a settings column
        // missing here is a listing that cannot type-check rather than one that
        // quietly answers `undefined` (tasks.md 3b.2).
        optimizationEnabled: project.optimizationEnabled,
        scheduleEngine: project.scheduleEngine,
        scheduleObjective: project.scheduleObjective,
        revision: project.revision,
        createdAt: project.createdAt,
        lastOpenedAt: projectAccess.lastOpenedAt,
        ownerName: users.username,
      })
      .from(project)
      .leftJoin(
        projectAccess,
        and(eq(projectAccess.projectId, project.id), eq(projectAccess.userId, userId)),
      )
      .leftJoin(users, eq(users.id, project.ownerId))
      .leftJoin(projectSolution, eq(projectSolution.projectId, project.id))
      .where(
        organizationId === null
          ? undefined
          : inArray(
              project.id,
              this.db
                .select({ id: projectOrganization.resourceId })
                .from(projectOrganization)
                .where(eq(projectOrganization.organizationId, organizationId)),
            ),
      )
      .orderBy(desc(projectAccess.lastOpenedAt), desc(project.createdAt));
    return rows.map(({ scopedSlug, scopedUrl, ...row }) =>
      toProject(withOwnerName(row), scopedSolution(scopedSlug, scopedUrl)),
    );
  }

  /**
   * Deliberately does **not** move the project's revision. Which screen a
   * project is on is one account's navigation history: nobody else's read of
   * the plan differs because of it, so a write that had to be sure the plan had
   * not changed must not be defeated by somebody opening it in another tab.
   *
   * Proof: bumping the project here fails `opening a project does not move its
   * revision` in `service/revision.test.ts`.
   */
  async recordOpen(projectId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await this.db
        .insert(projectAccess)
        .values({ userId: stamp.by, projectId, lastOpenedAt: stamp.at, ...auditOnCreate(stamp) })
        // The pair is the primary key, so a second open is an update rather than
        // a constraint violation — and the stamp's instant is taken as given
        // rather than maxed: the clock that saw the open happen is the one that
        // stamped the act.
        .onConflictDoUpdate({
          target: [projectAccess.userId, projectAccess.projectId],
          set: { lastOpenedAt: sql`excluded.last_opened_at`, ...auditOnUpdate(stamp) },
        });
    });
  }

  /**
   * {@link recordOpen} only while `organizationId` still owns the project,
   * checked in the write's own transaction: false, and nothing recorded,
   * otherwise.
   *
   * Proof: skipping the ownership check made `records an open and a write only
   * while the organization owns the project` in `project.db.test.ts` answer
   * true for the foreign open; watched 2026-09-27.
   */
  async recordOpenInOrganization(
    projectId: string,
    stamp: WriteStamp,
    organizationId: string,
  ): Promise<boolean> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx) => {
        const owned = tx
          .select({ id: projectOrganization.resourceId })
          .from(projectOrganization)
          .where(
            and(
              eq(projectOrganization.resourceId, projectId),
              eq(projectOrganization.organizationId, organizationId),
            ),
          )
          .get();
        if (owned === undefined) return false;
        tx.insert(projectAccess)
          .values({ userId: stamp.by, projectId, lastOpenedAt: stamp.at, ...auditOnCreate(stamp) })
          .onConflictDoUpdate({
            target: [projectAccess.userId, projectAccess.projectId],
            set: { lastOpenedAt: sql`excluded.last_opened_at`, ...auditOnUpdate(stamp) },
          })
          .run();
        return true;
      });
    });
  }

  async update(id: string, patch: ProjectPatch, stamp: WriteStamp): Promise<Project | null> {
    return await this.write(id, patch, stamp, null);
  }

  /**
   * {@link update} confined to one organization: the ownership predicate is in
   * the UPDATE itself, so a project that is not, or is no longer, the
   * organization's answers null and is left unchanged.
   *
   * Proof: dropping the predicate made `records an open and a write only while
   * the organization owns the project` in `project.db.test.ts` answer the
   * renamed foreign project instead of null; watched 2026-09-27.
   */
  /**
   * Proof, each watched 2026-09-27: skipping the audit insert made `recovers
   * a restricted project as an audited super-admin edit` in
   * `project-organization.controller.db.test.ts` find no record; classifying
   * from the caller's earlier read instead of in the transaction made
   * `audits a recovery the project became after the request read it` in
   * `organization-audit.db.test.ts` write without a record; skipping the
   * refusal made `refuses an actor who is no longer a writing member` write
   * the project; and continuing past a failed audit insert made `rolls the
   * edit back when its audit record cannot be written` keep the rename.
   */
  async editInOrganization(
    id: string,
    patch: ProjectPatch,
    stamp: WriteStamp,
    organizationId: string,
    editor: { readonly actorId: string; readonly auditId: string },
  ): Promise<Project | null | 'forbidden' | 'solution_taken'> {
    try {
      return await this.write(id, patch, stamp, organizationId, editor);
    } catch (refused) {
      // The modeled refusals, raised inside the transaction so it rolls back.
      if (refused instanceof EditRefused) return 'forbidden';
      if (refused instanceof SolutionTaken) return 'solution_taken';
      throw refused;
    }
  }

  /**
   * Runs as a savepoint inside the caller's unit of work, whose `BEGIN
   * IMMEDIATE` holds the write lock from before this read until the batch
   * commits or rolls back, the audit record with it. The record is dated by
   * this adapter, not a service clock: the unit of work hands its act no
   * clock.
   *
   * Proof, watched 2026-09-28: skipping the audit insert made `records one
   * recovery by a super-admin of a restricted project, keeping its creator`
   * and `fails when its audit record cannot be written` in
   * `organization-audit.db.test.ts` fail, and `recovers a restricted project
   * through a batch, undo and redo, one record each` in
   * `command-organization.controller.db.test.ts` find no record.
   */
  async admitEditInOrganization(
    projectId: string,
    organizationId: string,
    actorId: string,
    detail: RecoveryAuditDetail,
  ): Promise<'ordinary' | 'recovery' | 'forbidden' | null> {
    const addressed = and(
      eq(project.id, projectId),
      inArray(
        project.id,
        this.db
          .select({ id: projectOrganization.resourceId })
          .from(projectOrganization)
          .where(eq(projectOrganization.organizationId, organizationId)),
      ),
    );
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx) => {
        const classified = classifyWithin(tx, addressed, organizationId, actorId);
        if (classified === null) return null;
        if (classified === 'refused') return 'forbidden';
        if (classified === 'recovery') {
          recordRecovery(tx, {
            id: crypto.randomUUID(),
            organizationId,
            actorId,
            projectId,
            detail,
            at: Date.now(),
          });
        }
        return classified;
      });
    });
  }

  private async write(
    id: string,
    patch: ProjectPatch,
    stamp: WriteStamp,
    organizationId: string | null,
    editor: { readonly auditId: string; readonly actorId: string } | null = null,
  ): Promise<Project | null> {
    const addressed =
      organizationId === null
        ? eq(project.id, id)
        : and(
            eq(project.id, id),
            inArray(
              project.id,
              this.db
                .select({ id: projectOrganization.resourceId })
                .from(projectOrganization)
                .where(eq(projectOrganization.organizationId, organizationId)),
            ),
          );
    return await this.gate.enter(async () => {
      // An empty patch would make drizzle emit `SET` with no assignments, which
      // SQLite rejects — so a request that changes nothing reads instead.
      // Read off the patch rather than from a list of its fields: the list was
      // one line per `ProjectPatch` key, and a key added without a line here is a
      // patch that silently reads instead of writing. `Object.values` cannot
      // forget a field (tasks.md 3b.2, which added three at once).
      if (Object.values(patch).every((value) => value === undefined)) {
        return organizationId === null
          ? this.findById(id)
          : this.findInOrganization(id, organizationId);
      }
      const { solutionRef, pertWeights, ...fields } = patch;
      // The bump rides in the same `SET` as the change it describes, so a patch
      // that lands without moving the revision is not a state this can reach.
      const updates = {
        ...fields,
        // The triple is written as a triple or not at all: a patch holding one
        // weight would leave the other two as they were, and the divisor is
        // their sum — half an answer is a different arithmetic rather than a
        // partial one. `ProjectPatch` carries them as one object for that
        // reason, and this is where it becomes three columns.
        ...(pertWeights === undefined ? {} : weightColumns(pertWeights)),
        // A scoped link moves to `project_solution` below, and a legacy pair
        // the project held is cleared, so it never holds both.
        // Proof: leaving the pair made `moves a legacy pair into the
        // organization link, relinks and unlinks` in
        // `project-solution.db.test.ts` throw on the read back; watched
        // 2026-09-28.
        ...(solutionRef === undefined
          ? {}
          : {
              solutionSlug: organizationId === null ? (solutionRef?.slug ?? null) : null,
              solutionUrl: organizationId === null ? (solutionRef?.url ?? null) : null,
            }),
        revision: bumpedProject,
      };
      return this.db.transaction(
        (tx) => {
          let edit: 'ordinary' | 'recovery' = 'ordinary';
          if (editor !== null && organizationId !== null) {
            const classified = classifyWithin(tx, addressed, organizationId, editor.actorId);
            // Not the organization's (any more): null, as for an absent project,
            // before any permission is judged.
            if (classified === null) return null;
            if (classified === 'refused') throw new EditRefused();
            edit = classified;
          }
          // After authorization, so only a writer learns that a slug is in use,
          // and only among its own organization's projects. The write lock is
          // held since `BEGIN IMMEDIATE`, so no other process can take the slug
          // between this read and the insert below.
          // Proof, watched 2026-09-28 in `project-solution.db.test.ts`: skipping
          // this check made `refuses a slug another project of the organization
          // holds` throw SQLite's uniqueness error instead of answering
          // `solution_taken`, and dropping the legacy arm made `refuses a slug a
          // project of the organization kept from before activation` link it.
          if (organizationId !== null && solutionRef != null) {
            const holder = tx
              .select({ id: project.id })
              .from(project)
              .innerJoin(
                projectOrganization,
                and(
                  eq(projectOrganization.resourceId, project.id),
                  eq(projectOrganization.organizationId, organizationId),
                ),
              )
              .leftJoin(projectSolution, eq(projectSolution.projectId, project.id))
              .where(
                and(
                  ne(project.id, id),
                  or(
                    eq(projectSolution.slug, solutionRef.slug),
                    eq(project.solutionSlug, solutionRef.slug),
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
                  .update(project)
                  .set({ ...updates, ...auditOnUpdate(stamp) })
                  .where(and(addressed, eq(project.optimizationEnabled, true)))
                  .returning()
                  .all()
                  .at(0)
              : undefined;
          const turnedOff = updated !== undefined;
          updated ??= tx
            .update(project)
            .set({ ...updates, ...auditOnUpdate(stamp) })
            .where(addressed)
            .returning()
            .all()
            .at(0);
          if (updated === undefined) return null;
          if (organizationId !== null && solutionRef !== undefined) {
            tx.delete(projectSolution).where(eq(projectSolution.projectId, id)).run();
            if (solutionRef !== null)
              tx.insert(projectSolution)
                .values({ projectId: id, organizationId, ...solutionRef })
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
              projectId: id,
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
              .where(eq(optimizationGeneration.projectId, id))
              .run();
            tx.update(solverSlot)
              .set({ cancelRequestedAt: stamp.at })
              .where(eq(solverSlot.projectId, id))
              .run();
            tx.delete(solverQueue).where(eq(solverQueue.projectId, id)).run();
          }
          // Proof: without this cleanup, `turns optimization off as an idempotent
          // project-scoped cancellation` leaves both epochs, slots and queues live.
          // Read again rather than decoded from `RETURNING`, which cannot carry
          // the `project_solution` link written above.
          const reread = tx
            .select(WITH_SOLUTION)
            .from(project)
            .leftJoin(projectSolution, eq(projectSolution.projectId, project.id))
            .where(eq(project.id, id))
            .get();
          if (reread === undefined)
            throw new Error(`project ${id} vanished inside its transaction`);
          return fromJoined(reread);
        },
        // A scoped write reads the organization's slugs before it writes one.
        // Proof: a deferred transaction made `answers solution_taken to a link
        // racing another process, writing nothing` in
        // `project-solution.db.test.ts` fail on SQLite's busy snapshot;
        // watched 2026-09-28.
        organizationId === null ? undefined : { behavior: 'immediate' },
      );
    });
  }

  /**
   * Reads the held allowance and writes the new one inside one transaction, so
   * the `previousPercent` a journal entry carries is the value this write
   * replaced, and the revision it answers is the one the write left.
   *
   * Proof: with the revision increment removed, `moves the step’s allowance
   * revision on every write, even back to a value it held` failed: the
   * revision stayed at 0 (2026-09-27).
   */
  async setStepAllowance(
    projectId: string,
    stepId: string,
    allowancePercent: AllowancePercent,
    stamp: WriteStamp,
  ): Promise<StepAllowanceWritten> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx): StepAllowanceWritten => {
        const held = tx
          .select(STEP_COLUMNS)
          .from(step)
          .where(and(eq(step.id, stepId), eq(step.projectId, projectId)))
          .get();
        if (held === undefined) return { ok: false, reason: 'not_found' };
        const written = tx
          .update(step)
          .set({
            allowancePercent,
            allowanceRevision: sql`${step.allowanceRevision} + 1`,
            ...auditOnUpdate(stamp),
          })
          .where(eq(step.id, stepId))
          .returning({ ...STEP_COLUMNS, revision: step.allowanceRevision })
          .all()
          .at(0);
        // Read in this same transaction a line above: an update that found
        // nothing would be SQLite breaking its own isolation.
        if (written === undefined)
          throw new Error(`step ${stepId} vanished inside its transaction`);
        bumpProject(tx, projectId, stamp);
        const { revision, ...writtenStep } = written;
        return { ok: true, step: writtenStep, previousPercent: held.allowancePercent, revision };
      });
    });
  }

  async stepAllowanceRevisions(projectId: string): Promise<ReadonlyMap<string, number>> {
    const rows = await this.db
      .select({ id: step.id, revision: step.allowanceRevision })
      .from(step)
      .where(eq(step.projectId, projectId));
    return new Map(rows.map((row) => [row.id, row.revision]));
  }

  /**
   * The project's steps, in step order — the same order and the same reason as
   * {@link StepRepository.listByProject}, which this does not replace: the
   * schedule reads its step order through here.
   *
   * Proof: with the `orderBy` removed, `reads the same order through the
   * project, which is where the schedule asks` fails with `Analysis, Dev, QA`
   * — SQLite answers this from the `(project_id, name)` index; watched
   * 2026-08-09.
   */
  stepsOf(projectId: string): Promise<Step[]> {
    return (
      this.db
        // {@link STEP_COLUMNS}, not a bare `select()`, and not the mapper the
        // project reads above it use: `toProject` drops the audit columns by
        // name, and it did not until 2026-09-02 — it spread the rest of the row
        // — so `createdBy` and `updatedAt` reached `GET /api/projects/{id}` for
        // as long as those columns existed, with the comment here asserting
        // they did not. This read has no mapper, so the column list is the only
        // thing between the audit columns and a `Step`.
        .select(STEP_COLUMNS)
        .from(step)
        .where(eq(step.projectId, projectId))
        .orderBy(step.position, step.id)
    );
  }
}

type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];

/** Classifies a dependent write from an already open SQLite write transaction. */
export function classifyProjectWriteIn(
  tx: Transaction,
  projectId: string,
  organizationId: string,
  actorId: string,
): 'ordinary' | 'recovery' | 'refused' | null {
  // Proof: dropping the organization predicate made the store-path foreign
  // Retry answer forbidden instead of not_found; watched 2026-09-28.
  return classifyWithin(
    tx,
    and(
      eq(project.id, projectId),
      inArray(
        project.id,
        tx
          .select({ id: projectOrganization.resourceId })
          .from(projectOrganization)
          .where(eq(projectOrganization.organizationId, organizationId)),
      ),
    ),
    organizationId,
    actorId,
  );
}

/**
 * `actorId`'s write to the project `addressed` selects, classified from the
 * membership and project as `tx` reads them (see `classifyProjectEdit`):
 * null when the organization does not own the project.
 */
function classifyWithin(
  tx: Transaction,
  addressed: SQL | undefined,
  organizationId: string,
  actorId: string,
): 'ordinary' | 'recovery' | 'refused' | null {
  const current = tx
    .select({ restricted: project.restricted, ownerId: project.ownerId })
    .from(project)
    .where(addressed)
    .get();
  if (current === undefined) return null;
  const membership = tx
    .select({ role: organizationMembership.role })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.userId, actorId),
      ),
    )
    .get();
  if (membership === undefined) return 'refused';
  return classifyProjectEdit(current, {
    organizationId,
    userId: actorId,
    role: storedRole(membership.role, organizationId),
  });
}

/** Appends one recovery record to `tx`, so it commits or rolls back with the write. */
export function recordRecovery(
  tx: Transaction,
  record: {
    id: string;
    organizationId: string;
    actorId: string;
    projectId: string;
    detail: RecoveryAuditDetail;
    at: number;
  },
): void {
  tx.insert(organizationAudit)
    .values({
      id: record.id,
      organizationId: record.organizationId,
      actorId: record.actorId,
      action: 'restricted_project_recovery',
      subjectKind: 'project',
      subjectId: record.projectId,
      detail: JSON.stringify(record.detail),
      createdAt: record.at,
    })
    .run();
}

/** An organization edit its in-transaction classification refused; rolls the write back. */
class EditRefused extends Error {
  constructor() {
    super('the edit is not permitted to this member now');
    this.name = 'EditRefused';
  }
}

/** A scoped link naming a slug another project of the organization holds; rolls the write back. */
class SolutionTaken extends Error {
  constructor() {
    super('another project of this organization holds that solution slug');
    this.name = 'SolutionTaken';
  }
}

/**
 * A stored membership role, checked rather than trusted: an unknown role
 * reaching the classification must never be read as a privileged one.
 *
 * @throws for a role outside {@link ORGANIZATION_ROLES}.
 */
function storedRole(role: string, organizationId: string): OrganizationRole {
  const known: readonly string[] = ORGANIZATION_ROLES;
  if (!known.includes(role)) {
    throw new Error(`membership in organization "${organizationId}" has a malformed role`);
  }
  // Narrowed by the membership test above, which is the boundary this is.
  return role as OrganizationRole;
}
