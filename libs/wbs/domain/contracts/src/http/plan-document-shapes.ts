import { type } from 'arktype';

import { project } from './project-response';
import { requestSchema, responseSchema } from './schema-shape';
import { moneyBasis, numberedWorkItem, workItemTree } from './work-item-response';

/**
 * The newest plan document version this release writes.
 *
 * `11` carries the project's measures (`wbs-measure-budgets` D8, design D63):
 * the definitions its facts, estimates and budgets name, those three, and the
 * budget factor. The export writes it only when the plan holds one of them or
 * a factor other than 1, and {@link LEGACY_PLAN_DOCUMENT_VERSION} otherwise.
 * `10` carries resources, their per-project capacities and per-work-item demands
 * (`wbs-resources`). `9` carries direct step blockage facts separately from rows. `8` carries each step’s estimate unit. `7` carries the project's timezone and each leaf's attempts by step code
 * (`step-node-attempts` D5); `6` each leaf's readiness and hold
 * (`add-work-item-statuses`); `5`
 * extends typed dependencies to SS/FF; `4` added FS separately from
 * legacy `dependsOn`; `3` added step codes and `2` step allowances. The
 * classifier converts earlier versions explicitly.
 */
export const PLAN_DOCUMENT_VERSION = 11;

/**
 * The version the export writes for a plan with nothing version 11 adds, byte
 * for byte what the release before measures wrote, so the outgoing release,
 * Twilight Navigator and every saved file read it as before (design D63).
 */
export const LEGACY_PLAN_DOCUMENT_VERSION = 10;

