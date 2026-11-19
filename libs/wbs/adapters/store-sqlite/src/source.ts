import { guardPublicStores } from './public-store-owner';
import {retainPackageUnitWrites} from '@wbs/core';
import {guardMeasureReads,guardMeasureEstimateReads,guardAttemptReads,guardSparseStepReads,type StepFactReadLifetime} from '@wbs/core';
import {ownMeasureReads,ownMeasureEstimateReads,ownAttemptReads} from './tuple-read-owner';
import {StepMeasureRepository} from './step-measure';
import {guardSubtreeWrites} from '@wbs/core';
import {SubtreeRepository} from './work-item';
import {
  type DependencyRuntimeCapability,
  parseDependencyRuntimeCapability,
} from '@wbs/contracts/dependency-runtime';
import {
  guardEstimateReads,
  guardStepFactReads,
  guardEstimateTarget,
  guardStepCatalogue,
  type Source,
  type TransactionalStores,
} from '@wbs/core';
import type { CapturedFanout } from '@wbs/core/ports/fanout-capture-store';
import type { PlanExportReader } from '@wbs/core/ports/plan-export-reader';
import type { ProjectRead } from '@wbs/core/ports/project-read';
import type { WorkPackageObservation } from '@wbs/core/ports/work-package-observation';
import type { OrganizationLimitValues } from '@wbs/domain';
import type { Logger } from 'drizzle-orm';

import { buildStores } from './build-stores';
import { ActualRepository } from './actual';
import { StepProgressRepository } from './step-progress';
import { ownStepFactReads } from './point-read-owner';
import {ownSparseStepReads} from './sparse-read-owner';
import {StepBlockageRepository} from './step-blockage';
import {StepParallelRepository} from './step-parallel';
import { ownCalendarMarkerReads } from './calendar-marker';
import { type CaptureReadSeam, inertSqliteCaptureReadSeam } from './capture-read-seam';
import type { ConnectedCaptureOptions } from './captured-scheduler';
import { type ChainSnapshotOptions, createLivePlanStore } from './chain-snapshot';
import { readDependencyAuthoring } from './cross-work-package-dependency-activation';
import {
  type Connection,
  openConnection as openDatabaseConnection,
  openReadOnlyConnection,
  poolReadConnections,
} from './db';
import {
  authorizeImportIn,
  authorizeStepFanoutIn,
  authorizeWorkPackageFanoutIn,
  readFanoutObservationIn,
  resolveDirectoryWriteIn,
  resolveLifecycleOwnerIn,
  resolveWorkPackageWriteScopeIn,
} from './fanout-capture';
import { type Gate, OPEN, WriteCoordinator } from './gate';
import { probeSchema } from './health-probe';
import { inertSqliteLateWriteSeam, type SqliteLateWriteSeam } from './late-write-seam';
import { OrganizationLimitGaugeRepository } from './organization-limits';
import { SqliteProjectRead, type SqliteProjectReadOptions } from './project-read';
import type { ReadSnapshotLifetime } from './read-snapshot-lifetime';
import { createSavedCurrentCapture, refusingSavedCurrentCapture } from './saved-current-capture';
import { SavedPlanRepository } from './saved-plan';
import { SavedPlanCaptureRepository } from './saved-plan-capture';
import { sqliteUnitOfWork } from './sqlite-unit-of-work';
import { assertSqliteWriteUsable } from './sqlite-write-state';
import { ownEstimateReads } from './estimate-read-owner';
import { StepCatalogueRepository } from './step-catalogue';
import { ownStepCatalogue } from './step-catalogue-owner';
import {
  SqliteWorkPackageObservation,
  type SqliteWorkPackageObservationOptions,
} from './work-package-observation';
import { ownWorkPackageReads } from './work-package-read-owner';

