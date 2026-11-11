import { parseOrThrow, type } from '@shared/validation';

// Proof: window-decoder-ledger-exact-keys changes/removes this production behavior boundary; observed named RED: refuses a complete verifier wire receipt with ledger-unknown-field. Actual production-path negative; no broader host/deployment claim.
// Proof: window-decoder-ledger-hash changes/removes this production behavior boundary; observed named RED: refuses a complete verifier wire receipt with ledger-hash. Actual production-path negative; no broader host/deployment claim.
// Proof: window-decoder-ledger-name changes/removes this production behavior boundary; observed named RED: refuses a complete verifier wire receipt with ledger-name. Actual production-path negative; no broader host/deployment claim.
const identity = type({ name: 'string > 0', hash: /^[0-9a-f]{64}$/ }).onUndeclaredKey('reject');
// Proof: window-decoder-absolute-paths changes/removes this production wire boundary boundary; observed named RED: refuses a relative snapshotPath in an otherwise real generated report. Actual verifier path interpretation is reached; host relative-path fixture remains independently refused by explicit input-path correspondence, so no host bypass credit.
const absolutePath = type('string > 0').narrow((path) => path.startsWith('/'));
// Proof: window-decoder-safe-bytes changes/removes this production behavior boundary; observed named RED: refuses a complete verifier wire receipt with unsafe-bytes. Actual production-path negative; no broader host/deployment claim.
// Proof: window-decoder-positive-bytes changes/removes this production behavior boundary; observed named RED: refuses a complete verifier wire receipt with source-bytes; refuses a complete verifier wire receipt with snapshot-bytes. Actual production-path negative; no broader host/deployment claim.
const physicalBytes = type('number.integer > 0').narrow(Number.isSafeInteger);
const reportSchema = type({
  // Proof: window-decoder-wire-version changes/removes this production behavior boundary; observed named RED: refuses a complete verifier wire receipt with version; refuses a generated report with changed version and names the field. Actual production-path negative; no broader host/deployment claim.
  version: '1',
  sourcePath: absolutePath,
  // Proof: window-decoder-sourceSha256 changes/removes this production behavior boundary; observed named RED: refuses a complete verifier wire receipt with source-hash. Actual production-path negative; no broader host/deployment claim.
  sourceSha256: /^[0-9a-f]{64}$/,
  sourceBytes: physicalBytes,
  snapshotPath: absolutePath,
  // Proof: window-decoder-snapshotSha256 changes/removes this production behavior boundary; observed named RED: refuses a complete verifier wire receipt with snapshot-hash. Actual production-path negative; no broader host/deployment claim.
  snapshotSha256: /^[0-9a-f]{64}$/,
  snapshotBytes: physicalBytes,
  migrations: identity.array(),
  // Proof: window-decoder-report-exact-keys changes/removes this production behavior boundary; observed named RED: refuses a complete verifier wire receipt with unknown-field; refuses a generated report with unknown-field at its external boundary. Actual production-path negative; no broader host/deployment claim.
}).onUndeclaredKey('reject');
type DecodedReport = typeof reportSchema.infer;

/** E37 Linux-host wire evidence: exactly eight fields and independent physical source/snapshot identities. */
export type WindowBackupReport = Readonly<Omit<DecodedReport, 'migrations'>> & {
  readonly migrations: readonly Readonly<DecodedReport['migrations'][number]>[];
};

/** Validates report-file or verifier-stdout input once; owns no file/SQLite/candidate lookup. */
export function readWindowBackupReport(input: unknown): WindowBackupReport {
  const report = parseOrThrow(reportSchema, input);
  if (
    // Proof: window-decoder-required-ledger changes/removes this production behavior boundary; observed named RED: refuses a complete verifier wire receipt with empty-ledger. Actual production-path negative; no broader host/deployment claim.
    report.migrations.length === 0 ||
    // Proof: window-decoder-distinct-ledger changes/removes this production behavior boundary; observed named RED: refuses a complete verifier wire receipt with duplicate-ledger. Actual production-path negative; no broader host/deployment claim.
    new Set(report.migrations.map((entry) => entry.name)).size !== report.migrations.length
  )
    throw new Error('migrations must be a nonempty distinct full identity set');
  return report;
}
