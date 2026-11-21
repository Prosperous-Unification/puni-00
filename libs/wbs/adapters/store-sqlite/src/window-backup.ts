import { createHash } from 'node:crypto';
import {
  type BigIntStats,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import {
  readWindowBackupReport,
  type WindowBackupReport,
} from '@wbs/contracts/window-backup-report';
import { sql } from 'drizzle-orm';

import { snapshotDatabase } from './backup';
import { openExistingConnection, openReadOnlyDatabase, openWindowSourceDatabase } from './db';
import { readMigrationFolders } from './migrate-down';
import { type AppliedMigrationIdentity, readAppliedMigrationIdentities } from './migration-set';

export type { WindowBackupReport } from '@wbs/contracts/window-backup-report';

/** Explicit operator paths; the candidate migration catalogue is never fabricated. */
export interface WindowBackupRequest {
  readonly sourcePath: string;
  readonly snapshotPath: string;
  readonly reportPath: string;
  readonly migrationsFolder: string;
}

/** Publication refers to this invocation's artifact, never to a competitor occupying its path. */
type Publication = 'not_published' | 'published' | 'unknown';

/** Observed acquisition locations, never current inode ownership or permission to delete. */
export interface WindowStageLocation {
  readonly kind: 'snapshot' | 'report';
  readonly parent: string;
  /** Null means acquisition threw without returning its possibly created pathname. */
  readonly path: string | null;
}

/** Retained/possibly published artifacts; operators reconcile only under exclusive namespace control. */
export interface WindowBackupArtifacts {
  readonly snapshotPath: string;
  readonly reportPath: string;
  readonly snapshotPublication: Publication;
  readonly reportPublication: Publication;
  readonly stages: readonly WindowStageLocation[];
}

/** Auxiliary retention metadata is separate from the unchanged eight-field report wire. */
export interface WindowBackupReceipt {
  readonly report: WindowBackupReport;
  readonly artifacts: WindowBackupArtifacts;
}

interface WindowOperation {
  readonly snapshotPath: string;
  readonly reportPath: string;
  snapshotPublication: Publication;
  reportPublication: Publication;
  readonly stages: {
    readonly kind: 'snapshot' | 'report';
    readonly parent: string;
    path: string | null;
  }[];
}

const failures = new WeakMap<object, WindowBackupArtifacts>();

// Proof: window-retention-diagnostic-deep-detachment; sharing the nested stage array let a consumer alter retained diagnostics.
// Observed "returns detached failure stage diagnostics without changing retained evidence" fail; restored GREEN.
function retainArtifacts(operation: WindowBackupArtifacts): WindowBackupArtifacts {
  return { ...operation, stages: operation.stages.map((stage) => ({ ...stage })) };
}

/** Detached diagnostics for a failure actually observed here; never inferred from an error tree. */
export function readWindowBackupFailure(cause: unknown): WindowBackupArtifacts | null {
  if (typeof cause !== 'object' || cause === null) return null;
  const context = failures.get(cause);
  return context === undefined ? null : retainArtifacts(context);
}

/** Preserves one actual Error identity, or every thrown value in a paired failure. */
function composeWindowFailure(causes: readonly unknown[], message: string): Error {
  const primary = causes[0];
  // Proof: window-single-error-identity changes/removes this production behavior boundary; observed named RED: retains genuine lower snapshot cleanup uncertainty and propagates its exact identity. Actual production-path negative; no broader host/deployment claim.
  return causes.length === 1 && primary instanceof Error
    ? primary
    : // Proof: window-aggregate-primary-cause changes/removes this production behavior boundary; observed named RED: preserves actual source read and descriptor close failures before checkpoint. Actual production-path negative; no broader host/deployment claim.
      // Proof: window-aggregate-secondary-failure changes/removes this production behavior boundary; observed named RED: preserves actual source read and descriptor close failures before checkpoint. Actual production-path negative; no broader host/deployment claim.
      new AggregateError(causes, message, { cause: primary });
}

type Observation<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly cause: unknown };

/** Retains the acquisition attempt even if the native call creates a directory before throwing. */
function createStage(
  parent: string,
  kind: 'snapshot' | 'report',
  operation: WindowOperation,
): string {
  mkdirSync(parent, { recursive: true });
  const stage: { kind: 'snapshot' | 'report'; parent: string; path: string | null } = {
    kind,
    parent,
    path: null,
  };
  // Proof: window-retention-stage-attempt-before-native-acquisition; recording acquisition only after mkdtemp lost possibly created stages.
  // Observed "reports possible snapshot staging when native acquisition throws after creation" fail; restored GREEN.
  // Observed "reports possible report staging when native acquisition throws after creation" fail; restored GREEN.
  operation.stages.push(stage);
  const path = mkdtempSync(join(parent, '.window-' + kind + '-'));
  // Proof: window-retention-stage-returned-path; omitting returned-path retention lost successful stage locations.
  // Observed "retains usable snapshot and both stage links in separate detached success metadata" fail; restored GREEN.
  stage.path = path;
  return path;
}

