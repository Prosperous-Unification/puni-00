import { join } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';
import {
  compilePlanReferenceFromDocument,
  decodeOrdinaryPlanDocument,
  type PlanDocumentV11,
  planDocumentV11,
  validateBlockageFacts,
} from '@wbs/contracts';

import type { NavigatorRequest } from './cli-parser';
import {
  createExclusiveFiles,
  decodeRequiredText,
  parseRequiredJson,
  readRequiredBytes,
} from './required-file';

/** Explicit supported wire versions; a future WBS bump requires contract review here. */
const NAVIGATOR_PLAN_DOCUMENT_VERSIONS = [7, 8, 9, 10, 11] as const;

const EXPORT_ROLE = 'plan export';
const REQUIREMENTS_ROLE = 'requirements file';

/** What version 11 adds beside the factor (`wbs-measure-budgets` D63); older files carry none. */
const MEASURE_KEYS = ['measureDefinitions', 'measureFacts', 'measureEstimates', 'budgets'] as const;

/** The settings of a file before version 11: no budget factor, which reads as 1. */
const settingsBeforeVersion11 = planDocumentV11.get('settings').omit('budgetFactor');
// Proof: omitting this historical metadata restriction admitted project factors
// through the real v7 and v10 plan-reference entry points (2026-10-24).
const projectBeforeVersion11 = planDocumentV11.get('project').omit('budgetFactor');

const PlanDocumentHeader = type({
  document: { format: "'wbs-plan'", version: 'number.integer' },
});
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

interface DecodedPlanExport {
  document: PlanDocumentV11;
  wireVersion: NavigatorPlanDocumentVersion;
}

type NavigatorPlanDocumentVersion = (typeof NAVIGATOR_PLAN_DOCUMENT_VERSIONS)[number];

/** The resource facts a document before version 10 carries: none. */
function noResourceFacts(): Pick<PlanDocumentV11, 'resourceCapacities' | 'demands'> {
  return { resourceCapacities: [], demands: [] };
}

/** The measures a document before version 11 carries: none (`wbs-measure-budgets` D63). */
function noMeasures(): Pick<PlanDocumentV11, (typeof MEASURE_KEYS)[number]> {
  return { measureDefinitions: [], measureFacts: [], measureEstimates: [], budgets: [] };
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
      return { document: decodeOrdinaryPlanDocument(parsed), wireVersion: 11 };
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
  const { document, wireVersion } = decodePlanExport(exportBytes, exportPath);
  const { reference, tasks } = compilePlanReferenceFromDocument(document, wireVersion, {
    exportBytes,
    requirementsBytes,
    repository: request.repository,
    change: request.change,
    planningCommit: request.planningCommit,
    sourceBaseCommit: request.sourceBase,
  });

  await createExclusiveFiles([
    { path: join(request.output, 'tasks.json'), text: prettyJson(tasks) },
    { path: join(request.output, 'plan-reference.json'), text: prettyJson(reference) },
  ]);
  return reference.referenceDigest;
}
