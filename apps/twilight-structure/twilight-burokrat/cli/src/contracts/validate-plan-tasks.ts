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
  const tasksDigest = digestOf(tasks);
  // Proof: removing the digest guard made tampered task values exit 0 (plan-tasks.test.ts, 2026-10-13).
  if (tasksDigest !== reference.tasksDigest) throw new Error('tasksDigest does not match tasks');
  // Proof: removing identity equality made the re-digested plan mismatch exit 0 (plan-tasks.test.ts, 2026-10-13).
  if (tasks.plan !== reference.planRef.plan)
    throw new Error('plan identity does not match reference');
  // Proof: removing count equality made the re-digested count mismatch exit 0 (plan-tasks.test.ts, 2026-10-13).
  if (tasks.tasks.length !== reference.taskCount)
    throw new Error('task count does not match reference');
  // Proof: removing version pairing made all three unsupported pair tests exit 0 (plan-tasks.test.ts, 2026-10-13).
  if (tasks.schemaVersion !== (reference.planDocumentVersion === 8 ? 2 : 1)) {
    throw new Error('plan document and task schema pairing is unsupported');
  }
  // Proof: removing task uniqueness made the duplicate task IDs test exit 0 (plan-tasks.test.ts, 2026-10-13).
  if (new Set(tasks.tasks.map((task) => task.id)).size !== tasks.tasks.length) {
    throw new Error('plan tasks require unique task IDs');
  }
  // Proof: removing step ID uniqueness made the duplicate step IDs test exit 0 (plan-tasks.test.ts, 2026-10-13).
  if (new Set(tasks.steps.map((step) => step.id)).size !== tasks.steps.length) {
    throw new Error('plan tasks require unique step IDs');
  }
  // Proof: removing step code uniqueness made the duplicate step codes test exit 0 (plan-tasks.test.ts, 2026-10-13).
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
