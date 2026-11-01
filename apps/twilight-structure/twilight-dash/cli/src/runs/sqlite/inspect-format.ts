import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';

import type { SqliteOptions } from './open-stores';

type InspectionOptions = Pick<SqliteOptions, 'path' | 'maxBusyAttempts' | 'busyDelayMilliseconds'>;
type WalBytes = { readonly kind: 'absent' } | { readonly kind: 'present'; readonly bytes: Buffer };
interface FilePair {
  readonly main: Buffer;
  readonly wal: WalBytes;
}
/** Private inspection diagnostics retain original IO/close causes and any scratch whose native closure or removal could not be established. */
export class SqliteInspectionError extends Error {
  constructor(
    readonly failure: 'unreadable' | 'corrupt' | 'contention',
    readonly phase:
      | 'source_read'
      | 'changing_pair'
      | 'scratch_write'
      | 'constructor'
      | 'inspection_close'
      | 'scratch_cleanup',
    sourcePath: string,
    readonly retainedPath: string | undefined,
    cause: unknown,
  ) {
    super(
      `sqlite format inspection ${phase}: ${sourcePath}${retainedPath === undefined ? '' : '; private state retained: ' + retainedPath}`,
      { cause },
    );
    this.name = 'SqliteInspectionError';
  }
}
function hasCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === code;
}
function readPair(path: string): FilePair {
  try {
    const main = readFileSync(path);
    let wal: WalBytes;
    try {
      wal = { kind: 'present', bytes: readFileSync(path + '-wal') };
    } catch (cause) {
      // Proof: inspector-optional-wal-error broke “ordinary opener preserves private inspection wal_unreadable”; exact source hash restored.
      if (!hasCode(cause, 'ENOENT')) throw cause;
      wal = { kind: 'absent' };
    }
    if (wal.kind === 'present' && wal.bytes.length > 0) {
      const bytes = wal.bytes;
      // Proof: inspector-short-wal-diagnostic broke “ordinary opener preserves private inspection wal_malformed”; exact source hash restored.
      if (bytes.length < 32) throw new Error('incomplete SQLite WAL header');
      const magic = bytes.readUInt32BE(0);
      const version = bytes.readUInt32BE(4);
      const pageSize = bytes.readUInt32BE(8);
      if (
        // Proof: extra-wal-header broke “ordinary opener preserves private inspection wal_header_magic”; exact source hash restored.
        (magic !== 0x377f0682 && magic !== 0x377f0683) ||
        version !== 3007000 ||
        pageSize < 512 ||
        pageSize > 65536 ||
        (pageSize & (pageSize - 1)) !== 0
      )
        throw new Error('unsupported or malformed SQLite WAL header');
    }
    return { main, wal };
  } catch (cause) {
    throw new SqliteInspectionError(
      // Proof: inspector-source-access-category broke “ordinary opener preserves private inspection main_unreadable”; exact source hash restored.
      hasCode(cause, 'EACCES') || hasCode(cause, 'EPERM') ? 'unreadable' : 'corrupt',
      'source_read',
      path,
      undefined,
      cause,
    );
  }
}
function equalPairs(left: FilePair, right: FilePair): boolean {
  return (
    // Proof: inspector-main-pair broke “ordinary opener preserves private inspection changing_pair”; exact source hash restored.
    left.main.equals(right.main) &&
    left.wal.kind === right.wal.kind &&
    (left.wal.kind === 'absent' ||
      // Proof: inspector-wal-byte-pair broke “ordinary opener preserves private inspection changing_wal_bytes”; exact source hash restored.
      (right.wal.kind === 'present' && left.wal.bytes.equals(right.wal.bytes)))
  );
}
function removePrivateRoot(directory: string): void {
  rmSync(directory, { recursive: true });
  try {
    lstatSync(directory);
  } catch (cause) {
    // Proof: inspector-cleanup-stat-access broke “ordinary opener preserves private inspection cleanup_stat_unreadable”; exact source hash restored.
    if (hasCode(cause, 'ENOENT')) return;
    throw cause;
  }
  // Proof: inspector-cleanup-remains broke “ordinary opener preserves private inspection cleanup_unobserved”; exact source hash restored.
  throw new Error('private inspection directory remains after removal');
}
/**
 * Reads a bounded, advisory main/WAL pair and lets SQLite inspect a private copy without source
 * sidecar creation. Paired equality is convergence evidence, never a linearizable snapshot or
 * permission to publish. Source SHM is never read or copied. SQLite owns WAL frame/checksum/tail
 * recovery; the fixed header rejects unsupported or malformed retained envelopes.
 * The caller must still audit the actual path under its transaction before exposing stores.
 * Native constructor/close uncertainty preserves the exact private0700 directory; files use
 * exclusive0600 creation. A successful native close precedes every removal attempt.
 */
