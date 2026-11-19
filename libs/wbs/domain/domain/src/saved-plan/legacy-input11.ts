import { type } from 'arktype';

import {
  readSavedDependencyHistory,
  type SavedConnectedDependencyHistory,
  type SavedDependencyHistory,
} from './dependency-history';
import { detachHistory, type Historical, requireHistory, SavedHistoryError } from './history-json';

/** Published input11 owns its exact schema; no current canonical type is its base. */
export type LegacyPlanInputV11 = Historical<
  Omit<(typeof input11)['infer'], 'dependencyHistory'> & {
    dependencyHistory: SavedDependencyHistory;
  }
>;
type LegacyStepParallel11 = LegacyPlanInputV11['stepParallels'][number];

const nullableString = 'string | null';
const nullableNumber = 'number | null';
const named = type({ '+': 'reject', id: 'string', name: 'string' });
const endpoint = type({ '+': 'reject', scope: "'whole'", workItemId: 'string' }).or({
  '+': 'reject',
  scope: "'node' | 'descendant-step'",
  workItemId: 'string',
  stepId: 'string',
});
const fields = {
  workPackage: type({
    '+': 'reject',
    id: 'string',
    name: 'string',
    restricted: 'boolean',
    ownerId: nullableString,
    solutionSlug: nullableString,
    solutionUrl: nullableString,
    estimateMethod: "'pert' | 'optimistic' | 'realistic' | 'pessimistic'",
    depReach: "'whole-item' | 'anchor-slice'",
    estimateRounding: "'exact' | 'ceil' | 'round' | 'floor'",
    startDate: nullableString,
    pertWeightOptimistic: 'number',
    pertWeightRealistic: 'number',
    pertWeightPessimistic: 'number',
    timezone: 'string',
    budgetFactor: 'number',
  }),
  workItems: type({
    '+': 'reject',
    id: 'string',
    parentId: nullableString,
    position: 'number',
    name: 'string',
    notes: 'string',
    typeIds: 'string[]',
    tagIds: 'string[]',
    externalRefs: type({
      '+': 'reject',
      externalSystemId: 'string',
      url: 'string',
      position: 'number',
    }).array(),
    priority: nullableNumber,
    maxParallel: 'number',
    frozenNumber: nullableString,
    serviceTeamId: nullableString,
    serviceId: nullableString,
    startNoEarlierThan: nullableString,
    startNoEarlierThanReason: nullableString,
    readiness: "'draft' | 'ready' | null",
    hold: "'on_hold' | 'blocked' | null",
  }).array(),
  steps: type({
    '+': 'reject',
    id: 'string',
    code: nullableString,
    name: 'string',
    position: 'number',
    allowancePercent: 'number',
    estimateUnit: "'workdays' | 'minutes'",
  }).array(),
  stepValues: type({
    '+': 'reject',
    workItemId: 'string',
    stepId: 'string',
    optimistic: nullableNumber,
    realistic: nullableNumber,
    pessimistic: nullableNumber,
    derived: nullableNumber,
    actual: nullableNumber,
    progress: "'in_progress' | 'done' | null",
  }).array(),
  stepBlockages: type({
    '+': 'reject',
    workItemId: 'string',
    stepId: 'string',
    blockedAt: 'number',
  }).array(),
  stepParallels: type({
    '+': 'reject',
    workItemId: 'string',
    stepId: 'string',
    maxParallel: 'number',
  }).array(),
  measures: type({
    '+': 'reject',
    workItemId: 'string',
    stepId: 'string',
    metric: 'string',
    value: nullableNumber,
    currency: nullableString,
    rateCardDigest: nullableString,
  }).array(),
  measureEstimates: type({
    '+': 'reject',
    workItemId: 'string',
    stepId: 'string',
    key: 'string',
    optimistic: 'number',
    realistic: 'number',
    pessimistic: 'number',
    currency: nullableString,
    rateCardDigest: nullableString,
  }).array(),
  budgets: type({
    '+': 'reject',
    workItemId: 'string',
    key: 'string',
    cap: 'number',
    policy: "'strict' | 'advisory'",
    holdPerAttempt: nullableNumber,
  }).array(),
  dependencies: type({ '+': 'reject', predecessorId: 'string', successorId: 'string' }).array(),
  typedDependencies: type({
    '+': 'reject',
    id: 'string',
    predecessor: endpoint,
    successor: endpoint,
    type: "'FS' | 'SS' | 'FF'",
  }).array(),
  assignments: type({
    '+': 'reject',
    workItemId: 'string',
    stepId: 'string',
    personId: 'string',
  }).array(),
  people: named.array(),
  teams: named.array(),
  services: named.array(),
  personTeams: type({ '+': 'reject', personId: 'string', teamId: 'string' }).array(),
  teamServices: type({ '+': 'reject', teamId: 'string', serviceId: 'string' }).array(),
  workItemTeams: type({ '+': 'reject', workItemId: 'string', teamId: 'string' }).array(),
  workItemServices: type({ '+': 'reject', workItemId: 'string', serviceId: 'string' }).array(),
  priorityBands: type({
    '+': 'reject',
    startsAt: 'number',
    label: 'string',
    defaultValue: 'number',
  }).array(),
  capacity: type({ '+': 'reject', teamId: 'string', people: 'number' }).array(),
  tags: named.array(),
  workItemTypes: named.array(),
  externalSystems: named.array(),
} as const;
const input11 = type({
  '+': 'reject',
  schemaVersion: '11',
  ...fields,
  dependencyHistory: 'unknown',
});

