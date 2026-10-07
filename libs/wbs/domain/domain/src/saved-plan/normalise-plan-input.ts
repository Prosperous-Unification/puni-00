import {
  CANONICAL_PLAN_INPUT_SCHEMA_VERSION,
  type CanonicalPlanInput,
} from './canonical-plan-input';

/**
 * A stored plan-input body this reader cannot bring forward.
 *
 * Three distinguishable causes, because they call for different answers and a
 * single "unsupported version" would hide which one happened:
 *
 * - `from-the-future` — the body was written by a newer build. Nothing here can
 *   invent the down-conversion; design.md says a schema that *removes* a field
 *   needs a rule written at that change, not guessed at now.
 * - `no-upgrade-path` — the version is older than this reader's and no step is
 *   registered for it. That is an incomplete {@link PLAN_INPUT_UPGRADES} table,
 *   which must fail loudly rather than pass an old shape through as if it were
 *   current: silently accepting it is how a removed field comes to read as
 *   `undefined` and compare as a change nobody made.
 * - `not-a-version` — the header's number is not a positive integer at all.
 */
export type PlanInputNormaliseFailure = 'from-the-future' | 'no-upgrade-path' | 'not-a-version';

export class PlanInputVersionError extends Error {
  constructor(
    readonly reason: PlanInputNormaliseFailure,
    readonly storedVersion: number,
    readonly readerVersion: number = CANONICAL_PLAN_INPUT_SCHEMA_VERSION,
  ) {
    super(
      `plan input body at schema version ${String(storedVersion)} cannot be normalised ` +
        `to ${String(readerVersion)}: ${reason}`,
    );
    this.name = 'PlanInputVersionError';
  }
}

/**
 * One step forward: version *n* to version *n+1*, over the parsed body.
 *
 * A step receives a value it may not modify and returns a new one. The
 * non-mutation rule is what keeps normalisation compatible with the
 * immutability requirement seen from the reader: the stored bytes are never
 * rewritten, and a step that edited its argument would let a caller who parsed
 * once and stored later write a body it never read.
 */
export type PlanInputUpgrade = (body: Record<string, unknown>) => Record<string, unknown>;

/**
 * The upgrade table, keyed by the version each step reads.
 *
 * `1` → `2` is the explicit legacy conversion for step allowances: a body
 * saved before allowances existed charged every step at 0%, so each captured
 * step is read with `allowancePercent: 0`. It refuses a version-1 body whose
 * steps are not a list of objects rather than guessing a shape.
 */
export const PLAN_INPUT_UPGRADES: ReadonlyMap<number, PlanInputUpgrade> = new Map([
  [1, withZeroStepAllowances],
  [2, withNoTypedDependencies],
  [3, withNoStatusFacts],
]);

/**
 * Version 3 to 4: readiness and holds did not exist, so every captured work
 * item said nothing about either (`add-work-item-statuses`).
 *
 * Proof: returning the body unchanged made `reads a version-3 body with
 * nothing said about readiness or holds, and compares clean` fail on
 * `schemaVersion` and every work item's missing fields; watched 2026-09-29.
 */
function withNoStatusFacts(body: Record<string, unknown>): Record<string, unknown> {
  const workItems = body['workItems'];
  if (!Array.isArray(workItems)) {
    throw new Error('a version-3 plan input body holds no work items list');
  }
  return {
    ...body,
    schemaVersion: 4,
    workItems: workItems.map((row: unknown) => {
      if (typeof row !== 'object' || row === null) {
        throw new Error('a version-3 plan input body holds a work item that is not an object');
      }
      return { ...row, readiness: null, hold: null };
    }),
  };
}

/** Version 2 to 3: typed links and step codes did not exist in the saved body. */
function withNoTypedDependencies(body: Record<string, unknown>): Record<string, unknown> {
  const steps = body['steps'];
  // Proof: omitting this guard made the malformed-v2 test receive `steps.map is not a function` (2026-09-28).
  if (!Array.isArray(steps)) throw new Error('a version-2 plan input body holds no steps list');
  // Proof: leaving schemaVersion at 2 made cross-version equality fail on schemaVersion;
  // omitting code: null made it fail on both captured steps (2026-09-28).
  return {
    ...body,
    schemaVersion: 3,
    typedDependencies: [],
    steps: steps.map((step: unknown) => {
      // Proof: omitting this guard made the malformed-v2 test accept a null step as `{ code: null }` (2026-09-28).
      if (typeof step !== 'object' || step === null) {
        throw new Error('a version-2 plan input body holds a step that is not an object');
      }
      return { ...step, code: null };
    }),
  };
}

/**
 * Version 1 to 2: every captured step gains the 0% allowance it was charged at.
 *
 * Proof: with the upgrade returning the body unchanged, `reads a version-1
 * body's steps at 0% allowance` failed on `Expected: 0, Received: undefined`
 * (2026-09-27).
 */
function withZeroStepAllowances(body: Record<string, unknown>): Record<string, unknown> {
  const steps = body['steps'];
  if (!Array.isArray(steps)) throw new Error('a version-1 plan input body holds no steps list');
  return {
    ...body,
    steps: steps.map((step: unknown) => {
      if (typeof step !== 'object' || step === null) {
        throw new Error('a version-1 plan input body holds a step that is not an object');
      }
      return { ...step, allowancePercent: 0 };
    }),
  };
}

/**
 * Bring a stored plan-input body forward to the version this build reads.
 *
 * **Forward only, in memory, and the stored bytes are never touched** (task
 * 7.4). The argument is the *parsed* body and the return is a new value; this
 * function has no access to the bytes and no way to write them, which is the
 * structural half of the guarantee. The other half is that no step may modify
 * its argument, asserted directly.
 *
 * At the reader's own version this is the identity — the same value back, not a
 * copy, because a copy would quietly hide a step that had mutated it.
 */
export function normalisePlanInputForward(
  body: unknown,
  storedVersion: number,
  readerVersion: number = CANONICAL_PLAN_INPUT_SCHEMA_VERSION,
  upgrades: ReadonlyMap<number, PlanInputUpgrade> = PLAN_INPUT_UPGRADES,
): CanonicalPlanInput {
  if (!Number.isInteger(storedVersion) || storedVersion < 1) {
    throw new PlanInputVersionError('not-a-version', storedVersion, readerVersion);
  }
  if (storedVersion > readerVersion) {
    throw new PlanInputVersionError('from-the-future', storedVersion, readerVersion);
  }
  let current = body;
  for (let version = storedVersion; version < readerVersion; version += 1) {
    const step = upgrades.get(version);
    if (step === undefined) {
      throw new PlanInputVersionError('no-upgrade-path', storedVersion, readerVersion);
    }
    current = step(current as Record<string, unknown>);
  }
  return current as CanonicalPlanInput;
}
