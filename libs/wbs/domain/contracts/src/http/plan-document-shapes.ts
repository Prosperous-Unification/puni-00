import { type } from 'arktype';

import { project } from './project-response';
import { requestSchema, responseSchema } from './schema-shape';
import { workItemTree } from './work-item-response';

/**
 * The plan document version this release writes.
 *
 * `2` carries each step's `allowancePercent` (`add-project-step-estimate-allowances`);
 * a version-1 file is read through the explicit legacy conversion in
 * `classifyPlanDocument`, which charges every step at 0%. The typed-dependency
 * changes (`add-step-finish-start-dependencies`) take the next free number.
 */
export const PLAN_DOCUMENT_VERSION = 2;

const planHeader = type({
  format: "'wbs-plan'",
  version: '2',
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
  solutionRef: type({ slug: 'string', url: 'string' }).or('null'),
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
 * Version 2 keeps the complete established export, every authored value needed
 * to interpret its file-local references during a restore, and step allowances.
 */
export const planDocument = workItemTree.and({
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
  // Optional structurally because version 1 has no such field; the version
  // decides whether it is required (2) or must be absent (1) — see
  // `classifyPlanDocument`.
  steps: type({
    id: 'string',
    name: 'string',
    position: 'number',
    'allowancePercent?': 'number',
  }).array(),
});

export const planDocumentRequest = requestSchema(writablePlanDocument, {
  undeclaredKeys: 'delete',
});

export type PlanDocumentRequest = (typeof writablePlanDocument)['infer'];

/**
 * A writable plan document once its version has been read: every step carries
 * the allowance it is imported with — the file's own at version 2, zero at
 * version 1.
 */
export type PlanDocumentImport = Omit<PlanDocumentRequest, 'steps'> & {
  steps: (Omit<PlanDocumentRequest['steps'][number], 'allowancePercent'> & {
    allowancePercent: number;
  })[];
};