/** Syncs one publication directory and preserves a primary failure beside its close failure. */
function syncDirectory(path: string): void {
  const close = closeSync;
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY);
  const causes: unknown[] = [];
  try {
    // Proof: window-retention-parent-directory-sync; skipping parent fsync bypassed the reached sync/close pair.
    // Observed "preserves published report and stages after parent sync failure and keeps descriptor close failures" fail; restored GREEN.
    fsyncSync(descriptor);
  } catch (cause) {
    causes.push(cause);
  }
  // Proof: window-retention-parent-directory-close; skipping parent close lost its reached failure.
  // Observed "preserves published report and stages after parent sync failure and keeps descriptor close failures" fail; restored GREEN.
  try {
    close(descriptor);
  } catch (cause) {
    causes.push(cause);
  }
  if (causes.length !== 0) throw composeWindowFailure(causes, 'window directory sync/close failed');
}

function fileIdentity(stats: BigIntStats): string {
  return [stats.dev, stats.ino, stats.mode, stats.size, stats.mtimeNs, stats.ctimeNs].join(':');
}

/** Hashes one readable regular file through its acquired descriptor, without following a leaf link. */
function readDigest(
  path: string,
  field: string,
): { readonly sha256: string; readonly bytes: number } {
  const close = closeSync;
  let descriptor: number;
  try {
    // Proof: window-digest-nonblocking-open changes/removes this bounded native acquisition boundary; observed named RED: refuses a FIFO source without waiting for a writer or creating artifacts. Actual CLI child is killed only under missing NONBLOCK; the named parent assertion fails within its deadline. No outer-runner timeout credit.
    // Proof: window-digest-leaf-nofollow changes/removes this production acquisition/order boundary; observed named RED: refuses a live source leaf symlink before reading its descriptor. The later descriptor/path identity guard remains; this proves no descriptor content is consumed from a disallowed leaf link.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (cause) {
    throw new Error(field + ' cannot be opened', { cause });
  }
  let observation: Observation<{ readonly sha256: string; readonly bytes: number }>;
  try {
    observation = { ok: true, value: hashFileDescriptor(descriptor, path, field) };
  } catch (cause) {
    observation = { ok: false, cause };
  }
  try {
    // Proof: window-digest-descriptor-close changes/removes this production behavior boundary; observed named RED: preserves actual source read and descriptor close failures before checkpoint. Actual production-path negative; no broader host/deployment claim.
    close(descriptor);
  } catch (cause) {
    if (!observation.ok)
      // Proof: window-digest-operation-close-pair changes/removes this production behavior boundary; observed named RED: preserves actual source read and descriptor close failures before checkpoint. Actual production-path negative; no broader host/deployment claim.
      throw composeWindowFailure([observation.cause, cause], field + ' read/close failed');
    // Proof: window-digest-success-close-propagation changes/removes this production behavior boundary; observed named RED: propagates successful source read close failure exactly once before further observation. Actual production-path negative; no broader host/deployment claim.
    throw cause;
  }
  // Proof: window-digest-read-failure-propagation changes/removes this production failure/order boundary; observed named RED: refuses premature source EOF and closes its actual descriptor once. EOF is still detected by the hasher. The owner must propagate it rather than repeat reads or continue into later snapshot/hash work.
  if (!observation.ok) throw composeWindowFailure([observation.cause], field + ' read failed');
  return observation.value;
}