/**
 * Checks input11 figures independently of live definitions and future write policy.
 * Its published factor range is (0, 1000]; priced figures carry both basis fields.
 * @throws SavedHistoryError for invalid factors, values, trio order or paired bases.
 */
function assertMeasureFields(input: Omit<LegacyPlanInputV11, 'dependencyHistory'>): void {
  // Proof: omission admitted both invalid-factor integrity cases (2026-10-24).
  requireHistory(
    Number.isFinite(input.workPackage.budgetFactor) &&
      input.workPackage.budgetFactor > 0 &&
      input.workPackage.budgetFactor <= 1000,
    'budget_factor',
    '$.workPackage.budgetFactor',
  );
  // Proof: omission admitted the negative-fact integrity case (2026-10-24).
  requireHistory(
    input.measures.every(({ value }) => value === null || (Number.isFinite(value) && value >= 0)),
    'measure_values',
    '$.measures',
  );
  // Proof: omission admitted negative and reversed-trio integrity cases (2026-10-24).
  requireHistory(
    input.measureEstimates.every(
      ({ optimistic, realistic, pessimistic }) =>
        [optimistic, realistic, pessimistic].every(Number.isFinite) &&
        optimistic >= 0 &&
        optimistic <= realistic &&
        realistic <= pessimistic,
    ),
    'measure_values',
    '$.measureEstimates',
  );
  // Proof: omission admitted both half-basis integrity cases (2026-10-24).
  for (const [field, figures] of [
    ['measures', input.measures],
    ['measureEstimates', input.measureEstimates],
  ] as const)
    requireHistory(
      figures.every(
        ({ currency, rateCardDigest }) =>
          (currency === null && rateCardDigest === null) ||
          (currency !== null &&
            currency.length > 0 &&
            rateCardDigest !== null &&
            rateCardDigest.length > 0),
      ),
      'measure_basis',
      `$.${field}`,
    );
  // Proof: omission admitted negative-cap and negative-hold integrity cases (2026-10-24).
  requireHistory(
    input.budgets.every(
      ({ cap, holdPerAttempt }) =>
        Number.isFinite(cap) &&
        cap >= 0 &&
        (holdPerAttempt === null || (Number.isFinite(holdPerAttempt) && holdPerAttempt >= 0)),
    ),
    'budget_values',
    '$.budgets',
  );
}

/**
 * Links target input identities and owned facts to the same captured component.
 * Exact membership preserves branches and unused steps as well as scheduled leaves.
 * Shared names, calendars, step codes/positions and holds must describe the same capture.
 * The history decoder has already verified component ownership and target presence.
 */
