import {
  assertExportSound,
  assertRestoredMatches,
  parseSqliteReport,
  type SqliteReport,
} from './cutover';
import { validateCutoverReplay } from './cutover-replay';
import type { FirstStartRequest } from './first-start';
import { parseSourceReceipt, type SourceReceipt } from './first-start-source';
import { sha256Of } from './migration-capture';

const PHASES = [
  'requested',
  'admitted',
  'starting',
  'ready',
  'recorded',
  'handed',
  'complete',
] as const;
type Phase = (typeof PHASES)[number];

/** Sealed request, transaction and observed receipt fields shared by separately versioned owners. */
export interface FirstStartProgress {
  transaction: string;
  requestBytes: string;
  requestSha256: string;
  phase: Phase;
  receipt: { bytes: string; sha256: string } | null;
  source: SourceReceipt | null;
}

/** Refuse non-record trusted state before inspecting any protocol field. */
export function requireFirstStartFields(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('first-start state is malformed');
  // Boundary: non-null object shape permits unknown protocol field inspection.
  return raw as Record<string, unknown>;
}

/** Check report shape and SQLite soundness before admission or receipt reuse. */
export function verifyFirstStartReport(report: SqliteReport): void {
  parseSqliteReport(`PUNI_SQLITE_REPORT ${JSON.stringify(report)}`);
  assertExportSound(report);
}

/** Bind actual PVC bytes/replay to the restored export and require disabled writer authority. */
export function assertFirstStartObservation(
  request: FirstStartRequest,
  observation: { report: SqliteReport; activation: string },
): void {
  verifyFirstStartReport(observation.report);
  // Proof: call omission admitted changed actual main-file bytes in the actual-bytes negative.
  assertRestoredMatches(request.exported, observation.report);
  const actual = validateCutoverReplay(
    observation.report.replay,
    request.identity,
    request.exported.sha256,
  );
  const exported = validateCutoverReplay(
    request.exported.replay,
    request.identity,
    request.exported.sha256,
  );
  // Proof: actual-replay omission admits a changed retained journal inventory in first-start tests.
  if (
    observation.report.path !== request.pvc.path ||
    JSON.stringify(actual) !== JSON.stringify(exported)
  )
    throw new Error('first-start actual PVC replay differs from restore');
  // Proof: disabled-authority omission starts every tier in the enabled-marker refusal test.
  if (observation.activation !== 'DISABLED')
    throw new Error('first-start requires DISABLED step blockage authority');
}

/** Validate sealed request, transaction, source and observed receipt after the owner checks its version. */
export function parseFirstStartProgress(
  raw: unknown,
  request: FirstStartRequest,
): FirstStartProgress {
  const fields = requireFirstStartFields(raw);
  // Proof: request-binding omission allows a changed PVC UID to resume without evidence.
  if (
    typeof fields['transaction'] !== 'string' ||
    !/^first-start-[0-9a-f]{16}$/.test(fields['transaction']) ||
    fields['requestBytes'] !== JSON.stringify(request) ||
    fields['requestSha256'] !== sha256Of(JSON.stringify(request)) ||
    typeof fields['phase'] !== 'string' ||
    !(PHASES as readonly string[]).includes(fields['phase'])
  )
    throw new Error('first-start state belongs to another request or version');
  if (fields['phase'] !== 'requested' || fields['source'] !== null)
    parseSourceReceipt(fields['source'], request);
  if (fields['phase'] !== 'requested' || fields['receipt'] !== null) {
    const receipt = requireFirstStartFields(fields['receipt']);
    // Proof: receipt null/digest omission admits corrupted durable admission before scaling.
    if (typeof receipt['bytes'] !== 'string' || receipt['sha256'] !== sha256Of(receipt['bytes']))
      throw new Error('first-start receipt differs from original SHA-256');
    const payload = requireFirstStartFields(JSON.parse(receipt['bytes']) as unknown);
    // Proof: each identity omission accepted a resealed foreign transaction/request receipt
    // in the corresponding first-start progress corruption negatives.
    if (
      payload['transaction'] !== fields['transaction'] ||
      payload['requestSha256'] !== fields['requestSha256']
    )
      throw new Error('first-start receipt belongs to another transaction');
    const report = parseSqliteReport(`PUNI_SQLITE_REPORT ${JSON.stringify(payload['report'])}`);
    if (typeof payload['activation'] !== 'string')
      throw new Error('first-start receipt lacks activation');
    assertFirstStartObservation(request, { report, activation: payload['activation'] });
  }
  // Boundary: protocol fields, phase, request binding and receipt were checked above.
  return fields as unknown as FirstStartProgress;
}
