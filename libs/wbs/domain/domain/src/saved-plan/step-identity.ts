import type { ComparablePlanInput } from './comparison-input';
import {
  projectDependencyMeaning,
  projectMeaningSlices,
  readScheduleMeaning,
} from './comparison-meaning';
import { projectDependencyExecution } from './dependency-execution';
import type { PlanScheduleValue, PlanSide, PlanSideSchedule } from './diff-plans';
import { SavedHistoryError } from './history-json';
import { readSavedPlainScheduleBody } from './versioned-plain-schedule';

/** Current immutable alias evidence captured beside a saved record, never persisted as its body. */
export interface StepIdentityAlias {
  readonly oldStepId: string;
  readonly stepId: string;
}

/** An actual schema epoch; an empty catalogue roster is distinct from pre-catalogue storage. */
export type StepIdentityRead =
  | { readonly kind: 'pre_catalogue' }
  | { readonly kind: 'catalogue'; readonly aliases: readonly StepIdentityAlias[] };

/**
 * Resolve verified historical meaning into a detached comparison value.
 * Original body bytes, labels, hashes and recorded parent evidence are unchanged.
 * Whole endpoints and stepless slices retain null; projected identity collisions refuse.
 * Captured inputs, connected packets and summary evidence remain separate from resolved meaning.
 * @throws {SavedHistoryError} on identity collisions or incoherent typed references.
 */
export function projectSavedStepIdentity(side: PlanSide, identity: StepIdentityRead): PlanSide {
  if (identity.kind === 'pre_catalogue') return side;
  const aliases = new Map<string, string>();
  for (const alias of identity.aliases) {
    if (aliases.has(alias.oldStepId) || alias.oldStepId === alias.stepId)
      throw new SavedHistoryError('step_identity_roster', '$.stepIdentity');
    aliases.set(alias.oldStepId, alias.stepId);
  }
  for (const stepId of aliases.values())
    if (aliases.has(stepId)) throw new SavedHistoryError('step_identity_roster', '$.stepIdentity');
  if (aliases.size === 0) return side;
  const resolve = (id: string): string => aliases.get(id) ?? id;
  const input = side.input;
  const endpoint = (selected: ComparablePlanInput['typedDependencies'][number]['predecessor']) =>
    selected.scope === 'whole' ? selected : { ...selected, stepId: resolve(selected.stepId) };
  return {
    ...side,
    comparison: {
      kind: 'step-resolved',
      input: {
        ...input,
        steps: requireUniqueRows(
          input.steps.map((row) => ({ ...row, id: resolve(row.id) })),
          (row) => row.id,
          '$.steps',
        ),
        // Proof: leaving these IDs unresolved failed captured13 own-order meaning while bytes stayed exact (input13-fault-identity-own-v1).
        leafSteps: input.leafSteps.map((leaf) => ({
          ...leaf,
          stepIds: leaf.stepIds.map(resolve),
        })),
        stepValues: requireUniqueRows(
          input.stepValues.map((row) => ({ ...row, stepId: resolve(row.stepId) })),
          (row) => JSON.stringify([row.workItemId, row.stepId]),
          '$.stepValues',
        ),
        stepBlockages: requireUniqueRows(
          input.stepBlockages.map((row) => ({ ...row, stepId: resolve(row.stepId) })),
          (row) => JSON.stringify([row.workItemId, row.stepId]),
          '$.stepBlockages',
        ),
        stepParallels: requireUniqueRows(
          input.stepParallels.map((row) => ({ ...row, stepId: resolve(row.stepId) })),
          (row) => JSON.stringify([row.workItemId, row.stepId]),
          '$.stepParallels',
        ),
        measures: requireUniqueRows(
          input.measures.map((row) => ({ ...row, stepId: resolve(row.stepId) })),
          (row) => JSON.stringify([row.workItemId, row.stepId, row.metric]),
          '$.measures',
        ),
        measureEstimates: requireUniqueRows(
          input.measureEstimates.map((row) => ({ ...row, stepId: resolve(row.stepId) })),
          (row) => JSON.stringify([row.workItemId, row.stepId, row.key]),
          '$.measureEstimates',
        ),
        assignments: requireUniqueRows(
          input.assignments.map((row) => ({ ...row, stepId: resolve(row.stepId) })),
          (row) => JSON.stringify([row.workItemId, row.stepId, row.personId]),
          '$.assignments',
        ),
        typedDependencies: input.typedDependencies.map((row) => ({
          ...row,
          predecessor: endpoint(row.predecessor),
          successor: endpoint(row.successor),
        })),
      },
      dependencies:
        side.inputEvidence.dependencies.kind === 'unrecorded'
          ? side.inputEvidence.dependencies
          : {
              kind: 'recorded',
              // Proof: aliasing before deriving original uniform order reversed tied policies
              // (current-writer13-fault-alias-before-uniform-v2); detached comparison only.
              // Proof: translating before deriving uniform order reversed tied original12
              // policy meaning (current-writer13-fault-alias-before-uniform-v5).
              history: projectDependencyMeaning(
                projectDependencyExecution(side.inputEvidence.dependencies),
                resolve,
              ),
            },
      schedule:
        side.inputEvidence.dependencies.kind === 'recorded' &&
        side.inputEvidence.dependencies.history.kind === 'connected'
          ? readScheduleMeaning(side.schedule, resolve)
          : { kind: 'plain', value: projectLocalSchedule(side.schedule, resolve) },
    },
  };
}

/** Refuse collapse of independently recorded facts instead of overwriting one during translation. */
function requireUniqueRows<T>(
  rows: readonly T[],
  key: (row: T) => string,
  path: string,
): readonly T[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const id = key(row);
    if (seen.has(id)) throw new SavedHistoryError('step_identity_collision', path);
    seen.add(id);
  }
  return rows;
}

/** Re-key concrete local slices and their known predecessor references; opaque engine extensions retain their values. */
function projectLocalSchedule(
  schedule: PlanSideSchedule,
  resolve: (id: string) => string,
): PlanSideSchedule {
  if (!schedule.present) return schedule;
  const body = readSavedPlainScheduleBody(schedule.body, 3);
  const slices = projectMeaningSlices(body.slices, resolve);
  // Boundary: the strict historical reader validated every open extension as finite JSON; only typed IDs changed.
  return { ...schedule, body: { ...body, slices } as unknown as PlanScheduleValue };
}
