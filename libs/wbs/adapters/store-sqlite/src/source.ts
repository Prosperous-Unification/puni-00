import type { Source, TransactionalStores } from '@wbs/core';
import type { CapturedFanout } from '@wbs/core/ports/fanout-capture-store';
import type { OrganizationLimitValues } from '@wbs/domain';
import type { Logger } from 'drizzle-orm';

import { buildStores } from './build-stores';
import { type CaptureReadSeam, inertSqliteCaptureReadSeam } from './capture-read-seam';
import { type ChainSnapshotOptions, createLivePlanStore } from './chain-snapshot';
import {
  type Connection,
  openConnection as openDatabaseConnection,
  openReadOnlyConnection,
  poolReadConnections,
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
  resolveProjectWriteScopeIn,
} from './fanout-capture';
import { OPEN, WriteCoordinator } from './gate';
import { probeSchema } from './health-probe';
import { inertSqliteLateWriteSeam, type SqliteLateWriteSeam } from './late-write-seam';
import { OrganizationLimitGaugeRepository } from './organization-limits';
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
  const stores = buildStores(process.db, coordinator, lateWrite, undefined, claimObservation);
  const admitted = { ...buildStores(process.db, OPEN, lateWrite), ...limits };
  let closed = false;

  return {
    db: process.db,
    gate: coordinator,
    stores,
    bindLivePlans(scheduling) {
      const publicPlans = createLivePlanStore({
        ...scheduling,
        kind: 'owned',
        openConnection: () => reads.acquire(),
      });
      const commandPlans = createLivePlanStore({ ...scheduling, kind: 'borrowed', db: process.db });
      return {
        ...this,
        stores: buildStores(process.db, coordinator, lateWrite, publicPlans, claimObservation),
        uow: sqliteUnitOfWork(
          process.db,
          coordinator,
          // Proof: building this catalog without the gauge made every activated
          // case of be-01's agent-person-limit.controller.db.test.ts throw
          // "without organization limits" (3 pass, 9 fail); watched 2026-10-22.
          { ...buildStores(process.db, OPEN, lateWrite, commandPlans), ...limits },
          // Proof: omitting this borrowed capture made a cold mounted shared
          // command fail 500 before the expected recipient row.
          {
            // Proof: detaching this read onto a separate read-only connection
            // hid the staged command; cold mounted fan-out recorded no row.
            capture: async (organizationId: string) => {
              await options.onFanoutCapture?.(organizationId);
              // Proof: substituting the earlier preflight capture after a queued
              // assignment insert lost the Billing→Platform recipient row.
              const captured = await readFanoutObservationIn(
                process.db,
                organizationId,
                scheduling,
              );
              options.onCapturedFanout?.(captured);
              return captured;
            },
            // Proof: F15 omitted this binding; the real scoped runtime read failed before local facts.
            resolveProjectWriteScope: resolveProjectWriteScopeIn(process.db),
            authorizeProjectUpdate: authorizeProjectFanoutIn(process.db),
            authorizeStepRemoval: authorizeStepFanoutIn(process.db),
            authorizeRankMove: authorizeRankMoveIn(process.db),
            authorizeModeSwitch: authorizeModeSwitchIn(process.db),
            // Proof: removing this borrowed binding made a valid mounted
            // scoped import answer 500 before capture rather than 201.
            authorizeImport: authorizeImportIn(process.db),
            // Proof: omitting this borrowed resolver stopped the mounted
            // selected-retirement path before its B←A durable event.
            resolveLifecycleOwner: (projectId) =>
              Promise.resolve(resolveLifecycleOwnerIn(process.db, projectId)),
            resolveDirectoryWrite: (address) =>
              resolveDirectoryWriteIn(process.db, admitted.directory, address),
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
        reads.close();
        process.close();
        return Promise.resolve();
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        return Promise.reject(new Error(`failed to close SQLite source: ${detail}`, { cause }));
      }
    },
  };
}
