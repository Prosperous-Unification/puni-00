import { compareCanonicalText, serializeCanonical } from '../evidence/content-manifest';
import { decodeTrialReport, type TrialReport as TrialReportRecord } from './accounting';

export interface TrialEvidenceExport {
  /** One canonical JSON object per line: trial, outcome, attempt, receipt, or allocation. */
  jsonl: string;
  /** RFC 4180-compatible outcome rows with one row per frozen outcome and trial. */
  outcomesCsv: string;
  /** RFC 4180-compatible trial rows with independently recomputable headline totals. */
  trialsCsv: string;
}

function csvRow(fields: readonly (string | number)[]): string {
  return `${fields
    .map((field) =>
      typeof field === 'number' ? String(field) : `"${field.replaceAll('"', '""')}"`,
    )
    .join(',')}\n`;
}

function observation(report: TrialReportRecord, observationKind: string, record: object): string {
  return serializeCanonical({
    schemaVersion: 1,
    observationKind,
    trialId: report.trialId,
    manifestId: report.manifestId,
    corpusId: report.corpusId,
    ...record,
  });
}

/**
 * Exports normalized evidence whose accepted count, elapsed totals, and charges can be recomputed
 * with a generic JSONL/CSV reader. Input order never changes the emitted bytes.
 */
export function exportTrialEvidence(inputs: readonly unknown[]): TrialEvidenceExport {
  const reports = inputs
    .map((input) => decodeTrialReport(input))
    .sort((left, right) => compareCanonicalText(left.trialId, right.trialId));
  const trialIds = reports.map(({ trialId }) => trialId);
  if (new Set(trialIds).size !== trialIds.length) {
    throw new Error('portable experiment export requires unique trial identities');
  }

  let jsonl = '';
  let outcomesCsv = csvRow([
    'trial_id',
    'outcome_id',
    'title',
    'status',
    'attempt_count',
    'defect_count',
  ]);
  let trialsCsv = csvRow([
    'trial_id',
    'manifest_id',
    'corpus_id',
    'concurrency',
    'status',
    'accepted_outcome_count',
    'outcome_count',
    'total_elapsed_ms',
    'aggregate_session_elapsed_ms',
    'currency_charges',
  ]);

  for (const report of reports) {
    jsonl += observation(report, 'trial', {
      repeat: report.repeat,
      seed: report.seed,
      concurrency: report.concurrency,
      allocationMode: report.allocationMode,
      cacheCondition: report.cacheCondition,
      startedAt: report.startedAt,
      endedAt: report.endedAt,
      status: report.status,
      totalElapsedMs: report.totalElapsedMs,
      aggregateSessionElapsedMs: report.aggregateSessionElapsedMs,
    });
    for (const outcome of report.outcomes) {
      jsonl += observation(report, 'outcome', outcome);
      outcomesCsv += csvRow([
        report.trialId,
        outcome.outcomeId,
        outcome.title,
        outcome.status,
        outcome.attemptIds.length,
        outcome.defectCount,
      ]);
    }
    for (const attempt of report.attempts) {
      jsonl += observation(report, 'attempt', attempt);
    }
    for (const receipt of report.invocationReceipts) {
      jsonl += observation(report, 'invocation', receipt);
    }
    for (const receipt of report.elapsedReceipts) {
      jsonl += observation(report, 'elapsed', receipt);
    }
    for (const receipt of report.allocationReceipts) {
      jsonl += observation(report, 'allocation', receipt);
    }
    const charges = report.currencyCharges
      .map(({ currency, chargedAmountMicros }) => `${currency}:${String(chargedAmountMicros)}`)
      .join(';');
    trialsCsv += csvRow([
      report.trialId,
      report.manifestId,
      report.corpusId,
      report.concurrency,
      report.status,
      report.acceptedOutcomeCount,
      report.outcomes.length,
      report.totalElapsedMs,
      report.aggregateSessionElapsedMs,
      charges,
    ]);
  }
  return { jsonl, outcomesCsv, trialsCsv };
}
