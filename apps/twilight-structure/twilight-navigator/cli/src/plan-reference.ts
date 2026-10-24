import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';
import {
  digestOf,
  type PlanRef,
  PlanReferenceRecord,
  type PlanTask,
  PlanTasks,
} from '@twilight-burokrat/contracts';
import { type PlanDocument, planDocument } from '@wbs/contracts';

import type { FlagValues } from './cli';
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

/** Explicit supported wire versions; a future WBS bump requires contract review here. */
const NAVIGATOR_PLAN_DOCUMENT_VERSIONS = [7, 8, 9, 10, 11] as const;

const EXPORT_ROLE = 'plan export';
const REQUIREMENTS_ROLE = 'requirements file';

/** What version 11 adds beside the factor (`wbs-measure-budgets` D63); older files carry none. */
const MEASURE_KEYS = ['measureDefinitions', 'measureFacts', 'measureEstimates', 'budgets'] as const;

/** The settings of a file before version 11: no budget factor, which reads as 1. */
const settingsBeforeVersion11 = planDocument.get('settings').omit('budgetFactor');

const PlanDocumentHeader = type({
  document: { format: "'wbs-plan'", version: 'number.integer' },
});
/**
 * Navigator's v7 wire contract: steps predate estimate units and always carry workdays.
 * WBS's current document schema supplies the unchanged fields; the versioned header and
 * step and work-item shapes retain the historical wire contract.
 */
// Proof: retaining the v9 stepBlockages requirement broke valid v7 and v8 exports
// in plan-reference.test.ts (injected schema dependency fault, 2026-10-14).
const HistoricalPlanDocument = planDocument
  .omit(
    'document',
    'settings',
    'steps',
    'workItems',
    'stepBlockages',
    'resourceCapacities',
    'demands',
    'directory',
    ...MEASURE_KEYS,
  )
  .and({
    settings: settingsBeforeVersion11,
    directory: planDocument.get('directory').omit('resources'),
    document: {
      format: "'wbs-plan'",
      version: '7',
      exportedAt: 'string',
    },
    steps: planDocument.get('steps', 0).exclude('undefined').omit('estimateUnit').array(),
    workItems: planDocument.get('workItems', 0).exclude('undefined').omit('charged').array(),
  })
  // Proof: removing deep rejection made the root unknown-key case and all six v7
  // estimateUnit/charged refusal cases exit 0 instead of 1 (plan-reference.test.ts, 2026-10-13).
  .onDeepUndeclaredKey('reject');

/** Current wire contract; nested unknown keys remain a refused input. */
// Proof: ignoring deep unknown keys made both current-export unknown-key tests exit 0.
// Injecting a workday default before this decode made the missing-unit test exit 0 (2026-10-13).
const Version8PlanDocument = planDocument
  .omit(
    'document',
    'settings',
    'stepBlockages',
    'resourceCapacities',
    'demands',
    'directory',
    ...MEASURE_KEYS,
  )
  .and({
    settings: settingsBeforeVersion11,
    document: { format: "'wbs-plan'", version: '8', exportedAt: 'string' },
    directory: planDocument.get('directory').omit('resources'),
  })
  .onDeepUndeclaredKey('reject');

/**
 * Navigator's v9 wire contract: the current document without the resource facts
 * version 10 added (`wbs-resources`).
 */
// Proof: removing deep rejection accepted `refuses v9 unknown nested key`; defaulting a missing
// collection accepted `refuses v9 missing facts`; truncating accepted `refuses v9 fractional time`
// through plan-reference.test.ts production dispatch (2026-10-15).
// Proof: reading v9 through the v10 schema refused both v9 positives on the absent resource
// lists (plan-reference.test.ts, 2026-10-20).
const Version9PlanDocument = planDocument
  .omit('document', 'settings', 'resourceCapacities', 'demands', 'directory', ...MEASURE_KEYS)
  .and({
    settings: settingsBeforeVersion11,
    document: { format: "'wbs-plan'", version: '9', exportedAt: 'string' },
    directory: planDocument.get('directory').omit('resources'),
  })
  .onDeepUndeclaredKey('reject');

/**
 * Navigator's v10 wire contract: the current document without the measures and
 * budget factor version 11 added (`wbs-measure-budgets` D63).
 */
