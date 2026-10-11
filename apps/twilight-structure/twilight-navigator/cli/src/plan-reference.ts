import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';
import { digestOf, type PlanRef, PlanReferenceRecord } from '@twilight-burokrat/contracts';
import { type PlanDocument, planDocument } from '@wbs/contracts';

import type { FlagValues } from './cli';
import { type PlanTask, PlanTasks } from './plan-tasks';
import {
  createExclusiveFiles,
  decodeRequiredText,
  parseRequiredJson,
  readRequiredBytes,
} from './required-file';

/** The flags of `twin plan-reference`, each required once. */
export const PLAN_REFERENCE_FLAGS = [
  '--export',
  '--repository',
  '--change',
  '--planning-commit',
  '--source-base',
  '--requirements',
  '--output',
] as const;

type PlanReferenceFlag = (typeof PLAN_REFERENCE_FLAGS)[number];

/**
 * The one WBS plan document version Navigator reads, pinned here rather than imported so a WBS
 * bump is refused until Navigator, the `planDocumentVersion: 6` literal in Burokrat's
 * `PlanReferenceRecord`, and the v6 fixture move together.
 */
const NAVIGATOR_PLAN_DOCUMENT_VERSION = 6;

const EXPORT_ROLE = 'plan export';
const REQUIREMENTS_ROLE = 'requirements file';

const PlanDocumentHeader = type({
  document: { format: "'wbs-plan'", version: 'number.integer' },
});
/** WBS's own v6 export contract, with every key it does not declare refused. */
const StrictPlanDocument = planDocument.onDeepUndeclaredKey('reject');

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Reads and validates one WBS plan export.
 *
 * @throws when the document is not a WBS plan, is not version {@link NAVIGATOR_PLAN_DOCUMENT_VERSION},
 * or fails the version-6 contract with any undeclared key.
 */
function decodePlanExport(bytes: Uint8Array, path: string): PlanDocument {
  const parsed = parseRequiredJson(bytes, EXPORT_ROLE, path);
  const header = PlanDocumentHeader(parsed);
  if (header instanceof type.errors) {
    throw new Error(`${EXPORT_ROLE} is malformed: ${path} is not a WBS plan (${header.summary})`);
  }
  // Proof: removing this check failed `refuses a version-5 document before writing`. Comparing
  // to WBS's imported PLAN_DOCUMENT_VERSION, bumped to 7 in libs/wbs, failed `refuses a version-7
  // document before writing` (received `plan export is malformed`) (2026-10-11).
  if (header.document.version !== NAVIGATOR_PLAN_DOCUMENT_VERSION) {
    throw new Error(
      `${EXPORT_ROLE} ${path} has version ${String(header.document.version)}; twin reads version ${String(NAVIGATOR_PLAN_DOCUMENT_VERSION)} only`,
    );
  }
  try {
    return parseOrThrow(StrictPlanDocument, parsed);
  } catch (failure) {
    throw new Error(`${EXPORT_ROLE} is malformed: ${path}`, { cause: failure });
  }
}

/**
 * The leaf work items of a plan in export order, with their ancestry, per-step estimates in
 * days keyed by step code, and the dependencies that end on them.
 *
 * @throws when a parent, an estimate's step or a step code is missing or repeated, since the
 * export would then not describe one tree.
 */
export function derivePlanTasks(document: PlanDocument): PlanTasks {
  const steps = [...document.steps]
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map((step) => ({ id: step.id, code: step.code, name: step.name }));
  const stepById = new Map(steps.map((step) => [step.id, step]));
  if (new Set(steps.map((step) => step.code)).size !== steps.length) {
    throw new Error('plan export repeats a step code');
  }
  const itemById = new Map(document.workItems.map((workItem) => [workItem.id, workItem]));
  const parents = new Set(document.workItems.map((workItem) => workItem.parentId));

  const ancestorsOf = (id: string): string[] => {
    const names: string[] = [];
    let parentId = itemById.get(id)?.parentId ?? null;
    while (parentId !== null) {
      const parent = itemById.get(parentId);
      if (parent === undefined) throw new Error(`plan export names a missing parent ${parentId}`);
      if (names.length >= document.workItems.length) {
        throw new Error(`plan export has a parent cycle at ${id}`);
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
          throw new Error(`plan export estimates ${workItem.id} on an unknown step ${stepId}`);
        }
      }
      return {
        id: workItem.id,
        number: workItem.number,
        name: workItem.name,
        ancestors: ancestorsOf(workItem.id),
        estimateDays: steps
          .filter((step) => Object.hasOwn(workItem.estimates, step.id))
          .map((step) => {
            const trio = workItem.estimates[step.id];
            return {
              stepCode: step.code,
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

  return parseOrThrow(PlanTasks, {
    schemaVersion: 1,
    kind: 'plan-tasks',
    plan: document.project.id,
    steps,
    tasks,
  });
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * `twin plan-reference`: writes `tasks.json` and `plan-reference.json` into an existing
 * directory and returns the plan reference's digest. Every input is read and validated, and
 * the record is decoded through Burokrat, before the first output file is created.
 */
export async function runPlanReference(request: FlagValues<PlanReferenceFlag>): Promise<string> {
  const exportPath = request('--export');
  const requirementsPath = request('--requirements');
  const exportBytes = await readRequiredBytes(exportPath, EXPORT_ROLE);
  const requirementsBytes = await readRequiredBytes(requirementsPath, REQUIREMENTS_ROLE);
  // Proof: removing this decode failed `refuses a missing, unreadable or malformed requirements
  // file` at its empty-file case (2026-10-11).
  decodeRequiredText(requirementsBytes, REQUIREMENTS_ROLE, requirementsPath);
  const document = decodePlanExport(exportBytes, exportPath);
  const tasks = derivePlanTasks(document);

  const planRef: PlanRef = {
    repository: request('--repository'),
    plan: document.project.id,
    change: request('--change'),
    planningCommit: request('--planning-commit'),
    sourceBaseCommit: request('--source-base'),
    requirementsDigest: sha256Hex(requirementsBytes),
  };
  const body = {
    schemaVersion: 1,
    kind: 'plan-reference',
    planRef,
    planDocumentVersion: NAVIGATOR_PLAN_DOCUMENT_VERSION,
    exportDigest: sha256Hex(exportBytes),
    tasksDigest: digestOf(tasks),
    taskCount: tasks.tasks.length,
    createdAt: document.document.exportedAt,
  };
  const record = parseOrThrow(PlanReferenceRecord, { ...body, referenceDigest: digestOf(body) });

  await createExclusiveFiles([
    { path: join(request('--output'), 'tasks.json'), text: prettyJson(tasks) },
    { path: join(request('--output'), 'plan-reference.json'), text: prettyJson(record) },
  ]);
  return record.referenceDigest;
}
