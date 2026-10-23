import { expectedDays, type PertWeights } from './estimate';
import type { MeasureDefinition } from './measure-definition';
import { definitionsOrUnowned } from './measure-fact';
import type { MeasureScale } from './stored-vocabularies';

/**
 * Three points in one measure's unit and scale, ordered optimistic ≤
 * realistic ≤ pessimistic: the time trio's shape and its ordering rule
 * (`EstimateTrio`), for any measure but the scheduling one
 * (`wbs-measure-budgets` D3).
 */
export interface MeasureTrio {
  readonly optimistic: number;
  readonly realistic: number;
  readonly pessimistic: number;
}

/**
 * One step node's three-point estimate in one measure, the CONTEXT.md
 * **measure estimate**. `key` is the definition key, never a legacy name: the
 * tokens trio is `tokens`.
 *
 * `singlePoint` marks a trio that came from a legacy one-number token estimate
 * (`token_estimate`): its three points are equal and nobody estimated a range.
 * Only a `tokens` trio carries it, and a three-point write clears it (design
 * D28).
 */
export interface StoredMeasureEstimate extends MeasureTrio {
  readonly workItemId: string;
  readonly stepId: string;
  readonly key: string;
  readonly singlePoint: boolean;
}

/** One measure estimate's whole identity: its step node and its definition key. */
export interface MeasureEstimateKey {
  readonly workItemId: string;
  readonly stepId: string;
  readonly key: string;
}

/**
 * The definition key whose single-point trios stand for the legacy
 * `token_estimate` rows, which stay readable for one release (design D28).
 */
export const TOKEN_ESTIMATE_KEY = 'tokens';

/**
 * Why a trio cannot be written or cleared in a measure (`wbs-measure-budgets`
 * D3, spec "Estimates and facts exist per measure"):
 *
 * - `unknown_measure` (404): the key names no definition of the project's
 *   organization;
 * - `scheduling_measure_estimate` (409): the definition schedules work
 *   (`time`), whose trio stays in `estimate` and is written by `setEstimate`
 *   (D2): a second time trio would be a second truth the solver never reads;
 * - `three_point_forbidden` (409): the definition says `threePoint = false`
 *   (`hours`, `agent_minutes`);
 * - `scale_mismatch` (409): a fractional point on an integer-scale definition.
 */
export type MeasureEstimateRefusal =
  'unknown_measure' | 'scheduling_measure_estimate' | 'three_point_forbidden' | 'scale_mismatch';

/** {@link decideMeasureEstimate}'s answer: the definition the trio is in, or why not. */
export type MeasureEstimateDecision =
  { ok: true; definition: MeasureDefinition } | { ok: false; reason: MeasureEstimateRefusal };

/**
 * Whether a trio in `key` may be written (`trio`) or cleared (null) on a
 * project whose organization holds `definitions` (null when no organization
 * owns it, which answers the seeded four of design D19). Checked in the order
 * unknown, scheduling, three-point, scale, so one request answers one reason.
 *
 * `key` is a definition key: the legacy names (`token_estimate`,
 * `token_actual`) are facts' addresses and are unknown here. The ordering of
 * the trio is not checked here: the command boundary parses it with
 * `EstimateTrio`, and SQLite holds a CHECK beneath that.
 */
export function decideMeasureEstimate(
  definitions: readonly MeasureDefinition[] | null,
  key: string,
  trio: MeasureTrio | null,
): MeasureEstimateDecision {
  const definition = definitionsOrUnowned(definitions).find((each) => each.key === key);
  // Proof: with this lookup made to match any definition, `refuses a key the
  // organization does not define` (measure-estimate.test.ts) accepted
  // `story_points`; watched 2026-10-23.
  if (definition === undefined) return { ok: false, reason: 'unknown_measure' };
  // Proof: with this test removed, `refuses a trio, and a clear, in the
  // scheduling measure` (measure-estimate.test.ts) accepted `time`; watched
  // 2026-10-23.
  if (definition.schedulesWork) return { ok: false, reason: 'scheduling_measure_estimate' };
  // Proof: with this test removed, `refuses a trio where the definition
  // forbids three points` (measure-estimate.test.ts) accepted `hours`;
  // watched 2026-10-23.
  if (!definition.threePoint) return { ok: false, reason: 'three_point_forbidden' };
  // Proof: with the integer test made `false`, `refuses a fractional point on
  // an integer measure, and accepts a clear there` (measure-estimate.test.ts)
  // accepted 1.5 tokens; watched 2026-10-23.
  if (
    trio !== null &&
    definition.scale === 'integer' &&
    ![trio.optimistic, trio.realistic, trio.pessimistic].every(Number.isInteger)
  )
    return { ok: false, reason: 'scale_mismatch' };
  return { ok: true, definition };
}

/** How close a weighted figure must sit to a half to count as one: drift, not a value. */
const HALF_DRIFT = 1e-9;

/**
 * The **expected measure** of one trio: the project's PERT weights applied to
 * the three points ({@link expectedDays}'s arithmetic, which is unit free),
 * then rounded by the definition's scale.
 *
 * An integer measure is rounded half up, once, on the step node's own figure;
 * a parent sums its nodes' rounded figures rather than rounding a sum (the
 * order ADR 0011 fixes for days). A weighted average within {@link HALF_DRIFT}
 * of a half is snapped to it first, so a division's leftover bits cannot turn
 * 2.5 into 2. A real measure keeps the weighted figure as it comes out.
 */
export function expectedMeasure(
  trio: MeasureTrio,
  weights: PertWeights,
  scale: MeasureScale,
): number {
  const weighted = expectedDays(trio, weights);
  if (scale === 'real') return weighted;
  const halves = Math.round(weighted * 2);
  const snapped = Math.abs(weighted * 2 - halves) < HALF_DRIFT ? halves / 2 : weighted;
  // Proof: with `Math.floor` here, `rounds an integer measure half up, once`
  // and the roll-up case (measure-estimate.test.ts) failed; watched 2026-10-23.
  return Math.round(snapped);
}

/**
 * The **measure variance** of one node or subtree: the fact minus the
 * expected measure, positive when the work cost more than expected. Absent
 * (undefined) when either side is absent: a variance against nothing is not
 * a figure anybody stated.
 */
export function measureVariance(
  fact: number | undefined,
  expected: number | undefined,
): number | undefined {
  if (fact === undefined || expected === undefined) return undefined;
  // Proof: with `fact + expected` here, `subtracts the expected measure from
  // the fact` and the spec scenario (measure-estimate.test.ts) failed; watched
  // 2026-10-23.
  return fact - expected;
}