/** Borrows one acquired descriptor; never opens, closes or replaces the owner's file. */
function hashFileDescriptor(descriptor: number, path: string, field: string) {
  const before = fstatSync(descriptor, { bigint: true });
  // Proof: window-digest-readable-regular changes/removes this production behavior boundary; observed named RED: refuses source permission removal after native acquisition before reading its descriptor. Actual production-path negative; no broader host/deployment claim.
  if (!before.isFile() || (before.mode & 0o444n) === 0n)
    throw new Error(field + ' is not a readable regular file');
  const bytes = Number(before.size);
  // Proof: window-digest-physical-byte-bounds changes/removes this production bounds tuple boundary; observed named RED: refuses empty source bytes before a checkpoint can initialize the file; refuses unsafe trusted descriptor byte metadata before reading or acquiring SQLite. Real zero-byte input plus an explicitly malformed trusted fstat size; the latter is not a claim about a healthy filesystem supporting a nine-petabyte fixture.
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error(field + ' has invalid bytes');
  const digest = createHash('sha256');
  const chunk = Buffer.alloc(64 * 1024);
  let offset = 0;
  while (offset < bytes) {
    const count = readSync(descriptor, chunk, 0, Math.min(chunk.length, bytes - offset), offset);
    // Proof: window-digest-eof-progress changes/removes this bounded synchronous guard boundary; observed named RED: completes the real premature EOF refusal inside a bounded child. Parent invokes the real EOF negative in a child. The removed guard stalls that child, bounded SIGKILL becomes a named parent assertion failure; outer runner timeout is not credited.
    if (count === 0) throw new Error(field + ' truncated while reading');
    digest.update(chunk.subarray(0, count));
    offset += count;
  }
  // Proof: window-digest-file-identity-tuple changes/removes this production physical identity tuple boundary; observed named RED: refuses pathname replacement during actual source hashing before SQLite acquisition; refuses descriptor content change during actual source hashing before SQLite acquisition. One combined descriptor/path identity proof, exercised with actual rename/copy and descriptor content change. No independent healthy-ctime/fstat/lstat subpredicate claim.
  if (
    fileIdentity(before) !== fileIdentity(fstatSync(descriptor, { bigint: true })) ||
    fileIdentity(before) !== fileIdentity(lstatSync(path, { bigint: true }))
  )
    throw new Error(field + ' changed while reading');
  return { sha256: digest.digest('hex'), bytes };
}

function requireEmptyWal(path: string, field: 'source' | 'snapshot'): void {
  const wal = lstatSync(`${path}-wal`, { throwIfNoEntry: false });
  // Proof: window-wal-physical-state changes/removes this production physical WAL tuple boundary; observed named RED: refuses a WAL-only source write without checkpointing or changing the WAL evidence; refuses nonempty snapshot sidecar evidence before opening snapshot SQLite. Source is a genuine uncheckpointed writer with unchanged main identity. Snapshot is deliberate physical evidence, not the falsified ordinary-writer/same-header counterexample.
  if (wal !== undefined && (!wal.isFile() || wal.size !== 0))
    throw new Error(field + ' -wal must be absent or empty');
}

/** Completes and closes its checkpoint owner before the independent VACUUM owner opens. */
function checkpointSource(sourcePath: string): void {
  const connection = openExistingConnection(sourcePath);
  const causes: unknown[] = [];
  try {
    // Proof: window-checkpoint-zero-wait changes/removes this bounded native wait prerequisite boundary; observed named RED: completes the actual blocking reader checkpoint refusal inside a bounded child. The existing source connection defaults to5000ms. Real blocking reader is held while child deadline3500ms exposes omission without blocking the orchestrator.
    connection.db.run(sql.raw('PRAGMA busy_timeout = 0'));
    const checkpoint = connection.db.get<
      { busy: number; log: number; checkpointed: number } | undefined
    >(sql.raw('PRAGMA wal_checkpoint(TRUNCATE)'));
    // Proof: window-checkpoint-completion-tuple changes/removes this production completion/order boundary; observed named RED: refuses a genuine reader-blocked checkpoint without publishing either artifact. One checkpoint response tuple. The separate WAL guard may still refuse; this proof establishes required explicit completion refusal, not idle-connection exclusion.
    if (checkpoint?.busy !== 0 || checkpoint.log !== 0 || checkpoint.checkpointed !== 0)
      throw new Error('checkpoint did not complete with busy=0 and an empty WAL');
    // Proof: window-checkpoint-wal-settlement-tuple changes/removes this production checkpoint settlement tuple boundary; observed named RED: refuses a real closed-writer WAL between checkpoint response and owner settlement; refuses real post-checkpoint-close WAL before hashing the source again. Count once. Actual delegated PRAGMA plus real writer commit/close demonstrates the inside observation can precede native close erasing WAL evidence (pilot independently reached producer success). Distinct after-close live writer control proves refusal before baseline hashing; later ledger WAL check still refuses and is not claimed as an admission bypass. Both original calls remain in production.
    requireEmptyWal(sourcePath, 'source');
  } catch (cause) {
    causes.push(cause);
  }
  try {
    // Proof: window-checkpoint-owner-close changes/removes this production behavior boundary; observed named RED: preserves checkpoint and close failures without publishing or repeating cleanup. Actual production-path negative; no broader host/deployment claim.
    connection.close();
  } catch (cause) {
    causes.push(cause);
  }
  // Proof: window-checkpoint-failure-propagation changes/removes this production behavior boundary; observed named RED: preserves checkpoint and close failures without publishing or repeating cleanup. Actual production-path negative; no broader host/deployment claim.
  if (causes.length !== 0) throw composeWindowFailure(causes, 'checkpoint/close failed');
}