function assertConnectedTargetInput(
  input: Omit<LegacyPlanInputV11, 'dependencyHistory'>,
  history: SavedConnectedDependencyHistory,
): void {
  const workPackages = history.workPackages.filter(
    (workPackage) => workPackage.workPackageId === history.targetWorkPackageId,
  );
  const targetWorkItems = workPackages.flatMap((workPackage) => workPackage.workItems);
  const targetSteps = workPackages.flatMap((workPackage) => workPackage.steps);
  const workItems = new Map(input.workItems.map((row) => [row.id, row]));
  const steps = new Set(input.steps.map((step) => step.id));
  // Proof: omitting this guard returned 200 for mounted identity, parent, missing,
  // extra and duplicate target rows (omit-work-membership.log.txt).
  requireHistory(
    input.workItems.length === targetWorkItems.length &&
      targetWorkItems.every((row) => workItems.get(row.id)?.parentId === row.parentId),
    'target_work_items',
    '$.workItems',
  );
  // Proof: omission returned 200 for mounted foreign, missing, extra and duplicate
  // target steps (omit-step-membership.log.txt).
  requireHistory(
    input.steps.length === targetSteps.length && targetSteps.every((step) => steps.has(step.id)),
    'target_steps',
    '$.steps',
  );
  const target = workPackages.at(0);
  // Proof: independently omitting work package, row or step metadata equality returned 200 in mounted read/compare negatives (2026-10-22).
  requireHistory(
    input.workPackage.name === target?.name &&
      input.workPackage.startDate === target.startDate &&
      input.workPackage.timezone === target.timezone,
    'target_metadata',
    '$.workPackage',
  );
  requireHistory(
    targetWorkItems.every((row) => {
      const local = workItems.get(row.id);
      return local?.name === row.name && local.hold === row.hold;
    }),
    'target_metadata',
    '$.workItems',
  );
  requireHistory(
    targetSteps.every((step) => {
      const local = input.steps.find((entry) => entry.id === step.id);
      return (
        local?.name === step.name && local.code === step.code && local.position === step.position
      );
    }),
    'target_metadata',
    '$.steps',
  );
  // Proof: omission accepted foreign row/step owners in mounted value, measure
  // and assignment reads (omit-step-fact-owners.log.txt).
  for (const [name, facts] of [
    ['stepValues', input.stepValues],
    ['measures', input.measures],
    // Proof: omission accepted the foreign component trio in saved-body integrity (2026-10-24).
    ['measureEstimates', input.measureEstimates],
    ['assignments', input.assignments],
  ] as const)
    requireHistory(
      facts.every((fact) => workItems.has(fact.workItemId) && steps.has(fact.stepId)),
      'target_facts',
      `$.${name}`,
    );
  // Proof: omission accepted mounted foreign team/service row owners
  // (omit-row-fact-owners.log.txt).
  for (const [name, facts] of [
    // Proof: omission accepted the foreign component budget in saved-body integrity (2026-10-24).
    ['budgets', input.budgets],
    ['workItemTeams', input.workItemTeams],
    ['workItemServices', input.workItemServices],
  ] as const)
    requireHistory(
      facts.every((fact) => workItems.has(fact.workItemId)),
      'target_facts',
      `$.${name}`,
    );
  // Proof: omission accepted mounted foreign legacy/typed relationship owners
  // (omit-dependency-owners.log.txt).
  requireHistory(
    input.dependencies.every(
      (dependency) =>
        workItems.has(dependency.predecessorId) && workItems.has(dependency.successorId),
    ),
    'target_dependencies',
    '$.dependencies',
  );
  // Proof: omission accepted the mounted foreign typed endpoint step
  // (omit-dependency-owners.log.txt).
  requireHistory(
    input.typedDependencies.every((dependency) =>
      [dependency.predecessor, dependency.successor].every(
        (endpoint) =>
          workItems.has(endpoint.workItemId) &&
          (endpoint.scope === 'whole' || steps.has(endpoint.stepId)),
      ),
    ),
    'target_dependencies',
    '$.typedDependencies',
  );
}

/** Rejects corrupt persisted parallelism without coercion, rounding or a default. */
function assertStepParallel(maxParallel: number): void {
  // Proof: integer, lower and upper predicates removed independently; real memory-source
  // invalid-value negatives failed (evidence/domain-{integer,lower,upper}.txt), 2026-10-15.
  if (!Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > 1000)
    throw new Error('step parallelism must be an integer from 1 to 1000');
}

