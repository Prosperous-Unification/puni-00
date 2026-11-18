import {
  decodeRequiredText,
  digestBytes,
  digestOf,
  NativePlanTasks,
  parseRequiredJson,
  type PlanRef,
  PlanReferenceRecord,
  type PlanTask,
  PlanTasks,
  RequiredBytesError,
} from '@shared/plan-reference';
import { parseOrThrow, type, ValidationError } from '@shared/validation';

import { type PlanDocumentV11, planDocumentV11 } from './http/plan-document-shapes';

type SupportedPlanDocumentVersion = 7 | 8 | 9 | 10 | 11;

interface PlanReferenceInputs {
  readonly exportBytes: Uint8Array;
  readonly requirementsBytes: Uint8Array;
  readonly repository: string;
  readonly change: string;
  readonly planningCommit: string;
  readonly sourceBaseCommit: string;
}

const PlanDocumentHeader = type({
  document: { format: "'wbs-plan'", version: 'number.integer' },
});

function ordinaryDocumentShape() {
  return planDocumentV11.onDeepUndeclaredKey('reject');
}

let ordinaryDocument: ReturnType<typeof ordinaryDocumentShape> | undefined;

/** The strict ordinary document schema is built only for callers decoding an export. */
export function decodeOrdinaryPlanDocument(parsed: unknown): PlanDocumentV11 {
  // Proof: removing deep rejection accepted `refuses v11 unknown nested key` through
  // Navigator's production dispatch (2026-10-24).
  ordinaryDocument ??= ordinaryDocumentShape();
  const document = parseOrThrow(ordinaryDocument, parsed);
  // Proof: Skipping this check made "refuses a non-finite export budget factor at
  // registration" receive an internal 500 instead of 400 invalid_plan_artifacts.
  assertFinitePlanNumbers(document);
  validateBlockageFacts(document);
  return document;
}

/** Typed refusal of the ordinary acceptance input before live WBS capture. */
export class PlanReferenceInputError extends Error {
  constructor(
    readonly reason: 'unsupported_plan_version' | 'invalid_plan_artifacts',
    cause: unknown,
  ) {
    super(reason, { cause });
  }
}

/**
 * Decodes an ordinary v11 export and derives its complete reference from the same bytes.
 * @throws {PlanReferenceInputError} for invalid artifacts or a recognized unsupported version.
 */
export function compileOrdinaryPlanReference(inputs: PlanReferenceInputs) {
  try {
    decodeRequiredText(inputs.requirementsBytes, 'requirements file', 'request');
    const parsed = parseRequiredJson(inputs.exportBytes, 'plan export', 'request');
    const header = PlanDocumentHeader(parsed);
    // Proof: Skipping the explicit version refusal made "refuses actual v12 wire input" fail. The
    // faulted fixture received 400 with `invalid_plan_artifacts` where the fixture expected
    // `unsupported_plan_version`.
    if (!(header instanceof type.errors) && header.document.version !== 11) {
      throw new PlanReferenceInputError('unsupported_plan_version', header.document.version);
    }
    const document = decodeOrdinaryPlanDocument(parsed);
    return assembleReference(document, 11, inputs, nativeTasks(document));
  } catch (cause) {
    if (cause instanceof PlanReferenceInputError) throw cause;
    if (
      cause instanceof RequiredBytesError ||
      cause instanceof PlanDocumentFactsError ||
      cause instanceof ValidationError
    )
      throw new PlanReferenceInputError('invalid_plan_artifacts', cause);
    throw cause;
  }
}

class PlanDocumentFactsError extends Error {}

/** Rejects overflowing JSON numbers anywhere in the decoded ordinary export. */
function assertFinitePlanNumbers(value: unknown): void {
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new PlanDocumentFactsError('ordinary plan export contains a non-finite number');
  if (typeof value === 'object' && value !== null)
    for (const child of Object.values(value)) assertFinitePlanNumbers(child);
}

/**
 * Checks only direct archival facts at Navigator's external export boundary. Retained facts
 * on done nodes and negative instants are valid; progress and eligibility are not derived.
 * @throws when a direct fact has no existing leaf owner or step, repeats a pair, or has an unsafe instant.
 */
export function validateBlockageFacts(document: PlanDocumentV11): void {
  const owners = new Set(document.workItems.map(({ id }) => id));
  const parents = new Set(document.workItems.map(({ parentId }) => parentId));
  const steps = new Set(document.steps.map(({ id }) => id));
  const pairs = new Set<string>();
  for (const { workItemId, stepId, blockedAt } of document.stepBlockages) {
    // Proof: Removing owner membership accepted `refuses v9 owner` in plan-reference.test.ts (2026-10-15).
    if (!owners.has(workItemId))
      throw new PlanDocumentFactsError(`blockage names unknown owner ${workItemId}`);
    // Proof: Removing leaf ownership accepted `refuses v9 parent` in plan-reference.test.ts (2026-10-15).
    if (parents.has(workItemId))
      throw new PlanDocumentFactsError(`blockage owner ${workItemId} is not a leaf`);
    // Proof: Removing step membership accepted `refuses v9 step` in plan-reference.test.ts (2026-10-15).
    if (!steps.has(stepId))
      throw new PlanDocumentFactsError(`blockage names unknown step ${stepId}`);
    // Proof: Removing safe-integer validation accepted `refuses v9 unsafe time` in plan-reference.test.ts (2026-10-15).
    if (!Number.isSafeInteger(blockedAt))
      throw new PlanDocumentFactsError('blockage timestamp is not a safe integer');
    const pair = JSON.stringify([workItemId, stepId]);
    // Proof: Removing uniqueness accepted `refuses v9 duplicate` in plan-reference.test.ts (2026-10-15).
    if (pairs.has(pair)) throw new PlanDocumentFactsError('blockage repeats an owner/step pair');
    pairs.add(pair);
  }
}

