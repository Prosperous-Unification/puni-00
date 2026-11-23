import { snapshotDatabase } from '@wbs/store-sqlite/backup';
import { createWindowBackup, readWindowBackupFailure } from '@wbs/store-sqlite/window-backup';

/**
 * The swap's no-flag backup-db protocol remains one DatabaseSnapshot JSON line.
 * --report returns report plus separate retained-artifact metadata; CLI stdout remains the report.
 * Stage links retain disk blocks until explicit operator reconciliation under namespace exclusion.
 * Importing this entrypoint performs no operation; embedded PUNI callers select explicit argv/env.
 */
export function runBackupCommand(
  args: readonly string[],
  environment: { readonly DB_PATH?: string },
) {
  const dbPath = environment.DB_PATH;
  // Proof: window-backup-required-source-env changes/removes this production argv boundary boundary; observed named RED: refuses backup missing-db before changing database or artifacts. Missing required environment may fail later too; the named refusal must be emitted before artifact work.
  if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');
  let snapshotPath: string | undefined;
  let reportPath: string | undefined;
  for (const argument of args) {
    if (argument.startsWith('--report=')) {
      // Proof: window-backup-duplicate-report-option changes/removes this production behavior boundary; observed named RED: refuses backup duplicate-option before changing database or artifacts. Actual production-path negative; no broader host/deployment claim.
      if (reportPath !== undefined) throw new Error('reportPath was supplied more than once');
      reportPath = argument.slice('--report='.length);
      // Proof: window-backup-empty-report-option changes/removes this production behavior boundary; observed named RED: refuses backup empty-report before changing database or artifacts. Actual production-path negative; no broader host/deployment claim.
      if (reportPath === '') throw new Error('reportPath must be set');
    } else {
      // Proof: window-backup-unknown-or-multiple-target changes/removes this production behavior boundary; observed named RED: refuses backup unknown-option before changing database or artifacts; refuses two backup targets before changing either artifact. Actual production-path negative; no broader host/deployment claim.
      if (argument.startsWith('-') || snapshotPath !== undefined)
        throw new Error('usage: backup-db-cli.ts [--report=<file>] <snapshot-path>');
      snapshotPath = argument;
    }
  }
  // Proof: window-backup-required-target changes/removes this production argv boundary boundary; observed named RED: refuses backup missing-argument before changing database or artifacts. Missing target can throw later; explicit usage refusal is required before paths are resolved.
  if (snapshotPath === undefined || snapshotPath === '')
    throw new Error('usage: backup-db-cli.ts [--report=<file>] <snapshot-path>');
  return reportPath === undefined
    ? { kind: 'snapshot' as const, snapshot: snapshotDatabase(dbPath, snapshotPath) }
    : {
        kind: 'window' as const,
        receipt: createWindowBackup({
          sourcePath: dbPath,
          snapshotPath,
          reportPath,
          migrationsFolder: './drizzle',
        }),
      };
}

if (import.meta.main) {
  try {
    const answer = runBackupCommand(process.argv.slice(2), { DB_PATH: process.env['DB_PATH'] });
    if (answer.kind === 'window') {
      // Proof: window-retention-cli-success-diagnostics; hiding stderr concealed retained links from the successful CLI caller.
      // Observed "writes actual source snapshot and complete ledger identities into a window report" fail; restored GREEN.
      console.error('window backup retained artifacts:', JSON.stringify(answer.receipt.artifacts));
      console.log(JSON.stringify(answer.receipt.report));
    } else console.log(JSON.stringify(answer.snapshot));
  } catch (cause) {
    const context = readWindowBackupFailure(cause);
    if (context !== null)
      // Proof: window-cli-failed-artifact-diagnostics changes/removes this production behavior boundary; observed named RED: reports retained artifacts on actual CLI failure after snapshot publication. Actual production-path negative; no broader host/deployment claim.
      console.error('window backup failed with artifact state:', JSON.stringify(context));
    throw cause;
  }
}
