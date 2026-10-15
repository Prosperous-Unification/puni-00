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