/** Validates direct blockage at capture and stored-body boundaries without repairing trusted state. */
function assertStepBlockages(body: unknown): void {
  // Proof: collection guard removed; missing/malformed current facts negatives failed (step-blockages.test.ts); watched 2026-10-14.
  if (
    typeof body !== 'object' ||
    body === null ||
    !('stepBlockages' in body) ||
    !Array.isArray(body.stepBlockages)
  )
    throw new Error('step blockage collection is missing or malformed');
  // Proof: reference-list guard removed; malformed owner-list stored read failed (step-blockages.test.ts); watched 2026-10-14.
  if (
    !('workItems' in body) ||
    !Array.isArray(body.workItems) ||
    !('steps' in body) ||
    !Array.isArray(body.steps)
  )
    throw new Error('step blockage references have no owner or step collection');
  const owners = new Set<string>();
  const parents = new Set<string>();
  const steps = new Set<string>();
  const ownerRows: readonly unknown[] = body.workItems;
  for (const owner of ownerRows) {
    // Proof: owner-shape guard removed; malformed owner-row stored read failed (step-blockages.test.ts); watched 2026-10-14.
    if (
      typeof owner !== 'object' ||
      owner === null ||
      !('id' in owner) ||
      typeof owner.id !== 'string'
    )
      throw new Error('step blockage owner collection is malformed');
    owners.add(owner.id);
    if ('parentId' in owner && typeof owner.parentId === 'string') parents.add(owner.parentId);
  }
  const stepRows: readonly unknown[] = body.steps;
  for (const step of stepRows) {
    // Proof: step-shape guard removed; malformed step-row stored read failed (step-blockages.test.ts); watched 2026-10-14.
    if (typeof step !== 'object' || step === null || !('id' in step) || typeof step.id !== 'string')
      throw new Error('step blockage step collection is malformed');
    steps.add(step.id);
  }
  const pairs = new Set<string>();
  const facts: readonly unknown[] = body.stepBlockages;
  for (const fact of facts) {
    // Proof: fact-shape/time guard removed; fractional-time capture/read negatives failed (step-blockages.test.ts); watched 2026-10-14.
    if (
      typeof fact !== 'object' ||
      fact === null ||
      !('workItemId' in fact) ||
      typeof fact.workItemId !== 'string' ||
      !('stepId' in fact) ||
      typeof fact.stepId !== 'string' ||
      !('blockedAt' in fact) ||
      typeof fact.blockedAt !== 'number' ||
      !Number.isSafeInteger(fact.blockedAt)
    )
      throw new Error('step blockage fact is malformed');
    // Proof: owner guard removed; unknown-owner capture/read negatives failed (step-blockages.test.ts); watched 2026-10-14.
    if (!owners.has(fact.workItemId)) throw new Error('step blockage owner is unknown');
    // Proof: leaf guard removed; parent-owner capture/read negatives failed (step-blockages.test.ts); watched 2026-10-14.
    if (parents.has(fact.workItemId)) throw new Error('step blockage owner is not a leaf');
    // Proof: step guard removed; unknown-step capture/read negatives failed (step-blockages.test.ts); watched 2026-10-14.
    if (!steps.has(fact.stepId)) throw new Error('step blockage step is unknown');
    const pair = JSON.stringify([fact.workItemId, fact.stepId]);
    // Proof: pair guard removed; duplicate capture/read negatives failed (step-blockages.test.ts); watched 2026-10-14.
    if (pairs.has(pair)) throw new Error('step blockage pair is duplicated');
    pairs.add(pair);
  }
}

/**
 * Validates sparse authored maxima at capture and stored-body boundaries.
 * Throws for malformed collections, references, pairs or maxima; copies each
 * fact with a single read of its fields so validation and canonical bytes agree.
 * Empty collections need no references and never change another fact family's
 * historical failure contract.
 */
