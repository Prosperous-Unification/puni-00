import {
  type DependencyRuntimeCapability,
  parseDependencyRuntimeCapability,
} from '@wbs/contracts/dependency-runtime';
import type { Source, TransactionalStores } from '@wbs/core';
import type { CapturedFanout } from '@wbs/core/ports/fanout-capture-store';
import type { OrganizationLimitValues } from '@wbs/domain';
import type { Logger } from 'drizzle-orm';

import { buildStores } from './build-stores';
import { type CaptureReadSeam, inertSqliteCaptureReadSeam } from './capture-read-seam';
import type { ConnectedCaptureOptions } from './captured-scheduler';
import { type ChainSnapshotOptions, createLivePlanStore } from './chain-snapshot';
import { readDependencyAuthoring } from './cross-project-dependency-activation';
import {
  type Connection,
  openConnection as openDatabaseConnection,
  openReadOnlyConnection,
} from './db';
import {
  authorizeImportIn,
  authorizeModeSwitchIn,
  authorizeProjectFanoutIn,
  authorizeRankMoveIn,
  authorizeStepFanoutIn,
  readFanoutObservationIn,
  resolveDirectoryWriteIn,
  resolveLifecycleOwnerIn,
} from './fanout-capture';
import { OPEN, WriteCoordinator } from './gate';
import { probeSchema } from './health-probe';
import { inertSqliteLateWriteSeam, type SqliteLateWriteSeam } from './late-write-seam';
import { OrganizationLimitGaugeRepository } from './organization-limits';
import type { ReadSnapshotLifetime } from './read-snapshot-lifetime';
import { SavedPlanRepository } from './saved-plan';
import { SavedPlanCaptureRepository } from './saved-plan-capture';
import { sqliteUnitOfWork } from './sqlite-unit-of-work';

/** The adapter-owned details needed by be-01's optimizer runtime. */
export interface SqliteSource extends Source<TransactionalStores> {
  readonly db: Connection['db'];
  readonly gate: WriteCoordinator;
  /** Installs public and command readers together over this source's two transaction owners. */
  bindLivePlans(
    options: Pick<ChainSnapshotOptions, 'schedulerOf' | 'optimization'> & {
      readonly connected?: ConnectedCaptureOptions;
    },
  ): Source<TransactionalStores>;
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
  const defaults = options.organizationDefaultLimits;
  const limits =
    defaults === undefined
      ? {}
      : { organizationLimits: new OrganizationLimitGaugeRepository(process.db, defaults) };
  const stores = buildStores(process.db, coordinator, lateWrite);
  const admitted = { ...buildStores(process.db, OPEN, lateWrite), ...limits };
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
  let closed = false;

  return {
    db: process.db,
    gate: coordinator,
    stores,
    bindLivePlans(scheduling) {
      const publicPlans = createLivePlanStore({
        ...scheduling,
        captureRead,
        kind: 'owned',
        openConnection: () =>
          (options.openReadOnlyConnection ?? openReadOnlyConnection)(options.dbPath),
      });
      return {
        ...this,
        stores: buildStores(process.db, coordinator, lateWrite, publicPlans),
        uow: sqliteUnitOfWork(
          process.db,
          coordinator,
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
                  ...buildStores(process.db, OPEN, lateWrite, commandPlans),
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
                    authorizeProjectUpdate: guardRead(
                      lifetime,
                      authorizeProjectFanoutIn(process.db, lifetime),
                    ),
                    authorizeStepRemoval: guardRead(
                      lifetime,
                      authorizeStepFanoutIn(process.db, lifetime),
                    ),
                    authorizeRankMove: guardRead(lifetime, authorizeRankMoveIn(process.db)),
                    authorizeModeSwitch: guardRead(lifetime, authorizeModeSwitchIn(process.db)),
                    // Proof: removing this borrowed binding made a valid mounted
                    // scoped import answer 500 before capture rather than 201.
                    authorizeImport: guardRead(lifetime, authorizeImportIn(process.db)),
                    // Proof: omitting this borrowed resolver stopped the mounted
                    // selected-retirement path before its B←A durable event.
                    resolveLifecycleOwner: guardRead(lifetime, (projectId: string) =>
                      Promise.resolve(resolveLifecycleOwnerIn(process.db, projectId)),
                    ),
                    resolveDirectoryWrite: guardRead(lifetime, (address) =>
                      resolveDirectoryWriteIn(process.db, admitted.directory, address, lifetime),
                    ),
                  },
              };
            },
            createRepairScope: () => ({ stores: admitted }),
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
    uow: sqliteUnitOfWork(process.db, coordinator, {
      createScope: (lifetime) => ({
        stores: { ...admitted, externalDependencyAuthoring: createWriterAuthority(lifetime) },
      }),
      createRepairScope: () => ({ stores: admitted }),
    }),
    health() {
      try {
        return Promise.resolve(
          probeSchema(process.db) === 'ok' ? { ok: true } : { ok: false, reason: 'unavailable' },
        );
      } catch (cause) {
        return Promise.reject(new Error('failed to probe SQLite source health', { cause }));
      }
    },
    close() {
      if (closed) return Promise.resolve();
      closed = true;
      try {
        process.close();
        return Promise.resolve();
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        return Promise.reject(new Error(`failed to close SQLite source: ${detail}`, { cause }));
      }
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
