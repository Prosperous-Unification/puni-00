import { closeSync, constants, lstatSync, openSync } from 'node:fs';

import { type } from '@shared/validation';
import { Database } from 'bun:sqlite';

import {
  checkRunRecordsOwnerOnly,
  checkRunRecordsVersion,
  runRecordsPathOf,
} from '../resources/run-record-file';
import type { LeftoverProcess, ScopeCounters } from './scope';

/** The service a `puni.host-service` container declared, and the bounds Docker enforces on it. */
export interface HostServiceBound {
  name: string;
  memoryBytes: number;
  cpuCores: number;
}

/**
 * One container the run saw start, and whether it ran labelled and inside the declared bound.
 * `host-service` is a declared host service's container beside the job, run under its own
 * bounds (`dash-host-jobs` J16 amendment, A-ATTR-HOSTSVC-1); it is listed, never charged.
 */
export type ContainerVerdict =
  | { id: string; verdict: 'bounded' | 'unlabelled' | 'unbounded' | 'unverified'; reason: string }
  | { id: string; verdict: 'host-service'; reason: string; hostService: HostServiceBound };

/** Whether `container` is accounted for: the job's own bounded container or a bounded host service. */
export function isAttributed(container: ContainerVerdict): boolean {
  // Proof: dropping the host-service term made `a record whose only other container is a bounded
  // host service is complete (task 6.22)` (propose.test.ts) refuse with two complete records, and
  // three host-service tests in audit.test.ts fail (2026-11-19).
  return container.verdict === 'bounded' || container.verdict === 'host-service';
}

/**
 * Whether the containers a run saw leave its attribution incomplete (J16): any one neither the
 * job's bounded container nor a declared, bounded host service.
 */
export function isAttributionIncomplete(containers: readonly ContainerVerdict[]): boolean {
  return containers.some((container) => !isAttributed(container));
}

/** The labelled containers' advisory usage at one sample (J16), or why it could not be read. */
export type ContainerSample =
  | { labelled: number; sampled: number; memoryBytes: number; cpuPercent: number }
  | { error: string };

/**
 * One sample of a run: at the gate before the payload, every interval, and at payload exit.
 * `counters` is null when the reading failed; `failure` then names why.
 */
export interface RunSample {
  kind: 'gate' | 'interval' | 'exit';
  observedAt: number;
  counters: ScopeCounters | null;
  /** The tmp directory's readable bytes; a lower bound when `tmpUnreadable` is not empty. */
  tmpBytes: number | null;
  /**
   * Paths under the tmp directory the walk could not read (task 6.23), relative, at most 32;
   * empty on a sample recorded before task 6.23.
   */
  tmpUnreadable: string[];
  /** How many more unreadable paths this sample saw than `tmpUnreadable` lists. */
  tmpUnreadableOmitted: number;
  containers: ContainerSample | null;
  failure: string | null;
}

/** What a run record pins at the gate (J2, J7). */
export interface RunStart {
  jobId: string;
  type: string;
  label: string;
  descriptor: unknown;
  descriptorDigest: string;
  cataloguePath: string;
  /** The launcher checkout's HEAD, whose catalogue admitted the job; for `gate` the tested SHA is in `argv`. */
  launcherSha: string;
  argumentProfile: string;
  argv: readonly string[];
  hostClass: string;
  /**
   * The payload's toolchain (`toolchainOf` in `catalogue.ts`); absent only on a record written before
   * slice 4, which `propose` names and leaves out as not comparable.
   */
  toolchain?: string;
  /** Present on a calibration record (`ops job calibrate`, J9); an ordinary run omits it. */
  calibration?: true;
  unit: string;
  cgroup: string;
  tmpDirectory: string;
  units: { exclusiveId: string; path: string }[];
  startedAt: number;
}