const planHeader = type({
  format: "'wbs-plan'",
  version: '10 | 11',
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
  /** The IANA zone the project reads instants as days in; `UTC` before version 7. */
  timezone: 'string',
  /** What a derived budget multiplies the pessimistic point by; version 11 only (design D63). */
  'budgetFactor?': 'number',
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

/** A resource as the document writes it (`wbs-resources`): file-local id, name, kind, unit. */
export const documentResource = type({
  id: 'string',
  name: 'string',
  kind: "'exclusive' | 'divisible'",
  unitLabel: 'string',
});
export type DocumentResource = (typeof documentResource)['infer'];

/** One stated resource capacity of the exported project, by file-local resource id. */
export const documentResourceCapacity = type({ resourceId: 'string', units: 'number' });
export type DocumentResourceCapacity = (typeof documentResourceCapacity)['infer'];

/** One work item's demand on one resource, both by file-local id. */
export const documentDemand = type({ workItemId: 'string', resourceId: 'string', units: 'number' });
export type DocumentDemand = (typeof documentDemand)['infer'];

/**
 * A measure definition as version 11 writes it (`wbs-measure-budgets` D1,
 * design D63): every field but the organization's id, so an import elsewhere
 * can match it by key or create it.
 */
export const documentMeasureDefinition = type({
  key: 'string',
  name: 'string',
  unit: 'string',
  kind: "'duration' | 'count' | 'money'",
  scale: "'integer' | 'real'",
  threePoint: 'boolean',
  showByDefault: 'boolean',
  schedulesWork: 'boolean',
  derived: 'boolean',
  order: 'number',
  currency: 'string | null',
});
export type DocumentMeasureDefinition = (typeof documentMeasureDefinition)['infer'];

/**
 * One fact in a defined measure, by file-local work item and step and by
 * definition key, with the basis a money figure was priced under (null when
 * none was recorded). Facts in `tokens` and `hours` stay in the row's legacy
 * `measures` (design D18).
 */
export const documentMeasureFact = type({
  workItemId: 'string',
  stepId: 'string',
  measure: 'string',
  value: 'number',
  basis: moneyBasis.or('null'),
});
export type DocumentMeasureFact = (typeof documentMeasureFact)['infer'];

/**
 * One three-point estimate in a measure other than time. A single-point
 * tokens trio is the row's legacy `token_estimate` and is not repeated here
 * (design D28).
 */
export const documentMeasureEstimate = type({
  workItemId: 'string',
  stepId: 'string',
  measure: 'string',
  optimistic: 'number',
  realistic: 'number',
  pessimistic: 'number',
  basis: moneyBasis.or('null'),
});
export type DocumentMeasureEstimate = (typeof documentMeasureEstimate)['infer'];

/** One stated budget; derived budgets are computed again after import (design D38). */
export const documentBudget = type({
  workItemId: 'string',
  measure: 'string',
  cap: 'number',
  policy: "'strict' | 'advisory'",
  holdPerAttempt: 'number | null',
});
export type DocumentBudget = (typeof documentBudget)['infer'];

const authoredMarker = type({
  id: 'string',
  date: 'string',
  name: 'string',
  color: 'string | null',
});

const documentEndpoint = type({ scope: "'whole'", workItem: 'string' })
  .or({ scope: "'node'", workItem: 'string', step: 'string' })
  .or({ scope: "'descendant-step'", workItem: 'string', step: 'string' });

export const documentTypedDependency = type({
  id: 'string',
  predecessor: documentEndpoint,
  successor: documentEndpoint,
  // Proof: making type optional let the mounted v5 import accept a missing
  // type with HTTP 204 instead of refusing it with 400 (2026-09-28).
  type: "'FS' | 'SS' | 'FF'",
});
export const documentTypedDependencyRequest = requestSchema(documentTypedDependency);
export type DocumentTypedDependency = (typeof documentTypedDependency)['infer'];

/** Version 4's converter accepts only the relationship type that release wrote. */
export const documentV4TypedDependencyRequest = requestSchema(
  documentTypedDependency.and({ type: "'FS'" }),
);

/**
 * Version 5 keeps the established export and carries all typed relationships with
 * file-local work-item and step references, distinct from legacy links.
 *
 * A step's `code` is optional and nullable on the work-item read (an older
 * be-01, an uncoded step); here it is a required string, because the export
 * refuses an uncoded project rather than write a file without its codes.
 * `stepNodes` spells each leaf's step node beside the structured work-item and
 * step IDs the estimates, facts and assignments are keyed by — `010.s1-dev` for
 * `sn1.<work item>.<step>` — for a reader of the file. It is derived, so import
 * drops it and the new project's nodes follow its own IDs.
 */
/**
 * One attempt as the document writes it (`step-node-attempts` D5): instants as
 * ISO-8601 UTC strings for a reader of the file, the executor by the name the
 * file's directory gives that person, end and outcome null while it runs.
 */
export const documentAttempt = type({
  number: 'number',
  startedAt: 'string',
  endedAt: 'string | null',
  // Proof: widened to 'string | null', the unknown-outcome case of `refuses an
  // unknown zone, an unknown outcome, …` (`step-node-attempt.controller.db`)
  // answered 500 (`CHECK constraint failed: step_node_attempt_outcome`)
  // instead of 400; watched 2026-10-12.
  outcome: "'succeeded' | 'failed' | 'cancelled' | null",
  executor: 'string | null',
  reference: 'string | null',
  note: 'string | null',
});
export type DocumentAttempt = (typeof documentAttempt)['infer'];

/**
 * A work item as the document writes it: the read's row without its derived
 * spans, and with its attempts keyed by step code rather than step id —
 * present only on a leaf that holds any.
 */
const documentWorkItem = numberedWorkItem
  .omit(
    'attempts',
    'spans',
    'span',
    'blockages',
    'blockageCauses',
    'nodeResources',
    'measureEstimates',
    'budgets',
    'mixedRateCards',
    'moneyBases',
  )
  .and({ 'attempts?': type({ '[string]': documentAttempt.array() }) });

export const planDocument = workItemTree.omit('typedDependencies', 'workItems').and({
  workItems: documentWorkItem.array(),
  stepBlockages: type({
    workItemId: 'string',
    stepId: 'string',
    blockedAt: 'number.integer',
  }).array(),
  typedDependencies: documentTypedDependency.array(),
  steps: type({ code: 'string', estimateUnit: "'workdays' | 'minutes'" }).array(),
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
  resourceCapacities: documentResourceCapacity.array(),
  demands: documentDemand.array(),
  calendarMarkers: authoredMarker.array(),
  directory: directory.and({ resources: documentResource.array() }),
  // Version 11 only, all four together (design D63).
  'measureDefinitions?': documentMeasureDefinition.array(),
  'measureFacts?': documentMeasureFact.array(),
  'measureEstimates?': documentMeasureEstimate.array(),
  'budgets?': documentBudget.array(),
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
  // Opaque until the version is read: versions 1–5 carry neither, and version
  // 6 must state both — see `classifyPlanDocument`.
  'readiness?': 'unknown',
  'hold?': 'unknown',
  // Opaque until the version is read: version 7 keys a leaf's attempts by
  // step code, and earlier versions carry none — see `classifyPlanDocument`.
  'attempts?': 'unknown',
  'blockages?': 'unknown',
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
  // The zone stays opaque until the version is read: version 7 must name a
  // supported zone, and earlier versions read as `UTC`.
  // The factor likewise: version 11 must state one, and earlier versions read as 1.
  settings: planSettings
    .omit('timezone', 'budgetFactor')
    .and({ 'timezone?': 'unknown', 'budgetFactor?': 'unknown' }),
  capacity: type({ teamId: 'string', size: 'number' }).array(),
  priorityBands: type({ startsAt: 'number', defaultValue: 'number', label: 'string' }).array(),
  calendarMarkers: authoredMarker.array(),
  // Opaque until the version is read: version 10 must state resources, their
  // capacities and demands, and earlier versions carry none — see `classifyPlanDocument`.
  directory: directory.and({ 'resources?': 'unknown' }),
  'resourceCapacities?': 'unknown',
  'demands?': 'unknown',
  // Opaque until the version is read: version 11 must state all four, and
  // earlier versions carry none (`wbs-measure-budgets` design D63).
  'measureDefinitions?': 'unknown',
  'measureFacts?': 'unknown',
  'measureEstimates?': 'unknown',
  'budgets?': 'unknown',
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
    'estimateUnit?': 'unknown',
    'code?': 'unknown',
  }).array(),
  'typedDependencies?': 'unknown',
  'stepBlockages?': 'unknown',
});