function readStepParallels(body: unknown): LegacyStepParallel11[] {
  // Proof: collection guard removed; missing capture facts negative failed (collection.txt), 2026-10-17.
  if (
    typeof body !== 'object' ||
    body === null ||
    !('stepParallels' in body) ||
    !Array.isArray(body.stepParallels)
  )
    throw new Error('step parallelism collection is missing or malformed');
  const supplied: readonly unknown[] = body.stepParallels;
  if (supplied.length === 0) return [];
  // Proof: reference-list guard removed; malformed owner-list negative failed (reference-lists.txt).
  if (
    !('workItems' in body) ||
    !Array.isArray(body.workItems) ||
    !('steps' in body) ||
    !Array.isArray(body.steps)
  )
    throw new Error('step parallelism references have no owner or step collection');
  const owners = new Set<string>();
  const parents = new Set<string>();
  const steps = new Set<string>();
  const ownerRows: readonly unknown[] = body.workItems;
  for (const owner of ownerRows) {
    // Proof: owner-shape guard removed; malformed owner-row negative failed (owner-shape.txt).
    if (
      typeof owner !== 'object' ||
      owner === null ||
      !('id' in owner) ||
      typeof owner.id !== 'string'
    )
      throw new Error('step parallelism owner collection is malformed');
    owners.add(owner.id);
    if ('parentId' in owner && typeof owner.parentId === 'string') parents.add(owner.parentId);
  }
  const stepRows: readonly unknown[] = body.steps;
  for (const step of stepRows) {
    // Proof: step-shape guard removed; malformed step-row negative failed (step-shape.txt).
    if (typeof step !== 'object' || step === null || !('id' in step) || typeof step.id !== 'string')
      throw new Error('step parallelism step collection is malformed');
    steps.add(step.id);
  }
  const pairs = new Set<string>();
  const facts: LegacyStepParallel11[] = [];
  for (const fact of supplied) {
    // Proof: object guard removed; null-fact capture negative failed (fact-object.txt).
    if (typeof fact !== 'object' || fact === null)
      throw new Error('step parallelism fact is malformed');
    const workItemId = 'workItemId' in fact ? fact.workItemId : undefined;
    const stepId = 'stepId' in fact ? fact.stepId : undefined;
    const maxParallel = 'maxParallel' in fact ? fact.maxParallel : undefined;
    // Proof: value-shape guard removed; string-maximum capture negative failed (fact-values.txt).
    if (
      typeof workItemId !== 'string' ||
      typeof stepId !== 'string' ||
      typeof maxParallel !== 'number'
    )
      throw new Error('step parallelism fact is malformed');
    // Proof: range call removed; oversized-maximum capture negative failed (range.txt).
    assertStepParallel(maxParallel);
    // Proof: owner guard removed; unknown-owner capture negative failed (owner.txt).
    if (!owners.has(workItemId)) throw new Error('step parallelism owner is unknown');
    // Proof: leaf guard removed; parent-owner capture negative failed (leaf.txt).
    if (parents.has(workItemId)) throw new Error('step parallelism owner is not a leaf');
    // Proof: step guard removed; unknown-step capture negative failed (step.txt).
    if (!steps.has(stepId)) throw new Error('step parallelism step is unknown');
    const pair = JSON.stringify([workItemId, stepId]);
    // Proof: uniqueness guard removed; duplicate capture negative failed (duplicate.txt).
    if (pairs.has(pair)) throw new Error('step parallelism pair is duplicated');
    pairs.add(pair);
    // Proof: rereading the accessor emitted 1001 after validating 2; single-read regression failed (accessor-reread.txt).
    facts.push({ workItemId, stepId, maxParallel });
  }
  return facts;
}

/** Decode exactly published input11 without changing original stored bytes or consulting live plan facts. */
export function readLegacySavedPlanInput11(body: unknown): LegacyPlanInputV11 {
  const parsed = input11(body);
  if (parsed instanceof type.errors) throw new SavedHistoryError('shape', '$', { cause: parsed });
  assertMeasureFields(parsed);
  try {
    assertStepBlockages(parsed);
    readStepParallels(parsed);
  } catch (cause) {
    throw new SavedHistoryError('local_facts', '$', { cause });
  }
  const dependencyHistory = readSavedDependencyHistory(parsed.dependencyHistory);
  if (dependencyHistory.kind === 'connected') {
    requireHistory(
      dependencyHistory.targetWorkPackageId === parsed.workPackage.id,
      'target',
      '$.dependencyHistory.targetWorkPackageId',
    );
    assertConnectedTargetInput(parsed, dependencyHistory);
  }
  // Boundary: the complete input11 schema validates the projected current fields and current dependency decoder.
  return detachHistory({ ...parsed, dependencyHistory });
}