/**
 * What the launcher did with the processes left in the job's scope once its session had ended
 * (task 6.24, A-SCOPE-LEFTOVER-1): how many there were (the scope's subtree), at most
 * {@link LEFTOVER_EXAMPLE_LIMIT} of the scope's own described, and what ended them: `none` (there
 * were none), `SIGTERM` within the grace, `SIGKILL` after it, or `timeout` when the scope still
 * had members after the SIGKILL wait. Two outcomes carry their `failure` (review of #954 S3-1):
 * `signal-failed` when `systemctl --user kill` failed, so no signal was delivered and nothing was
 * waited for, and `unverified` when the scope's members became unreadable during the wait. Every
 * outcome but `none`, `SIGTERM` and `SIGKILL` leaves the tmp directory charged.
 */
export type LeftoverProcesses =
  | {
      count: number;
      examples: LeftoverProcess[];
      endedWith: 'none' | 'SIGTERM' | 'SIGKILL' | 'timeout';
    }
  | {
      count: number;
      examples: LeftoverProcess[];
      endedWith: 'signal-failed' | 'unverified';
      failure: string;
    };

/** How many leftovers a run record describes; the rest are only counted. */
export const LEFTOVER_EXAMPLE_LIMIT = 8;

/** What a run record adds after the payload exits. */
export interface RunOutcome {
  endedAt: number;
  exitCode: number;
  signal: string | null;
  telemetryFailure: string | null;
  ledgerFailure: string | null;
  attributionIncomplete: boolean;
  containers: ContainerVerdict[];
  /** Why the singleton guard did not hold for this run (review H5); absent when it did. */
  guardLost?: string;
  /** Why the launcher ended the payload itself (its type's `maxRuntimeMinutes`); absent otherwise. */
  endedByLauncher?: string;
  /** Absent on a record written before task 6.24, or when the ending step could not run. */
  leftoverProcesses?: LeftoverProcesses;
}

/** A run record as `ops job status` and the tests read it. */
export interface RunRecord extends RunStart {
  endedAt: number | null;
  exitCode: number | null;
  signal: string | null;
  telemetryFailure: string | null;
  ledgerFailure: string | null;
  attributionIncomplete: boolean;
  containers: ContainerVerdict[];
  /** Why the singleton guard did not hold for this run (review H5); absent when it did. */
  guardLost?: string;
  /** Why the launcher ended the payload itself (its type's `maxRuntimeMinutes`); absent otherwise. */
  endedByLauncher?: string;
  /** Absent on a record written before task 6.24, or when the ending step could not run. */
  leftoverProcesses?: LeftoverProcesses;
  /** The largest `memory.peak` sampled, bytes; null before any counter was read. */
  peakMemoryBytes: number | null;
  /** The largest tmp sample, bytes: a lower bound, disk outside `TMPDIR` not covered (J7). */
  peakTmpBytes: number | null;
  /**
   * The payload's own wall time, gate to leader exit; the leftover ending after it (task 6.24)
   * is excluded. Null before the outcome is recorded.
   */
  wallMs: number | null;
  samples: RunSample[];
}

const SCHEMA = `CREATE TABLE runs (job_id TEXT PRIMARY KEY, start TEXT NOT NULL, outcome TEXT);
CREATE TABLE samples (sequence INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL REFERENCES runs(job_id), sample TEXT NOT NULL);
PRAGMA user_version=1`;

