import { canonicalConnectedStageInput } from './canonical-connected-stage-input';
import type { ConnectedOptimizationStage } from './connected-optimization-input';
import { leafDeadlinesOf } from './leaf-constraints';
import { isOnTime, WORK_ITEM_PROJECTION_START } from './on-time';
import { priorityWeightOf, priorityWeights } from './priority-weight';
import type { PublicationChoice, RealPrimaryTerm } from './publication-guard';
import {
  durationOf,
  indexTree,
  priorityByLeaf,
  type Schedule,
  ScheduleInvalidOptimizedStartError,
  scheduleResolved,
  sliceKey,
  workItemIdsWithPositiveDuration,
} from './schedule';
import { type RealObjectiveValues, scoreReal } from './score-real';

/** A captured component that cannot reproduce its trusted real placements. */
export class ConnectedStageEvidenceError extends Error {
  override name = 'ConnectedStageEvidenceError' as const;
  constructor(message: string, options?: ErrorOptions) {
    super(`connected stage evidence: ${message}`, options);
  }
}

/** Scoped real scores and the complete component schedule chosen for publication. */
export interface ConnectedPublicationDecision {
  readonly scope: { readonly kind: 'connected-stage'; readonly projectId: string };
  readonly chosen: PublicationChoice;
  readonly schedule: Schedule;
  readonly baseline: Schedule;
  readonly values: RealObjectiveValues;
  readonly optimizedValues: RealObjectiveValues;
  readonly baselineValues: RealObjectiveValues;
}

function localKeysOf(stage: ConnectedOptimizationStage): Set<string> {
  if (stage.input.order.kind !== 'connected') {
    throw new ConnectedStageEvidenceError('connected order is absent');
  }
  const keys = new Set<string>();
  for (const slice of stage.input.slices) {
    if (stage.input.order.projectIdByWorkItem.get(slice.workItemId) === stage.projectId) {
      keys.add(sliceKey(slice.workItemId, slice.stepId));
    }
  }
  // Proof: removing this guard let a stage with no B-owned slice replay and
  // failed the empty-local-stage assertion after its ownership was changed.
  if (keys.size === 0) throw new ConnectedStageEvidenceError('empty local slice set');
  return keys;
}

function assertKeys(
  actual: ReadonlyMap<string, unknown>,
  expected: ReadonlySet<string>,
  fail: (key: string, reason: string) => Error,
): void {
  for (const key of expected) {
    if (!actual.has(key)) throw fail(key, 'missing key');
  }
  for (const key of actual.keys()) {
    if (!expected.has(key)) throw fail(key, 'surplus key');
  }
}

/** Replay all captured pins through the actual connected scheduler and require exact timings. */
export function replayConnectedStage(stage: ConnectedOptimizationStage): Schedule {
  try {
    // Proof: removing canonical validation admitted an invalid capacity mode
    // through real replay in the structurally-invalid-stage test.
    canonicalConnectedStageInput(stage);
    localKeysOf(stage);
    for (const [key, start] of stage.starts) {
      if (!Number.isFinite(start) || start < 0) {
        throw new Error(`invalid captured start ${key}: ${String(start)}`);
      }
    }
    const baseline = scheduleResolved(stage.input, stage.starts);
    assertKeys(
      baseline.slices,
      new Set(stage.starts.keys()),
      (key, reason) => new Error(`baseline slice ${key}: ${reason}`),
    );
    for (const [key, placed] of baseline.slices) {
      // Proof: removing start equality admitted a captured C pin raised one ulp
      // when real replay reconciled it; removing finish equality separately
      // admitted a captured foreign finish raised one ulp.
      if (
        placed.earliestStart !== stage.starts.get(key) ||
        placed.earliestFinish !== stage.finishes.get(key)
      ) {
        throw new Error(`baseline timing mismatch for ${key}`);
      }
    }
    return baseline;
  } catch (cause) {
    if (cause instanceof ConnectedStageEvidenceError) throw cause;
    throw new ConnectedStageEvidenceError('baseline replay failed', { cause });
  }
}

