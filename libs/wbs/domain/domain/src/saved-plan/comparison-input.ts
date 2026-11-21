import type { LeafStepOrder } from '../leaf-step-order';
import type { CanonicalPlanInput, CanonicalWorkPackage } from './canonical-plan-input';
import type { SavedDependencyHistory } from './dependency-history';
import { compareHistoryKeys, detachHistory } from './history-json';
import type { SavedLeafDependencyHistory } from './leaf-dependency-history';
import { type DecodedPlanInput, readSavedPlanInput } from './versioned-plan-input';

/** Authored facts shared by supported captures; generation-specific evidence stays separate. */
export type ComparablePlanInput = Omit<CanonicalPlanInput, 'workPackage'> & {
  readonly workPackage: Omit<CanonicalWorkPackage, 'projectId'>;
  readonly leafSteps: readonly LeafStepOrder[];
};

/** Original version selects each captured history grammar before comparison projection. */
export type RecordedDependencyHistory = SavedDependencyHistory | SavedLeafDependencyHistory;

/** Absence means unrecorded, while a recorded historical null remains evidence. */
export interface SavedInputEvidence {
  readonly parent:
    { readonly kind: 'unrecorded' } | { readonly kind: 'recorded'; readonly projectId: string };
  readonly retired?: { readonly ownerId: string | null };
  readonly dependencies:
    | { readonly kind: 'unrecorded' }
    | {
        readonly kind: 'recorded';
        readonly execution: 'uniform';
        readonly history: SavedDependencyHistory;
      }
    | {
        readonly kind: 'recorded';
        readonly execution: 'leaf';
        readonly history: SavedLeafDependencyHistory;
      };
}

/** A detached comparison view, never a replacement serialized saved-plan body. */
export interface ProjectedPlanInput {
  readonly input: ComparablePlanInput;
  readonly inputEvidence: SavedInputEvidence;
}

/**
 * Validates the declared original grammar before separating authored facts and provenance.
 * Callers must verify original bytes, hashes and header links before invoking this projection.
 * Earlier captures never acquire a current parent or lose their actually recorded owner.
 */
export function projectSavedPlanInput(body: unknown, originalVersion: number): ProjectedPlanInput {
  const decoded = readSavedPlanInput(body, originalVersion);
  const dependencies: SavedInputEvidence['dependencies'] =
    originalVersion < 10
      ? { kind: 'unrecorded' }
      : decoded.schemaVersion === 13
        ? { kind: 'recorded', execution: 'leaf', history: decoded.dependencyHistory }
        : { kind: 'recorded', execution: 'uniform', history: decoded.dependencyHistory };
  const leafSteps = projectExecutionOrder(decoded);
  if (decoded.schemaVersion === 12 || decoded.schemaVersion === 13) {
    const { schemaVersion, dependencyHistory, workPackage, ...facts } = decoded;
    const { projectId, ...metadata } = workPackage;
    const inputEvidence: SavedInputEvidence = {
      parent: { kind: 'recorded', projectId },
      dependencies,
    };
    return detachHistory({ input: { ...facts, leafSteps, workPackage: metadata }, inputEvidence });
  }
  const { schemaVersion, dependencyHistory, workPackage, ...facts } = decoded;
  const { ownerId, ...metadata } = workPackage;
  const inputEvidence: SavedInputEvidence = {
    parent: { kind: 'unrecorded' },
    retired: { ownerId },
    dependencies,
  };
  return detachHistory({ input: { ...facts, leafSteps, workPackage: metadata }, inputEvidence });
}

/**
 * Original1–12 declare package-wide execution; original13 records each leaf's own list.
 * This derives execution semantics only, never binding provenance or a current catalogue lookup.
 * It changes the detached comparison view, never the captured body's fields or bytes.
 */
function projectExecutionOrder(input: DecodedPlanInput): readonly LeafStepOrder[] {
  // Proof: forcing uniform interpretation failed the mixed/zero comparison capture (input13-fault-comparison-own-v1).
  const leafSteps =
    input.schemaVersion === 13
      ? input.leafSteps
      : input.workItems
          .filter((row) => !input.workItems.some((child) => child.parentId === row.id))
          .map((row) => ({
            workItemId: row.id,
            stepIds: [...input.steps]
              .sort(
                (left, right) =>
                  left.position - right.position || compareHistoryKeys(left.id, right.id),
              )
              .map((step) => step.id),
          }));
  return [...leafSteps].sort((left, right) =>
    compareHistoryKeys(left.workItemId, right.workItemId),
  );
}