function readLedger(
  path: string,
  candidate: ReadonlyMap<string, { readonly hash: string }>,
  field: 'source' | 'snapshot',
): AppliedMigrationIdentity[] {
  // Proof: window-ledger-preopen-wal changes/removes this production read-order boundary; observed named RED: refuses producer source WAL before entering its actual ledger owner; refuses verifier source WAL before entering its actual ledger owner; refuses verifier snapshot WAL before entering its actual ledger owner. Actual native owner counters distinguish missing pre-open check from the later still-present WAL refusal.
  requireEmptyWal(path, field);
  const connection =
    field === 'source' ? openWindowSourceDatabase(path) : openReadOnlyDatabase(path);
  let observation: Observation<AppliedMigrationIdentity[]>;
  try {
    const applied = readAppliedMigrationIdentities(connection, candidate);
    // Proof: window-ledger-required-nonempty changes/removes this production required-state/order boundary; observed named RED: refuses missing required ledger before allocating a retained snapshot stage. Older capture intentionally allows an empty ledger; the new owner must reject before allocating snapshot stage, even though lower snapshot validation might also fail.
    if (applied.length === 0) throw new Error('migrations ledger is absent or empty');
    observation = { ok: true, value: applied };
  } catch (cause) {
    observation = { ok: false, cause };
  }
  try {
    // Proof: window-ledger-owner-close changes/removes this production behavior boundary; observed named RED: preserves ledger and close failures without publishing or repeating cleanup. Actual production-path negative; no broader host/deployment claim.
    connection.close();
  } catch (cause) {
    if (!observation.ok)
      // Proof: window-ledger-operation-close-pair changes/removes this production behavior boundary; observed named RED: preserves ledger and close failures without publishing or repeating cleanup. Actual production-path negative; no broader host/deployment claim.
      throw composeWindowFailure([observation.cause, cause], 'migrations read/close failed');
    // Proof: window-ledger-success-close-propagation changes/removes this production behavior boundary; observed named RED: propagates successful ledger close failure before creating a snapshot stage. Actual production-path negative; no broader host/deployment claim.
    throw cause;
  }
  if (!observation.ok) throw composeWindowFailure([observation.cause], 'migrations read failed');
  // Proof: window-ledger-postclose-wal changes/removes this production read-order boundary; observed named RED: refuses producer snapshot WAL after ledger close before opening its hash descriptor. Late outer WAL guard remains. This proves the owner-settlement check refuses before a further hash descriptor is opened.
  requireEmptyWal(path, field);
  return observation.value;
}

function sameLedger(
  left: readonly AppliedMigrationIdentity[],
  right: readonly AppliedMigrationIdentity[],
) {
  return (
    // Proof: window-ledger-full-set-length changes/removes this production behavior boundary; observed named RED: refuses a generated report with changed migrations and names the field. Actual production-path negative; no broader host/deployment claim.
    left.length === right.length &&
    left.every(({ name, hash }) =>
      // Proof: window-ledger-hash-identity changes/removes this production behavior boundary; observed named RED: refuses a generated report with valid-ledger-hash-mismatch at its external boundary. Actual production-path negative; no broader host/deployment claim.
      // Proof: window-ledger-name-identity changes/removes this production behavior boundary; observed named RED: refuses a generated report with valid-ledger-name-mismatch at its external boundary. Actual production-path negative; no broader host/deployment claim.
      right.some((entry) => entry.name === name && entry.hash === hash),
    )
  );
}

/** Publishes a settled snapshot without deleting mutable stage paths, including lower cleanup UNKNOWN. */
function publishSnapshot(sourcePath: string, operation: WindowOperation) {
  const stage = createStage(dirname(operation.snapshotPath), 'snapshot', operation);
  const snapshot = snapshotDatabase(sourcePath, join(stage, basename(operation.snapshotPath)));
  // Proof: window-retention-snapshot-prelink-unknown; moving unknown after link falsely reported a remaining snapshot as absent.
  // Observed "reports actual snapshot publication after its native link throws following delegation" fail; restored GREEN.
  operation.snapshotPublication = 'unknown';
  linkSync(snapshot.path, operation.snapshotPath);
  // Proof: window-snapshot-parent-settlement changes/removes this production callsite boundary; observed named RED: retains snapshot after its actual publication parent sync fails; retains snapshot after its actual publication parent close fails. Distinct snapshot callsite, in addition to earlier retention14 shared helper/report-parent proofs. The later report parent cannot substitute for snapshot settlement.
  syncDirectory(dirname(operation.snapshotPath));
  // Proof: window-retention-snapshot-destructive-stage-cleanup; reintroduced recursive stage cleanup deleted competing snapshot-stage bytes.
  // Observed "preserves competing snapshot stage bytes replaced after its actual publication link" fail; restored GREEN.
  operation.snapshotPublication = 'published';
  return snapshot;
}

