import { type } from 'arktype';

import { project } from './project-response';
import { requestSchema, responseSchema } from './schema-shape';
import { workItemTree } from './work-item-response';

/**
 * The plan document version this release writes.
 *
 * `3` carries each step's `code` (`address-step-nodes`); `2` added each step's
 * `allowancePercent` (`add-project-step-estimate-allowances`). Files of
 * versions 1 and 2 are read through the explicit conversions in
 * `classifyPlanDocument`: version 1 charges every step at 0%, and neither
 * earlier version's steps keep a code — each is suggested on import exactly as
 * for a newly created step. The typed-dependency changes
 * (`add-step-finish-start-dependencies`) take the next free number, 4.
 */
export const PLAN_DOCUMENT_VERSION = 3;

const planHeader = type({
  format: "'wbs-plan'",
  version: '3',
  exportedAt: 'string',
});

const planSettings = type({
  name: 'string',
  restricted: 'boolean',
  estimateMethod: "'pert' | 'optimistic' | 'realistic' | 'pessimistic'",
  depReach: "'whole-item' | 'anchor-slice'",
  pertWeights: { optimistic: 'number', realistic: 'number', pessimistic: 'number' },
  estimateRounding: "'exact' | 'floor' | 'round' | 'ceil'",
  startDate: 'string | null',
  // Non-empty, as a PATCH requires: a scoped import stores the link under
  // `project_solution`'s length checks.
  // Proof: accepting empty strings made `refuses an empty solution slug or url
  // as input, importing nothing` in
  // `import-export-organization.controller.db.test.ts` answer 500 instead of
  // 400; watched 2026-09-28.
  solutionRef: type({ slug: 'string > 0', url: 'string > 0' }).or('null'),
  optimizationEnabled: 'boolean',
  scheduleEngine: "'fast' | 'optimized'",
  scheduleObjective: "'pri' | 'time'",
});

const named = type({ id: 'string', name: 'string' });
const directory = type({
  teams: type({ id: 'string', name: 'string', serviceIds: 'string[]' }).array(),
  people: type({
    id: 'string',
    name: 'string',
    kind: "'person' | 'agent'",
    teamIds: 'string[]',
  }).array(),
  tags: named.array(),
  services: named.array(),
  types: named.array(),
  externalSystems: named.array(),
});

const authoredMarker = type({
  id: 'string',
  date: 'string',
  name: 'string',
  color: 'string | null',
});

/**
 * Version 3 keeps the complete established export, every authored value needed
 * to interpret its file-local references during a restore, step allowances and
 * step codes.
 *
 * A step's `code` is optional and nullable on the work-item read (an older
 * be-01, an uncoded step); here it is a required string, because the export
 * refuses an uncoded project rather than write a file without its codes.
 * `stepNodes` spells each leaf's step node beside the structured work-item and
 * step IDs the estimates, facts and assignments are keyed by — `010.dev` for
 * `sn1.<work item>.<step>` — for a reader of the file. It is derived, so import
 * drops it and the new project's nodes follow its own IDs.
 */
export const planDocument = workItemTree.and({
  steps: type({ code: 'string' }).array(),
  stepNodes: type({
    id: 'string',
    workItemId: 'string',
    stepId: 'string',
    reference: 'string',
  }).array(),
  project,
  document: planHeader,
  settings: planSettings,
  capacity: type({ teamId: 'string', size: 'number' }).array(),
  calendarMarkers: authoredMarker.array(),
  directory,
});

export type PlanDocument = (typeof planDocument)['infer'];

/** Additive responses remain readable by clients written for this version. */
export const planDocumentResponse = responseSchema(planDocument);

/** The classifier reads only the format/version header before version-specific content. */
export const planDocumentHeaderRequest = requestSchema(
  type({
    document: type({ format: "'wbs-plan'", version: 'number.integer', exportedAt: 'string' }),
  }),
  { undeclaredKeys: 'delete' },
);

const opaqueStepValues = type({ '[string]': 'unknown' });
const authoredWorkItem = type({
  id: 'string',
  parentId: 'string | null',
  position: 'number',
  name: 'string',
  notes: 'string',
  frozenNumber: 'string | null',
  startNoEarlierThan: 'string | null',
  startNoEarlierThanReason: 'string | null',
  deadline: 'string | null',
  factStart: 'string | null',
  factEnd: 'string | null',
  // Proof: loosening this to unknown made the mounted document boundary accept
  // "high" at workItems[3].priority with 204 instead of 400 invalid_body.
  priority: 'number | null',
  serviceTeamId: 'string | null',
  serviceId: 'string | null',
  maxParallel: 'number',
  teamIds: 'string[]',
  tagIds: 'string[]',
  serviceIds: 'string[]',
  typeIds: 'string[]',
  externalRefs: type({ id: 'string', systemId: 'string', url: 'string', name: 'string' }).array(),
  estimates: opaqueStepValues,
  actuals: opaqueStepValues,
  progress: opaqueStepValues,
  measures: opaqueStepValues,
  dependsOn: 'string[]',
  assignees: type({ '[string]': 'string' }),
});

/**
 * The archival request projection admits old additive/read-only fields and
 * returns only writable content. Step-value maps stay opaque until
 * hierarchy validation determines which rows are leaves.
 */
const writablePlanDocument = type({
  document: type({ format: "'wbs-plan'", version: 'number.integer', exportedAt: 'string' }),
  settings: planSettings,
  capacity: type({ teamId: 'string', size: 'number' }).array(),
  priorityBands: type({ startsAt: 'number', defaultValue: 'number', label: 'string' }).array(),
  calendarMarkers: authoredMarker.array(),
  directory,
  workItems: authoredWorkItem.array(),
  // Optional structurally because version 1 has no allowance and versions 1
  // and 2 carry no code the import keeps; the version decides what each field
  // must be — see `classifyPlanDocument`. `code` stays `unknown` here so an
  // earlier-version file is read exactly as before codes existed, whatever it
  // held under that key (a version-2 export writes the read's `code: null`).
  steps: type({
    id: 'string',
    name: 'string',
    position: 'number',
    'allowancePercent?': 'number',
    'code?': 'unknown',
  }).array(),
});

export const planDocumentRequest = requestSchema(writablePlanDocument, {
  undeclaredKeys: 'delete',
});

export type PlanDocumentRequest = (typeof writablePlanDocument)['infer'];

/**
 * A writable plan document once its version has been read: every step carries
 * the allowance it is imported with — the file's own from version 2, zero at
 * version 1 — and the code the file gives it from version 3, or `null` for an
 * earlier version, whose steps are coded by suggestion on import.
 */
export type PlanDocumentImport = Omit<PlanDocumentRequest, 'steps'> & {
  steps: (Omit<PlanDocumentRequest['steps'][number], 'allowancePercent' | 'code'> & {
    allowancePercent: number;
    code: string | null;
  })[];
};