function validateLocalValues(
  values: ReadonlyMap<string, number>,
  localKeys: ReadonlySet<string>,
  fail: (key: string, reason: string) => Error,
): void {
  assertKeys(values, localKeys, fail);
  for (const [key, value] of values) {
    if (!localKeys.has(key)) throw fail(key, 'foreign or surplus key');
    if (!Number.isFinite(value) || value < 0)
      throw fail(key, `nonnegative finite start required: ${String(value)}`);
  }
}

function checkLocalDeadlines(
  stage: ConnectedOptimizationStage,
  candidate: Schedule,
  localKeys: ReadonlySet<string>,
): void {
  const localSlices = stage.input.slices.filter((slice) =>
    localKeys.has(sliceKey(slice.workItemId, slice.stepId)),
  );
  const localIds = new Set(localSlices.map((slice) => slice.workItemId));
  const ownRows = stage.input.rows.filter(
    (row) =>
      stage.input.order.kind === 'connected' &&
      stage.input.order.projectIdByWorkItem.get(row.id) === stage.projectId,
  );
  const deadlines = leafDeadlinesOf(stage.input.deadlines, indexTree(ownRows));
  const positive = workItemIdsWithPositiveDuration(localSlices, localSlices.map(durationOf));
  for (const [leafId, deadline] of deadlines) {
    if (!localIds.has(leafId)) continue;
    if (positive.has(leafId)) {
      const projected = candidate.workItems.get(leafId);
      if (projected === undefined) {
        throw new ScheduleInvalidOptimizedStartError(
          leafId,
          `missing deadline projection for ${String(deadline)}`,
        );
      }
      if (!isOnTime(WORK_ITEM_PROJECTION_START, projected.earliestFinish, deadline)) {
        throw new ScheduleInvalidOptimizedStartError(
          leafId,
          `misses effective deadline ${String(deadline)}`,
        );
      }
    } else {
      for (const slice of localSlices) {
        if (slice.workItemId !== leafId) continue;
        const key = sliceKey(slice.workItemId, slice.stepId);
        const placed = candidate.slices.get(key);
        if (placed === undefined)
          throw new ScheduleInvalidOptimizedStartError(key, 'missing milestone slice');
        if (!isOnTime(placed.earliestStart, placed.earliestFinish, deadline)) {
          throw new ScheduleInvalidOptimizedStartError(
            key,
            `misses effective deadline ${String(deadline)}`,
          );
        }
      }
    }
  }
}

function scoreLocal(
  stage: ConnectedOptimizationStage,
  schedule: Schedule,
  localKeys: ReadonlySet<string>,
  reference: ReadonlyMap<string, number>,
): RealObjectiveValues {
  const ownRows = stage.input.rows.filter(
    (row) =>
      stage.input.order.kind === 'connected' &&
      stage.input.order.projectIdByWorkItem.get(row.id) === stage.projectId,
  );
  // Proof: deriving ranks from all component rows made the local PRI fixture
  // score 2.4 instead of 1.2 when a foreign lower-priority leaf was present.
  const weights = priorityWeights(priorityByLeaf(ownRows, indexTree(ownRows)));
  // Proof: dropping local filtering made the long foreign-slice regression test
  // fail in scoreReal on the absent foreign movement reference.
  const localSlices = new Map([...schedule.slices].filter(([key]) => localKeys.has(key)));
  const sliceByKey = new Map(
    stage.input.slices.map((slice) => [sliceKey(slice.workItemId, slice.stepId), slice]),
  );
  const values = scoreReal(
    { ...schedule, slices: localSlices },
    (key) => {
      const slice = sliceByKey.get(key);
      if (slice === undefined) throw new ConnectedStageEvidenceError(`missing slice ${key}`);
      return priorityWeightOf(weights, slice.workItemId);
    },
    (key) => {
      const start = reference.get(key);
      if (start === undefined) throw new ConnectedStageEvidenceError(`missing reference ${key}`);
      return start;
    },
  );
  // Proof: removing this check published Infinity movement from two finite
  // MAX_VALUE references in the scoped-score test.
  if (Object.values(values).some((value) => !Number.isFinite(value))) {
    throw new ConnectedStageEvidenceError('nonfinite local score');
  }
  return values;
}