/** The adapter-owned details needed by be-01's optimizer runtime. */
export interface SqliteSource extends Source<TransactionalStores> {
  /** Adapter-owned physical writer, not a public-store lease. Admitted gate work may finish while close waits; raw callers must coordinate their existing ownership. */
  readonly db: Connection['db'];
  /** Public repository write turns use this source's existing coordinator and current writer recovery fence. */
  readonly gate: Gate;
  /** Creates a lazy reader over this source's pool; active loans finish after close, new loans refuse. */
  createProjectRead(options: Omit<SqliteProjectReadOptions, 'openConnection'>): ProjectRead;
  /** Resolves mode/current caller and ordinary package visibility inside one pooled observation. */
  createWorkPackageObservation(
    options: Omit<SqliteWorkPackageObservationOptions, 'openConnection' | 'currentCapture'>,
  ): WorkPackageObservation;
  /** Installs public and command readers together over this source's two transaction owners. */
  bindLivePlans(
    options: Pick<ChainSnapshotOptions, 'schedulerOf' | 'optimization'> & {
      readonly connected?: ConnectedCaptureOptions;
    },
  ): Source<TransactionalStores> & {
    readonly planExports: PlanExportReader;
  } & Pick<SqliteSource, 'createWorkPackageObservation'>;
}

/** Options that own every connection in one SQLite source lifetime. */
export interface OpenSqliteSourceOptions {
  readonly dbPath: string;
  /** Exact immutable binary descriptor; schema, activation and configuration cannot grant support. */
  readonly dependencyCapability: DependencyRuntimeCapability;
  readonly openConnection?: (dbPath: string) => Connection;
  /** Read-only connection factory for owned live observations. */
  readonly openReadOnlyConnection?: (dbPath: string) => Connection;
  /** Optional Drizzle query observer for diagnostics such as statement-count tests. */
  readonly logger?: Logger;
  /** Test diagnostic at the borrowed capture boundary; a throw aborts its owning write. */
  readonly onFanoutCapture?: (organizationId: string) => unknown;
  /** Test diagnostic of the completed borrowed observation; never substitutes it. */
  readonly onCapturedFanout?: (captured: CapturedFanout) => void;
  /** Test diagnostic of a borrowed UoW entry; never substitutes its transaction. */
  readonly onBorrowedUnitOfWork?: () => void;
  /**
   * The deployment default organization limits (`wbs-organization-limits`
   * L7). Given, the catalogs a unit of work admits carry the limits gauge,
   * and only they: a count read outside a write turn decides nothing (L10).
   * Absent, an acquisition under scoped access throws rather than admitting
   * uncapped. be-01's boot and its organization harness give them.
   */
  readonly organizationDefaultLimits?: OrganizationLimitValues;
}

/**
 * Opens SQLite without changing its schema. Missing/malformed/non-backend binary
 * descriptors throw before any connection opens. Each writer intersects captured
 * immutable support with fresh durable authority; neither alone grants authoring.
 */
export function openSqliteSource(options: OpenSqliteSourceOptions): SqliteSource {
  return openSqliteSourceWithSeams(options, inertSqliteLateWriteSeam, inertSqliteCaptureReadSeam);
}

/** @internal */
export function openSqliteSourceWithLateWriteSeam(
  options: OpenSqliteSourceOptions,
  lateWrite: SqliteLateWriteSeam,
): SqliteSource {
  return openSqliteSourceWithSeams(options, lateWrite, inertSqliteCaptureReadSeam);
}

/** @internal */
export function openSqliteSourceWithCaptureReadSeam(
  options: OpenSqliteSourceOptions,
  captureRead: CaptureReadSeam,
): SqliteSource {
  return openSqliteSourceWithSeams(options, inertSqliteLateWriteSeam, captureRead);
}

