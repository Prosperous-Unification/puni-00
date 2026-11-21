import type { ChainAccess, SavedPlanCaptureStore } from '@wbs/core';
import { captureLocalTypedDependency } from '@wbs/core';
import { captureLeafStepOrders, type ResolvedPlanInputReads } from '@wbs/domain';
import { eq } from 'drizzle-orm';

import { ActualRepository } from './actual';
import { CapacityRepository } from './capacity';
import { type CaptureReadSeam, inertSqliteCaptureReadSeam } from './capture-read-seam';
import type { CurrentPlanInputMemo } from './current-plan-input-memo';
import type { Connection, Drizzle } from './db';
import { drizzleReadTransaction } from './db';
import { DependencyRepository } from './dependency';
import { DirectoryRepository } from './directory';
import { EstimateRepository } from './estimate';
import { OPEN } from './gate';
import { MeasureEstimateRepository } from './measure-estimate';
import { PriorityBandRepository } from './priority-band';
import { createReadSnapshotLifetime, type ReadSnapshotLifetime } from './read-snapshot-lifetime';
import { DemandRepository, ResourceCapacityRepository } from './resource';
import {
  organization,
  project,
  workPackage as packageTable,
  workPackageOrganization,
} from './schema';
import { StepBlockageRepository } from './step-blockage';
import { StepMeasureRepository } from './step-measure';
import { StepParallelRepository } from './step-parallel';
import { StepProgressRepository } from './step-progress';
import { readSqliteStepTreeIn } from './step-tree-reads';
import { TypedDependencyRepository } from './typed-dependency';
import { WorkItemRepository } from './work-item';
import { WorkItemBudgetRepository } from './work-item-budget';
import { WorkPackageRepository } from './work-package';

/**
 * Every row one capture read, as the stores returned it.
 *
 * Deliberately **not** `PlanInputRows` (`@wbs/domain`): that is the canonical
 * shape, and folding into it is a separate, pure step over these values. Keeping
 * the two apart is what lets the fold be tested without a database and this
 * class be tested without asserting anything about hashing. It is also what
 * makes 3.3 possible at all — `schedule()` runs over detached values, outside
 * the read snapshot, and cannot do that if the only way to obtain them is a
 * function that also canonicalises.
 *
 * One field per read, named for the read. Nothing here is sorted, deduplicated
 * or reshaped; a row arrives exactly as its store handed it over.
 */
export type { PlanInputReads, SavedPlanCaptureStore } from '@wbs/core';

/** How the capture obtains the connection it holds its snapshot on. */
export interface SavedPlanCaptureOptions {
  /**
   * A **new** connection each call, closed by this class on every path.
   *
   * Injected rather than a `dbPath` string so a test can watch the connection
   * be opened and closed, and so this file never imports the adapter. In the
   * process it is `() => openConnection(dbPath)`.
   */
  readonly openConnection: () => Connection;
}