/** Replay local real starts against fixed foreign evidence and compare only local scores. */
export function guardConnectedPublication(
  stage: ConnectedOptimizationStage,
  localStarts: ReadonlyMap<string, number>,
  primary: RealPrimaryTerm,
  movementReference: ReadonlyMap<string, number>,
): ConnectedPublicationDecision {
  const baseline = replayConnectedStage(stage);
  const localKeys = localKeysOf(stage);
  // Proof: removing reference validation let a negative movement origin -1
  // publish a score, failing the trusted-reference refusal test.
  validateLocalValues(
    movementReference,
    localKeys,
    (key, reason) => new ConnectedStageEvidenceError(`reference ${key}: ${reason}`),
  );
  // Proof: removing this call let a missing local candidate reuse its captured
  // baseline pin; the missing-candidate test received a decision instead of refusal.
  validateLocalValues(
    localStarts,
    localKeys,
    (key, reason) => new ScheduleInvalidOptimizedStartError(key, reason),
  );
  const pins = new Map(stage.starts);
  for (const [key, start] of localStarts) pins.set(key, start);
  let optimized: Schedule;
  try {
    // Proof: removing the supplied authored graph edges let a local later-step
    // candidate start at 0.1 ahead of its foreign FS predecessor (real test).
    // Switching to unpinned Fast made the long-foreign-task test report local
    // candidate makespan 1 instead of the requested real placement's 4.
    optimized = scheduleResolved(stage.input, pins);
  } catch (cause) {
    if (cause instanceof ScheduleInvalidOptimizedStartError) throw cause;
    throw new Error('connected candidate replay failed', { cause });
  }
  assertKeys(
    optimized.slices,
    new Set(stage.starts.keys()),
    (key, reason) => new ScheduleInvalidOptimizedStartError(key, reason),
  );
  for (const [key, placed] of optimized.slices) {
    if (localKeys.has(key)) continue;
    // Proof: removing start equality changed the sub-drift fixture's refusal
    // to the finish diagnostic. Removing both comparisons published a decision
    // after the foreign C start and finish moved under real pin reconciliation.
    if (placed.earliestStart !== stage.starts.get(key)) {
      throw new ScheduleInvalidOptimizedStartError(key, 'foreign start changed');
    }
    // Proof (redundant under deterministic replay): removing this check alone
    // left the real sub-drift and forged-capture negatives green. Removing both
    // foreign comparisons admitted the sub-drift candidate, while baseline
    // finish equality separately refused forged trusted evidence.
    if (placed.earliestFinish !== stage.finishes.get(key)) {
      throw new ScheduleInvalidOptimizedStartError(key, 'foreign finish changed');
    }
  }
  // Proof: removing this call published a local finish at day 2 against
  // deadline 0; the real deadline test then failed its typed refusal assertion.
  checkLocalDeadlines(stage, optimized, localKeys);
  const baselineValues = scoreLocal(stage, baseline, localKeys, movementReference);
  const optimizedValues = scoreLocal(stage, optimized, localKeys, movementReference);
  // Proof: changing > to >= failed the fractional A→B→C equal-primary test:
  // it chose baseline where the optimized replay must win the tie.
  const worse = optimizedValues[primary] > baselineValues[primary];
  return {
    scope: { kind: 'connected-stage', projectId: stage.projectId },
    chosen: worse ? 'baseline' : 'optimized',
    schedule: worse ? baseline : optimized,
    baseline,
    values: worse ? baselineValues : optimizedValues,
    optimizedValues,
    baselineValues,
  };
}
