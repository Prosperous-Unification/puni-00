import { parseOrThrow } from '@shared/validation';

import { canonicalJson } from './canonical';
import { PlanReferenceRecord, ProgressReceiptRecord } from './navigator-records';
import { PlanTasks } from './plan-tasks';
import { checkPlanTaskConsistency } from './validate-plan-tasks';

/** Consistency of supplied documents only; grants no certification, approval or admission. */
export interface ProgressReceiptConsistency {
  schemaVersion: 1;
  scope: 'progress-receipt-consistency';
  receiptDigest: string;
  referenceDigest: string;
  tasksDigest: string;
  plan: string;
  entryCount: number;
}

/**
 * Strictly decodes three persisted documents, including embedded record digests, without
 * transforming their values, then checks their consistency via {@link checkProgressReceiptConsistency}.
 * No current WBS state, evidence authority or completion claim is verified.
 *
 * @throws when a document cannot decode or any consistency invariant fails.
 */
export function validateProgressReceipt(
  receiptInput: unknown,
  referenceInput: unknown,
  tasksInput: unknown,
): ProgressReceiptConsistency {
  // Proof: bypassing these decoders failed 16 production CLI digest/unknown-key/v9
  // refusals in progress-receipt.test.ts (2026-10-15).
  const receipt = parseOrThrow(ProgressReceiptRecord, receiptInput);
  const reference = parseOrThrow(PlanReferenceRecord, referenceInput);
  const tasks = parseOrThrow(PlanTasks, tasksInput);
  return checkProgressReceiptConsistency(receipt, reference, tasks);
}

/**
 * Checks already strictly decoded documents: existing plan/task consistency, complete
 * PlanRef equality and each receipt entry's leaf task ID and step code membership.
 * Preserves entry order and repetitions. Grants consistency only, without checking authorship,
 * evidence contents, freshness, approval, admission or current WBS authority.
 *
 * @throws when any supplied document is inconsistent with the others.
 */
export function checkProgressReceiptConsistency(
  receipt: ProgressReceiptRecord,
  reference: PlanReferenceRecord,
  tasks: PlanTasks,
): ProgressReceiptConsistency {
  // Proof: skipping this call accepted tampered tasks and eight re-digested semantic faults
  // in progress-receipt.test.ts (2026-10-15).
  checkPlanTaskConsistency(reference, tasks);
  // Proof: removing equality accepted all six redigested PlanRef member mismatches
  // in progress-receipt.test.ts (2026-10-15).
  if (canonicalJson(receipt.planRef) !== canonicalJson(reference.planRef)) {
    throw new Error('progress receipt names another plan reference');
  }
  const taskIds = new Set(tasks.tasks.map((task) => task.id));
  const stepCodes = new Set(tasks.steps.map((step) => step.code));
  for (const [index, entry] of receipt.entries.entries()) {
    // Proof: removing membership accepted unknown and parent-only task IDs in the
    // production receipt CLI tests (progress-receipt.test.ts, 2026-10-15).
    if (!taskIds.has(entry.taskId)) {
      throw new Error(
        `receipt entry ${String(index)} names task ${entry.taskId}, absent from the plan`,
      );
    }
    // Proof: removing membership accepted the unknown-step receipt through the production
    // CLI (progress-receipt.test.ts, 2026-10-15).
    if (!stepCodes.has(entry.stepCode)) {
      throw new Error(
        `receipt entry ${String(index)} names step ${entry.stepCode}, absent from the plan`,
      );
    }
  }
  return {
    schemaVersion: 1,
    scope: 'progress-receipt-consistency',
    receiptDigest: receipt.receiptDigest,
    referenceDigest: reference.referenceDigest,
    tasksDigest: reference.tasksDigest,
    plan: tasks.plan,
    entryCount: receipt.entries.length,
  };
}
