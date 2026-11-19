import type { CanonicalPlanInput, CanonicalWorkPackage } from './canonical-plan-input';
import type { SavedDependencyHistory } from './dependency-history';
import { detachHistory } from './history-json';
import { readSavedPlanInput } from './versioned-plan-input';

/** Authored facts shared by supported captures; generation-specific evidence stays separate. */
export type ComparablePlanInput = Omit<CanonicalPlanInput, 'workPackage'> & {
  readonly workPackage: Omit<CanonicalWorkPackage, 'projectId'>;
};

/** Absence means unrecorded, while a recorded historical null remains evidence. */
export interface SavedInputEvidence {
  readonly parent:
    { readonly kind: 'unrecorded' } | { readonly kind: 'recorded'; readonly projectId: string };
  readonly retired?: { readonly ownerId: string | null };
  readonly dependencies:
    | { readonly kind: 'unrecorded' }
    | { readonly kind: 'recorded'; readonly history: SavedDependencyHistory };
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
      : { kind: 'recorded', history: decoded.dependencyHistory };
  if (decoded.schemaVersion === 12) {
    const { schemaVersion, dependencyHistory, workPackage, ...facts } = decoded;
    const { projectId, ...metadata } = workPackage;
    const inputEvidence: SavedInputEvidence = {
      parent: { kind: 'recorded', projectId },
      dependencies,
    };
    return detachHistory({ input: { ...facts, workPackage: metadata }, inputEvidence });
  }
  const { schemaVersion, dependencyHistory, workPackage, ...facts } = decoded;
  const { ownerId, ...metadata } = workPackage;
  const inputEvidence: SavedInputEvidence = {
    parent: { kind: 'unrecorded' },
    retired: { ownerId },
    dependencies,
  };
  return detachHistory({ input: { ...facts, workPackage: metadata }, inputEvidence });
}