/**
 * The leaf work items of a plan in export order, with their ancestry, per-step native estimates
 * keyed by step code, and the dependencies that end on them.
 *
 * @throws when a parent, an estimate's step or a step code is missing or repeated, since the
 * export would then not describe one tree.
 */
function derivePlanTasks(document: PlanDocumentV11) {
  const steps = [...document.steps]
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map((step) => ({
      id: step.id,
      code: step.code,
      name: step.name,
      estimateUnit: step.estimateUnit,
    }));
  const stepById = new Map(document.steps.map((step) => [step.id, step]));
  if (new Set(steps.map((step) => step.code)).size !== steps.length) {
    throw new PlanDocumentFactsError('plan export repeats a step code');
  }
  const workItemById = new Map(document.workItems.map((workItem) => [workItem.id, workItem]));
  const parents = new Set(document.workItems.map((workItem) => workItem.parentId));

  const ancestorsOf = (id: string): string[] => {
    const names: string[] = [];
    let parentId = workItemById.get(id)?.parentId ?? null;
    while (parentId !== null) {
      const parent = workItemById.get(parentId);
      if (parent === undefined)
        throw new PlanDocumentFactsError(`plan export names a missing parent ${parentId}`);
      if (names.length >= document.workItems.length) {
        throw new PlanDocumentFactsError(`plan export has a parent cycle at ${id}`);
      }
      names.unshift(parent.name);
      parentId = parent.parentId;
    }
    return names;
  };

  const tasks: PlanTask[] = document.workItems
    .filter((workItem) => !parents.has(workItem.id))
    .map((workItem) => {
      for (const stepId of Object.keys(workItem.estimates)) {
        if (!stepById.has(stepId)) {
          throw new PlanDocumentFactsError(
            `plan export estimates ${workItem.id} on an unknown step ${stepId}`,
          );
        }
      }
      return {
        id: workItem.id,
        number: workItem.number,
        name: workItem.name,
        ancestors: ancestorsOf(workItem.id),
        estimates: steps
          .filter((step) => Object.hasOwn(workItem.estimates, step.id))
          .map((step) => {
            const trio = workItem.estimates[step.id];
            return {
              stepCode: step.code,
              unit: step.estimateUnit,
              optimistic: trio.optimistic,
              realistic: trio.realistic,
              pessimistic: trio.pessimistic,
            };
          }),
        dependsOn: [...workItem.dependsOn],
        typedDependencies: document.typedDependencies
          .filter((dependency) => dependency.successor.workItem === workItem.id)
          .map((dependency) => ({
            id: dependency.id,
            type: dependency.type,
            predecessor: { ...dependency.predecessor },
            successor: { ...dependency.successor },
          })),
      };
    });

  return {
    kind: 'plan-tasks' as const,
    plan: document.project.id,
    steps: steps.map(({ id, code, name }) => ({ id, code, name })),
    tasks,
  };
}

function nativeTasks(document: PlanDocumentV11) {
  return parseOrThrow(NativePlanTasks, { schemaVersion: 2, ...derivePlanTasks(document) });
}

/** Decodes a string already validated by the accepted-reference base64 wire contract. */
export function decodePlanReferenceBytes(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), (unit) => unit.charCodeAt(0));
}

/**
 * Compiles Navigator's previously validated and normalized historical input.
 * The document and wire version must be derived from the exact export bytes,
 * and the requirements bytes must already have passed the required-text check.
 */
export function compilePlanReferenceFromDocument(
  document: PlanDocumentV11,
  wireVersion: SupportedPlanDocumentVersion,
  inputs: PlanReferenceInputs,
) {
  if (wireVersion !== 7)
    return assembleReference(document, wireVersion, inputs, nativeTasks(document));
  const native = derivePlanTasks(document);
  const tasks = parseOrThrow(PlanTasks, {
    schemaVersion: 1,
    ...native,
    tasks: native.tasks.map(({ estimates, ...task }) => ({
      ...task,
      estimateDays: estimates.map(({ unit: _unit, ...estimate }) => estimate),
    })),
  });
  return assembleReference(document, wireVersion, inputs, tasks);
}

function assembleReference<Tasks extends PlanTasks>(
  document: PlanDocumentV11,
  wireVersion: SupportedPlanDocumentVersion,
  {
    exportBytes,
    requirementsBytes,
    repository,
    change,
    planningCommit,
    sourceBaseCommit,
  }: PlanReferenceInputs,
  tasks: Tasks,
) {
  const planRef: PlanRef = {
    repository: repository,
    plan: document.project.id,
    change: change,
    planningCommit: planningCommit,
    sourceBaseCommit: sourceBaseCommit,
    requirementsDigest: digestBytes(requirementsBytes),
  };
  const body = {
    schemaVersion: 1,
    kind: 'plan-reference',
    planRef,
    planDocumentVersion: wireVersion,
    // Proof: hashing decoded canonical JSON broke both v9 raw-byte assertions in
    // plan-reference.test.ts (2026-10-15).
    exportDigest: digestBytes(exportBytes),
    tasksDigest: digestOf(tasks),
    taskCount: tasks.tasks.length,
    createdAt: document.document.exportedAt,
  };
  const reference = parseOrThrow(PlanReferenceRecord, { ...body, referenceDigest: digestOf(body) });
  return { document, reference, tasks };
}
