import { createHash } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';

/** The host-job run record file of the managed root `root`, beside the resource ledger. */
export function runRecordsPathOf(root: string): string {
  return join(root, '.dash', 'host-job-runs.sqlite');
}

/**
 * The run records must be an owner-only regular file: no link, this account's, no group or
 * world bits.
 * @throws Error naming the file otherwise.
 */
export function checkRunRecordsOwnerOnly(path: string): void {
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
export function checkRunRecordsVersion(path: string, version: number | undefined): void {
  // Proof: without it `refuses run records of another schema version` (job-run.test.ts)
  // opened version 7 (2026-11-02, Slice 3 review F2d).
  if (version !== 1)
    throw new Error(
      `host job run records ${path} have schema version ${String(version)}; this Dash knows 1`,
    );
}

/**
 * The SHA-256 of a run record's stored `start` text, its gate entry: written once, before the
 * payload ran, and never changed. This is what a returned host job's settlement evidence
 * carries (`dash-host-jobs` task 6.8, S6F-A1); `docs/resources.md` gives the operator's check.
 */
export function runRecordDigestOf(start: string): string {
  return createHash('sha256').update(start).digest('hex');
}

/**
 * The stored `start` text of `jobId`'s run record under `root`, or null when the job never
 * reached its gate. Opened read-only and closed again; never creates the file.
 * @throws Error when the records are missing (a ledger with host jobs always has them: the
 * launcher opens them before admission), a link, not owner-only, or of another schema.
 */
export function readRunRecordStart(root: string, jobId: string): string | null {
  const path = runRecordsPathOf(root);
  try {
    lstatSync(path);
  } catch (cause) {
    // Proof: reading ENOENT as "no record" made `run records missing beside a returned host
    // job stop the move, publishing nothing` (host-job-publication.test.ts) synchronize and
    // publish `not_created` (2026-11-05, task 6.8).
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
      throw new Error(
        `host job run records ${path} are missing beside a ledger that has host jobs; restore them from backup`,
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
    return (
      db.query<{ start: string }, [string]>('SELECT start FROM runs WHERE job_id=?').get(jobId)
        ?.start ?? null
    );
  } finally {
    db.close();
  }
}
