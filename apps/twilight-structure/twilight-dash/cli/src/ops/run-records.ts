import { closeSync, constants, lstatSync, openSync } from 'node:fs';
import { join } from 'node:path';

import { type } from '@shared/validation';
import { Database } from 'bun:sqlite';

import type { ScopeCounters } from './scope';

/** One container the run saw start, and whether it ran labelled and inside the declared bound. */
export interface ContainerVerdict {
  id: string;
  verdict: 'bounded' | 'unlabelled' | 'unbounded' | 'unverified';
  reason: string;
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
  tmpBytes: number | null;
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
  unit: string;
  cgroup: string;
  tmpDirectory: string;
  units: { exclusiveId: string; path: string }[];
  startedAt: number;
}

/** What a run record adds after the payload exits. */
export interface RunOutcome {
  endedAt: number;
  exitCode: number;
  signal: string | null;
  telemetryFailure: string | null;
  ledgerFailure: string | null;
  attributionIncomplete: boolean;
  containers: ContainerVerdict[];
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
  /** The largest `memory.peak` sampled, bytes; null before any counter was read. */
  peakMemoryBytes: number | null;
  /** The largest tmp sample, bytes: a lower bound, disk outside `TMPDIR` not covered (J7). */
  peakTmpBytes: number | null;
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
  unit: 'string',
  cgroup: 'string',
  tmpDirectory: 'string',
  units: type({ exclusiveId: 'string', path: 'string' }).array(),
  startedAt: 'number',
});
const OutcomeShape = type({
  endedAt: 'number',
  exitCode: 'number',
  signal: 'string | null',
  telemetryFailure: 'string | null',
  ledgerFailure: 'string | null',
  attributionIncomplete: 'boolean',
  containers: type({
    id: 'string',
    verdict: "'bounded'|'unlabelled'|'unbounded'|'unverified'",
    reason: 'string',
  }).array(),
});

/**
 * The run records must be an owner-only regular file: no link, this account's, no group or
 * world bits.
 * @throws Error naming the file otherwise.
 */
function checkOwnerOnly(path: string): void {
  const identity = lstatSync(path);
  // Proof: without this refusal `refuses run records that are not an owner-only regular file`
  // (job-run.test.ts) opened the symlink. Removing only the link test stays green, because
  // `!isFile()` refuses a link too (2026-11-02, Slice 3 review F2d).
  if (
    identity.isSymbolicLink() ||
    !identity.isFile() ||
    identity.uid !== process.getuid?.() ||
    (identity.mode & 0o077) !== 0
  )
    throw new Error(`host job run records ${path} must be an owner-only regular file`);
}

/** @throws Error unless the records are schema version 1. */
function checkVersion(path: string, version: number | undefined): void {
  // Proof: without it `refuses run records of another schema version` (job-run.test.ts)
  // opened version 7 (2026-11-02, Slice 3 review F2d).
  if (version !== 1)
    throw new Error(
      `host job run records ${path} have schema version ${String(version)}; this Dash knows 1`,
    );
}

/**
 * The host-job run records (`dash-host-jobs` J7): one record per admitted host job with its
 * samples, in `<root>/.dash/host-job-runs.sqlite` beside the resource ledger. A separate file
 * because the ledger's job snapshot is the runtime's closed shape (slice 3 assumption S3-A4).
 */
export class HostJobRunRecords {
  private constructor(private readonly db: Database) {}

  /** The run record file of the managed root `root`. */
  static pathOf(root: string): string {
    return join(root, '.dash', 'host-job-runs.sqlite');
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
    checkOwnerOnly(path);
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
        checkVersion(path, version?.user_version);
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
    checkOwnerOnly(path);
    const db = new Database(path, { readonly: true, strict: true });
    try {
      db.run('PRAGMA busy_timeout=10000');
      checkVersion(
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
    if (row === null) return null;
    const start = StartShape.assert(JSON.parse(row.start));
    const outcome = row.outcome === null ? null : OutcomeShape.assert(JSON.parse(row.outcome));
    const samples = this.db
      .query<{ sample: string }, [string]>(
        'SELECT sample FROM samples WHERE job_id=? ORDER BY sequence',
      )
      .all(jobId)
      .map((sample) => SampleShape.assert(JSON.parse(sample.sample)));
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
      peakMemoryBytes: peaks.length === 0 ? null : Math.max(...peaks),
      peakTmpBytes: tmp.length === 0 ? null : Math.max(...tmp),
      wallMs: outcome === null ? null : outcome.endedAt - start.startedAt,
      samples,
    };
  }
}
