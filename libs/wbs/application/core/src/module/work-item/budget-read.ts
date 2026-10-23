import { type BudgetReading, factMetricOf, type MixedRateCards } from '@wbs/domain';

import type { NumberedWorkItem, RateCardMixes } from '../../service/numbered-work-item';

/** The rows and keys whose money figures mix bases, facts and trios apart (design D44). */
export interface RowMixes {
  readonly facts: ReadonlyMap<string, ReadonlyMap<string, MixedRateCards>>;
  readonly estimates: ReadonlyMap<string, ReadonlyMap<string, MixedRateCards>>;
}

/**
 * The row read's rows with `budgets` attached and the money sums that mix
 * bases taken off (`wbs-measure-budgets` tasks 3.1 and 3.3, design D39 and
 * D44).
 *
 * `readings` is {@link readBudgets}' answer. A key whose facts mix is removed
 * from `measures` (under {@link factMetricOf}); a key whose trios mix from
 * `measureEstimates`; each named per kind in `mixedRateCards`. A row with
 * neither budgets nor a mix comes back as it was, byte for byte.
 */
export function withBudgets<Row extends NumberedWorkItem>(
  rows: readonly Row[],
  readings: ReadonlyMap<string, ReadonlyMap<string, BudgetReading>>,
  mixes: RowMixes,
): Row[] {
  return rows.map((row) => {
    const budgets = readings.get(row.id);
    const factMixes = mixes.facts.get(row.id);
    const trioMixes = mixes.estimates.get(row.id);
    const mixed = factMixes !== undefined || trioMixes !== undefined;
    if ((budgets === undefined || budgets.size === 0) && !mixed) return row;
    let next: Row = row;
    if (mixed) {
      const named: Record<string, RateCardMixes> = {};
      for (const [key, pair] of factMixes ?? []) named[key] = { facts: pair };
      for (const [key, pair] of trioMixes ?? []) named[key] = { ...named[key], estimates: pair };
      const metrics = new Set([...(factMixes?.keys() ?? [])].map(factMetricOf));
      // Proof: with this strip skipped, `reads a parent whose leaves hold two
      // rate cards as mixed, naming both, with no cost sum`
      // (budget-command.test.ts) read the mixed sum; watched 2026-10-23.
      const measures = Object.fromEntries(
        Object.entries(row.measures).filter(([metric]) => !metrics.has(metric)),
      );
      next = { ...next, measures, mixedRateCards: named };
      if (row.measureEstimates !== undefined && trioMixes !== undefined) {
        // Proof: with the unfiltered trios kept, `reads a leaf whose trio and
        // fact sit on two cards as unmixed, and strips a mix among trios from
        // the estimates alone` (budget-command.test.ts) read the mixed trio
        // sum; watched 2026-10-23.
        const estimates = Object.fromEntries(
          Object.entries(row.measureEstimates).filter(([key]) => !trioMixes.has(key)),
        );
        if (Object.keys(estimates).length === 0) delete next.measureEstimates;
        else next.measureEstimates = estimates;
      }
    }
    if (budgets !== undefined && budgets.size > 0)
      next = { ...next, budgets: Object.fromEntries(budgets) };
    return next;
  });
}