/**
 * Reads one work package's whole plan input as of a single instant.
 *
 * ## What "the whole plan input" is bounded by
 *
 * `CanonicalPlanInput`'s field list, **not** the live projection's. The
 * projection is where most of these reads come from, and the capture list is a
 * strict superset of it: the projection may resolve an id against a live
 * registry on the next request, and a saved plan may not — it reads no live
 * table ever again, so a `tag`, `work_item_type` or `external_system` row it did
 * not capture is a label it can never render. Two holes make that concrete, and
 * both are ordinary in the early planning this feature targets:
 *
 * - `capacity.slotsFor` is keyed by team id, so a team with stated capacity and
 *   no junction row is named by the capacity map and by nothing else. The
 *   unfiltered {@link DirectoryRepository.listTeams} is what captures its name.
 * - The live tree reads assigned names through
 *   {@link DirectoryRepository.assignmentsInWorkPackage}. A `person_team` row for
 *   an unassigned person therefore names someone the live projection does not
 *   include. Capture separately calls {@link DirectoryRepository.listPeople}
 *   to retain every person and membership in its independent history.
 *
 * ## The eighteen reads
 *
 * Twelve calls are shared with the live projection, excluding
 * `broadcast.latestSeq`, which is a refresh cursor rather than plan input.
 * The work-package-scoped assignment call includes assigned names in its answer.
 * Six calls are capture-only: `listPeople`, `listTeams`, `listServices`,
 * `listTags`, `listWorkItemTypes` and `listExternalSystems`. They retain the
 * complete directory that memberships, junctions and capacity rows name.
 *
 * All capture reads run inside one transaction, on a connection of this
 * class's own. WorkPackage-scoped assignment reads do not narrow the separate
 * directory capture.
 *
 * ## Why a revision counter cannot substitute for any of this
 *
 * `workPackage.revision` and `work_item.revision` (`schema.ts:215`) move on writes,
 * so re-reading them after the fact could tell you *that* something changed
 * between two reads — never *what* the first read should have seen instead. A
 * capture that detects tearing and retries still needs the consistent read this
 * class provides in order to succeed; and a counter cannot see the tables that
 * carry none. `tag`, `work_item_type`, `external_system`, `person_team` and
 * `team_service` have no revision column at all, which is precisely where the
 * expensive tearing lives: a tag renamed between the item read and the registry
 * read stores pre-edit items beside post-edit labels, and every counter in the
 * database still agrees.
 *
 * ## The connection, and why it is this class's own
 *
 * `boot.ts:64` opens exactly one connection for the whole process, `bun:sqlite`
 * has no pool, and every store read opens with `await Promise.resolve()` — a
 * real microtask yield before the query, so another in-flight request's
 * continuation can issue a statement between any two reads below. A
 * `BEGIN DEFERRED` held on that shared handle would therefore enclose every
 * statement the rest of the process issues until it commits, making a
 * stranger's write the capture's to commit or to roll back. So the capture
 * opens its own connection, holds the snapshot there, and **closes it on every
 * path** — success, refusal, and throw alike. A leaked connection is a leaked
 * WAL reader, which during a blue/green swap is the other colour's problem.
 *
 * **Measured, not reasoned.** `saved-plan-capture.db.test.ts` runs one scenario
 * twice, differing only in the connection this class is handed: on its own, a
 * stranger's `UPDATE tag` survives the capture's rollback; on the process
 * handle, the same write is inside the capture's transaction and the rollback
 * revokes it while the writing request is told it succeeded. design.md, "The
 * topology found", records what changed.
 */
export class SavedPlanCaptureRepository implements SavedPlanCaptureStore {
  constructor(
    private readonly opts: SavedPlanCaptureOptions,
    private readonly captureRead: CaptureReadSeam = inertSqliteCaptureReadSeam,
  ) {}

  /**
   * Every read the canonical input requires, inside one read snapshot.
   *
   * `null` when the work package does not exist — the same answer the projection
   * gives, decided by the first read inside the transaction rather than by a
   * probe before it, so a work package deleted between the two cannot produce an
   * empty-but-present capture.
   */
  async readPlanInput(workPackageId: string): Promise<ResolvedPlanInputReads | null> {
    const connection = this.opts.openConnection();
    const lifetime = createReadSnapshotLifetime();
    try {
      const db = connection.db;
      const tx = drizzleReadTransaction(db);
      tx.begin();
      try {
        const captured = await readPlanInputIn(db, workPackageId, lifetime, this.captureRead);
        lifetime.expire();
        tx.commit();
        return captured;
      } catch (err) {
        // The snapshot is released before the connection closes. Closing a
        // handle with an open transaction would roll it back anyway, but only
        // after `bun:sqlite` has decided how to complain about it.
        lifetime.expire();
        tx.rollback();
        throw err;
      }
    } finally {
      lifetime.expire();
      connection.close();
    }
  }
}

/**
 * Reads local-only plan input; incident external rows remain a refusal. Historical callers
 * omit memo. Only the bound current reader supplies its optional snapshot row cache; settings,
 * ownership, parent checks and the configured first-read seam remain fresh.
 */