/** Retains stage/report links on every outcome: stat then unlink cannot condition deletion on identity. */
function publishReport(report: WindowBackupReport, operation: WindowOperation): void {
  const stage = createStage(dirname(operation.reportPath), 'report', operation);
  const stagedPath = join(stage, 'report.json');
  const close = closeSync;
  const descriptor = openSync(stagedPath, 'wx', 0o600);
  const causes: unknown[] = [];
  try {
    // Proof: window-retention-report-write; skipping the report write bypassed its injected failure.
    // Observed "retains stages and closes report once after actual report write failure" fail; restored GREEN.
    writeFileSync(descriptor, JSON.stringify(report) + '\n');
    // Proof: window-retention-report-file-sync; skipping report fsync bypassed its injected failure.
    // Observed "retains stages and closes report once after actual report sync failure" fail; restored GREEN.
    fsyncSync(descriptor);
    // Proof: window-retention-report-prelink-unknown; moving unknown after link falsely reported a remaining report as absent.
    // Observed "reports actual report publication after its native link throws following delegation" fail; restored GREEN.
    operation.reportPublication = 'unknown';
    linkSync(stagedPath, operation.reportPath);
    // Proof: window-retention-post-link-report-unlink; reintroduced failure unlink erased the published report.
    // Observed "preserves published report and stages after parent sync failure and keeps descriptor close failures" fail; restored GREEN.
    syncDirectory(dirname(operation.reportPath));
  } catch (cause) {
    causes.push(cause);
  }
  // Proof: window-retention-report-descriptor-close; skipping the report close lost the reached close failure.
  // Observed "retains report after actual file close throws without repeating that close" fail; restored GREEN.
  try {
    close(descriptor);
  } catch (cause) {
    causes.push(cause);
  }
  if (causes.length !== 0)
    throw composeWindowFailure(causes, 'window report operation/close failed');
  // Proof: window-retention-report-destructive-stage-cleanup; reintroduced recursive stage cleanup deleted competing report-stage bytes.
  // Observed "preserves competing report stage bytes replaced after its actual publication link" fail; restored GREEN.
  operation.reportPublication = 'published';
}

/** Resolves existing parent links before reserving any SQLite or artifact pathname. */
function resolvePhysicalPath(path: string): string {
  const absolute = resolve(path);
  let ancestor = dirname(absolute);
  const remaining = [basename(absolute)];
  while (lstatSync(ancestor, { throwIfNoEntry: false }) === undefined) {
    remaining.unshift(basename(ancestor));
    ancestor = dirname(ancestor);
  }
  return join(realpathSync(ancestor), ...remaining);
}

function sqlitePaths(path: string): string[] {
  return [path, path + '-wal', path + '-shm', path + '-journal'];
}

/**
 * Produces E37 report evidence under the separate E36 stopped-writer procedure.
 * busy=0 proves checkpoint completion, never absence of idle/future connections.
 * Source/WAL/full-ledger rechecks surround an independently owned verified VACUUM copy.
 * Existing targets refuse before acquisition; races use no-replace links. A failed report
 * preserves its verified snapshot. Staging links remain allocated on every outcome; metadata
 * describes observed locations, not inode ownership. See ADR0084 and the window runbook.
 */
