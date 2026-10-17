import type { StepNodeRef } from './step-node';

/** Sparse authored maximum parallelism on a concrete leaf step; absence means inherit. */
export interface StoredStepParallel {
  workItemId: string;
  stepId: string;
  maxParallel: number;
}

/** Rejects corrupt persisted parallelism without coercion, rounding or a default. */
export function assertStepParallel(maxParallel: number): void {
  // Proof: integer, lower and upper predicates removed independently; real memory-source
  // invalid-value negatives failed (evidence/domain-{integer,lower,upper}.txt), 2026-10-15.
  if (!Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > 1000)
    throw new Error('step parallelism must be an integer from 1 to 1000');
}

/** Maximum before person and pool clamps, preserving authored provenance. */
export type StepParallel =
  { kind: 'inherited'; maxParallel: number } | { kind: 'explicit'; maxParallel: number };

/**
 * Resolves a concrete node's maximum before {@link resolveStepResources} applies
 * person and pool clamps. Absence inherits; a present fact remains explicit even
 * when equal to the row maximum. Reads the supplied maximum once, validates that
 * captured number and returns it with provenance.
 * Throws for invalid maxima or a fact naming a different work-item/step pair.
 * Existence, leaf status and project ownership belong to the supplying store.
 */
export function resolveStepParallel(
  node: StepNodeRef,
  rowMaximum: number,
  override: StoredStepParallel | undefined,
): StepParallel {
  // Proof: row-validation removed; inherited and explicit-path invalid-row tests failed,
  // evidence/resolver-2026-10-17/row-validation.txt, 2026-10-17.
  assertStepParallel(rowMaximum);
  // Proof: override-ignored and equality-collapse independently failed the sibling and
  // equal-default tests, evidence/resolver-2026-10-17/{override-ignored,equality-collapse}.txt.
  if (override === undefined) return { kind: 'inherited', maxParallel: rowMaximum };
  // Proof: work-item-guard removed; foreign work-item test failed (work-item-guard.txt).
  if (override.workItemId !== node.workItemId)
    throw new Error('step parallelism belongs to another work item');
  // Proof: step-guard removed; foreign step test failed (step-guard.txt).
  if (override.stepId !== node.stepId) throw new Error('step parallelism belongs to another step');
  // Proof: override-validation removed; invalid-override tests failed (override-validation.txt).
  // Proof: returning a fresh getter read emitted 1001 after validating 2; the
  // single-read regression failed (evidence/resolver-accessor-2026-10-17/reread.txt).
  const maxParallel = override.maxParallel;
  assertStepParallel(maxParallel);
  // Proof: getter retained supplied fact; mutation-after-resolution test failed
  // (evidence/resolver-2026-10-17/mutable-boundary.txt), 2026-10-17.
  return { kind: 'explicit', maxParallel };
}