export function readPlanInputIn(
  db: Drizzle,
  workPackageId: string,
  lifetime: ReadSnapshotLifetime,
  captureRead: CaptureReadSeam = inertSqliteCaptureReadSeam,
  access?: ChainAccess,
  memo?: CurrentPlanInputMemo,
): Promise<ResolvedPlanInputReads | null> {
  return readPlanInputValuesIn(db, workPackageId, lifetime, captureRead, access, false, memo);
}

/**
 * Reads detached current plan facts on the caller's observation, without another owner.
 * Missing packages and scoped foreign packages remain null before foreign DTO decoding.
 * Existing packages require actual organization and parent correspondence, including
 * pre-activation organizations without the legacy label; corrupt references throw.
 */
async function readPlanInputValuesIn(
  db: Drizzle,
  workPackageId: string,
  lifetime: ReadSnapshotLifetime,
  captureRead: CaptureReadSeam = inertSqliteCaptureReadSeam,
  access?: ChainAccess,
  connected = false,
  memo?: CurrentPlanInputMemo,
): Promise<ResolvedPlanInputReads | null> {
  lifetime.assertOpen();
  const workPackages = new WorkPackageRepository(db, OPEN);
  lifetime.assertOpen();
  const directory = new DirectoryRepository(db, OPEN);
  lifetime.assertOpen();
  const workPackage =
    access?.kind === 'scoped'
      ? await workPackages.findInOrganization(workPackageId, access.scope.organizationId)
      : await workPackages.findById(workPackageId);
  lifetime.assertOpen();
  if (workPackage === null) {
    if (access?.kind === 'scoped') {
      const unresolved = db
        .select({ id: packageTable.id, organizationId: workPackageOrganization.organizationId })
        .from(packageTable)
        .leftJoin(workPackageOrganization, eq(workPackageOrganization.resourceId, packageTable.id))
        .where(eq(packageTable.id, workPackageId))
        .get();
      if (
        unresolved !== undefined &&
        (typeof unresolved.organizationId !== 'string' || unresolved.organizationId === '')
      )
        throw new Error('captured package organization is absent or malformed');
    }
    return null;
  }
  const ownership = db
    .select({
      organizationId: workPackageOrganization.organizationId,
      actualOrganizationId: organization.id,
    })
    .from(workPackageOrganization)
    .leftJoin(organization, eq(organization.id, workPackageOrganization.organizationId))
    .where(eq(workPackageOrganization.resourceId, workPackageId))
    .get();
  if (
    ownership === undefined ||
    typeof ownership.organizationId !== 'string' ||
    ownership.organizationId === '' ||
    ownership.actualOrganizationId !== ownership.organizationId
  )
    throw new Error('captured package organization is absent or malformed');
  if (access?.kind === 'scoped' && ownership.organizationId !== access.scope.organizationId)
    return null;
  lifetime.assertOpen();
  const timezone = await workPackages.timezoneOf(workPackageId);
  // The work package row was just read on this snapshot, so its zone cannot be missing.
  if (timezone === null) throw new Error(`work package "${workPackageId}" has no timezone`);
  lifetime.assertOpen();
  const turn = memo?.observeIn(db, workPackageId, access);
  const memoized = turn?.read({ ...workPackage, timezone });
  if (memoized === undefined && access?.kind === 'scoped') {
    const crossing = await workPackages.findCrossReferences(
      workPackageId,
      access.scope.organizationId,
    );
    // Proof: dropping this check made the crossing-assignee negative accept foreign person assignment.
    if (crossing.length > 0)
      throw new Error(`work package "${workPackageId}" holds references outside its organization`);
  }
  lifetime.assertOpen();
  await captureRead.afterFirstRead({ workPackageId, workPackage: { ...workPackage, timezone } });
  // Proof: removing this continuation check issued a work-item read after the suspended source capture expired.
  lifetime.assertOpen();
  if (typeof workPackage.projectId !== 'string' || workPackage.projectId === '')
    throw new Error('captured package parent identity is malformed');
  const parent = db
    .select({ id: project.id, organizationId: project.organizationId })
    .from(project)
    .where(eq(project.id, workPackage.projectId))
    .get();
  // Proof: omitting this guard lost the exact parent refusal after actual same-owner deletion;
  // a later metadata refusal still rolled the deletion back. Diagnostic evidence (2026-11-20).
  if (parent?.id !== workPackage.projectId || parent.organizationId !== ownership.organizationId)
    throw new Error('captured package parent is absent or inconsistent');
  if (memoized !== undefined) return memoized;
  const workItems = await new WorkItemRepository(db, OPEN).listByWorkPackage(workPackageId);
  lifetime.assertOpen();
  // Proof: reading metadata through a fresh connection mixed old rows with the rival's new
  // leaf order. Ordinary rows in place of the resolved handoff failed capture (2026-11-20).
  const leafSteps = captureLeafStepOrders(
    workItems,
    readSqliteStepTreeIn(db, workPackageId, workItems),
  );
  lifetime.assertOpen();
  const estimates = await new EstimateRepository(db, OPEN).listByWorkPackage(workPackageId);
  lifetime.assertOpen();
  const actuals = await new ActualRepository(db, OPEN).listByWorkPackage(workPackageId);
  lifetime.assertOpen();
  const progress = await new StepProgressRepository(db, OPEN).listByWorkPackage(workPackageId);
  // Proof: snapshot read replaced with empty; concurrent-clear capture regression failed (saved-plan-capture.db.test.ts), 2026-10-14.
  lifetime.assertOpen();
  const stepBlockages = await new StepBlockageRepository(db, OPEN).listByWorkPackage(workPackageId);
  // Proof: snapshot read replaced with empty; concurrent-clear sparse capture failed (sqlite-read.txt), 2026-10-17.
  lifetime.assertOpen();
  const stepParallels = await new StepParallelRepository(db, OPEN).listByWorkPackage(workPackageId);
  lifetime.assertOpen();
  const measures = await new StepMeasureRepository(db, OPEN).listByWorkPackage(workPackageId);
  // On the snapshot with the facts, so a saved plan pairs each budget with
  // the figures it bounds (`wbs-measure-budgets` design D66).
  // Proof: with either read replaced by `[]`, the SQLite run of the
  // conformance case `savedPlanCapture.readPlanInput:complete` captured none
  // (source-conformance.db.test.ts: 75 pass became 68 pass, 7 fail, for each
  // read alone); watched 2026-10-23.
  lifetime.assertOpen();
  const measureDefinitions = await new StepMeasureRepository(db, OPEN).definitionsFor(
    workPackageId,
  );
  lifetime.assertOpen();
  // Proof: omitting this guard issued the next query after the definitions
  // read expired in connected-plan-capture.db.test.ts (2026-10-24).
  const measureEstimates = await new MeasureEstimateRepository(db, OPEN).listByWorkPackage(
    workPackageId,
  );
  lifetime.assertOpen();
  // Proof: omitting the preceding guard queried budgets after the estimates
  // read expired in connected-plan-capture.db.test.ts (2026-10-24).
  const budgets = await new WorkItemBudgetRepository(db, OPEN).listByWorkPackage(workPackageId);
  lifetime.assertOpen();
  // Proof: omitting the preceding guard queried dependencies after the budgets
  // read expired in connected-plan-capture.db.test.ts (2026-10-24).
  const dependencies = await new DependencyRepository(db, OPEN).listByWorkPackage(workPackageId);
  lifetime.assertOpen();
  const typedDependencies = (
    await new TypedDependencyRepository(db, OPEN).listIncident([workPackageId])
  )
    .filter(
      (relationship) =>
        !connected ||
        relationship.predecessor.workPackageId === relationship.successor.workPackageId,
    )
    .map(captureLocalTypedDependency);
  lifetime.assertOpen();
  const { assignments } = await directory.assignmentsInWorkPackage(workPackageId);
  lifetime.assertOpen();
  const steps = await workPackages.stepsOf(workPackageId);
  lifetime.assertOpen();
  const capacity = await new CapacityRepository(db, OPEN).slotsFor(workPackageId);
  // Plan data both engines level, read on this snapshot (`wbs-resources` R5).
  // Proof: the demand read replaced with `[]` made `levels a demanded resource
  // (shared)` (resource-schedule.controller.db.test.ts) schedule overlapping
  // blocks while its isolated twin passed; watched 2026-10-20.
  lifetime.assertOpen();
  const demands = await new DemandRepository(db, OPEN).listByWorkPackage(workPackageId);
  lifetime.assertOpen();
  const resourceCapacities = await new ResourceCapacityRepository(db, OPEN).listFor(workPackageId);
  lifetime.assertOpen();
  const priorityBands = await new PriorityBandRepository(db, OPEN).listFor(workPackageId);
  // Capture the directory whole for independent saved-plan history;
  // the live tree's assigned-name projection cannot replace these reads.
  // Proof: reading the global people list made the scoped capture negative include foreign.
  lifetime.assertOpen();
  const people =
    access?.kind === 'scoped'
      ? await directory.listInOrganization('people', access.scope.organizationId)
      : await directory.listPeople();
  lifetime.assertOpen();
  const teams =
    access?.kind === 'scoped'
      ? await directory.listInOrganization('teams', access.scope.organizationId)
      : await directory.listTeams();
  lifetime.assertOpen();
  const services =
    access?.kind === 'scoped'
      ? await directory.listInOrganization('services', access.scope.organizationId)
      : await directory.listServices();
  lifetime.assertOpen();
  const tags =
    access?.kind === 'scoped'
      ? await directory.listInOrganization('tags', access.scope.organizationId)
      : await directory.listTags();
  lifetime.assertOpen();
  const workItemTypes =
    access?.kind === 'scoped'
      ? await directory.listInOrganization('workItemTypes', access.scope.organizationId)
      : await directory.listWorkItemTypes();
  lifetime.assertOpen();
  const externalSystems =
    access?.kind === 'scoped'
      ? await directory.listInOrganization('externalSystems', access.scope.organizationId)
      : await directory.listExternalSystems();
  // Under the organization's own names, for the label of a bar a resource held.
  lifetime.assertOpen();
  const resourceCatalog =
    access?.kind === 'scoped'
      ? await directory.listInOrganization('resources', access.scope.organizationId)
      : await directory.listResources();
  // Proof: publication-existing omission issued five late native queries before the caller refused the expired lifetime (V114 current capture test).
  lifetime.assertOpen();
  const reads: ResolvedPlanInputReads = {
    workPackage: { ...workPackage, timezone },
    steps,
    workItems,
    leafSteps,
    estimates,
    actuals,
    progress,
    stepBlockages,
    stepParallels,
    measures,
    measureDefinitions,
    measureEstimates,
    budgets,
    dependencies,
    // Proof: omitting this snapshot read made `keeps captured node endpoints after step reorder and live relationship removal` receive undefined (2026-09-27).
    typedDependencies,
    assignments,
    capacity,
    demands,
    resourceCapacities,
    resources: resourceCatalog,
    priorityBands,
    people,
    teams,
    services,
    tags,
    workItemTypes,
    externalSystems,
  };
  turn?.remember(reads);
  return reads;
}

/** Explicit connected projection: external relationships are captured separately, never local-hashed. */
export function readConnectedPlanInputIn(
  db: Drizzle,
  workPackageId: string,
  access: Extract<ChainAccess, { kind: 'scoped' }>,
  lifetime: ReadSnapshotLifetime,
  captureRead: CaptureReadSeam = inertSqliteCaptureReadSeam,
): Promise<ResolvedPlanInputReads | null> {
  return readPlanInputValuesIn(db, workPackageId, lifetime, captureRead, access, true);
}