export function createWindowBackup(request: WindowBackupRequest): WindowBackupReceipt {
  const sourcePath = resolvePhysicalPath(request.sourcePath);
  const snapshotPath = resolvePhysicalPath(request.snapshotPath);
  const reportPath = resolvePhysicalPath(request.reportPath);
  const migrationsFolder = resolve(request.migrationsFolder);
  const sourceNamespace = sqlitePaths(sourcePath);
  const snapshotNamespace = sqlitePaths(snapshotPath);
  // Proof: window-sqlite-namespace-admission changes/removes this production admission/order boundary; observed named RED: refuses SQLite namespace collision report-source-wal before changing source or artifacts; refuses SQLite namespace collision report-source-shm before changing source or artifacts; refuses SQLite namespace collision report-source-journal before changing source or artifacts; refuses SQLite namespace collision snapshot-source-wal before changing source or artifacts; refuses SQLite namespace collision snapshot-source-shm before changing source or artifacts; refuses SQLite namespace collision snapshot-source-journal before changing source or artifacts; refuses SQLite namespace collision report-snapshot-wal before changing source or artifacts; refuses SQLite namespace collision report-snapshot-shm before changing source or artifacts; refuses SQLite namespace collision report-snapshot-journal before changing source or artifacts. Combined SQLite namespace guard, nine addressed main/sidecar relationships. Some omissions are refused later after creating an unacceptable artifact; do not claim all nine become successful.
  if (
    sourceNamespace.some((path) => snapshotNamespace.includes(path)) ||
    sourceNamespace.includes(reportPath) ||
    snapshotNamespace.includes(reportPath)
  )
    throw new Error('SQLite path namespaces overlap');
  // Proof: window-existing-report-admission changes/removes this production admission/order boundary; observed named RED: refuses an existing report before creating a new snapshot or replacing operator evidence. No-replace link still preserves the competitor. This guard prevents acquiring/publishing a snapshot when the report target was already known to exist.
  if (lstatSync(reportPath, { throwIfNoEntry: false }) !== undefined)
    throw new Error('reportPath already exists');
  // Proof: window-existing-snapshot-admission changes/removes this production admission/order boundary; observed named RED: refuses an existing snapshot before acquiring any staging directory. No-replace link still preserves the competing final target; the negative checks no stage was acquired for a known refusal.
  if (lstatSync(snapshotPath, { throwIfNoEntry: false }) !== undefined)
    throw new Error('snapshotPath already exists');
  const operation: WindowOperation = {
    snapshotPath,
    reportPath,
    snapshotPublication: 'not_published',
    reportPublication: 'not_published',
    stages: [],
  };
  try {
    readDigest(sourcePath, 'sourcePath');
    checkpointSource(sourcePath);
    requireEmptyWal(sourcePath, 'source');
    const candidate = new Map(
      readMigrationFolders(migrationsFolder).map((folder) => [folder.name, folder]),
    );
    const baseline = readDigest(sourcePath, 'sourcePath');
    const migrations = readLedger(sourcePath, candidate, 'source');
    const produced = publishSnapshot(sourcePath, operation);
    const currentLedger = readLedger(sourcePath, candidate, 'source');
    const snapshotLedger = readLedger(snapshotPath, candidate, 'snapshot');
    // Proof: window-producer-full-ledger-installation changes/removes this production required-state/order boundary; observed named RED: refuses changed producer source ledger before its next hash observation; refuses changed producer snapshot ledger before its next hash observation. Actual source and snapshot ledger deletions remain valid catalogue subsets. Later physical checks can still refuse; this proves no subsequent hash observation follows the known full-set mismatch.
    if (!sameLedger(migrations, currentLedger) || !sameLedger(migrations, snapshotLedger))
      throw new Error('migrations changed while producing report');
    // Proof: window-producer-cross-file-source-wal changes/removes this production behavior boundary; observed named RED: refuses producer cross-file source WAL before its next hash observation. Actual production-path negative; no broader host/deployment claim.
    requireEmptyWal(sourcePath, 'source');
    const snapshot = readDigest(snapshotPath, 'snapshotPath');
    // Proof: window-producer-published-snapshot-tuple changes/removes this production physical tuple boundary; observed named RED: refuses actual snapshot mutation after publication before writing a report. One SHA+bytes tuple proof; no independent bytes-only claim.
    if (snapshot.sha256 !== produced.sha256 || snapshot.bytes !== produced.bytes)
      throw new Error('snapshotSha256 or snapshotBytes changed while producing report');
    // Proof: window-producer-final-source-wal changes/removes this production behavior boundary; observed named RED: refuses final producer source WAL after its actual digest closes. Actual production-path negative; no broader host/deployment claim.
    const current = readDigest(sourcePath, 'sourcePath');
    requireEmptyWal(sourcePath, 'source');
    // Proof: window-producer-final-source-tuple changes/removes this production physical tuple boundary; observed named RED: refuses a checkpointed source write during final ledger observation. Actual checkpointed source mutation during late ledger observation; final digest follows all SQLite observations.
    if (current.sha256 !== baseline.sha256 || current.bytes !== baseline.bytes)
      throw new Error('sourceSha256 or sourceBytes changed while producing report');
    // Proof: window-producer-final-snapshot-wal changes/removes this production behavior boundary; observed named RED: refuses final producer snapshot WAL after its actual digest closes. Actual production-path negative; no broader host/deployment claim.
    requireEmptyWal(snapshotPath, 'snapshot');
    const report: WindowBackupReport = {
      version: 1,
      sourcePath,
      sourceSha256: baseline.sha256,
      sourceBytes: baseline.bytes,
      snapshotPath,
      snapshotSha256: snapshot.sha256,
      snapshotBytes: snapshot.bytes,
      migrations,
    };
    publishReport(report, operation);
    return { report, artifacts: retainArtifacts(operation) };
  } catch (cause) {
    const failure = composeWindowFailure([cause], 'window backup operation failed');
    // Proof: window-artifact-failure-attribution changes/removes this production behavior boundary; observed named RED: retains genuine lower snapshot cleanup uncertainty and propagates its exact identity. Actual production-path negative; no broader host/deployment claim.
    failures.set(failure, retainArtifacts(operation));
    throw failure;
  }
}

