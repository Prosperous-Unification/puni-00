import type { WriteStamp } from '@wbs/core';

import type { TransactionalStores } from './index';
import type {
  SavedPlanHoldingRow,
  SavedPlanPrincipals,
  SavedPlanTouchOutcome,
  SavedPlanWrite,
  SavedPlanWriteOutcome,
  StoredSavedPlan,
} from './saved-plan';
import type { PlanInputReads } from './saved-plan-capture';
import type { SavedPlanRow } from './schema';

/**
 * A project's saved plans — the {@link HistoryStores} half of a source, and
 * **independent of every batch** (D12, D27).
 *
 * Independent is the contract rather than a description of today's wiring. A
 * save takes no turn at the write coordinator: it runs on its own connection,
 * checks its quota inside its own write, and survives whatever the batch beside
 * it decides. A plan is immutable once written, so there is nothing for a
 * rollback to make consistent, and an author who saved a plan while somebody
 * else's batch was open must not lose it to that batch's refusal.
 *
 * What that costs is contention rather than correctness: a save that meets the
 * database's own write lock answers `snapshot_busy` instead of waiting behind
 * an editing session (`refuseToWaitForWriteLock`).
 *
 * **`holdingOf` and `bodyOf` are deliberately absent**, and were never port
 * methods: they take a `Drizzle` because the quota has to be read inside the
 * write's own transaction, and their only callers are the adapter itself and
 * its own database tests. A port naming a driver's handle is a port only that
 * driver can implement, and it was this file's own mistake — written from the
 * class's public surface rather than from what a caller needs.
 */
export interface SavedPlanStore {
  /**
   * Writes a plan's header and bodies, refusing through `check` inside the
   * write's own transaction — which is where a quota has to be read, or two
   * saves at 99 of 100 both pass.
   */
  write<Refusal>(
    plan: SavedPlanWrite,
    check: (holding: SavedPlanHoldingRow, incomingBytes: number) => Promise<Refusal | null>,
  ): Promise<SavedPlanWriteOutcome<Refusal>>;
  readOf(savedPlanId: string): Promise<StoredSavedPlan | null>;
  listOf(projectId: string): Promise<SavedPlanRow[]>;
  /** Who may rename or delete one plan, as one row: the project's owner and the author. */
  principalsOf(savedPlanId: string): Promise<SavedPlanPrincipals | null>;
  renameTo(savedPlanId: string, name: string): Promise<SavedPlanTouchOutcome>;
  deleteOf(savedPlanId: string): Promise<SavedPlanTouchOutcome>;
}

/**
 * The whole-project read a save is taken from, on a snapshot of its own.
 *
 * Its own port beside {@link SavedPlanStore} because it is the one read in the
 * system that has to be **coherent across seventeen queries**: a save made
 * while somebody is editing must not carry rows from two different moments. On
 * SQLite that is a `BEGIN DEFERRED` on a connection nothing else is using; a
 * source with snapshot reads of its own would meet it another way, which is why
 * the port says what it answers and not how.
 */
export interface SavedPlanCaptureStore {
  readPlanInput(projectId: string): Promise<PlanInputReads | null>;
}

/**
 * The stores a source offers that are **not** part of any batch (D27).
 *
 * Saved plans are the whole of it today. They open their own connection per
 * call, check their quota inside their own write, take **no turn** at the write
 * coordinator, and survive a batch's outcome either way — a save that succeeded
 * while a batch was open is still there whether that batch committed or rolled
 * back. That is a property of the feature rather than an accident of the
 * wiring: a plan is immutable once written, so there is nothing for a rollback
 * to be consistent with.
 *
 * Separate from {@link TransactionalStores} rather than a section of it,
 * because the type is what stops a command enlisting one: `Scope` carries the
 * transactional composition alone, so `scope.stores.savedPlans` does not
 * compile.
 */
export interface HistoryStores {
  savedPlans: SavedPlanStore;
  savedPlanCapture: SavedPlanCaptureStore;
}

/**
 * Everything a source offers, as one composition (D22).
 *
 * A composition rather than one interface: a source implements the ports it
 * has, and the type of what it composes says which services can then be built
 * over it. A browser source with no accounts is certified for what it has and
 * is not asked about the rest.
 */
export type Stores = TransactionalStores & HistoryStores;

/**
 * The audit stamp, from the ring it belongs to.
 *
 * Re-exported rather than moved-and-forgotten: ninety files in this app import
 * it from this module and the direction is right either way — this is the
 * adapter, `@wbs/core` is the application ring, and naming its application's
 * types is what an adapter does.
 */
export type { WriteStamp };
