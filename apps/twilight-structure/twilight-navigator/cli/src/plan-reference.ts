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
import {
  createLegacyPlanDocumentV11,
  createLegacyPlanDocumentV12,
  type PlanDocument,
  planDocument,
  type PlanDocumentV11,
  type PlanDocumentV12,
  type PlanDocumentV13,
  planDocumentV13,
  type PlanDocumentV14,
  planDocumentV14,
  requestSchema,
  validateSchema,
} from '@wbs/contracts';

import type { NavigatorRequest } from './cli-parser';
import {
  createExclusiveFiles,
  decodeRequiredText,
  parseRequiredJson,
  readRequiredBytes,
} from './required-file';

/** Explicit supported wire versions; a future WBS bump requires contract review here. */
const NAVIGATOR_PLAN_DOCUMENT_VERSIONS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

const EXPORT_ROLE = 'plan export';
const REQUIREMENTS_ROLE = 'requirements file';

/** What version 11 adds beside the factor (`wbs-measure-budgets` D63); older files carry none. */
const MEASURE_KEYS = ['measureDefinitions', 'measureFacts', 'measureEstimates', 'budgets'] as const;

const PlanDocumentHeader = type({
  document: { format: "'wbs-plan'", version: 'number.integer' },
});
/** Historical7–11 decoders share one cached frozen11 factory, compiled only on selection. */
function createHistoricalDecoders() {
  const planDocumentV11 = createLegacyPlanDocumentV11();
  /** The settings of a file before version 11: no budget factor, which reads as 1. */
  const settingsBeforeVersion11 = planDocumentV11.get('settings').omit('budgetFactor');
  // Proof: omitting this historical metadata restriction admitted project factors
  // through the real v7 and v10 plan-reference entry points (2026-10-24).
  const projectBeforeVersion11 = planDocumentV11.get('project').omit('budgetFactor');

  /**
   * Navigator's v7 wire contract: steps predate estimate units and always carry workdays.
   * WBS's pinned v10 document schema supplies the unchanged fields; the versioned header and
   * step and work-item shapes retain the historical wire contract.
   */
  // Proof: retaining the v9 stepBlockages requirement broke valid v7 and v8 exports
  // in plan-reference.test.ts (injected schema dependency fault, 2026-10-14).
  const HistoricalPlanDocument = planDocumentV11
    .omit(
      'project',
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
      project: projectBeforeVersion11,
      settings: settingsBeforeVersion11,
      directory: planDocumentV11.get('directory').omit('resources'),
      document: {
        format: "'wbs-plan'",
        version: '7',
        exportedAt: 'string',
      },
      steps: planDocumentV11.get('steps', 0).exclude('undefined').omit('estimateUnit').array(),
      workItems: planDocumentV11.get('workItems', 0).exclude('undefined').omit('charged').array(),
    })
    // Proof: removing deep rejection made the root unknown-key case and all six v7
    // estimateUnit/charged refusal cases exit 0 instead of 1 (plan-reference.test.ts, 2026-10-13).
    .onDeepUndeclaredKey('reject');

  /** Current wire contract; nested unknown keys remain a refused input. */
  // Proof: ignoring deep unknown keys made both current-export unknown-key tests exit 0.
  // Injecting a workday default before this decode made the missing-unit test exit 0 (2026-10-13).
  const Version8PlanDocument = planDocumentV11
    .omit(
      'project',
      'document',
      'settings',
      'stepBlockages',
      'resourceCapacities',
      'demands',
      'directory',
      ...MEASURE_KEYS,
    )
    .and({
      project: projectBeforeVersion11,
      settings: settingsBeforeVersion11,
      document: { format: "'wbs-plan'", version: '8', exportedAt: 'string' },
      directory: planDocumentV11.get('directory').omit('resources'),
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
  const Version9PlanDocument = planDocumentV11
    .omit(
      'project',
      'document',
      'settings',
      'resourceCapacities',
      'demands',
      'directory',
      ...MEASURE_KEYS,
    )
    .and({
      project: projectBeforeVersion11,
      settings: settingsBeforeVersion11,
      document: { format: "'wbs-plan'", version: '9', exportedAt: 'string' },
      directory: planDocumentV11.get('directory').omit('resources'),
    })
    .onDeepUndeclaredKey('reject');

  /**
   * Navigator's v10 wire contract: the current document without the measures and
   * budget factor version 11 added (`wbs-measure-budgets` D63).
   */
  // Proof: removing deep rejection accepted `refuses v10 unknown nested key` through
  // plan-reference.test.ts production dispatch (2026-10-20).
  const Version10PlanDocument = planDocumentV11
    .omit('project', 'document', 'settings', ...MEASURE_KEYS)
    .and({
      document: { format: "'wbs-plan'", version: '10', exportedAt: 'string' },
      project: projectBeforeVersion11,
      settings: settingsBeforeVersion11,
    })
    .onDeepUndeclaredKey('reject');

  /** Strict current external wire shape, without historical defaults or discarded keys. */
  // Proof: removing deep rejection accepted `refuses v11 unknown nested key` through
  // plan-reference.test.ts production dispatch (2026-10-24).
  const Version11PlanDocument = planDocumentV11.onDeepUndeclaredKey('reject');

  return {
    HistoricalPlanDocument,
    Version8PlanDocument,
    Version9PlanDocument,
    Version10PlanDocument,
    Version11PlanDocument,
  };
}
// Proof: F16 eagerly built historical graphs: the import counter was eleven1 instead of 0, before
// reuse assertions (plan-reference-lazy.test.ts).
let historicalDecoders: ReturnType<typeof createHistoricalDecoders> | undefined;
let connected12Decoder: ReturnType<typeof createConnected12Decoder> | undefined;
/** Complete frozen12 uses the public strict descriptor boundary, including object-valued dictionaries. */
function createConnected12Decoder() {
  // Proof: F03 bypassed descriptor validation: an array-valued estimate dictionary12 exited 0 instead
  // of 1 (plan-reference-current.test.ts).
  // Proof: F04 used tolerant response decoding: a mixed-owner endpoint12 exited 0 instead of 1
  // (plan-reference-current.test.ts).
  return requestSchema(createLegacyPlanDocumentV12());
}
// Proof: F15 eagerly built this graph: the import counter was current1 instead of 0, before reuse
// assertions (plan-reference-lazy.test.ts).
let frozenWorkPackageDecoder: ReturnType<typeof createFrozenWorkPackageDecoder> | undefined;
/** Frozen owner-bearing13/14 use their public versioned declarations, independent of current exports. */
function createFrozenWorkPackageDecoder() {
  // Proof: F05 used the tolerant current response: a mixed-owner endpoint14 exited 0 instead of 1,
  // with valid13 control (plan-reference-current.test.ts).
  return requestSchema(planDocumentV13.or(planDocumentV14));
}
let strictCurrentDecoder: ReturnType<typeof createStrictCurrentDecoder> | undefined;
/** Ownerless15/16 select one cached strict public union; HTTP response tolerance remains unchanged. */
function createStrictCurrentDecoder() {
  return requestSchema(planDocument);
}

/**
 * Checks only direct archival facts at Navigator's external export boundary. Retained facts
 * on done nodes and negative instants are valid; progress and eligibility are not derived.
 * @throws when a direct fact has no existing leaf owner or step, repeats a pair, or has an unsafe instant.
 */
function validateBlockageFacts(document: {
  workItems: readonly { id: string; parentId: string | null }[];
  steps: readonly { id: string }[];
  stepBlockages: readonly { workItemId: string; stepId: string; blockedAt: number }[];
}): void {
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

type DecodedPlanExport =
  | { document: PlanDocumentV11; wireVersion: 7 | 8 | 9 | 10 | 11 }
  | { document: PlanDocumentV12; wireVersion: 12 }
  | { document: PlanDocumentV13 | PlanDocumentV14; wireVersion: 13 | 14 }
  | { document: PlanDocument; wireVersion: 15 | 16 };

/** The resource facts a document before version 10 carries: none. */
function noResourceFacts(): Pick<PlanDocumentV11, 'resourceCapacities' | 'demands'> {
  return { resourceCapacities: [], demands: [] };
}

/** The measures a document before version 11 carries: none (`wbs-measure-budgets` D63). */
function noMeasures(): Pick<PlanDocumentV11, (typeof MEASURE_KEYS)[number]> {
  return { measureDefinitions: [], measureFacts: [], measureEstimates: [], budgets: [] };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Reads one WBS export: preserved7–14 plus complete ownerless ordinary15/connected16.
 * Frozen12, frozen13/14 and current15/16 cache separate selected strict decoders; import builds none.
 * Historical12 retains published project spelling and detached history before projection.
 *
 * @throws when the document is not a WBS plan, names no version in {@link NAVIGATOR_PLAN_DOCUMENT_VERSIONS},
 * or fails the export contract with any undeclared key.
 */
async function decodePlanExport(bytes: Uint8Array, path: string): Promise<DecodedPlanExport> {
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
  // Proof: D01 removed this guard: future15 still exited 1, but lost the has-version15 diagnostic
  // (plan-reference-current.test.ts).
  if (
    header.document.version !== 7 &&
    header.document.version !== 8 &&
    header.document.version !== 9 &&
    header.document.version !== 10 &&
    header.document.version !== 11 &&
    header.document.version !== 12 &&
    header.document.version !== 13 &&
    header.document.version !== 14 &&
    header.document.version !== 15 &&
    header.document.version !== 16
  ) {
    throw new Error(
      `${EXPORT_ROLE} ${path} has version ${String(header.document.version)}; twin reads versions ${NAVIGATOR_PLAN_DOCUMENT_VERSIONS.join(' and ')} only`,
    );
  }
  try {
    if (header.document.version === 15 || header.document.version === 16) {
      strictCurrentDecoder ??= createStrictCurrentDecoder();
      const checked = await validateSchema(strictCurrentDecoder, parsed);
      if (checked.issues !== undefined) throw new Error(JSON.stringify(checked.issues));
      // Captured parent correspondence is document consistency, never a lookup or write authority.
      if (checked.value.workPackage.projectId !== checked.value.project.id)
        throw new Error('plan export parent mismatch');
      validateBlockageFacts(checked.value);
      return { document: checked.value, wireVersion: header.document.version };
    }
    if (header.document.version === 13 || header.document.version === 14) {
      frozenWorkPackageDecoder ??= createFrozenWorkPackageDecoder();
      const checked = await validateSchema(frozenWorkPackageDecoder, parsed);
      if (checked.issues !== undefined) throw new Error(JSON.stringify(checked.issues));
      // Proof: F17B removed this call: documents13/14 fault=owner exited 0 instead of 1; later loop
      // cases were not reached (plan-reference-current.test.ts).
      validateBlockageFacts(checked.value);
      return { document: checked.value, wireVersion: header.document.version };
    }
    if (header.document.version === 12) {
      connected12Decoder ??= createConnected12Decoder();
      const checked = await validateSchema(connected12Decoder, parsed);
      if (checked.issues !== undefined) throw new Error(JSON.stringify(checked.issues));
      // Proof: F17A removed this call: document12 fault=owner exited 0 instead of 1; later loop cases
      // were not reached (plan-reference-current.test.ts).
      validateBlockageFacts(checked.value);
      return { document: checked.value, wireVersion: 12 };
    }
    historicalDecoders ??= createHistoricalDecoders();
    const {
      HistoricalPlanDocument,
      Version8PlanDocument,
      Version9PlanDocument,
      Version10PlanDocument,
      Version11PlanDocument,
    } = historicalDecoders;
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
      const current: PlanDocumentV11 = {
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
      const current: PlanDocumentV11 = {
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
function deriveHistoricalPlanTasks(
  document: PlanDocumentV11,
  wireVersion: 7 | 8 | 9 | 10 | 11,
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

type SupportedDocument = DecodedPlanExport['document'];

/** The selected WBS/work-package identity is local; detached owners never replace it. */
function planIdOf(document: SupportedDocument): string {
  // Proof: F01 substituted the historical root: the native14 C-identity assertion received
  // missing-project-root (plan-reference-current.test.ts).
  return 'workPackage' in document ? document.workPackage.id : document.project.id;
}

/**
 * Preserves7–11 tasks/digests and projects12–16 to PlanTasks3: local leaf receipt targets
 * and every authored dependency once in document order, including parent successors.
 * Frozen12 external project identity/display names map explicitly to current work-package names.
 * Detached connected history was validated before this projection and is never expanded into edges.
 * @throws for missing/cyclic parents, unknown estimate steps or repeated step codes.
 */
export function derivePlanTasks({ document, wireVersion }: DecodedPlanExport): PlanTasks {
  if (
    wireVersion === 7 ||
    wireVersion === 8 ||
    wireVersion === 9 ||
    wireVersion === 10 ||
    wireVersion === 11
  ) {
    return deriveHistoricalPlanTasks(document, wireVersion);
  }
  const steps = [...document.steps].sort(
    (left, right) => left.position - right.position || left.id.localeCompare(right.id),
  );
  // Proof: F18 bypassed duplicate step-code rejection: projection exited 0 instead of 1
  // (plan-reference-current.test.ts).
  if (new Set(steps.map((step) => step.code)).size !== steps.length)
    throw new Error('plan export repeats a step code');
  const stepById = new Map(steps.map((step) => [step.id, step]));
  const workById = new Map(document.workItems.map((work) => [work.id, work]));
  const parents = new Set(document.workItems.map((work) => work.parentId));
  const tasks = document.workItems
    .filter((work) => !parents.has(work.id))
    .map((work) => {
      const ancestors: string[] = [];
      let parentId = work.parentId;
      while (parentId !== null) {
        const parent = workById.get(parentId);
        // Proof: F19 replaced this throw with bounded break: missing-parent projection exited 0
        // instead of 1 (plan-reference-current.test.ts).
        if (parent === undefined) throw new Error('plan export names a missing parent ' + parentId);
        // Proof: F20 replaced this throw with bounded break: cyclic-parent projection exited 0
        // instead of 1; no timeout credit (plan-reference-current.test.ts).
        if (ancestors.length >= document.workItems.length)
          throw new Error('plan export has a parent cycle at ' + work.id);
        ancestors.unshift(parent.name);
        parentId = parent.parentId;
      }
      // Proof: F21 bypassed unknown estimate-step rejection: projection exited 0 instead of 1
      // (plan-reference-current.test.ts).
      for (const stepId of Object.keys(work.estimates))
        if (!stepById.has(stepId))
          throw new Error('plan export estimates ' + work.id + ' on an unknown step ' + stepId);
      return {
        id: work.id,
        number: work.number,
        name: work.name,
        ancestors,
        dependsOn: [...work.dependsOn],
        estimates: steps
          .filter((step) => Object.hasOwn(work.estimates, step.id))
          .map((step) => {
            const trio = work.estimates[step.id];
            return {
              stepCode: step.code,
              unit: step.estimateUnit,
              optimistic: trio.optimistic,
              realistic: trio.realistic,
              pessimistic: trio.pessimistic,
            };
          }),
      };
    });
  // Proof: F06 dropped external predecessors: the authored-edge count14 became 0 instead of 1
  // (plan-reference-current.test.ts).
  // Proof: F07 kept only leaf successors: the three parent-edge tuples became []
  // (plan-reference-current.test.ts).
  const typedDependencies = document.typedDependencies.map((dependency) => {
    const predecessor = dependency.predecessor;
    // Proof: F08 substituted a local predecessor: the external kind/owner/work-item/display-name
    // shape failed (plan-reference-current.test.ts).
    if ('kind' in predecessor && predecessor.kind === 'external') {
      const display = predecessor.display;
      return {
        id: dependency.id,
        type: dependency.type,
        predecessor: {
          kind: 'external',
          scope: predecessor.scope,
          workPackageId:
            'projectId' in predecessor ? predecessor.projectId : predecessor.workPackageId,
          workItemId: predecessor.workItemId,
          ...('stepId' in predecessor ? { stepId: predecessor.stepId } : {}),
          display: {
            workPackageName:
              'projectName' in display ? display.projectName : display.workPackageName,
            abbreviation: display.abbreviation,
            workItemName: display.workItemName,
            address: display.address,
            ...(display.stepName === undefined ? {} : { stepName: display.stepName }),
          },
        },
        successor: { ...dependency.successor, kind: 'internal' },
      };
    }
    return {
      id: dependency.id,
      type: dependency.type,
      predecessor: { ...predecessor, kind: 'internal' },
      successor: { ...dependency.successor, kind: 'internal' },
    };
  });
  return parseOrThrow(PlanTasks, {
    schemaVersion: 3,
    kind: 'plan-tasks',
    plan: planIdOf(document),
    steps: steps.map(({ id, code, name }) => ({ id, code, name })),
    tasks,
    typedDependencies,
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
export async function runPlanReference(
  request: NavigatorRequest<'plan-reference'>,
): Promise<string> {
  const exportPath = request.export;
  const requirementsPath = request.requirements;
  const exportBytes = await readRequiredBytes(exportPath, EXPORT_ROLE);
  const requirementsBytes = await readRequiredBytes(requirementsPath, REQUIREMENTS_ROLE);
  // Proof: removing this decode failed `refuses a missing, unreadable or malformed requirements
  // file` at its empty-file case (2026-10-11).
  decodeRequiredText(requirementsBytes, REQUIREMENTS_ROLE, requirementsPath);
  const decoded = await decodePlanExport(exportBytes, exportPath);
  const tasks = derivePlanTasks(decoded);
  const { document, wireVersion } = decoded;

  const planRef: PlanRef = {
    repository: request.repository,
    plan: planIdOf(document),
    change: request.change,
    planningCommit: request.planningCommit,
    sourceBaseCommit: request.sourceBase,
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
    { path: join(request.output, 'tasks.json'), text: prettyJson(tasks) },
    { path: join(request.output, 'plan-reference.json'), text: prettyJson(record) },
  ]);
  return record.referenceDigest;
}