export const planDocumentRequest = requestSchema(writablePlanDocument, {
  undeclaredKeys: 'delete',
});

export type PlanDocumentRequest = (typeof writablePlanDocument)['infer'];

/**
 * A writable plan document once its version has been read: every step carries
 * the allowance it is imported with — the file's own from version 2, zero at
 * version 1 — and the code the file gives it from version 3, or `null` for an
 * earlier version. Versions 1–3 carry an empty typed set after conversion;
 * version 4 converts its FS-only typed set explicitly.
 */
export type PlanDocumentImport = Omit<
  PlanDocumentRequest,
  | 'settings'
  | 'steps'
  | 'typedDependencies'
  | 'workItems'
  | 'stepBlockages'
  | 'directory'
  | 'resourceCapacities'
  | 'demands'
  | 'measureDefinitions'
  | 'measureFacts'
  | 'measureEstimates'
  | 'budgets'
> & {
  /** The measures version 11 states (design D63), none before. */
  measureDefinitions: DocumentMeasureDefinition[];
  measureFacts: DocumentMeasureFact[];
  measureEstimates: DocumentMeasureEstimate[];
  budgets: DocumentBudget[];
  /** The file's directory, its resources as version 10 states them and none before. */
  directory: Omit<PlanDocumentRequest['directory'], 'resources'> & {
    resources: DocumentResource[];
  };
  resourceCapacities: DocumentResourceCapacity[];
  demands: DocumentDemand[];
  /**
   * The zone as version 7 names it, `UTC` for an earlier version; the budget
   * factor as version 11 states it, 1 for an earlier one.
   */
  settings: Omit<PlanDocumentRequest['settings'], 'timezone' | 'budgetFactor'> & {
    timezone: string;
    budgetFactor: number;
  };
  typedDependencies: DocumentTypedDependency[];
  stepBlockages: { workItemId: string; stepId: string; blockedAt: number }[];
  /**
   * Readiness and hold as the file states them from version 6, null before;
   * the attempts version 7 gives a leaf, none before.
   */
  workItems: (Omit<
    PlanDocumentRequest['workItems'][number],
    'readiness' | 'hold' | 'attempts' | 'blockages'
  > & {
    readiness: 'draft' | 'ready' | null;
    hold: 'on_hold' | 'blocked' | null;
    attempts: ImportedAttempt[];
  })[];
  steps: (Omit<
    PlanDocumentRequest['steps'][number],
    'allowancePercent' | 'code' | 'estimateUnit'
  > & {
    estimateUnit: 'workdays' | 'minutes';
    allowancePercent: number;
    code: string | null;
  })[];
};

/**
 * One attempt a version-7 file gives a leaf, once checked: at the file's step
 * id the code named, instants in epoch milliseconds, the executor still by
 * the directory name the file gave (`prepareImport` resolves it).
 */
export interface ImportedAttempt {
  stepId: string;
  attemptNumber: number;
  startedAt: number;
  endedAt: number | null;
  outcome: 'succeeded' | 'failed' | 'cancelled' | null;
  executor: string | null;
  reference: string | null;
  note: string | null;
}
