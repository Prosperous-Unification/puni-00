import {
  factMetricOf,
  type MeasureDefinition,
  measureVariance,
  type PertWeights,
  rollUpMeasureEstimates,
  type StoredMeasureEstimate,
} from '@wbs/domain';

import type { MeasureEstimateReading, NumberedWorkItem } from '../../service/numbered-work-item';

/**
 * The row read's rows with `measureEstimates` attached (`wbs-measure-budgets`
 * task 2.2): per definition key held by any trio, the one-measure fold
 * {@link rollUpMeasureEstimates} under the project's `weights` and the
 * definition's scale, and beside each figure the variance against the row's
 * own rolled-up fact in that measure ({@link factMetricOf}: `token_actual`
 * for tokens).
 *
 * Variance is folded the same way both sides are — the subtree's summed facts
 * minus its summed expected measures — and is absent where either is (design
 * D29). A row holding no figure in any key keeps no `measureEstimates` field.
 *
 * @throws when a trio names a key `definitions` does not hold: the stores
 * refuse to write one and `deleteMeasure` refuses a referenced definition, so
 * such a trio is drifted trusted state, never a figure to default.
 */
export function withMeasureEstimates<Row extends NumberedWorkItem>(
  rows: readonly Row[],
  estimates: readonly StoredMeasureEstimate[],
  definitions: readonly MeasureDefinition[],
  weights: PertWeights,
): Row[] {
  if (estimates.length === 0) return [...rows];
  const keys = [...new Set(estimates.map(({ key }) => key))].sort();
  const folds = keys.map((key) => {
    const definition = definitions.find((each) => each.key === key);
    if (definition === undefined)
      throw new Error(`a measure estimate names ${key}, which no definition of its project holds`);
    return [key, rollUpMeasureEstimates(rows, estimates, key, weights, definition.scale)] as const;
  });
  return rows.map((row) => {
    const byKey: Record<string, Record<string, MeasureEstimateReading>> = {};
    for (const [key, fold] of folds) {
      const held = fold.get(row.id);
      if (held === undefined || held.size === 0) continue;
      const facts = row.measures[factMetricOf(key)] ?? {};
      byKey[key] = Object.fromEntries(
        [...held].map(([stepId, figure]): [string, MeasureEstimateReading] => {
          const variance = measureVariance(facts[stepId], figure.expected);
          return [stepId, variance === undefined ? figure : { ...figure, variance }];
        }),
      );
    }
    return Object.keys(byKey).length === 0 ? row : { ...row, measureEstimates: byKey };
  });
}