/** Reads and validates external report bytes without following a leaf symlink or opening SQLite. */
function readWindowReport(path: string): WindowBackupReport {
  const close = closeSync;
  let descriptor: number;
  try {
    // Proof: window-report-nonblocking-open changes/removes this bounded native acquisition boundary; observed named RED: refuses fifo reportPath without changing source or snapshot. The real verifier subprocess has its own bounded deadline; missing NONBLOCK fails the actual named CLI negative, not orchestration.
    // Proof: window-report-leaf-nofollow changes/removes this production acquisition/order boundary; observed named RED: refuses a live report leaf symlink before reading its descriptor. A later pathname identity comparison still exists. Read counter proves refusal before following the live link.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (cause) {
    throw new Error('reportPath cannot be opened', { cause });
  }
  let observation: Observation<WindowBackupReport>;
  try {
    const before = fstatSync(descriptor, { bigint: true });
    // Proof: window-report-readable-regular changes/removes this production behavior boundary; observed named RED: refuses directory reportPath without changing source or snapshot; refuses report permission removal after acquisition before reading JSON. Actual production-path negative; no broader host/deployment claim.
    if (!before.isFile() || (before.mode & 0o444n) === 0n)
      throw new Error('reportPath is not a readable regular file');
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(descriptor, 'utf8'));
    } catch (cause) {
      // Proof: window-report-json-field-context changes/removes this production behavior boundary; observed named RED: refuses malformed-json reportPath without changing source or snapshot. Actual production-path negative; no broader host/deployment claim.
      throw new Error('reportPath is malformed JSON', { cause });
    }
    // Proof: window-report-decoder-installation changes/removes this production behavior boundary; observed named RED: refuses a generated report with unknown-field at its external boundary. Actual production-path negative; no broader host/deployment claim.
    const report = readWindowBackupReport(parsed);
    // Proof: window-report-file-identity-tuple changes/removes this production physical identity tuple boundary; observed named RED: refuses report pathname replacement after actual JSON reading before SQLite acquisition. One combined report descriptor/path identity proof; matching copied bytes do not substitute for the acquired inode.
    if (
      fileIdentity(before) !== fileIdentity(fstatSync(descriptor, { bigint: true })) ||
      fileIdentity(before) !== fileIdentity(lstatSync(path, { bigint: true }))
    )
      throw new Error('reportPath changed while reading');
    observation = { ok: true, value: report };
  } catch (cause) {
    observation = { ok: false, cause };
  }
  try {
    // Proof: window-report-descriptor-close changes/removes this production behavior boundary; observed named RED: preserves report JSON read and descriptor close failures without opening SQLite. Actual production-path negative; no broader host/deployment claim.
    close(descriptor);
  } catch (cause) {
    if (!observation.ok)
      // Proof: window-report-operation-close-pair changes/removes this production behavior boundary; observed named RED: preserves report JSON read and descriptor close failures without opening SQLite. Actual production-path negative; no broader host/deployment claim.
      throw composeWindowFailure([observation.cause, cause], 'reportPath read/close failed');
    // Proof: window-report-success-close-propagation changes/removes this production behavior boundary; observed named RED: propagates successful report read close failure exactly once before further observation. Actual production-path negative; no broader host/deployment claim.
    throw cause;
  }
  // Proof: window-report-read-failure-propagation changes/removes this production behavior boundary; observed named RED: refuses malformed-json reportPath without changing source or snapshot. Actual production-path negative; no broader host/deployment claim.
  if (!observation.ok) throw composeWindowFailure([observation.cause], 'reportPath read failed');
  return observation.value;
}

/** Explicit read-only verifier inputs; never opens a creating writer or checkpoints evidence. */
export interface WindowVerificationRequest {
  readonly sourcePath: string;
  readonly reportPath: string;
  readonly migrationsFolder: string;
}

/**
 * Verifies an actual E37 report against current source, snapshot and complete ledger identities.
 * WAL is inspected before any SQLite open and after every observation settles. This reads only;
 * it cannot establish E36's lasting stopped-writer/poller/host-lock barrier or admit a live swap.
 * Every missing, malformed, changed or unreadable required artifact throws naming its field.
 */
