import { parseOrThrow, type } from '@shared/validation';

import { PlanReferenceRecord, ProgressReceiptRecord } from './navigator-records';
import {
  BenchmarkCorpus,
  CandidateEntry,
  CandidateInventory,
  CheckReceipt,
  ClassificationPolicy,
  ElapsedReceipt,
  ExperimentManifest,
  GranularityPolicy,
  InvocationReceipt,
  ModuleMapping,
  OpaqueTranscript,
  ReviewReceipt,
} from './records';

// Proof: removing 'plan-reference' from this set made `the kind set is exactly the documented
// list` and `the production validate command accepts both kinds` fail (2026-10-11).
export const RecordKind = type(
  "'benchmark-corpus'|'candidate-entry'|'candidate-inventory'|'check-receipt'|'classification-policy'|'elapsed-receipt'|'experiment-manifest'|'granularity-policy'|'invocation-receipt'|'module-mapping'|'opaque-transcript'|'plan-reference'|'progress-receipt'|'review-receipt'",
);
export type RecordKind = typeof RecordKind.infer;

export type ContractRecord =
  | typeof BenchmarkCorpus.infer
  | typeof CandidateEntry.infer
  | typeof CandidateInventory.infer
  | typeof CheckReceipt.infer
  | typeof ClassificationPolicy.infer
  | typeof ElapsedReceipt.infer
  | typeof ExperimentManifest.infer
  | typeof GranularityPolicy.infer
  | typeof InvocationReceipt.infer
  | typeof ModuleMapping.infer
  | typeof OpaqueTranscript.infer
  | PlanReferenceRecord
  | ProgressReceiptRecord
  | typeof ReviewReceipt.infer;

/** Validates one untrusted JSON record once, before internal code can observe it. */
export function decodeRecord(kind: RecordKind, input: unknown): ContractRecord {
  switch (kind) {
    case 'benchmark-corpus':
      return parseOrThrow(BenchmarkCorpus, input);
    case 'candidate-entry':
      return parseOrThrow(CandidateEntry, input);
    case 'candidate-inventory':
      return parseOrThrow(CandidateInventory, input);
    case 'check-receipt':
      return parseOrThrow(CheckReceipt, input);
    case 'classification-policy':
      return parseOrThrow(ClassificationPolicy, input);
    case 'elapsed-receipt':
      return parseOrThrow(ElapsedReceipt, input);
    case 'experiment-manifest':
      return parseOrThrow(ExperimentManifest, input);
    case 'granularity-policy':
      return parseOrThrow(GranularityPolicy, input);
    case 'invocation-receipt':
      return parseOrThrow(InvocationReceipt, input);
    case 'module-mapping':
      return parseOrThrow(ModuleMapping, input);
    case 'opaque-transcript':
      return parseOrThrow(OpaqueTranscript, input);
    case 'plan-reference':
      return parseOrThrow(PlanReferenceRecord, input);
    case 'progress-receipt':
      return parseOrThrow(ProgressReceiptRecord, input);
    case 'review-receipt':
      return parseOrThrow(ReviewReceipt, input);
  }
}