// Proof: removing deep rejection accepted `refuses v10 unknown nested key` through
// plan-reference.test.ts production dispatch (2026-10-20).
const Version10PlanDocument = planDocument
  .omit('document', 'settings', ...MEASURE_KEYS)
  .and({
    document: { format: "'wbs-plan'", version: '10', exportedAt: 'string' },
    settings: settingsBeforeVersion11,
  })
  .onDeepUndeclaredKey('reject');

/** Strict current external wire shape, without historical defaults or discarded keys. */
// Proof: removing deep rejection accepted `refuses v11 unknown nested key` through
// plan-reference.test.ts production dispatch (2026-10-24).
const Version11PlanDocument = planDocument.onDeepUndeclaredKey('reject');

/**
 * Checks only direct archival facts at Navigator's external export boundary. Retained facts
 * on done nodes and negative instants are valid; progress and eligibility are not derived.
 * @throws when a direct fact has no existing leaf owner or step, repeats a pair, or has an unsafe instant.
 */
function validateBlockageFacts(document: PlanDocument): void {
  const owners = new Set(document.workItems.map(({ id }) => id));
  const parents = new Set(document.workItems.map(({ parentId }) => parentId));
  const steps = new Set(document.steps.map(({ id }) => id));
  const pairs = new Set<string>();
  for (const { workItemId, stepId, blockedAt } of document.stepBlockages) {
    // Proof: Removing owner membership accepted `refuses v9 owner` in plan-reference.test.ts (2026-10-15).
    if (!owners.has(workItemId)) throw new Error(`blockage names unknown owner ${workItemId}`);
    // Proof: Removing leaf ownership accepted `refuses v9 parent` in plan-reference.test.ts (2026-10-15).
    if (parents.has(workItemId)) throw new Error(`blockage owner ${workItemId} is not a leaf`);
    // Proof: Removing step membership accepted `refuses v9 step` in plan-reference.test.ts (2026-10-15).
    if (!steps.has(stepId)) throw new Error(`blockage names unknown step ${stepId}`);
    // Proof: Removing safe-integer validation accepted `refuses v9 unsafe time` in plan-reference.test.ts (2026-10-15).
    if (!Number.isSafeInteger(blockedAt))
      throw new Error('blockage timestamp is not a safe integer');
    const pair = JSON.stringify([workItemId, stepId]);
    // Proof: Removing uniqueness accepted `refuses v9 duplicate` in plan-reference.test.ts (2026-10-15).
    if (pairs.has(pair)) throw new Error('blockage repeats an owner/step pair');
    pairs.add(pair);
  }
}

interface DecodedPlanExport {
  document: PlanDocument;
  wireVersion: NavigatorPlanDocumentVersion;
}

type NavigatorPlanDocumentVersion = (typeof NAVIGATOR_PLAN_DOCUMENT_VERSIONS)[number];

/** The resource facts a document before version 10 carries: none. */
function noResourceFacts(): Pick<PlanDocument, 'resourceCapacities' | 'demands'> {
  return { resourceCapacities: [], demands: [] };
}

