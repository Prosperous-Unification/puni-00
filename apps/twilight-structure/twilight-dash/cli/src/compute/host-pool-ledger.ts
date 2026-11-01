import { type } from '@shared/validation';
import { Database } from 'bun:sqlite';

/** The dimensions a `host_pool` binding names besides an exclusive id (`dash-host-jobs` J10). */
export const HOST_POOL_DIMENSIONS = ['cpuCores', 'memoryGib', 'tmpDiskGib'] as const;
export type HostPoolDimension = (typeof HOST_POOL_DIMENSIONS)[number];

/** Whether `dimension` is counted in units of the envelope rather than an exclusive id. */
export function isCountedDimension(dimension: string): dimension is HostPoolDimension {
  return (HOST_POOL_DIMENSIONS as readonly string[]).includes(dimension);
}

/** A countable dimension, or an exclusive id as the catalogue spells it (`gate_tree`). */
export const HostPoolDimensionShape = /^(?:cpuCores|memoryGib|tmpDiskGib|[a-z][a-z0-9_]{0,63})$/;

/** How often the ledger's change sequence is read for {@link HostPoolLedger.onChange}. */
export const LEDGER_POLL_MS = 2_000;

/**
 * The read-only port the reporter reads a host pool through (`dash-host-jobs` J10, task 5.1):
 * what the managed-resource ledger of this host reserves now, and a change notification after
 * every admission and settlement. It never writes the ledger and never admits.
 */
export interface HostPoolLedger {
  /**
   * The units every unreleased host job reserves of `dimension`: cores and memory while its
   * compute entry is outstanding, tmp disk while its tmp entry is, one per unit of an exclusive
   * id while that unit is. Worktree uses are counted in disk units by the runtime, never here.
   */
  reserved(dimension: string): number;
  /** Calls `listener` once the ledger has changed since the last read; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  close(): void;
}

/** The fields of a `host_jobs` snapshot the reserved sum reads; the runtime owns the rest. */
const ReservingJob = type({
  descriptor: {
    envelope: {
      cpuCores: 'number.integer >= 0',
      memoryGib: 'number.integer >= 0',
      tmpDiskGib: 'number.integer >= 0',
    },
  },
  compute: { state: 'string' },
  tmpDisk: { state: 'string' },
  units: type({ exclusiveId: 'string', state: 'string' }).array(),
});

/** The ledger schema `ResourceRuntime` writes since `dash-host-jobs` slice 2. */
const LEDGER_VERSION = 1;

/**
 * Opens the managed-resource ledger at `path` read-only. Change is noticed by reading the
 * largest `host_job_events` sequence every `pollMs`: the runtime commits one row with every
 * admission and every settlement, in the same transaction as the reservation change, so a new
 * sequence is exactly a new reservation state (S5-A3).
 * @throws when the file is absent or unreadable, or is not a version-1 ledger: a binding that
 * names the host pool has no honest figure without it.
 */
export function openHostPoolLedger(path: string, pollMs = LEDGER_POLL_MS): HostPoolLedger {
  let db: Database;
  try {
    db = new Database(path, { readonly: true, strict: true });
  } catch (cause) {
    throw new Error(`host pool ledger ${path} cannot be opened read-only`, { cause });
  }
  const version = db.query<{ user_version: number }, []>('PRAGMA user_version').get();
  if (version?.user_version !== LEDGER_VERSION) {
    db.close();
    throw new Error(
      `host pool ledger ${path} is version ${String(version?.user_version)}, not ${String(LEDGER_VERSION)}`,
    );
  }
  const sequence = (): number => {
    const row = db
      .query<{ sequence: number }, []>(
        'SELECT COALESCE(MAX(sequence),0) AS sequence FROM host_job_events',
      )
      .get();
    if (row === null) throw new Error(`host pool ledger ${path} answered no sequence`);
    return row.sequence;
  };
  return {
    reserved(dimension) {
      let total = 0;
      for (const row of db
        .query<{ snapshot: string }, []>('SELECT snapshot FROM host_jobs')
        .all()) {
        // Only the runtime writes this owner-only ledger; a malformed snapshot throws.
        const job = ReservingJob.assert(JSON.parse(row.snapshot));
        const { envelope } = job.descriptor;
        if (dimension === 'cpuCores' || dimension === 'memoryGib') {
          if (job.compute.state !== 'released') total += envelope[dimension];
        } else if (dimension === 'tmpDiskGib') {
          if (job.tmpDisk.state !== 'released') total += envelope.tmpDiskGib;
        } else
          total += job.units.filter(
            (unit) => unit.exclusiveId === dimension && unit.state !== 'released',
          ).length;
      }
      return total;
    },
    onChange(listener) {
      let seen = sequence();
      const timer = setInterval(() => {
        const now = sequence();
        if (now === seen) return;
        seen = now;
        listener();
      }, pollMs);
      return () => {
        clearInterval(timer);
      };
    },
    close() {
      db.close();
    },
  };
}
