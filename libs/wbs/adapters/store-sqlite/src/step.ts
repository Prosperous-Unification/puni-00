import {
  assertStepRetirementEpoch,
  type StepRetirementEpochRecord,
} from '@wbs/core/step-catalogue/step-retirement';
import {
  assertStepParallel,
  type EstimateUnit,
  isEstimateUnit,
  STEP_POSITION_STEP,
  type StepHoldings,
  stepIsInUse,
  suggestStepCode,
} from '@wbs/domain';

import { stepRetirementEpochColumns } from './step-retirement';

export { type StepHoldings, stepIsInUse } from '@wbs/domain';

import {
  type Assignment,
  type NewStep,
  type Step,
  type StepRemoved,
  type StepStore,
  type StepUnitWritten,
  type StepUsageRows,
  type StepWritten,
  WorkPackageStepMissing,
  type WriteStamp,
} from '@wbs/core';
import { and, count, eq, inArray, or, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { type PackageTargetRecord, readPackageTargetRow } from './access-decisions';
import { auditOnCreate, auditOnUpdate } from './audit';
import { isUniqueViolation, UNIQUE_INDEXES } from './constraint';
import type { Gate } from './gate';
import { bumpWorkItems, bumpWorkPackage } from './revision';
import {
  actual,
  assignment,
  claim,
  estimate,
  measureEstimate,
  organization,
  project,
  space,
  step,
  stepBinding,
  stepBlockage,
  stepDefinition,
  stepMeasure,
  stepNodeAttempt,
  stepParallel,
  stepProgress,
  stepRetirement,
  workItem,
  workItemType,
  workItemTypeOrganization,
  workPackage,
  workPackageOrganization,
  workPackageStep,
} from './schema';

/**
 * The columns a {@link Step} is, named once because four reads and writes in
 * this file and one in `work-package.ts` want exactly them.
 *
 * Spelled out rather than left to `select()`, which is this folder's convention
 * (see `WORK_ITEM_COLUMNS`): the audit columns are **recorded, not published**,
 * so a bare select would put `created_at`, `updated_at` and `created_by` into
 * `Step` and from there into the plan payload. The declared return types check
 * the list is complete.
 */
export const STEP_COLUMNS = {
  id: step.id,
  workPackageId: step.workPackageId,
  name: step.name,
  position: step.position,
  code: step.code,
  allowancePercent: step.allowancePercent,
  estimateUnit: step.estimateUnit,
};

/**
 * Every assignment in one work package, read through the work items that hold them.
 *
 * The whole work package's rather than one step's, because whether a work item's
 * assumed assignee moves when a step goes depends on what it holds for the steps
 * that stay — see {@link StepUsageRows}. Takes the writer so the refusal can
 * read it inside the transaction that refused.
 */
function assignmentsIn(
  reader: Pick<SQLiteBunDatabase, 'select'>,
  workPackageId: string,
): Assignment[] {
  return reader
    .select({
      workItemId: assignment.workItemId,
      stepId: assignment.stepId,
      personId: assignment.personId,
    })
    .from(assignment)
    .innerJoin(workItem, eq(assignment.workItemId, workItem.id))
    .where(eq(workItem.workPackageId, workPackageId))
    .all();
}

/** Raw selected SQLite values; declared ORM column types do not validate corrupt trusted driver values. */
interface CatalogueStepRecord extends PackageTargetRecord, StepRetirementEpochRecord {
  readonly retirement_step_id: unknown;
  readonly binding_id: unknown;
  readonly binding_organization_id: unknown;
  readonly binding_step_id: unknown;
  readonly binding_position: unknown;
  readonly binding_type_id: unknown;
  readonly actual_type_id: unknown;
  readonly type_organization_id: unknown;
  readonly definition_id: unknown;
  readonly definition_organization_id: unknown;
  readonly code: unknown;
  readonly name: unknown;
  readonly values_package_id: unknown;
  readonly values_step_id: unknown;
  readonly estimate_unit: unknown;
  readonly allowance_bps: unknown;
}

/** Decode every selected binding before deduplication; a LEFT row without explicit values is corruption, never a default. */
function readCatalogueStep(
  row: CatalogueStepRecord,
  workPackageId: string,
  organizationId: string,
): Step | null {
  assertStepRetirementEpoch(row);
  if (row.binding_id === null) return null;
  if (row.retirement_step_id !== null)
    throw new Error('catalogue binding names a retired definition');
  if (
    typeof row.binding_id !== 'string' ||
    row.binding_id === '' ||
    row.binding_organization_id !== organizationId
  )
    throw new Error('catalogue step binding has an absent identity or inconsistent organization');
  if (
    typeof row.definition_id !== 'string' ||
    row.definition_id === '' ||
    row.definition_id !== row.binding_step_id ||
    row.definition_organization_id !== organizationId
  )
    throw new Error('catalogue step binding has an absent or inconsistent definition');
  if (
    row.binding_type_id !== null &&
    (typeof row.binding_type_id !== 'string' ||
      row.binding_type_id === '' ||
      row.actual_type_id !== row.binding_type_id ||
      row.type_organization_id !== organizationId)
  )
    throw new Error('catalogue step binding has an absent or inconsistent type');
  if (typeof row.binding_position !== 'number' || !Number.isSafeInteger(row.binding_position))
    throw new Error('catalogue step binding has a malformed position');
  if (
    typeof row.code !== 'string' ||
    row.code === '' ||
    typeof row.name !== 'string' ||
    row.name === ''
  )
    throw new Error('catalogue step definition has malformed display fields');
  // Proof: M1 removed this named refusal; the missing-row control failed at its expected
  // WorkPackageStepMissing pair because the later identity check still threw a generic Error.
  // Exact restoration passed; this proves classification only, not independent refusal necessity.
  if (row.values_package_id === null && row.values_step_id === null)
    throw new WorkPackageStepMissing(workPackageId, row.definition_id);
  if (row.values_package_id !== workPackageId || row.values_step_id !== row.definition_id)
    throw new Error('catalogue step has an inconsistent explicit package row');
  if (!isEstimateUnit(row.estimate_unit))
    throw new Error('catalogue package step has a malformed estimate unit');
  if (
    typeof row.allowance_bps !== 'number' ||
    !Number.isSafeInteger(row.allowance_bps) ||
    row.allowance_bps < 0 ||
    row.allowance_bps > 100000
  )
    throw new Error('catalogue package step has a malformed allowance');
  return {
    id: row.definition_id,
    workPackageId,
    name: row.name,
    position: row.binding_position,
    code: row.code,
    estimateUnit: row.estimate_unit,
    allowancePercent: row.allowance_bps / 100,
  };
}

/**
 * Read the any-type project-chain union in one SQLite statement, with its explicit package values.
 * All reaching bindings are checked before duplicates are discarded. Ordering by scope/position/code/id
 * places each step's least scope/position/binding identity first and yields the SC18 resolved order.
 * Unbound retained rows do not participate. A missing package preserves this port's empty-list behavior;
 * missing/malformed ancestors, definitions, type attribution or explicit selected values throw.
 * This borrowed read owns no connection, transaction, permission decision or fallback schema path.
 */
export function readCatalogueStepsIn(
  db: Pick<SQLiteBunDatabase, 'select'>,
  workPackageId: string,
): Step[] {
  const scopeRank = sql`CASE ${stepBinding.scopeKind} WHEN 'organization' THEN 0 WHEN 'space' THEN 1 WHEN 'project' THEN 2 END`;
  const rows = db
    .select({
      ...stepRetirementEpochColumns,
      retirement_step_id: stepRetirement.stepId,
      package_id: workPackage.id,
      organization_id: workPackageOrganization.organizationId,
      project_id: workPackage.projectId,
      parent_id: project.id,
      parent_organization_id: project.organizationId,
      actual_organization_id: organization.id,
      space_id: project.spaceId,
      actual_space_id: space.id,
      space_organization_id: space.organizationId,
      restricted: sql<unknown>`${workPackage.restricted}`,
      binding_id: stepBinding.id,
      binding_organization_id: stepBinding.organizationId,
      binding_step_id: stepBinding.stepId,
      binding_position: stepBinding.position,
      binding_type_id: stepBinding.workItemTypeId,
      actual_type_id: workItemType.id,
      type_organization_id: workItemTypeOrganization.organizationId,
      definition_id: stepDefinition.id,
      definition_organization_id: stepDefinition.organizationId,
      code: stepDefinition.code,
      name: stepDefinition.name,
      values_package_id: workPackageStep.workPackageId,
      values_step_id: workPackageStep.stepId,
      estimate_unit: workPackageStep.estimateUnit,
      // The raw scalar must be checked before the percentage custom type can coerce it.
      allowance_bps: sql<unknown>`${workPackageStep.allowancePercent}`,
    })
    .from(workPackage)
    .leftJoin(project, eq(workPackage.projectId, project.id))
    .leftJoin(workPackageOrganization, eq(workPackageOrganization.resourceId, workPackage.id))
    .leftJoin(organization, eq(organization.id, project.organizationId))
    .leftJoin(space, eq(space.id, project.spaceId))
    .leftJoin(
      stepBinding,
      or(
        and(
          eq(stepBinding.scopeKind, 'organization'),
          eq(stepBinding.scopeId, project.organizationId),
        ),
        and(eq(stepBinding.scopeKind, 'space'), eq(stepBinding.scopeId, project.spaceId)),
        // Proof: B1 removed only the project-id predicate; the complete sibling-binding control
        // returned additional a-dev/a-qa rows. Exact restoration passed; its fault state tail was unreached.
        and(eq(stepBinding.scopeKind, 'project'), eq(stepBinding.scopeId, project.id)),
      ),
    )
    .leftJoin(stepDefinition, eq(stepDefinition.id, stepBinding.stepId))
    .leftJoin(stepRetirement, eq(stepRetirement.stepId, stepBinding.stepId))
    .leftJoin(workItemType, eq(workItemType.id, stepBinding.workItemTypeId))
    .leftJoin(
      workItemTypeOrganization,
      eq(workItemTypeOrganization.resourceId, stepBinding.workItemTypeId),
    )
    .leftJoin(
      workPackageStep,
      and(
        eq(workPackageStep.workPackageId, workPackage.id),
        eq(workPackageStep.stepId, stepBinding.stepId),
      ),
    )
    .where(eq(workPackage.id, workPackageId))
    // Proof: O1 omitted only scopeRank; the literal scope-order control changed its order and
    // z-dev controlling position from30 to10. Exact restoration passed; the fault state tail was unreached.
    .orderBy(
      scopeRank,
      stepBinding.position,
      sql`${stepDefinition.code} COLLATE BINARY`,
      sql`${stepDefinition.id} COLLATE BINARY`,
      sql`${stepBinding.id} COLLATE BINARY`,
    )
    .all();
  const first = rows.at(0);
  if (first === undefined) return [];
  const target = readPackageTargetRow(first);
  const selected = new Map<string, Step>();
  for (const row of rows) {
    const decoded = readCatalogueStep(row, workPackageId, target.chain.organizationId);
    if (decoded !== null && !selected.has(decoded.id)) selected.set(decoded.id, decoded);
  }
  return [...selected.values()];
}

/**
 * A work package's steps, and the writes that change them.
 *
 * Its own repository rather than more methods on `WorkPackageRepository`: removing
 * a step spans its estimates, recorded days, stated progress, measures,
 * attempts, blockage, assignments and the step itself — plus the
 * revisions of everything that lost a row, and that transaction has nothing to
 * do with a work package's own columns.
 *
 * listByWorkPackage reads catalogue117 definitions, bindings and explicit package values. Other
 * methods still operate on legacy step storage and require their separate caller/write cutover before activation.
 *
 * Every write here moves the **work package's** revision, because a step is a
 * satellite of the work package: adding, renaming or removing one changes what every
 * estimate in it means. See `workPackage.revision` in `schema.ts`.
 */
export class StepRepository implements StepStore {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /**
   * The any-type reaching project-chain union with explicit package values and SC18 controlling order.
   * Retained unbound package rows are excluded. This read has no legacy-table/schema-existence fallback.
   *
   * Historical pre-catalogue query evidence follows; it describes the replaced old-table read only.
   * The `ORDER BY` is load-bearing, not tidiness: without it SQLite answers
   * `WHERE work_package_id = ?` from the `step_work_package_name` index and hands back
   * the rows in **name** order, which puts a step called `Analysis` in front of
   * `Dev` however late it was added — and step order is what a work item's
   * slices run in.
   *
   * Proof: with the `orderBy` removed, `reads a step added later last, however
   * its name sorts` fails with `Analysis, Dev, QA`; watched 2026-08-09.
   */
  listByWorkPackage(workPackageId: string): Promise<Step[]> {
    return Promise.resolve().then(() => readCatalogueStepsIn(this.db, workPackageId));
  }

  async findById(stepId: string): Promise<Step | null> {
    const rows = await this.db.select(STEP_COLUMNS).from(step).where(eq(step.id, stepId)).limit(1);
    return rows.at(0) ?? null;
  }

  /**
   * Writes the step and the work package's bump together, or writes neither.
   *
   * The refusal comes from the unique index rather than from a read first: two
   * clients adding `Design` at the same moment both see it free.
   *
   * The place it takes is read **inside** the transaction, so two steps added
   * at the same moment cannot both be told the same last position — one of them
   * would then sort by id, which is a UUID, which is no order at all.
   *
   * Proof: with the `stepNameInWorkPackage` unique-violation branch removed, `refuses a name the
   * workPackage already holds, and leaves the steps as they were` fails with the
   * raw `SQLITE_CONSTRAINT_UNIQUE` instead of a refusal — the 500 this
   * translation exists to prevent. With `bumpWorkPackage` removed, `adds a step and
   * moves the workPackage’s revision` fails, 1 expected and 0 read. Both watched
   * 2026-08-08.
   */
  async add(toAdd: NewStep, stamp: WriteStamp): Promise<StepWritten> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      try {
        return this.db.transaction(
          (tx) => {
            const held = tx
              .select({ position: step.position, code: step.code })
              .from(step)
              .where(eq(step.workPackageId, toAdd.workPackageId))
              .all();
            const taken = new Set(held.flatMap((each) => (each.code === null ? [] : [each.code])));
            const written: Step = {
              ...toAdd,
              estimateUnit: toAdd.estimateUnit ?? 'workdays',
              code: toAdd.code ?? suggestStepCode(toAdd.name, taken),
              position: Math.max(0, ...held.map((each) => each.position)) + STEP_POSITION_STEP,
            };
            tx.insert(step)
              .values({ ...written, ...auditOnCreate(stamp) })
              .run();
            bumpWorkPackage(tx, toAdd.workPackageId, stamp);
            return { ok: true, step: written };
          },
          // `IMMEDIATE`: the write lock is taken before the codes are read, so
          // the post-swap backfill — another process — cannot hand out the
          // code this suggestion is about to take between the read and the
          // insert. The unique index is still what refuses a collision.
          { behavior: 'immediate' },
        );
      } catch (err) {
        if (isUniqueViolation(err, UNIQUE_INDEXES.stepNameInWorkPackage))
          return { ok: false, reason: 'taken' };
        if (isUniqueViolation(err, UNIQUE_INDEXES.stepCodeInWorkPackage))
          return { ok: false, reason: 'code_taken' };
        throw err;
      }
    });
  }

  /** Refuses unit conversion over estimates; count and update hold the same immediate write lock (ADR 0042). */
  async patchUnit(
    workPackageId: string,
    stepId: string,
    unit: EstimateUnit,
    stamp: WriteStamp,
  ): Promise<StepUnitWritten> {
    return this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction(
        (tx) => {
          const current = tx
            .select(STEP_COLUMNS)
            .from(step)
            .where(and(eq(step.id, stepId), eq(step.workPackageId, workPackageId)))
            .get();
          if (current === undefined) return { ok: false, reason: 'not_found' };
          if (current.estimateUnit === unit) return { ok: true, step: current };
          const holdings = tx
            .select({ count: count() })
            .from(estimate)
            .where(eq(estimate.stepId, stepId))
            .get();
          // Proof: an injected absent count row without this guard produced a raw TypeError instead of the named refusal (step.db.test.ts, 2026-10-12).
          if (holdings === undefined) throw new Error('estimate count returned no row');
          // Proof: bypassing this count returned 200 instead of 409 for three estimates in step.controller.db.test.ts (2026-10-12).
          if (holdings.count > 0)
            return { ok: false, reason: 'estimates_present', count: holdings.count };
          tx.update(step)
            .set({ estimateUnit: unit, ...auditOnUpdate(stamp) })
            .where(and(eq(step.id, stepId), eq(step.workPackageId, workPackageId)))
            .run();
          bumpWorkPackage(tx, workPackageId, stamp);
          return { ok: true, step: { ...current, estimateUnit: unit } };
        },
        { behavior: 'immediate' },
      );
    });
  }

  /**
   * Renames one step, or says why it could not.
   *
   * A refused rename writes nothing, the work package's revision included: a request
   * that changed nothing must not defeat somebody else's precondition.
   *
   * Proof: with the empty-`returning` branch reporting success instead,
   * `reports a step that is gone rather than pretending to rename it` fails —
   * a rename of nothing answered `ok`; watched 2026-08-08.
   */
  async rename(
    workPackageId: string,
    stepId: string,
    name: string,
    stamp: WriteStamp,
  ): Promise<StepWritten> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      try {
        return this.db.transaction((tx) => {
          const rows = tx
            .update(step)
            .set({ name, ...auditOnUpdate(stamp) })
            // Proof: addressing the step by id alone made `renames nothing of
            // another work package, whatever it is called by` in `step.db.test.ts`
            // rename the other work package's step; watched 2026-09-27.
            .where(and(eq(step.id, stepId), eq(step.workPackageId, workPackageId)))
            .returning(STEP_COLUMNS)
            .all();
          const renamed = rows.at(0);
          // Nothing was updated, so there is no step by that id — and nothing to
          // bump. Rolling back is not needed (the update wrote nothing), but the
          // early return keeps the bump and the write in the same branch.
          if (renamed === undefined) return { ok: false, reason: 'not_found' };
          bumpWorkPackage(tx, renamed.workPackageId, stamp);
          return { ok: true, step: renamed };
        });
      } catch (err) {
        if (isUniqueViolation(err, UNIQUE_INDEXES.stepNameInWorkPackage))
          return { ok: false, reason: 'taken' };
        throw err;
      }
    });
  }

  /**
   * What a removal would take with it, read for the refusal that names it.
   *
   * The assignments are the whole work package's — see {@link StepUsageRows} for why
   * this step's own rows cannot answer the question.
   */
  async usageOf(workPackageId: string, stepId: string): Promise<StepUsageRows> {
    const held = await this.db
      .select({ workItemId: estimate.workItemId })
      .from(estimate)
      .where(eq(estimate.stepId, stepId));
    // Read through `actual_by_step`, which exists for this question and for the
    // one `remove` asks: the primary key leads with the work item, so counting
    // one step's rows without it is a scan.
    const recorded = await this.db
      .select({ workItemId: actual.workItemId })
      .from(actual)
      .where(eq(actual.stepId, stepId));
    // Read through `step_progress_by_step`, which exists for this question for
    // `actual_by_step`'s reason.
    const spoken = await this.db
      .select({ workItemId: stepProgress.workItemId })
      .from(stepProgress)
      .where(eq(stepProgress.stepId, stepId));
    // Read through `step_measure_by_step`, which exists for this question for
    // `actual_by_step`'s reason — the primary key leads with the work item, so
    // counting one step's rows without it would be a scan. Nothing owed here:
    // the index has shipped with the table since
    // `20260821140000_add_role_measure`.
    const measured = [
      ...(await this.db
        .select({ workItemId: stepMeasure.workItemId })
        .from(stepMeasure)
        .where(eq(stepMeasure.stepId, stepId))),
      // And the trios in other measures, counted with the facts as figures
      // that are not days; a single-point tokens trio is its legacy row above
      // and is not counted twice (`wbs-measure-budgets` design D28).
      ...(await this.db
        .select({ workItemId: measureEstimate.workItemId })
        .from(measureEstimate)
        .where(and(eq(measureEstimate.stepId, stepId), eq(measureEstimate.singlePoint, false)))),
    ];
    // Read through `step_node_attempt_by_step`, for `actual_by_step`'s reason.
    const attempted = await this.db
      .select({ workItemId: stepNodeAttempt.workItemId })
      .from(stepNodeAttempt)
      .where(eq(stepNodeAttempt.stepId, stepId));
    const blocked = await this.db
      .select({ workItemId: stepBlockage.workItemId })
      .from(stepBlockage)
      .where(eq(stepBlockage.stepId, stepId));
    const claimed = await this.db
      .select({ workItemId: claim.workItemId })
      .from(claim)
      .where(eq(claim.stepId, stepId));
    const ids = await this.db
      .select({ id: workItem.id })
      .from(workItem)
      .where(eq(workItem.workPackageId, workPackageId));
    // `inArray` with an empty list becomes `IN ()`, which SQLite refuses — and
    // a work package with no work items has no assignments by definition.
    if (ids.length === 0)
      return {
        estimates: held.length,
        actuals: recorded.length,
        progress: spoken.length,
        blockages: blocked.length,
        measures: measured.length,
        attempts: attempted.length,
        claims: claimed.length,
        assignments: [],
      };
    const assignments = await this.db
      .select({
        workItemId: assignment.workItemId,
        stepId: assignment.stepId,
        personId: assignment.personId,
      })
      .from(assignment)
      .where(
        inArray(
          assignment.workItemId,
          ids.map((row) => row.id),
        ),
      );
    return {
      estimates: held.length,
      actuals: recorded.length,
      progress: spoken.length,
      blockages: blocked.length,
      measures: measured.length,
      attempts: attempted.length,
      claims: claimed.length,
      assignments,
    };
  }

  /**
   * Counts, decides and deletes in **one** transaction.
   *
   * The count is inside because it *is* the decision, not a report about it. A
   * caller that asked without `cascade` consented to nothing, so an estimate
   * written between that caller's own count and this statement has to refuse the
   * removal rather than be deleted by it — the counts a person was shown never
   * mentioned it. `cascade` is the only thing carried across the two requests;
   * every number is read here, freshly.
   *
   * The estimates are deleted **explicitly**: `estimate.step_id` has no
   * `onDelete` cascade, so deleting the step row on its own hits the foreign key
   * and answers 500. The assignments are deleted explicitly too, though their
   * column does cascade, so that what this reports having removed is what this
   * statement removed rather than what the database did behind it.
   *
   * Every read and every delete is scoped through `stepInWorkPackage`, a subquery
   * that is empty for a step that has gone or never belonged to this work package. So
   * the loser of two removals counts nothing, deletes nothing, and is told
   * `not_found` by its own `DELETE ... RETURNING` — no revision moves and its
   * caller has no event to announce. The same scoping is what stops one
   * work package's route from deleting another work package's step by id.
   *
   * Proof, all watched: the estimate delete removed, and all three removal cases
   * fail on `FOREIGN KEY constraint failed` — the 500 a bare step delete answers
   * today (2026-08-08). The bump set narrowed to the assignments alone, and
   * `deletes an estimate written between the count and the confirmed removal`
   * fails on the third work item's revision (2026-08-08). The counting left in
   * the service alone, and `refuses an unconfirmed removal when an estimate
   * lands after the count` deletes it instead; the `RETURNING` check dropped,
   * and `refuses the loser of two removals, bumping and announcing nothing`
   * moves the work package's revision and answers `ok`; the step delete's
   * `workPackageId` condition dropped, and `reports another workPackage’s step as not
   * there, and leaves it alone` deletes theirs (2026-08-09).
   *
   * Sparse parallelism refuses either cascade value with exact detached node
   * references. Selected trusted facts are validated before any mutation, using
   * a left join so a missing owner cannot disappear from the guard.
   *
   * What no test here can observe is a writer landing **inside** this
   * transaction: `bun:sqlite` transactions are synchronous, so the interleave
   * the API actually faces — count, somebody else's write, confirm — is
   * reproduced across two calls rather than inside one.
   */
  async remove(
    workPackageId: string,
    stepId: string,
    cascade: boolean,
    stamp: WriteStamp,
  ): Promise<StepRemoved> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx) => {
        const stepInWorkPackage = tx
          .select({ id: step.id })
          .from(step)
          .where(and(eq(step.id, stepId), eq(step.workPackageId, workPackageId)));
        // Proof: targetless/work-package-blind queries broke retained refusal scope tests; inner join hid the corrupt owner, 2026-10-17.
        const parallels = tx
          .select({
            workItemId: stepParallel.workItemId,
            stepId: stepParallel.stepId,
            maxParallel: stepParallel.maxParallel,
            ownerWorkPackage: workItem.workPackageId,
            hasChildren: sql<number>`EXISTS (SELECT 1 FROM work_item child WHERE child.parent_id = ${stepParallel.workItemId})`,
          })
          .from(stepParallel)
          .leftJoin(workItem, eq(workItem.id, stepParallel.workItemId))
          .where(inArray(stepParallel.stepId, stepInWorkPackage))
          // Proof: descending owner order broke the exact sorted-reference assertion, 2026-10-17.
          .orderBy(stepParallel.workItemId, stepParallel.stepId)
          .all();
        for (const parallel of parallels) {
          // Proof: owner guard omitted; corrupt retained SQLite owner test lost its trusted-reference error, 2026-10-17.
          if (parallel.ownerWorkPackage === null)
            throw new Error('step parallelism has an invalid work-item reference');
          // Proof: work package guard omitted; corrupt retained SQLite work package test received a policy refusal, 2026-10-17.
          if (parallel.ownerWorkPackage !== workPackageId)
            throw new Error('step parallelism work package mismatch');
          // Proof: leaf guard omitted; corrupt retained SQLite leaf test received a policy refusal, 2026-10-17.
          if (parallel.hasChildren !== 0) throw new Error('step parallelism owner is not a leaf');
          // Proof: range validation omitted; corrupt retained SQLite range test received a policy refusal, 2026-10-17.
          assertStepParallel(parallel.maxParallel);
        }
        // Proof: omitted guard and cascade-only guard hit the FK; late-insertion omission also failed, 2026-10-17.
        // Proof: moving refusal after DELETE estimate lost that retained estimate in cascade-preservation test, 2026-10-17.
        if (parallels.length > 0)
          return {
            ok: false,
            reason: 'referenced_by_step_parallel',
            // Proof: returning selected SQL rows exposed metadata in exact-reference assertions, 2026-10-17.
            nodes: parallels.map(({ workItemId, stepId }) => ({ workItemId, stepId })),
          };
        const estimated = tx
          .select({ workItemId: estimate.workItemId })
          .from(estimate)
          .where(inArray(estimate.stepId, stepInWorkPackage))
          .all();
        // Counted inside the transaction with the estimates, and counted at all
        // because an actual is a record of work somebody has already done: a step
        // that holds one and no estimate is `in_use`, and an unconfirmed removal
        // of it is refused rather than quietly taking the only record of that
        // week. `actual.step_id` has no cascade for exactly this — see `step` in
        // `schema.ts`.
        const recorded = tx
          .select({ workItemId: actual.workItemId })
          .from(actual)
          .where(inArray(actual.stepId, stepInWorkPackage))
          .all();
        // And the statements, counted here for the recorded days' reason: a step
        // that holds no estimate and no actual but has been said to be **done** on
        // a work item is `in_use`, and an unconfirmed removal of it would turn
        // finished work back into work nobody has started, silently.
        const spoken = tx
          .select({ workItemId: stepProgress.workItemId })
          .from(stepProgress)
          .where(inArray(stepProgress.stepId, stepInWorkPackage))
          .all();
        // And the figures that are not days, counted here for the recorded days'
        // reason in two of its three units and for the estimates' reason in the
        // third: a `token_actual` or an `hours_actual` is an account of work that
        // has already happened, and a step holding one and nothing else is
        // `in_use`. Rows, not pairs — a pair holding a token estimate and an hours
        // fact is two statements, and the number a person is shown before
        // consenting has to be the number of statements that go.
        const measured = [
          ...tx
            .select({ workItemId: stepMeasure.workItemId })
            .from(stepMeasure)
            .where(inArray(stepMeasure.stepId, stepInWorkPackage))
            .all(),
          // The trios in other measures with them, a single-point tokens trio
          // being its legacy row above (design D28).
          // Proof: with this count left out, `refuses removing a step holding
          // only a three-point trio, and takes it with a confirmed cascade`
          // (step.db.test.ts) removed the step unconfirmed; watched 2026-10-23.
          ...tx
            .select({ workItemId: measureEstimate.workItemId })
            .from(measureEstimate)
            .where(
              and(
                inArray(measureEstimate.stepId, stepInWorkPackage),
                eq(measureEstimate.singlePoint, false),
              ),
            )
            .all(),
        ];
        // And the attempts, counted for the recorded days' reason: an attempt
        // is history of work that ran (ADR 0045), and a step holding one and
        // nothing else is `in_use`.
        const attempted = tx
          .select({ workItemId: stepNodeAttempt.workItemId })
          .from(stepNodeAttempt)
          .where(inArray(stepNodeAttempt.stepId, stepInWorkPackage))
          .all();
        // Proof: zeroing this fresh count made late-arriving blockage delete succeed (step.service.db.test.ts, 2026-10-14).
        const blocked = tx
          .select({ workItemId: stepBlockage.workItemId })
          .from(stepBlockage)
          .where(inArray(stepBlockage.stepId, stepInWorkPackage))
          .all();
        const claimedHere = tx
          .select({ workItemId: claim.workItemId })
          .from(claim)
          .where(inArray(claim.stepId, stepInWorkPackage))
          .all();
        const assigned = tx
          .select({ workItemId: assignment.workItemId })
          .from(assignment)
          .where(inArray(assignment.stepId, stepInWorkPackage))
          .all();
        const held: StepHoldings = {
          estimates: estimated.length,
          actuals: recorded.length,
          progress: spoken.length,
          blockages: blocked.length,
          measures: measured.length,
          attempts: attempted.length,
          claims: claimedHere.length,
          assignments: assigned.length,
        };
        if (!cascade && stepIsInUse(held)) {
          return {
            ok: false,
            reason: 'in_use',
            // Every count but the assignments is the one just tested. The
            // assignments are re-read across the whole work package rather than for
            // this step, because the caller reports assumed-assignee flips from
            // them and those are a fact about rows this step does not hold.
            usage: { ...held, assignments: assignmentsIn(tx, workPackageId) },
          };
        }
        tx.delete(estimate).where(inArray(estimate.stepId, stepInWorkPackage)).run();
        // Explicit, like the estimates and for the identical reason: `step_id`
        // carries no cascade here, so the step delete below hits the foreign key
        // and answers 500 without this statement.
        tx.delete(actual).where(inArray(actual.stepId, stepInWorkPackage)).run();
        // Explicit for the same reason once more: `step_progress.step_id` carries
        // no cascade either, deliberately.
        tx.delete(stepProgress).where(inArray(stepProgress.stepId, stepInWorkPackage)).run();
        // Explicit for the third time and the same reason: `step_measure.step_id`
        // carries no cascade either (`schema.ts`, `stepMeasure`), so without this
        // statement the step delete below hits the foreign key and answers 500 to
        // a confirmed cascade — the exact failure the estimates' delete was added
        // for in 2026-08-08, one table later.
        tx.delete(stepMeasure).where(inArray(stepMeasure.stepId, stepInWorkPackage)).run();
        // And the trios: `measure_estimate.step_id` carries no cascade either;
        // the single-point ones went with their legacy rows just above.
        tx.delete(measureEstimate).where(inArray(measureEstimate.stepId, stepInWorkPackage)).run();
        // Explicit once more: `step_node_attempt.step_id` carries no cascade
        // either, so the step delete below would hit its foreign key.
        tx.delete(stepNodeAttempt).where(inArray(stepNodeAttempt.stepId, stepInWorkPackage)).run();
        // Proof: omitting this delete failed confirmed cascade with a restrictive foreign-key error (step.service.db.test.ts, 2026-10-14).
        tx.delete(stepBlockage).where(inArray(stepBlockage.stepId, stepInWorkPackage)).run();
        // Explicit: `claim.step_id` is restrictive like the blockage's, and a
        // confirmed cascade releases the claims on the step.
        tx.delete(claim).where(inArray(claim.stepId, stepInWorkPackage)).run();
        tx.delete(assignment).where(inArray(assignment.stepId, stepInWorkPackage)).run();
        const removed = tx
          .delete(step)
          .where(and(eq(step.id, stepId), eq(step.workPackageId, workPackageId)))
          .returning()
          .all();
        // Nothing was deleted, so there was nothing here to delete: somebody
        // else's removal committed first, or this step belongs to another
        // work package. Either way this request changed nothing and must move no
        // revision — the two deletes above touched nothing for the same reason.
        if (removed.length === 0) return { ok: false, reason: 'not_found' };
        // Proof: omitting blockage owners lost the blockage-only revision bump (step.service.db.test.ts, 2026-10-14).
        const workItemIds = [
          ...new Set(
            [
              ...estimated,
              ...recorded,
              ...spoken,
              ...measured,
              ...attempted,
              ...blocked,
              ...claimedHere,
              ...assigned,
            ].map((row) => row.workItemId),
          ),
        ];
        bumpWorkItems(tx, workItemIds, stamp);
        bumpWorkPackage(tx, workPackageId, stamp);
        return {
          ok: true,
          removal: {
            estimates: estimated.length,
            actuals: recorded.length,
            progress: spoken.length,
            blockages: blocked.length,
            measures: measured.length,
            attempts: attempted.length,
            claims: claimedHere.length,
            assignments: assigned.length,
            workItemIds,
          },
        };
      });
    });
  }
}