const Counters = type({
  memoryPeak: 'number',
  memoryCurrent: 'number',
  cpuUsageUsec: 'number',
  cpuUserUsec: 'number',
  cpuSystemUsec: 'number',
  pidsCurrent: 'number',
  memoryHighEvents: 'number',
});
const SampleShape = type({
  kind: "'gate'|'interval'|'exit'",
  observedAt: 'number',
  counters: Counters.or('null'),
  tmpBytes: 'number | null',
  'tmpUnreadable?': 'string[]',
  'tmpUnreadableOmitted?': 'number.integer >= 0',
  containers: type({
    labelled: 'number',
    sampled: 'number',
    memoryBytes: 'number',
    cpuPercent: 'number',
  })
    .or({ error: 'string' })
    .or('null'),
  failure: 'string | null',
});
const StartShape = type({
  jobId: 'string',
  type: 'string',
  label: 'string',
  descriptor: 'unknown',
  descriptorDigest: 'string',
  cataloguePath: 'string',
  launcherSha: 'string',
  argumentProfile: 'string',
  argv: 'string[]',
  hostClass: 'string',
  'toolchain?': 'string > 0',
  'calibration?': 'true',
  unit: 'string',
  cgroup: 'string',
  tmpDirectory: 'string',
  units: type({ exclusiveId: 'string', path: 'string' }).array(),
  startedAt: 'number',
});
const Leftover = type({ pid: 'number.integer > 0', comm: 'string', cmdline: 'string' });
const OutcomeShape = type({
  endedAt: 'number',
  exitCode: 'number',
  signal: 'string | null',
  telemetryFailure: 'string | null',
  ledgerFailure: 'string | null',
  attributionIncomplete: 'boolean',
  'guardLost?': 'string > 0',
  'endedByLauncher?': 'string > 0',
  'leftoverProcesses?': type({
    count: 'number.integer >= 0',
    examples: Leftover.array(),
    endedWith: "'none'|'SIGTERM'|'SIGKILL'|'timeout'",
  }).or({
    count: 'number.integer >= 0',
    examples: Leftover.array(),
    endedWith: "'signal-failed'|'unverified'",
    failure: 'string > 0',
  }),
  containers: type({
    id: 'string',
    verdict: "'bounded'|'unlabelled'|'unbounded'|'unverified'",
    reason: 'string',
  })
    // Proof: admitting 'host-service' in the branch above made `a host-service verdict without
    // its declared bounds is refused` (run-records.test.ts) write the record (2026-11-19).
    .or({
      id: 'string',
      verdict: "'host-service'",
      reason: 'string',
      hostService: { name: 'string > 0', memoryBytes: 'number > 0', cpuCores: 'number > 0' },
    })
    .array(),
});

/**
 * The host-job run records (`dash-host-jobs` J7): one record per admitted host job with its
 * samples, in `<root>/.dash/host-job-runs.sqlite` beside the resource ledger. A separate file
 * because the ledger's job snapshot is the runtime's closed shape (slice 3 assumption S3-A4).
 */
export class HostJobRunRecords {
  private constructor(private readonly db: Database) {}

  /** The run record file of the managed root `root`. */
  static pathOf(root: string): string {
    return runRecordsPathOf(root);
  }

  /**
   * Open the run records of `root`, creating them only while the ledger holds no host job:
   * a ledger with host jobs and no run records lost them, which is refused, never recreated.
   * @throws Error when the file is a link, not owner-only, of another schema, or missing beside
   * a ledger that has host jobs.
   */
  static open(root: string, ledgerHasHostJobs: boolean): HostJobRunRecords {
    const path = HostJobRunRecords.pathOf(root);
    try {
      lstatSync(path);
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
      // Proof: creating it here unconditionally made `refuses run records missing beside a
      // ledger with host jobs` (job-run.test.ts) recreate them and run the job, no refusal (2026-11-01).
      if (ledgerHasHostJobs)
        throw new Error(
          `host job run records ${path} are missing beside a ledger that has host jobs; restore them from backup`,
          { cause },
        );
      try {
        closeSync(openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600));
      } catch (raced) {
        // Another launcher created it first; its schema is written under the write lock below.
        if (!(raced instanceof Error && 'code' in raced && raced.code === 'EEXIST')) throw raced;
      }
    }
    checkRunRecordsOwnerOnly(path);
    const db = new Database(path, { create: false, strict: true });
    try {
      db.run('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
      db.transaction(() => {
        const version = db.query<{ user_version: number }, []>('PRAGMA user_version').get();
        const tables = db
          .query<{ count: number }, []>(
            "SELECT count(*) AS count FROM sqlite_master WHERE type='table'",
          )
          .get();
        // A file with no table is one this class just created, here or in a racing launcher.
        if (version?.user_version === 0 && tables?.count === 0) {
          db.run(SCHEMA);
          return;
        }
        checkRunRecordsVersion(path, version?.user_version);
      }).immediate();
    } catch (cause) {
      db.close();
      throw cause;
    }
    return new HostJobRunRecords(db);
  }

