import {
  type DependencyReach,
  type EstimateMethod,
  type EstimateRounding,
  isDependencyReach,
  isEstimateMethod,
  isEstimateRounding,
  PertWeights,
} from '@wbs/domain';
import { type } from '@wbs/validation';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { Project, ProjectPatch, ProjectStore, ProjectWithAccess, Step } from './index';
import { bumpedProject } from './revision';
import { project, projectAccess, step, users } from './schema';

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
function toProject<
  T extends {
    estimateMethod: string;
    depReach: string;
    estimateRounding: string;
    pertWeightOptimistic: number;
    pertWeightRealistic: number;
    pertWeightPessimistic: number;
    solutionSlug: string | null;
    solutionUrl: string | null;
  },
>(
  row: T,
): Omit<
  T,
  | 'estimateMethod'
  | 'depReach'
  | 'estimateRounding'
  | 'pertWeightOptimistic'
  | 'pertWeightRealistic'
  | 'pertWeightPessimistic'
  | 'solutionSlug'
  | 'solutionUrl'
> & {
  estimateMethod: EstimateMethod;
  depReach: DependencyReach;
  estimateRounding: EstimateRounding;
  pertWeights: PertWeights;
  solutionRef: { slug: string; url: string } | null;
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
  return {
    ...rest,
    estimateMethod,
    depReach,
    estimateRounding,
    pertWeights: weights,
    solutionRef:
      solutionSlug === null || solutionUrl === null
        ? null
        : { slug: solutionSlug, url: solutionUrl },
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
  constructor(private readonly db: SQLiteBunDatabase) {}

  // `async` is load-bearing rather than decorative: `db.transaction` is
  // synchronous, so a constraint violation would otherwise be thrown before the
  // promise this signature advertises exists — and a caller holding it with
  // `.catch()` would never see the rejection.
  async create(toCreate: Project, startingSteps: readonly Step[]): Promise<Project> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      const { solutionRef, pertWeights, ...fields } = toCreate;
      tx.insert(project)
        .values({
          ...fields,
          ...weightColumns(pertWeights),
          solutionSlug: solutionRef?.slug ?? null,
          solutionUrl: solutionRef?.url ?? null,
        })
        .run();
      if (startingSteps.length > 0)
        tx.insert(step)
          .values([...startingSteps])
          .run();
    });
    return toCreate;
  }

  async findById(id: string): Promise<Project | null> {
    const rows = await this.db.select().from(project).where(eq(project.id, id)).limit(1);
    const found = rows.at(0);
    return found === undefined ? null : toProject(found);
  }

  async findBySolutionSlug(slug: string): Promise<Project | null> {
    const rows = await this.db
      .select()
      .from(project)
      .where(eq(project.solutionSlug, slug))
      .limit(1);
    const found = rows.at(0);
    return found === undefined ? null : toProject(found);
  }

  async list(): Promise<Project[]> {
    const rows = await this.db.select().from(project).orderBy(desc(project.createdAt));
    return rows.map(toProject);
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
      .orderBy(desc(projectAccess.lastOpenedAt), desc(project.createdAt));
    return rows.map((row) => toProject(withOwnerName(row)));
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
  async recordOpen(userId: string, projectId: string, at: number): Promise<void> {
    await this.db
      .insert(projectAccess)
      .values({ userId, projectId, lastOpenedAt: at })
      // The pair is the primary key, so a second open is an update rather than
      // a constraint violation — and `at` is taken as given rather than
      // maxed: the caller's clock is the one that saw the open happen.
      .onConflictDoUpdate({
        target: [projectAccess.userId, projectAccess.projectId],
        set: { lastOpenedAt: sql`excluded.last_opened_at` },
      });
  }

  async update(id: string, patch: ProjectPatch): Promise<Project | null> {
    // An empty patch would make drizzle emit `SET` with no assignments, which
    // SQLite rejects — so a request that changes nothing reads instead.
    if (
      patch.name === undefined &&
      patch.restricted === undefined &&
      patch.estimateMethod === undefined &&
      patch.depReach === undefined &&
      patch.pertWeights === undefined &&
      patch.estimateRounding === undefined &&
      patch.startDate === undefined &&
      patch.solutionRef === undefined
    ) {
      return this.findById(id);
    }
    // The bump rides in the same `SET` as the change it describes, so a patch
    // that lands without moving the revision is not a state this can reach.
    const { solutionRef, pertWeights, ...fields } = patch;
    const rows = await this.db
      .update(project)
      .set({
        ...fields,
        // The triple is written as a triple or not at all: a patch holding one
        // weight would leave the other two as they were, and the divisor is
        // their sum — half an answer is a different arithmetic rather than a
        // partial one. `ProjectPatch` carries them as one object for that
        // reason, and this is where it becomes three columns.
        ...(pertWeights === undefined ? {} : weightColumns(pertWeights)),
        ...(solutionRef === undefined
          ? {}
          : {
              solutionSlug: solutionRef?.slug ?? null,
              solutionUrl: solutionRef?.url ?? null,
            }),
        revision: bumpedProject,
      })
      .where(eq(project.id, id))
      .returning();
    const updated = rows.at(0);
    return updated === undefined ? null : toProject(updated);
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
    return this.db
      .select()
      .from(step)
      .where(eq(step.projectId, projectId))
      .orderBy(step.position, step.id);
  }
}
