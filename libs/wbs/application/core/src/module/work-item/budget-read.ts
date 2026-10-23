import { type BudgetReading, factMetricOf, type MixedRateCards } from '@wbs/domain';

import type { NumberedWorkItem } from '../../service/numbered-work-item';

/**
 * The row read's rows with `budgets` attached and the money keys whose sums
 * mix rate cards taken off (`wbs-measure-budgets` tasks 3.1 and 3.3, design
 * D39 and D44).
 *
 * `readings` is {@link readBudgets}' answer, computed with `mixed` so no
 * reading exists where a key mixes. On a mixed row and key the facts in
 * `measures` (under {@link factMetricOf}) and the trios in `measureEstimates`
 * are removed and the pair of digests named in `mixedRateCards`. A row with
 * neither budgets nor a mix comes back as it was, byte for byte.
 */
export function withBudgets<Row extends NumberedWorkItem>(
  rows: readonly Row[],
  readings: ReadonlyMap<string, ReadonlyMap<string, BudgetReading>>,
  mixed: ReadonlyMap<string, ReadonlyMap<string, MixedRateCards>>,
): Row[] {
  return rows.map((row) => {
    const budgets = readings.get(row.id);
    const mixes = mixed.get(row.id);
    if ((budgets === undefined || budgets.size === 0) && mixes === undefined) return row;
    let next: Row = row;
    if (mixes !== undefined) {
      const metrics = new Set([...mixes.keys()].map(factMetricOf));
      const measures = Object.fromEntries(
        Object.entries(row.measures).filter(([metric]) => !metrics.has(metric)),
      );
      const estimates =
        row.measureEstimates === undefined
          ? undefined
          : Object.fromEntries(
              Object.entries(row.measureEstimates).filter(([key]) => !mixes.has(key)),
            );
      // Proof: with this strip skipped, `reads a parent whose leaves hold two
      // rate cards as mixed, naming both, with no cost sum`
      // (budget-command.test.ts) read the mixed sum; watched 2026-10-23.
      next = { ...next, measures, mixedRateCards: Object.fromEntries(mixes) };
      if (estimates !== undefined) {
        if (Object.keys(estimates).length === 0) delete next.measureEstimates;
        else next.measureEstimates = estimates;
      }
    }
    if (budgets !== undefined && budgets.size > 0)
      next = { ...next, budgets: Object.fromEntries(budgets) };
    return next;
  });
}
