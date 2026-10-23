import { expectedDays, type PertWeights } from './estimate';
import type { MeasureDefinition } from './measure-definition';
import { definitionsOrUnowned } from './measure-fact';
import type { MoneyBasis } from './money-basis';
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
  /**
   * The currency and rate card a money trio was priced with (design D43);
   * absent on every other measure, and on a money trio written before bases
   * were recorded.
   */
  readonly basis?: MoneyBasis;
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

/** The most decimal places a weight is scaled by before it is taken as inexact. */
const MOST_WEIGHT_DECIMALS = 12;

/**
 * `value` as an integer times `10^-decimals` when it is one with at most
 * {@link MOST_WEIGHT_DECIMALS} places (`1.2` is 12 × 10^-1), else null. The
 * decimal a person typed, recovered from its double: the scaled value must
 * divide back to exactly the same double.
 */
function decimalPlacesOf(value: number): number | null {
  for (let decimals = 0; decimals <= MOST_WEIGHT_DECIMALS; decimals++) {
    const scale = 10 ** decimals;
    if (Math.round(value * scale) / scale === value) return decimals;
  }
  return null;
}

/**
 * The weighted average of an integer trio rounded half up, in exact integer
 * arithmetic: weights scaled to integers by their common decimal places, then
 * `floor((2N + D) / 2D)` over BigInts. Null when a point is not an integer or
 * a weight is not a short decimal, where the caller falls back to doubles.
 *
 * Exact because a half is a boundary no tolerance can find at every
 * magnitude: under weights 1/1.2/1.4 the trio 2776814/17939787/24687947
 * weighs exactly 16352134.5, which doubles compute as 16352134.499999998.
 */
function exactHalfUp(trio: MeasureTrio, weights: PertWeights): number | null {
  const points = [trio.optimistic, trio.realistic, trio.pessimistic];
  if (!points.every(Number.isSafeInteger)) return null;
  const coefficients = [weights.optimistic, weights.realistic, weights.pessimistic];
  let decimals = 0;
  for (const coefficient of coefficients) {
    const places = decimalPlacesOf(coefficient);
    if (places === null) return null;
    decimals = Math.max(decimals, places);
  }
  const scaled = coefficients.map((coefficient) =>
    BigInt(Math.round(coefficient * 10 ** decimals)),
  );
  const [wo, wr, wp] = scaled as [bigint, bigint, bigint];
  const numerator =
    wo * BigInt(trio.optimistic) + wr * BigInt(trio.realistic) + wp * BigInt(trio.pessimistic);
  const denominator = wo + wr + wp;
  // Proof: with `numerator / denominator` (truncation) here, `rounds an
  // integer measure half up, once` and the random-weights property
  // (measure-estimate.test.ts) failed; watched 2026-10-23.
  return Number((2n * numerator + denominator) / (2n * denominator));
}

/** How close a weighted figure must sit to a half to count as one, relative to its size. */
const HALF_DRIFT = 1e-12;

/**
 * The **expected measure** of one trio: the project's PERT weights applied to
 * the three points ({@link expectedDays}'s arithmetic, which is unit free),
 * then rounded by the definition's scale.
 *
 * An integer measure is rounded half up, once, on the step node's own figure;
 * a parent sums its nodes' rounded figures rather than rounding a sum (the
 * order ADR 0011 fixes for days). The rounding is exact for integer points
 * and decimal weights ({@link exactHalfUp}); otherwise (a legacy fractional
 * token estimate, a weight no short decimal names) a weighted average within
 * a relative {@link HALF_DRIFT} of a half is snapped to it first. A real
 * measure keeps the weighted figure as it comes out.
 */
export function expectedMeasure(
  trio: MeasureTrio,
  weights: PertWeights,
  scale: MeasureScale,
): number {
  const weighted = expectedDays(trio, weights);
  if (scale === 'real') return weighted;
  // Proof: with this exact path skipped, `rounds a third down at a magnitude
  // where any relative tolerance would call it a half` (measure-estimate.test.ts)
  // read 333333333334; watched 2026-10-23. (The ten-million case is held by
  // both paths.)
  const exact = exactHalfUp(trio, weights);
  if (exact !== null) return exact;
  const halves = Math.round(weighted * 2);
  const snapped =
    Math.abs(weighted * 2 - halves) < HALF_DRIFT * Math.max(1, Math.abs(weighted * 2))
      ? halves / 2
      : weighted;
  // Proof: with `Math.floor` here, `rounds a legacy fractional token estimate
  // half up` (measure-estimate.test.ts) failed; watched 2026-10-23.
  return Math.round(snapped);
}

/**
 * A computed figure in a measure's scale that is not a weighted trio: the
 * derived budget's cap (`wbs-measure-budgets` design D38). Unchanged on a real
 * measure; on an integer one rounded half up after snapping a figure within
 * {@link HALF_DRIFT} (relative) of a half to it, the floating-point leg of
 * {@link expectedMeasure}'s rounding.
 */
export function roundToScale(figure: number, scale: MeasureScale): number {
  if (scale === 'real') return figure;
  const halves = Math.round(figure * 2);
  const snapped =
    Math.abs(figure * 2 - halves) < HALF_DRIFT * Math.max(1, Math.abs(figure * 2))
      ? halves / 2
      : figure;
  // Proof: with `Math.floor` here, `derives a budget from the pessimistic
  // points times the project factor …` (budget.test.ts) capped B at 601;
  // watched 2026-10-23.
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
