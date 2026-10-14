import { parseOrThrow } from '@shared/validation';

import { digestOf } from './canonical';
import { PlanReferenceRecord } from './navigator-records';
import { PlanTasks } from './plan-tasks';

/** Consistency of two supplied documents only; grants no certification or admission. */
export interface PlanTaskConsistency {
  schemaVersion: 1;
  scope: 'plan-task-consistency';
  referenceDigest: string;
  tasksDigest: string;
  plan: string;
  taskCount: number;
}

/**
 * Strictly decodes the persisted values without transformation and checks their binding,
 * version pairing and identifier uniqueness. Does not validate requirements, approval,
 * admission or composite dependency closure.
 *
 * @throws when decoding, either digest, identity, count, pairing or uniqueness fails.
 */
export function validatePlanTasks(
  referenceInput: unknown,
  tasksInput: unknown,
): PlanTaskConsistency {
  const reference = parseOrThrow(PlanReferenceRecord, referenceInput);
  const tasks = parseOrThrow(PlanTasks, tasksInput);
  return checkPlanTaskConsistency(reference, tasks);
}

/**
 * Checks already decoded documents for digest binding, plan identity, task count,
 * supported version pairing and unique task IDs, step IDs and step codes.
 * Grants only consistency of these two documents.
 *
 * @throws when any consistency invariant fails.
 */
export function checkPlanTaskConsistency(
  reference: PlanReferenceRecord,
  tasks: PlanTasks,
): PlanTaskConsistency {
  const tasksDigest = digestOf(tasks);
  // Proof: removing the digest guard made tampered task values exit 0 in plan-tasks.test.ts
  // and the built executable refusal in packaging/build.test.ts (2026-10-13).
  // Proof: bypassing digest binding failed Navigator `tampered native estimate` refusal tests
  // in receipt-to-commands.test.ts (2026-10-14).
  if (tasksDigest !== reference.tasksDigest) throw new Error('tasksDigest does not match tasks');
  // Proof: removing identity equality made the re-digested plan mismatch exit 0 (plan-tasks.test.ts, 2026-10-13).
  // Proof: bypassing plan identity failed Navigator `re-digested plan mismatch` refusal tests
  // in receipt-to-commands.test.ts (2026-10-14).
  if (tasks.plan !== reference.planRef.plan)
    throw new Error('plan identity does not match reference');
  // Proof: removing count equality made the re-digested count mismatch exit 0 (plan-tasks.test.ts, 2026-10-13).
  // Proof: bypassing task count failed Navigator `re-digested count mismatch` refusal tests
  // in receipt-to-commands.test.ts (2026-10-14).
  if (tasks.tasks.length !== reference.taskCount)
    throw new Error('task count does not match reference');
  // Proof: removing version pairing made all three unsupported pair tests exit 0 (plan-tasks.test.ts, 2026-10-13).
  // Proof: bypassing version pairing failed Navigator `re-digested v6/schema2, v7/schema2 and v8/schema1` refusal tests
  // in receipt-to-commands.test.ts (2026-10-14).
  if (tasks.schemaVersion !== (reference.planDocumentVersion === 8 ? 2 : 1)) {
    throw new Error('plan document and task schema pairing is unsupported');
  }
  // Proof: removing task uniqueness made the duplicate task IDs test exit 0 (plan-tasks.test.ts, 2026-10-13).
  // Proof: bypassing task uniqueness failed Navigator `re-digested duplicate task ID` refusal tests
  // in receipt-to-commands.test.ts (2026-10-14).
  if (new Set(tasks.tasks.map((task) => task.id)).size !== tasks.tasks.length) {
    throw new Error('plan tasks require unique task IDs');
  }
  // Proof: removing step ID uniqueness made the duplicate step IDs test exit 0 (plan-tasks.test.ts, 2026-10-13).
  // Proof: bypassing step ID uniqueness failed Navigator `re-digested duplicate step ID` refusal tests
  // in receipt-to-commands.test.ts (2026-10-14).
  if (new Set(tasks.steps.map((step) => step.id)).size !== tasks.steps.length) {
    throw new Error('plan tasks require unique step IDs');
  }
  // Proof: removing step code uniqueness made the duplicate step codes test exit 0 (plan-tasks.test.ts, 2026-10-13).
  // Proof: bypassing step code uniqueness failed Navigator `re-digested duplicate step code named by receipt` refusal tests
  // in receipt-to-commands.test.ts (2026-10-14).
  if (new Set(tasks.steps.map((step) => step.code)).size !== tasks.steps.length) {
    throw new Error('plan tasks require unique step codes');
  }
  return {
    schemaVersion: 1,
    scope: 'plan-task-consistency',
    referenceDigest: reference.referenceDigest,
    tasksDigest,
    plan: tasks.plan,
    taskCount: tasks.tasks.length,
  };
}