/** The measures a document before version 11 carries: none (`wbs-measure-budgets` D63). */
function noMeasures(): Pick<PlanDocument, (typeof MEASURE_KEYS)[number]> {
  return { measureDefinitions: [], measureFacts: [], measureEstimates: [], budgets: [] };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Reads and validates one WBS plan export.
 *
 * @throws when the document is not a WBS plan, names no version in {@link NAVIGATOR_PLAN_DOCUMENT_VERSIONS},
 * or fails the export contract with any undeclared key.
 */
function decodePlanExport(bytes: Uint8Array, path: string): DecodedPlanExport {
  const parsed = parseRequiredJson(bytes, EXPORT_ROLE, path);
  const header = PlanDocumentHeader(parsed);
  if (header instanceof type.errors) {
    throw new Error(`${EXPORT_ROLE} is malformed: ${path} is not a WBS plan (${header.summary})`);
  }
  // Proof: restoring the v7 pin failed the mixed-unit v8 test; removing this guard
  // failed the historical future-version refusal diagnostic (plan-reference.test.ts, 2026-10-13).
  // Proof: restoring the v7/v8 pin broke both v9 positives; bypassing the guard broke the v10
  // refusal diagnostic in plan-reference.test.ts (2026-10-15).
  // Proof: with 11 dropped from this guard and the list, `reads a v11 export carrying
  // measures, deriving the same tasks as v10` and the three v11 refusals exited on
  // "has version 11" (38 pass, 6 fail, plan-reference.test.ts); watched 2026-10-24.
  if (
    header.document.version !== 7 &&
    header.document.version !== 8 &&
    header.document.version !== 9 &&
    header.document.version !== 10 &&
    header.document.version !== 11
  ) {
    throw new Error(
      `${EXPORT_ROLE} ${path} has version ${String(header.document.version)}; twin reads versions ${NAVIGATOR_PLAN_DOCUMENT_VERSIONS.join(' and ')} only`,
    );
  }
  try {
    // Proof: with version 11 parsed through the v10 shape, `reads a v11 export
    // carrying measures, deriving the same tasks as v10` (plan-reference.test.ts)
    // exited 1 as malformed (43 pass, 1 fail); watched 2026-10-24.
    if (header.document.version === 11) {
      const document = parseOrThrow(Version11PlanDocument, parsed);
      validateBlockageFacts(document);
      return { document, wireVersion: 11 };
    }
    if (header.document.version === 10) {
      const document = parseOrThrow(Version10PlanDocument, parsed);
      const current: PlanDocument = {
        ...document,
        ...noMeasures(),
        document: { ...document.document, version: 11 },
        settings: { ...document.settings, budgetFactor: 1 },
      };
      validateBlockageFacts(current);
      return { document: current, wireVersion: 10 };
    }
    if (header.document.version === 9) {
      const document = parseOrThrow(Version9PlanDocument, parsed);
      const current: PlanDocument = {
        ...document,
        ...noResourceFacts(),
        ...noMeasures(),
        document: { ...document.document, version: 11 },
        settings: { ...document.settings, budgetFactor: 1 },
        directory: { ...document.directory, resources: [] },
      };
      validateBlockageFacts(current);
      return { document: current, wireVersion: 9 };
    }
    if (header.document.version === 8) {
      const document = parseOrThrow(Version8PlanDocument, parsed);
      return {
        document: {
          ...document,
          ...noResourceFacts(),
          ...noMeasures(),
          document: { ...document.document, version: 11 },
          settings: { ...document.settings, budgetFactor: 1 },
          directory: { ...document.directory, resources: [] },
          stepBlockages: [],
        },
        wireVersion: 8,
      };
    }
    const document = parseOrThrow(HistoricalPlanDocument, parsed);
    return {
      wireVersion: 7,
      document: {
        ...document,
        ...noResourceFacts(),
        ...noMeasures(),
        document: { ...document.document, version: 11 },
        settings: { ...document.settings, budgetFactor: 1 },
        directory: { ...document.directory, resources: [] },
        stepBlockages: [],
        steps: document.steps.map((step) => ({ ...step, estimateUnit: 'workdays' })),
      },
    };
  } catch (failure) {
    throw new Error(`${EXPORT_ROLE} is malformed: ${path}`, { cause: failure });
  }
}

/**
 * The leaf work items of a plan in export order, with their ancestry, per-step native estimates
 * keyed by step code, and the dependencies that end on them.
 *
 * @throws when a parent, an estimate's step or a step code is missing or repeated, since the
 * export would then not describe one tree.
 */
export function derivePlanTasks(
  document: PlanDocument,
  wireVersion: NavigatorPlanDocumentVersion,
): PlanTasks {
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

  return parseOrThrow(PlanTasks, {
    schemaVersion: wireVersion === 7 ? 1 : 2,
    kind: 'plan-tasks',
    plan: document.project.id,
    steps: steps.map(({ id, code, name }) => ({ id, code, name })),
    tasks:
      wireVersion === 7
        ? tasks.map(({ estimates, ...task }) => ({
            ...task,
            estimateDays: estimates.map(({ unit: _unit, ...estimate }) => estimate),
          }))
        : tasks,
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
  const { document, wireVersion } = decodePlanExport(exportBytes, exportPath);
  const tasks = derivePlanTasks(document, wireVersion);

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
    planDocumentVersion: wireVersion,
    // Proof: hashing decoded canonical JSON broke both v9 raw-byte assertions in
    // plan-reference.test.ts (2026-10-15).
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
