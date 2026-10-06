import type { Source, TransactionalStores } from '@wbs/core';
import type { Logger } from 'drizzle-orm';

import { buildStores } from './build-stores';
import { type CaptureReadSeam, inertSqliteCaptureReadSeam } from './capture-read-seam';
import { type ChainSnapshotOptions, createLivePlanStore } from './chain-snapshot';
import {
  type Connection,
  openConnection as openDatabaseConnection,
  openReadOnlyConnection,
} from './db';
import {
  authorizeProjectFanoutIn,
  authorizeStepFanoutIn,
  readFanoutObservationIn,
} from './fanout-capture';
import { OPEN, WriteCoordinator } from './gate';
import { probeSchema } from './health-probe';
import { inertSqliteLateWriteSeam, type SqliteLateWriteSeam } from './late-write-seam';
import { SavedPlanRepository } from './saved-plan';
import { SavedPlanCaptureRepository } from './saved-plan-capture';
import { sqliteUnitOfWork } from './sqlite-unit-of-work';

/** The adapter-owned details needed by be-01's optimizer runtime. */
export interface SqliteSource extends Source<TransactionalStores> {
  readonly db: Connection['db'];
  readonly gate: WriteCoordinator;
  /** Installs public and command readers together over this source's two transaction owners. */
  bindLivePlans(
    options: Pick<ChainSnapshotOptions, 'schedulerOf' | 'optimization'>,
  ): Source<TransactionalStores>;
}

/** Options that own every connection in one SQLite source lifetime. */
export interface OpenSqliteSourceOptions {
  readonly dbPath: string;
  readonly openConnection?: (dbPath: string) => Connection;
  /** Read-only connection factory for owned live observations. */
  readonly openReadOnlyConnection?: (dbPath: string) => Connection;
  /** Optional Drizzle query observer for diagnostics such as statement-count tests. */
  readonly logger?: Logger;
}

/** Opens SQLite persistence without changing its schema. */
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
  const connect =
    options.openConnection ?? ((dbPath: string) => openDatabaseConnection(dbPath, options.logger));
  const process = connect(options.dbPath);
  const coordinator = new WriteCoordinator();
  const stores = buildStores(process.db, coordinator, lateWrite);
  const admitted = buildStores(process.db, OPEN, lateWrite);
  let closed = false;

  return {
    db: process.db,
    gate: coordinator,
    stores,
    bindLivePlans(scheduling) {
      const publicPlans = createLivePlanStore({
        ...scheduling,
        kind: 'owned',
        openConnection: () =>
          (options.openReadOnlyConnection ?? openReadOnlyConnection)(options.dbPath),
      });
      const commandPlans = createLivePlanStore({ ...scheduling, kind: 'borrowed', db: process.db });
      return {
        ...this,
        stores: buildStores(process.db, coordinator, lateWrite, publicPlans),
        uow: sqliteUnitOfWork(
          process.db,
          coordinator,
          buildStores(process.db, OPEN, lateWrite, commandPlans),
          // Proof: omitting this borrowed capture made a cold mounted shared
          // command fail 500 before the expected recipient row.
          {
            // Proof: detaching this read onto a separate read-only connection
            // hid the staged command; cold mounted fan-out recorded no row.
            capture: (organizationId: string) =>
              readFanoutObservationIn(process.db, organizationId, scheduling),
            authorizeProjectUpdate: authorizeProjectFanoutIn(process.db),
            authorizeStepRemoval: authorizeStepFanoutIn(process.db),
          },
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
    uow: sqliteUnitOfWork(process.db, coordinator, admitted),
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
