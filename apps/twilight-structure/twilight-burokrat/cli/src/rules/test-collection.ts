import type { TestLevel } from './test-levels';

/** Exact discovery supplied by a runner adapter before it starts a level. */
export interface TestCollectionRequest {
  readonly target: string;
  readonly level: TestLevel;
  readonly files: readonly string[];
  readonly discoveryInputs: readonly string[];
  readonly noCasesReason?: string;
}

/** An empty level is visible and cannot be mistaken for a passing runner. */
export type TestCollectionPlan =
  | {
      readonly kind: 'run';
      readonly target: string;
      readonly level: TestLevel;
      readonly files: readonly string[];
      readonly discoveryInputs: readonly string[];
    }
  | {
      readonly kind: 'no-cases';
      readonly target: string;
      readonly level: TestLevel;
      readonly discoveryInputs: readonly string[];
      readonly reason: string;
    };

/**
 * Makes empty collections explicit. A caller must never launch its runner with
 * no positional file list, because most runners then discover unrelated tests.
 *
 * @throws when the target, discovery, file set or empty-set reason is malformed.
 */
export function planTestCollection(request: TestCollectionRequest): TestCollectionPlan {
  if (request.target.trim() === '') throw new Error('test collection target is empty');
  // Proof: an empty discoveryInputs array makes the malformed-discovery case
  // fail here; removing this guard produces a run without config provenance.
  if (request.discoveryInputs.length === 0 || request.discoveryInputs.some((path) => path === '')) {
    throw new Error(`${request.target} has no valid discovery input`);
  }
  if (
    request.files.some((path) => path === '') ||
    new Set(request.files).size !== request.files.length
  ) {
    throw new Error(`${request.target} has an invalid or duplicate collected file`);
  }
  if (request.files.length === 0) {
    // Proof: the empty API case without noCasesReason fails this guard; removing
    // it would create a false no-cases record with an absent reason.
    if (request.noCasesReason === undefined || request.noCasesReason.trim() === '') {
      throw new Error(`${request.target} has no cases and no no-cases reason`);
    }
    return {
      kind: 'no-cases',
      target: request.target,
      level: request.level,
      discoveryInputs: request.discoveryInputs,
      reason: request.noCasesReason,
    };
  }
  if (request.noCasesReason !== undefined) {
    throw new Error(`${request.target} has files and a no-cases reason`);
  }
  return {
    kind: 'run',
    target: request.target,
    level: request.level,
    files: request.files,
    discoveryInputs: request.discoveryInputs,
  };
}