export function assertWindowBackup(request: WindowVerificationRequest): WindowBackupReport {
  const sourcePath = resolvePhysicalPath(request.sourcePath);
  const report = readWindowReport(resolvePhysicalPath(request.reportPath));
  // Proof: window-verifier-source-binding changes/removes this production behavior boundary; observed named RED: refuses a generated report with changed sourcePath and names the field. Actual production-path negative; no broader host/deployment claim.
  if (report.sourcePath !== sourcePath) throw new Error('sourcePath differs from DB_PATH');
  // Proof: window-verifier-initial-source-wal changes/removes this production behavior boundary; observed named RED: refuses initial source WAL before opening its hash descriptor. Actual production-path negative; no broader host/deployment claim.
  requireEmptyWal(sourcePath, 'source');
  const source = readDigest(sourcePath, 'sourcePath');
  // Proof: window-verifier-initial-sourceSha256 changes/removes this production input-validation/order boundary; observed named RED: refuses initial sourceSha256 mismatch before opening either ledger owner. The later SHA/byte tuple remains. Actual owner counters prove required initial mismatch refusal before native ledger observation.
  if (source.sha256 !== report.sourceSha256) throw new Error('sourceSha256 differs from report');
  // Proof: window-verifier-initial-sourceBytes changes/removes this production input-validation/order boundary; observed named RED: refuses initial sourceBytes mismatch before opening either ledger owner. The later SHA/byte tuple remains. Actual owner counters prove required initial mismatch refusal before native ledger observation.
  if (source.bytes !== report.sourceBytes) throw new Error('sourceBytes differs from report');
  // Proof: window-verifier-initial-snapshot-wal changes/removes this production behavior boundary; observed named RED: refuses initial snapshot WAL before opening its hash descriptor. Actual production-path negative; no broader host/deployment claim.
  requireEmptyWal(report.snapshotPath, 'snapshot');
  const snapshot = readDigest(report.snapshotPath, 'snapshotPath');
  // Proof: window-verifier-initial-snapshotSha256 changes/removes this production input-validation/order boundary; observed named RED: refuses initial snapshotSha256 mismatch before opening either ledger owner. The later SHA/byte tuple remains. Actual owner counters prove required initial mismatch refusal before native ledger observation.
  if (snapshot.sha256 !== report.snapshotSha256)
    throw new Error('snapshotSha256 differs from report');
  // Proof: window-verifier-initial-snapshotBytes changes/removes this production input-validation/order boundary; observed named RED: refuses initial snapshotBytes mismatch before opening either ledger owner. The later SHA/byte tuple remains. Actual owner counters prove required initial mismatch refusal before native ledger observation.
  if (snapshot.bytes !== report.snapshotBytes) throw new Error('snapshotBytes differs from report');
  const candidate = new Map(
    readMigrationFolders(resolve(request.migrationsFolder)).map((folder) => [folder.name, folder]),
  );
  const sourceLedger = readLedger(sourcePath, candidate, 'source');
  const snapshotLedger = readLedger(report.snapshotPath, candidate, 'snapshot');
  // Proof: window-verifier-full-ledger-installation changes/removes this production behavior boundary; observed named RED: refuses a generated report with valid-ledger-name-mismatch at its external boundary; refuses a generated report with valid-ledger-hash-mismatch at its external boundary. Actual production-path negative; no broader host/deployment claim.
  if (
    !sameLedger(report.migrations, sourceLedger) ||
    !sameLedger(report.migrations, snapshotLedger)
  )
    throw new Error('migrations differ from report');
  // Proof: window-verifier-cross-file-source-wal changes/removes this production behavior boundary; observed named RED: refuses verifier cross-file source WAL before its next hash observation. Actual production-path negative; no broader host/deployment claim.
  requireEmptyWal(sourcePath, 'source');
  const current = readDigest(sourcePath, 'sourcePath');
  // Proof: window-verifier-final-source-tuple changes/removes this production physical identity tuple boundary; observed named RED: refuses late source mutation during actual verifier ledger observation. One combined SHA+bytes observation-site proof using actual length-growing checkpointed writes. Healthy growth reaches SHA first; bytes is NOT independently falsified. External byte-field validation has separate negatives.
  if (current.sha256 !== report.sourceSha256)
    throw new Error('sourceSha256 changed during verification');
  if (current.bytes !== report.sourceBytes)
    throw new Error('sourceBytes changed during verification');
  const finalSnapshot = readDigest(report.snapshotPath, 'snapshotPath');
  // Proof: window-verifier-final-snapshot-tuple changes/removes this production physical identity tuple boundary; observed named RED: refuses late snapshot mutation during actual verifier ledger observation. One combined SHA+bytes observation-site proof using actual length-growing checkpointed writes. Healthy growth reaches SHA first; bytes is NOT independently falsified. External byte-field validation has separate negatives.
  if (finalSnapshot.sha256 !== report.snapshotSha256)
    throw new Error('snapshotSha256 changed during verification');
  if (finalSnapshot.bytes !== report.snapshotBytes)
    throw new Error('snapshotBytes changed during verification');
  // Proof: window-verifier-final-source-wal changes/removes this production behavior boundary; observed named RED: refuses final source sidecar evidence created after actual verifier digest close. Actual production-path negative; no broader host/deployment claim.
  requireEmptyWal(sourcePath, 'source');
  // Proof: window-verifier-final-snapshot-wal changes/removes this production behavior boundary; observed named RED: refuses final snapshot sidecar evidence created after actual verifier digest close. Actual production-path negative; no broader host/deployment claim.
  requireEmptyWal(report.snapshotPath, 'snapshot');
  return report;
}
