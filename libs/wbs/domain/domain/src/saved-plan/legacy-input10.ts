import { type } from 'arktype';

import { assertStepBlockages, readStepParallels } from './canonical-plan-input';
import { detachHistory, type Historical, requireHistory, SavedHistoryError } from './history-json';
import {
  readSavedDependencyHistory,
  type SavedConnectedDependencyHistory,
  type SavedDependencyHistory,
} from './legacy-dependency-history10';
import { legacyInputFields } from './legacy-input-fields';
import { normalisePlanInputForward, PlanInputVersionError } from './normalise-plan-input';

/** Published input10 owns these exact legacy field names; no current type is its base. */
export type LegacyPlanInputV10 = Historical<
  Omit<(typeof input10)['infer'], 'dependencyHistory'> & {
    dependencyHistory: SavedDependencyHistory;
  }
>;

const input10 = type({
  '+': 'reject',
  schemaVersion: '10',
  ...legacyInputFields,
  dependencyHistory: 'unknown',
});

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
export function upgradeLocalPlanInputV9(body: unknown): Record<string, unknown> {
  requireHistory(typeof body === 'object' && body !== null && !Array.isArray(body), 'shape', '$');
  assertLegacyLocalClaims(body);
  requireHistory(
    Array.isArray(Reflect.get(body, 'typedDependencies')),
    'shape',
    '$.typedDependencies',
  );
  return { ...body, schemaVersion: 10, dependencyHistory: { kind: 'local' } };
}

/**
 * Checks input10 figures independently of live definitions and future write policy.
 * Its published factor range is (0, 1000]; priced figures carry both basis fields.
 * @throws SavedHistoryError for invalid factors, values, trio order or paired bases.
 */
function assertMeasureFields(input: Omit<LegacyPlanInputV10, 'dependencyHistory'>): void {
  // Proof: omission admitted both invalid-factor integrity cases (2026-10-24).
  requireHistory(
    Number.isFinite(input.project.budgetFactor) &&
      input.project.budgetFactor > 0 &&
      input.project.budgetFactor <= 1000,
    'budget_factor',
    '$.project.budgetFactor',
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
  input: Omit<LegacyPlanInputV10, 'dependencyHistory'>,
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

/**
 * Decodes supported bodies without rewriting stored bytes or their hash.
 * Connected inputs require exact target row/step membership, matching metadata/parents and
 * target-owned facts; captured context cannot stand in for unrelated local rows.
 */
export function readLegacySavedPlanInput(body: unknown, version: number): LegacyPlanInputV10 {
  if (!Number.isInteger(version) || version < 1)
    throw new PlanInputVersionError('not-a-version', version, 10);
  if (version > 10) throw new PlanInputVersionError('from-the-future', version, 10);
  requireHistory(
    typeof body === 'object' &&
      body !== null &&
      'schemaVersion' in body &&
      body.schemaVersion === version,
    'version',
    '$.schemaVersion',
  );
  let current: unknown = body;
  if (version < 10) {
    assertLegacyLocalClaims(body);
    // Boundary: legacy normalizer returns its validated v9 field set; this upgrade accepts only that local shape.
    current = upgradeLocalPlanInputV9(normalisePlanInputForward(body, version));
  }
  requireHistory(
    typeof current === 'object' && current !== null && 'dependencyHistory' in current,
    'shape',
    '$.dependencyHistory',
  );
  const parsed = input10(current);
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
      dependencyHistory.targetProjectId === parsed.project.id,
      'target',
      '$.dependencyHistory.targetProjectId',
    );
    assertConnectedTargetInput(parsed, dependencyHistory);
  }
  // Boundary: the complete input10 schema checks every legacy field; dependency history has its own frozen decoder.
  return detachHistory({ ...parsed, dependencyHistory });
}