export async function inspectFormat(
  options: InspectionOptions,
  inspect: (database: Database) => void,
): Promise<void> {
  let captured: FilePair | undefined;
  // Proof: extra-capture-budget broke “ordinary opener preserves private inspection changing_pair”; exact source hash restored.
  for (let attempt = 1; attempt <= options.maxBusyAttempts; attempt++) {
    const first = readPair(options.path);
    const second = readPair(options.path);
    if (equalPairs(first, second)) {
      captured = second;
      break;
    }
    if (attempt < options.maxBusyAttempts) await Bun.sleep(options.busyDelayMilliseconds);
  }
  if (captured === undefined)
    throw new SqliteInspectionError(
      'contention',
      'changing_pair',
      options.path,
      undefined,
      new Error('main and WAL did not converge within inspection budget'),
    );
  let directory: string;
  try {
    directory = mkdtempSync(join(tmpdir(), 'dash-format-inspection-'));
  } catch (cause) {
    // Proof: inspector-allocation-diagnostic broke “ordinary opener preserves private inspection allocation”; exact source hash restored.
    throw new SqliteInspectionError('unreadable', 'scratch_write', options.path, undefined, cause);
  }
  let inspection: Database | undefined;
  let constructorStarted = false;
  let primary: { readonly cause: unknown } | undefined;
  try {
    const path = join(directory, 'inspection.sqlite');
    // Proof: extra-private-exclusive broke “ordinary opener preserves private inspection private_exists”; exact source hash restored.
    writeFileSync(path, captured.main, { flag: 'wx', mode: 0o600 });
    if (captured.wal.kind === 'present')
      writeFileSync(path + '-wal', captured.wal.bytes, { flag: 'wx', mode: 0o600 });
    constructorStarted = true;
    inspection = new Database(path, { readonly: true, create: false, strict: true });
    inspect(inspection);
  } catch (cause) {
    if (constructorStarted && inspection === undefined)
      // Proof: inspector-constructor-cause broke “ordinary opener preserves private inspection constructor”; exact source hash restored.
      throw new SqliteInspectionError('corrupt', 'constructor', options.path, directory, cause);
    primary = {
      cause: constructorStarted
        ? cause
        : // Proof: inspector-copy-diagnostic broke “ordinary opener preserves private inspection main_copy”; exact source hash restored.
          new SqliteInspectionError('unreadable', 'scratch_write', options.path, undefined, cause),
    };
  }
  if (inspection !== undefined) {
    try {
      inspection.close();
    } catch (cause) {
      // Proof: inspector-inspection_close-cause broke “ordinary opener preserves private inspection close”; exact source hash restored.
      throw new SqliteInspectionError(
        'corrupt',
        'inspection_close',
        options.path,
        directory,
        primary === undefined
          ? cause
          : // Proof: extra-close-primary-cause broke “native close failure retains exact private path and original callback cause”; exact source hash restored.
            new AggregateError(
              [primary.cause, cause],
              'format inspection and native close failed',
              { cause },
            ),
      );
    }
  }
  try {
    removePrivateRoot(directory);
  } catch (cause) {
    // Proof: inspector-scratch_cleanup-cause broke “ordinary opener preserves private inspection cleanup”; exact source hash restored.
    throw new SqliteInspectionError(
      'corrupt',
      'scratch_cleanup',
      options.path,
      directory,
      primary === undefined
        ? cause
        : new AggregateError(
            [primary.cause, cause],
            'format inspection and private cleanup failed',
            { cause },
          ),
    );
  }
  // Proof: extra-inspection-refusal broke “ordinary opener refuses genuine format5 before creating sidecars or changing bytes”; exact source hash restored.
  if (primary !== undefined) throw primary.cause;
}