  /**
   * Open existing run records read-only, for `ops job status`: never creates them (review F7).
   * @throws Error when they are missing, a link, not owner-only, or of another schema.
   */
  static openForReading(root: string): HostJobRunRecords {
    const path = HostJobRunRecords.pathOf(root);
    try {
      lstatSync(path);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
        throw new Error(
          `host job run records ${path} are missing; \`ops pool init\` creates them`,
          { cause },
        );
      throw cause;
    }
    checkRunRecordsOwnerOnly(path);
    const db = new Database(path, { readonly: true, strict: true });
    try {
      db.run('PRAGMA busy_timeout=10000');
      checkRunRecordsVersion(
        path,
        db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version,
      );
    } catch (cause) {
      db.close();
      throw cause;
    }
    return new HostJobRunRecords(db);
  }

  close(): void {
    this.db.close();
  }

  /** Persist the run's start and its gate sample in one transaction, before the gate opens. */
  begin(start: RunStart, gate: RunSample): void {
    this.db
      .transaction(() => {
        this.db
          .query('INSERT INTO runs(job_id, start) VALUES (?, ?)')
          .run(start.jobId, JSON.stringify(StartShape.assert(start)));
        this.insertSample(start.jobId, gate);
      })
      .immediate();
  }

  /** Persist one sample. */
  sample(jobId: string, sample: RunSample): void {
    this.db
      .transaction(() => {
        this.insertSample(jobId, sample);
      })
      .immediate();
  }

  private insertSample(jobId: string, sample: RunSample): void {
    this.db
      .query('INSERT INTO samples(job_id, sample) VALUES (?, ?)')
      .run(jobId, JSON.stringify(SampleShape.assert(sample)));
  }

  /** Persist the run's outcome; a run ends once. */
  finish(jobId: string, outcome: RunOutcome): void {
    this.db
      .transaction(() => {
        const changed = this.db
          .query('UPDATE runs SET outcome=? WHERE job_id=? AND outcome IS NULL')
          .run(JSON.stringify(OutcomeShape.assert(outcome)), jobId);
        if (changed.changes !== 1) throw new Error(`host job run ${jobId} is unknown or ended`);
      })
      .immediate();
  }

  /**
   * The run record of `jobId`, or null when the job never reached its gate sample.
   * @throws Error when a stored row is malformed: only this class writes the file.
   */
  inspect(jobId: string): RunRecord | null {
    const row = this.db
      .query<{ start: string; outcome: string | null }, [string]>(
        'SELECT start, outcome FROM runs WHERE job_id=?',
      )
      .get(jobId);
    return row === null ? null : this.recordOf(jobId, row);
  }

  /**
   * Every run record, oldest gate first: what `propose` and `audit` read (J9).
   * @throws Error when a stored row is malformed: only this class writes the file.
   */
  list(): RunRecord[] {
    return this.db
      .query<{ job_id: string; start: string; outcome: string | null }, []>(
        'SELECT job_id, start, outcome FROM runs ORDER BY rowid',
      )
      .all()
      .map((row) => this.recordOf(row.job_id, row));
  }