function openSqliteSourceWithSeams(
  options: OpenSqliteSourceOptions,
  lateWrite: SqliteLateWriteSeam,
  captureRead: CaptureReadSeam,
): SqliteSource {
  // The parser copies the descriptor; only this immutable support fact survives construction.
  // Proof: bypassing parsing admitted malformed versions/support before opening in source-dependency-capability.db.test.ts.
  const capability = parseDependencyRuntimeCapability(options.dependencyCapability);
  // Proof: removing role validation reached the connection factory for the gateway-descriptor negative.
  if (capability.role !== 'backend')
    throw new Error('SQLite source requires backend dependency runtime capability');
  // Proof: consulting the caller descriptor later granted support after its mutation in the source capability suite.
  const supportsExternalDependencies = capability.semantics.includes(
    'cross-project-dependencies-v1',
  );
  const connect =
    options.openConnection ?? ((dbPath: string) => openDatabaseConnection(dbPath, options.logger));
  const process = connect(options.dbPath);
  const coordinator = new WriteCoordinator();
  let closed = false;
  let closing: Promise<void> | undefined;
  const assertSourceOpen = (): void => {
    if (closed) throw new Error('SQLite source is closed');
  };
  const uowGate: Gate = {
    enter: (work) =>
      coordinator.enter(() => {
        assertSourceOpen();
        return work();
      }),
  };
  /** Public repository turns recheck this writer after queueing; physical close and pooled reads retain their existing owners. */
  const publicWriteGate: Gate = {
    enter: (work) =>
      coordinator.enter(() => {
        assertSourceOpen();
        assertSqliteWriteUsable(process.db);
        return work();
      }),
  };
  const defaults = options.organizationDefaultLimits;
  const limits =
    defaults === undefined
      ? {}
      : { organizationLimits: new OrganizationLimitGaugeRepository(process.db, defaults) };
  // The public catalogs' claims read observes committed state on a read-only
  // connection of its own; the admitted (batch) catalog sees its own writes.
  // Proof: with this observation dropped from the plain catalog, and again
  // from the bound public catalog, `does not see an open batch's claim (plain
  // source)` and `(bound source)` (claim-observation.db.test.ts) each saw
  // the batch's claim (6 pass, 1 fail each); watched 2026-10-23.
  // Both owned observations borrow from one pool of read-only connections, which this source's
  // close drains (`poolReadConnections`).
  // Proof: with `reads.close()` dropped from close, `reuses one read connection and closes
  // every pooled one with the source` (claim-observation.db.test.ts) counted one connection
  // still open; watched 2026-10-28.
  const reads = poolReadConnections(() =>
    (options.openReadOnlyConnection ?? openReadOnlyConnection)(options.dbPath),
  );
  const claimObservation = { openConnection: () => reads.acquire() };
  const rawStores = buildStores(
    process.db,
    publicWriteGate,
    lateWrite,
    undefined,
    claimObservation,
  );
  const stores = {
    ...rawStores,
    measures:guardMeasureReads(ownMeasureReads(rawStores.measures,()=>reads.acquire(),snapshot=>new StepMeasureRepository(snapshot,OPEN)),{kind:'public',assertOpen:assertSourceOpen}),
    measureEstimates:guardMeasureEstimateReads(ownMeasureEstimateReads(rawStores.measureEstimates,()=>reads.acquire()),{kind:'public',assertOpen:assertSourceOpen}),
    attempts:guardAttemptReads(ownAttemptReads(rawStores.attempts,()=>reads.acquire()),{kind:'public',assertOpen:assertSourceOpen}),
    estimates: ownEstimateReads(guardEstimateTarget(rawStores.estimates, assertSourceOpen), () => reads.acquire()),
    actuals: ownStepFactReads(rawStores.actuals,()=>reads.acquire(),snapshot=>new ActualRepository(snapshot,OPEN)),
    progress: ownStepFactReads(rawStores.progress,()=>reads.acquire(),snapshot=>new StepProgressRepository(snapshot,OPEN)),
    blockages:guardSparseStepReads(ownSparseStepReads(rawStores.blockages,()=>reads.acquire(),snapshot=>new StepBlockageRepository(snapshot,OPEN)),{kind:'public',assertOpen:assertSourceOpen}),
    stepParallels:guardSparseStepReads(ownSparseStepReads(rawStores.stepParallels,()=>reads.acquire(),snapshot=>new StepParallelRepository(snapshot,OPEN)),{kind:'public',assertOpen:assertSourceOpen}),
    stepCatalogue: ownStepCatalogue(
      () => reads.acquire(),
      () => uow,
    ),
    calendarMarkers: ownCalendarMarkerReads(rawStores.calendarMarkers, () => reads.acquire()),
    workPackages: ownWorkPackageReads(retainPackageUnitWrites(rawStores.workPackages,assertSourceOpen), () => reads.acquire()),
  };
  const admitted = {
    ...buildStores(process.db, OPEN, lateWrite, undefined, undefined, 'borrowed'),
    ...limits,
  };
  /** Retains the actual Source and supplied loan assertions; no independent lifetime authority is created. */
  const bindTupleReadLifetime=(lifetime:ReadSnapshotLifetime):StepFactReadLifetime=>({kind:'borrowed',assertOpen:()=>{assertSourceOpen();lifetime.assertOpen();}});
  const createSubtreeLoan=(lifetime:ReadSnapshotLifetime)=>{
    const assertOpen=():void=>{assertSourceOpen();lifetime.assertOpen();};
    const gate:Gate={enter:(write)=>OPEN.enter(()=>{assertOpen();return write();})};
    return guardSubtreeWrites(new SubtreeRepository(process.db,gate,lateWrite),assertOpen);
  };
  /** Reuses the actual Source/loan lifetime; mutation remains synchronous after this entry assertion. */
  const createPackageUnitLoan=(lifetime:ReadSnapshotLifetime)=>retainPackageUnitWrites(admitted.workPackages,bindTupleReadLifetime(lifetime).assertOpen);
  /** Intersects immutable binary support with fresh durable authority on the exact admitted writer. */
  const createWriterAuthority = (lifetime: ReadSnapshotLifetime) => () => {
    // Proof: removing expiry admitted retained authority after settlement in writer-authority-binding.db.test.ts.
    lifetime.assertOpen();
    // Proof: constant inactive hid staged deletion of authority on this writer in the same test.
    // Proof: forcing active here admitted the disabled-authority case despite immutable V1 support.
    const state = readDependencyAuthoring(process.db).state;
    // Proof: removing this refusal admitted enabled-empty authority in writer-authority-binding.db.test.ts.
    if (state === 'active' && !supportsExternalDependencies)
      throw new Error('external dependency semantic runtime is unsupported');
    // Proof: returning the live getter here caused two marker reads in the one-operation authority test.
    return { state };
  };
  const uow = sqliteUnitOfWork(process.db, uowGate, {
    createScope: (lifetime) => ({
      stores: {
        ...admitted,
        measures:guardMeasureReads(admitted.measures,bindTupleReadLifetime(lifetime)),
        measureEstimates:guardMeasureEstimateReads(admitted.measureEstimates,bindTupleReadLifetime(lifetime)),
        blockages:guardSparseStepReads(admitted.blockages,bindTupleReadLifetime(lifetime)),
        stepParallels:guardSparseStepReads(admitted.stepParallels,bindTupleReadLifetime(lifetime)),
        attempts:guardAttemptReads(admitted.attempts,bindTupleReadLifetime(lifetime)),
        subtrees:createSubtreeLoan(lifetime),
        workPackages:createPackageUnitLoan(lifetime),
        estimates: guardEstimateReads(admitted.estimates, { kind: 'borrowed', assertOpen: () => {
          assertSourceOpen();
          lifetime.assertOpen();
        } }),
        actuals: guardStepFactReads(admitted.actuals, { kind: 'borrowed', assertOpen: () => {
          assertSourceOpen();
          lifetime.assertOpen();

        } }),
        progress: guardStepFactReads(admitted.progress, { kind: 'borrowed', assertOpen: () => {
          assertSourceOpen();
          lifetime.assertOpen();

        } }),
        stepCatalogue: guardStepCatalogue(admitted.stepCatalogue, () => {
          assertSourceOpen();
          lifetime.assertOpen();
        }),
        externalDependencyAuthoring: createWriterAuthority(lifetime),
      },
    }),
    createRepairScope: (lifetime) => ({
      stores: {
        ...admitted,
        measures:guardMeasureReads(admitted.measures,bindTupleReadLifetime(lifetime)),
        measureEstimates:guardMeasureEstimateReads(admitted.measureEstimates,bindTupleReadLifetime(lifetime)),
        blockages:guardSparseStepReads(admitted.blockages,bindTupleReadLifetime(lifetime)),
        stepParallels:guardSparseStepReads(admitted.stepParallels,bindTupleReadLifetime(lifetime)),
        attempts:guardAttemptReads(admitted.attempts,bindTupleReadLifetime(lifetime)),
        subtrees:createSubtreeLoan(lifetime),
        workPackages:createPackageUnitLoan(lifetime),
        // Proof: L_SQL_PLAIN omits this binding; target-plain-repair-expiry resolves after repair.
        estimates: guardEstimateReads(admitted.estimates, { kind: 'borrowed', assertOpen: () => {
          assertSourceOpen();
          lifetime.assertOpen();
        } }),
        actuals: guardStepFactReads(admitted.actuals, { kind: 'borrowed', assertOpen: () => {
          assertSourceOpen();
          lifetime.assertOpen();

        } }),
        progress: guardStepFactReads(admitted.progress, { kind: 'borrowed', assertOpen: () => {
          assertSourceOpen();
          lifetime.assertOpen();

        } }),
        stepCatalogue: guardStepCatalogue(
          new StepCatalogueRepository(process.db, OPEN, 'owned'),
          () => {
            assertSourceOpen();
            lifetime.assertOpen();
          },
        ),
      },
    }),
  });

  return {
    db: process.db,
    gate: publicWriteGate,
    stores: guardPublicStores(stores, assertSourceOpen),
    createProjectRead(options) {
      return new SqliteProjectRead({ ...options, openConnection: () => reads.acquire() });
    },
    createWorkPackageObservation(options) {
      return new SqliteWorkPackageObservation({
        ...options,
        openConnection: () => reads.acquire(),
        currentCapture: refusingSavedCurrentCapture,
      });
    },
    bindLivePlans(scheduling) {
      const publicPlans = createLivePlanStore({
        ...scheduling,
        captureRead,
        kind: 'owned',
        openConnection: () => reads.acquire(),
      });
      return {
        ...this,
        planExports: publicPlans,
        createWorkPackageObservation(options) {
          return new SqliteWorkPackageObservation({
            ...options,
            openConnection: () => reads.acquire(),
            currentCapture: createSavedCurrentCapture({ ...scheduling, captureRead }),
          });
        },
        stores: guardPublicStores({
          ...buildStores(process.db, publicWriteGate, lateWrite, publicPlans, claimObservation),
          estimates: stores.estimates,
          measures:stores.measures,
          measureEstimates:stores.measureEstimates,
          attempts:stores.attempts,
          actuals: stores.actuals,
          progress: stores.progress,
          blockages: stores.blockages,
          stepParallels: stores.stepParallels,
          workPackages: stores.workPackages,
          calendarMarkers: stores.calendarMarkers,
          stepCatalogue: stores.stepCatalogue,
        }, assertSourceOpen),
        uow: sqliteUnitOfWork(
          process.db,
          uowGate,
          {
            createScope: (lifetime) => {
              lifetime.assertOpen();
              // Proof: overriding connected with undefined here made the borrowed mounted ready tree unavailable.
              const commandPlans = createLivePlanStore({
                ...scheduling,
                captureRead,
                kind: 'borrowed',
                db: process.db,
                lifetime,
              });
              return {
                stores: {
                  ...buildStores(process.db, OPEN, lateWrite, commandPlans, undefined, 'borrowed'),
                  measures:guardMeasureReads(admitted.measures,bindTupleReadLifetime(lifetime)),
                  measureEstimates:guardMeasureEstimateReads(admitted.measureEstimates,bindTupleReadLifetime(lifetime)),
                  blockages:guardSparseStepReads(admitted.blockages,bindTupleReadLifetime(lifetime)),
        stepParallels:guardSparseStepReads(admitted.stepParallels,bindTupleReadLifetime(lifetime)),
        attempts:guardAttemptReads(admitted.attempts,bindTupleReadLifetime(lifetime)),
                  subtrees:createSubtreeLoan(lifetime),
        workPackages:createPackageUnitLoan(lifetime),
                  estimates: guardEstimateReads(admitted.estimates, { kind: 'borrowed', assertOpen: () => {
                    assertSourceOpen();
                    lifetime.assertOpen();
                  } }),
                  actuals: guardStepFactReads(admitted.actuals, { kind: 'borrowed', assertOpen: () => {
                    assertSourceOpen();
                    lifetime.assertOpen();

                  } }),
                  progress: guardStepFactReads(admitted.progress, { kind: 'borrowed', assertOpen: () => {
                    assertSourceOpen();
                    lifetime.assertOpen();

                  } }),
                  stepCatalogue: guardStepCatalogue(admitted.stepCatalogue, () => {
                    assertSourceOpen();
                    lifetime.assertOpen();
                  }),
                  ...limits,
                  externalDependencyAuthoring: createWriterAuthority(lifetime),
                },
                fanoutCapture:
                  // Proof: omitting this borrowed capture made a cold mounted shared
                  // command fail 500 before the expected recipient row.
                  {
                    // Proof: detaching this read onto a separate read-only connection
                    // hid the staged command; cold mounted fan-out recorded no row.
                    capture: async (organizationId: string) => {
                      lifetime.assertOpen();
                      await options.onFanoutCapture?.(organizationId);
                      lifetime.assertOpen();
                      // Proof: substituting the earlier preflight capture after a queued
                      // assignment insert lost the Billing→Platform recipient row.
                      const captured = await readFanoutObservationIn(
                        process.db,
                        organizationId,
                        { ...scheduling, captureRead },
                        lifetime,
                      );
                      lifetime.assertOpen();
                      options.onCapturedFanout?.(captured);
                      return captured;
                    },
                    // Proof: F15 omitted this binding; the real scoped runtime read failed before local facts.
                    // Proof: removing this entry guard issued a work package query after closure in the runtime resolver matrix (R10, 2026-10-26).
                    resolveWorkPackageWriteScope: guardRead(
                      lifetime,
                      resolveWorkPackageWriteScopeIn(process.db, lifetime),
                    ),
                    authorizeWorkPackageUpdate: guardRead(
                      lifetime,
                      authorizeWorkPackageFanoutIn(process.db, lifetime),
                    ),
                    authorizeStepRemoval: guardRead(
                      lifetime,
                      authorizeStepFanoutIn(process.db, lifetime),
                    ),
                    // Proof: removing this borrowed binding made a valid mounted
                    // scoped import answer 500 before capture rather than 201.
                    authorizeImport: guardRead(lifetime, authorizeImportIn(process.db)),
                    // Proof: omitting this borrowed resolver stopped the mounted
                    // selected-retirement path before its B←A durable event.
                    resolveLifecycleOwner: guardRead(lifetime, (workPackageId: string) =>
                      Promise.resolve(resolveLifecycleOwnerIn(process.db, workPackageId)),
                    ),
                    resolveDirectoryWrite: guardRead(lifetime, (address) =>
                      resolveDirectoryWriteIn(process.db, admitted.directory, address, lifetime),
                    ),
                  },
              };
            },
            createRepairScope: (lifetime) => ({
              stores: {
                ...admitted,
        measures:guardMeasureReads(admitted.measures,bindTupleReadLifetime(lifetime)),
        measureEstimates:guardMeasureEstimateReads(admitted.measureEstimates,bindTupleReadLifetime(lifetime)),
        blockages:guardSparseStepReads(admitted.blockages,bindTupleReadLifetime(lifetime)),
        stepParallels:guardSparseStepReads(admitted.stepParallels,bindTupleReadLifetime(lifetime)),
        attempts:guardAttemptReads(admitted.attempts,bindTupleReadLifetime(lifetime)),
        subtrees:createSubtreeLoan(lifetime),
        workPackages:createPackageUnitLoan(lifetime),
                // Proof: L_SQL_BOUND omits this binding; the real bound repair owner resolves after repair.
                estimates: guardEstimateReads(admitted.estimates, { kind: 'borrowed', assertOpen: () => {
                  assertSourceOpen();
                  lifetime.assertOpen();
                } }),
                actuals: guardStepFactReads(admitted.actuals, { kind: 'borrowed', assertOpen: () => {
                  assertSourceOpen();
                  lifetime.assertOpen();

                } }),
                progress: guardStepFactReads(admitted.progress, { kind: 'borrowed', assertOpen: () => {
                  assertSourceOpen();
                  lifetime.assertOpen();

                } }),
                stepCatalogue: guardStepCatalogue(
                  new StepCatalogueRepository(process.db, OPEN, 'owned'),
                  () => {
                    assertSourceOpen();
                    lifetime.assertOpen();
                  },
                ),
              },
            }),
          },
          options.onBorrowedUnitOfWork,
        ),
      };
    },
    history: {
      savedPlans: new SavedPlanRepository(
        {
          openConnection: () => connect(options.dbPath),
        },
        lateWrite,
      ),
      savedPlanCapture: new SavedPlanCaptureRepository(
        {
          openConnection: () => connect(options.dbPath),
        },
        captureRead,
      ),
    },
    uow,
    health() {
      try {
        // Proof: omitting this admission makes the held-writer "rejects health immediately" test resolve.
        assertSourceOpen();
        return Promise.resolve(
          probeSchema(process.db) === 'ok' ? { ok: true } : { ok: false, reason: 'unavailable' },
        );
      } catch (cause) {
        return Promise.reject(new Error('failed to probe SQLite source health', { cause }));
      }
    },
    /**
     * Revokes public transactional-store and pool admission immediately; writer retirement waits for the
     * existing coordinator's admitted turns. Repeated calls share the actual close
     * promise, including failure. Await outside an owned turn: the gate is nonreentrant.
     *
     * The coordinator schedules its callback through native Promise.then, so the
     * closing promise is published before pool cleanup can reenter, and pool failure
     * is captured before the deferred writer disposal. Both disposals are attempted.
     */
    close() {
      // Proof: omitting reuse makes "closes once and surfaces cleanup failure" observe two native close attempts.
      if (closing !== undefined) return closing;
      closed = true;
      let readFailure: { cause: unknown } | undefined;
      const closeWriter = (): Promise<void> => {
        const failures: unknown[] = readFailure === undefined ? [] : [readFailure.cause];
        try {
          process.close();
        } catch (cause: unknown) {
          failures.push(cause);
        }
        if (failures.length === 0) return Promise.resolve();
        const cause = failures.length === 1
          ? failures[0]
          : new AggregateError(failures, 'read pool and SQLite writer close failed');
        const detail = cause instanceof Error ? cause.message : String(cause);
        return Promise.reject(new Error(`failed to close SQLite source: ${detail}`, { cause }));
      };
      // Proof: bypassing this coordinator makes current-unit:queued-close fail at the original rollback AggregateError.
      closing = coordinator.enter(closeWriter);
      try {
        reads.close();
      } catch (cause: unknown) {
        readFailure = { cause };
      }
      return closing;
    },
  };
}

/** Read authority and its return continuation expire with the admitting command scope. */
function guardRead<Args extends readonly unknown[], Value>(
  lifetime: ReadSnapshotLifetime,
  read: (...args: Args) => Promise<Value>,
): (...args: Args) => Promise<Value> {
  return async (...args) => {
    lifetime.assertOpen();
    const value = await read(...args);
    lifetime.assertOpen();
    return value;
  };
}
