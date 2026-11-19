import { type } from 'arktype';

import { assertStepBlockages, readStepParallels } from './canonical-plan-input';
import {
  readSavedDependencyHistory,
  type SavedConnectedDependencyHistory,
  type SavedDependencyHistory,
} from './dependency-history';
import { detachHistory, type Historical, requireHistory, SavedHistoryError } from './history-json';
export type CanonicalPlanInputV12 = Historical<
  Omit<ReturnType<typeof createInput12>['infer'], 'dependencyHistory'> & {
    dependencyHistory: SavedDependencyHistory;
  }
>;
/** Builds the strict current grammar only when a stored12 body is actually read. */
function createInput12() {
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
      projectId: 'string > 0',
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
  return type({
    '+': 'reject',
    schemaVersion: '12',
    ...fields,
    dependencyHistory: 'unknown',
  });
}
let compiledInput12: ReturnType<typeof createInput12> | undefined;
function assertMeasureFields(input: Omit<CanonicalPlanInputV12, 'dependencyHistory'>): void {
  requireHistory(
    Number.isFinite(input.workPackage.budgetFactor) &&
      input.workPackage.budgetFactor > 0 &&
      input.workPackage.budgetFactor <= 1000,
    'budget_factor',
    '$.workPackage.budgetFactor',
  );
  requireHistory(
    input.measures.every(({ value }) => value === null || (Number.isFinite(value) && value >= 0)),
    'measure_values',
    '$.measures',
  );
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
function assertConnectedTargetInput(
  input: Omit<CanonicalPlanInputV12, 'dependencyHistory'>,
  history: SavedConnectedDependencyHistory,
): void {
  const workPackages = history.workPackages.filter(
    (workPackage) => workPackage.workPackageId === history.targetWorkPackageId,
  );
  const targetWorkItems = workPackages.flatMap((workPackage) => workPackage.workItems);
  const targetSteps = workPackages.flatMap((workPackage) => workPackage.steps);
  const workItems = new Map(input.workItems.map((row) => [row.id, row]));
  const steps = new Set(input.steps.map((step) => step.id));
  requireHistory(
    input.workItems.length === targetWorkItems.length &&
      targetWorkItems.every((row) => workItems.get(row.id)?.parentId === row.parentId),
    'target_work_items',
    '$.workItems',
  );
  requireHistory(
    input.steps.length === targetSteps.length && targetSteps.every((step) => steps.has(step.id)),
    'target_steps',
    '$.steps',
  );
  const target = workPackages.at(0);
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
  for (const [name, facts] of [
    ['stepValues', input.stepValues],
    ['measures', input.measures],
    ['measureEstimates', input.measureEstimates],
    ['assignments', input.assignments],
  ] as const)
    requireHistory(
      facts.every((fact) => workItems.has(fact.workItemId) && steps.has(fact.stepId)),
      'target_facts',
      `$.${name}`,
    );
  for (const [name, facts] of [
    ['budgets', input.budgets],
    ['workItemTeams', input.workItemTeams],
    ['workItemServices', input.workItemServices],
  ] as const)
    requireHistory(
      facts.every((fact) => workItems.has(fact.workItemId)),
      'target_facts',
      `$.${name}`,
    );
  requireHistory(
    input.dependencies.every(
      (dependency) =>
        workItems.has(dependency.predecessorId) && workItems.has(dependency.successorId),
    ),
    'target_dependencies',
    '$.dependencies',
  );
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
/**
 * Decodes current ownerless12 with complete captured history and local fact semantics.
 * @throws SavedHistoryError for malformed shape, invalid figures or incoherent connected ownership.
 */
export function readCurrentSavedPlanInput12(body: unknown): CanonicalPlanInputV12 {
  const parsed = (compiledInput12 ??= createInput12())(body);
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
  return detachHistory({ ...parsed, dependencyHistory });
}
