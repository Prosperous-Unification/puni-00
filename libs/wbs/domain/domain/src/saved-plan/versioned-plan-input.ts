import { type } from 'arktype';

import {
  assertStepBlockages,
  canonicalisePlanInput,
  type CanonicalPlanInput,
  type PlanInputRows,
  readStepParallels,
} from './canonical-plan-input';
import {
  readSavedDependencyHistory,
  type SavedConnectedDependencyHistory,
  type SavedDependencyHistory,
  serializeSavedDependencyHistory,
} from './dependency-history';
import { detachHistory, requireHistory, SavedHistoryError } from './history-json';
import { normalisePlanInputForward, PlanInputVersionError } from './normalise-plan-input';

/** Reserved reader version; the existing writer remains v8 until connected capture is integrated. */
export const SAVED_PLAN_INPUT_READER_VERSION = 9 as const;

/** Input9 requires explicit captured dependency meaning, including known-local plans. */
export type CanonicalPlanInputV9 = Omit<CanonicalPlanInput, 'schemaVersion'> & {
  readonly schemaVersion: 9;
  readonly dependencyHistory: SavedDependencyHistory;
};

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
  project: type({
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
const input9 = type({ '+': 'reject', schemaVersion: '9', ...fields, dependencyHistory: 'unknown' });

/** Reject claims on the original legacy body before historical upgrades may remove obsolete fields. */
function assertLegacyLocalClaims(body: object): void {
  requireHistory(
    !('dependencyHistory' in body) && !('externalDependencies' in body),
    'legacy_external',
    '$.dependencyHistory',
  );
  const dependencies: unknown = Reflect.get(body, 'typedDependencies');
  if (dependencies === undefined) return;
  requireHistory(Array.isArray(dependencies), 'shape', '$.typedDependencies');
  for (const dependency of dependencies) {
    requireHistory(
      typeof dependency === 'object' && dependency !== null && !('projectId' in dependency),
      'legacy_external',
      '$.typedDependencies',
    );
    for (const side of ['predecessor', 'successor']) {
      const scoped: unknown = Reflect.get(dependency, side);
      requireHistory(
        typeof scoped === 'object' && scoped !== null && !('projectId' in scoped),
        'legacy_external',
        `$.typedDependencies.${side}`,
      );
    }
  }
}

/** Upgrade only the historical local format; explicit external claims must never be discarded. */
export function upgradeLocalPlanInputV8(body: Record<string, unknown>): Record<string, unknown> {
  assertLegacyLocalClaims(body);
  requireHistory(Array.isArray(body['typedDependencies']), 'shape', '$.typedDependencies');
  return { ...body, schemaVersion: 9, dependencyHistory: { kind: 'local' } };
}

/**
 * Links target input identities and owned facts to the same captured component.
 * Exact membership preserves branches and unused steps as well as scheduled leaves.
 * Shared names, calendars, step codes/positions and holds must describe the same capture.
 * The history decoder has already verified component ownership and target presence.
 */
function assertConnectedTargetInput(
  input: Omit<CanonicalPlanInputV9, 'dependencyHistory'>,
  history: SavedConnectedDependencyHistory,
): void {
  const projects = history.projects.filter(
    (project) => project.projectId === history.targetProjectId,
  );
  const targetWorkItems = projects.flatMap((project) => project.workItems);
  const targetSteps = projects.flatMap((project) => project.steps);
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
  const target = projects.at(0);
  // Proof: independently omitting project, row or step metadata equality returned 200 in mounted read/compare negatives (2026-10-22).
  requireHistory(
    input.project.name === target?.name &&
      input.project.startDate === target.startDate &&
      input.project.timezone === target.timezone,
    'target_metadata',
    '$.project',
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

/**
 * Decodes supported bodies without rewriting stored bytes or their hash.
 * Connected inputs require exact target row/step membership, matching metadata/parents and
 * target-owned facts; captured context cannot stand in for unrelated local rows.
 */
export function readSavedPlanInput(body: unknown, version: number): CanonicalPlanInputV9 {
  if (!Number.isInteger(version) || version < 1)
    throw new PlanInputVersionError('not-a-version', version, 9);
  if (version > 9) throw new PlanInputVersionError('from-the-future', version, 9);
  requireHistory(
    typeof body === 'object' &&
      body !== null &&
      'schemaVersion' in body &&
      body.schemaVersion === version,
    'version',
    '$.schemaVersion',
  );
  let current: unknown = body;
  if (version < 9) {
    assertLegacyLocalClaims(body);
    // Boundary: legacy normalizer returns its validated v8 field set; this upgrade accepts only that local shape.
    current = upgradeLocalPlanInputV8(
      normalisePlanInputForward(body, version) as unknown as Record<string, unknown>,
    );
  }
  requireHistory(
    typeof current === 'object' && current !== null && 'dependencyHistory' in current,
    'shape',
    '$.dependencyHistory',
  );
  const parsed = input9(current);
  if (parsed instanceof type.errors) throw new SavedHistoryError('shape', '$', { cause: parsed });
  try {
    assertStepBlockages(parsed);
    readStepParallels(parsed);
  } catch (cause) {
    throw new SavedHistoryError('local_facts', '$', { cause });
  }
  const dependencyHistory = readSavedDependencyHistory(parsed.dependencyHistory);
  if (dependencyHistory.kind === 'connected') {
    requireHistory(
      dependencyHistory.targetProjectId === parsed.project.id,
      'target',
      '$.dependencyHistory.targetProjectId',
    );
    assertConnectedTargetInput(parsed, dependencyHistory);
  }
  // Boundary: the complete input9 schema checks every legacy field; dependency history has its own frozen decoder.
  return detachHistory({ ...parsed, dependencyHistory });
}

/** Explicit v9 builder; callers provide converted captured context, never an optional fallback. */
export function canonicalisePlanInputV9(
  rows: PlanInputRows,
  history: SavedDependencyHistory,
): CanonicalPlanInputV9 {
  // Reader-only fault: retaining caller order failed the unordered-history test; production writer proof is pending.
  const dependencyHistory: unknown = JSON.parse(serializeSavedDependencyHistory(history));
  return readSavedPlanInput(
    { ...canonicalisePlanInput(rows), schemaVersion: 9, dependencyHistory },
    9,
  );
}