  private recordOf(jobId: string, row: { start: string; outcome: string | null }): RunRecord {
    const start = StartShape.assert(JSON.parse(row.start));
    const outcome = row.outcome === null ? null : OutcomeShape.assert(JSON.parse(row.outcome));
    const samples = this.db
      .query<{ sample: string }, [string]>(
        'SELECT sample FROM samples WHERE job_id=? ORDER BY sequence',
      )
      .all(jobId)
      .map((stored): RunSample => {
        const { tmpUnreadable, tmpUnreadableOmitted, ...sample } = SampleShape.assert(
          JSON.parse(stored.sample),
        );
        // A sample written before task 6.23 has neither field: its walk listed nothing.
        // Proof: requiring both fields made `a sample recorded before task 6.23 loads with no
        // unreadable paths` (run-records.test.ts) throw on the stored row (2026-11-19).
        return {
          ...sample,
          tmpUnreadable: tmpUnreadable ?? [],
          tmpUnreadableOmitted: tmpUnreadableOmitted ?? 0,
        };
      });
    const peaks = samples.flatMap((sample) =>
      sample.counters ? [sample.counters.memoryPeak] : [],
    );
    const tmp = samples.flatMap((sample) => (sample.tmpBytes === null ? [] : [sample.tmpBytes]));
    return {
      ...start,
      endedAt: outcome?.endedAt ?? null,
      exitCode: outcome?.exitCode ?? null,
      signal: outcome?.signal ?? null,
      telemetryFailure: outcome?.telemetryFailure ?? null,
      ledgerFailure: outcome?.ledgerFailure ?? null,
      attributionIncomplete: outcome?.attributionIncomplete ?? false,
      containers: outcome?.containers ?? [],
      ...(outcome?.guardLost === undefined ? {} : { guardLost: outcome.guardLost }),
      ...(outcome?.endedByLauncher === undefined
        ? {}
        : { endedByLauncher: outcome.endedByLauncher }),
      // A record written before task 6.24 has no field: nothing was ended for it.
      ...(outcome?.leftoverProcesses === undefined
        ? {}
        : { leftoverProcesses: outcome.leftoverProcesses }),
      peakMemoryBytes: peaks.length === 0 ? null : Math.max(...peaks),
      peakTmpBytes: tmp.length === 0 ? null : Math.max(...tmp),
      wallMs: outcome === null ? null : outcome.endedAt - start.startedAt,
      samples,
    };
  }
}

/**
 * `run <id> ended N leftover processes with SIGKILL (node serve.cjs ×2, …)` for `ops job status`
 * and `ops job audit` (task 6.24), naming the described command lines by count; null for a run
 * that left none or whose record predates the ending step.
 */
export function leftoverNote(record: RunRecord): string | null {
  const leftovers = record.leftoverProcesses;
  if (leftovers === undefined || leftovers.count === 0) return null;
  const counted = new Map<string, number>();
  for (const example of leftovers.examples) {
    const name = example.cmdline === '' ? example.comm : example.cmdline;
    counted.set(name, (counted.get(name) ?? 0) + 1);
  }
  const undescribed = leftovers.count - leftovers.examples.length;
  const names = [
    ...[...counted].map(([name, count]) => `${name} ×${String(count)}`),
    ...(undescribed > 0 ? [`${String(undescribed)} more undescribed`] : []),
  ].join(', ');
  const count = String(leftovers.count);
  const charged = 'so its tmp directory stays charged';
  let ending: string;
  switch (leftovers.endedWith) {
    case 'none':
      return null;
    case 'SIGTERM':
    case 'SIGKILL':
      ending = `ended ${count} leftover processes with ${leftovers.endedWith}`;
      break;
    case 'timeout':
      ending = `could not end ${count} leftover processes: its scope still had members after SIGKILL, ${charged}`;
      break;
    case 'signal-failed':
      ending = `could not signal ${count} leftover processes, no signal was delivered (${leftovers.failure}), ${charged}`;
      break;
    case 'unverified':
      ending = `could not verify that ${count} leftover processes ended (${leftovers.failure}), ${charged}`;
      break;
  }
  return `run ${record.jobId} ${ending} (${names})`;
}
