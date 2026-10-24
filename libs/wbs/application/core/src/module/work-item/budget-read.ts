import {
  type BudgetReading,
  factMetricOf,
  type MixedRateCards,
  type MoneyBasis,
} from '@wbs/domain';

import type {
  NumberedWorkItem,
  RateCardMixes,
  RowMoneyBases,
} from '../../service/numbered-work-item';

/** The rows and keys whose money figures mix bases, facts and trios apart (design D44). */
export interface RowMixes {
  readonly facts: ReadonlyMap<string, ReadonlyMap<string, MixedRateCards>>;
  readonly estimates: ReadonlyMap<string, ReadonlyMap<string, MixedRateCards>>;
}

/** The rows and keys whose money figures share one priced basis, per kind (design D49). */
export interface RowBases {
  readonly facts: ReadonlyMap<string, ReadonlyMap<string, MoneyBasis>>;
  readonly estimates: ReadonlyMap<string, ReadonlyMap<string, MoneyBasis>>;
}

/**
 * The row read's rows with `budgets` attached and the money sums that mix
 * bases taken off (`wbs-measure-budgets` tasks 3.1 and 3.3, design D39 and
 * D44).
 *
 * `readings` is {@link readBudgets}' answer. A key whose facts mix is removed
 * from `measures` (under {@link factMetricOf}); a key whose trios mix from
 * `measureEstimates`; each named per kind in `mixedRateCards`. A row with
 * neither budgets nor a mix comes back as it was, byte for byte, unless a
 * key's figures share one priced basis, which `moneyBases` names per kind
 * (design D49).
 */
export function withBudgets<Row extends NumberedWorkItem>(
  rows: readonly Row[],
  readings: ReadonlyMap<string, ReadonlyMap<string, BudgetReading>>,
  mixes: RowMixes,
  bases: RowBases,
): Row[] {
  return rows.map((row) => {
    const budgets = readings.get(row.id);
    const factMixes = mixes.facts.get(row.id);
    const trioMixes = mixes.estimates.get(row.id);
    const mixed = factMixes !== undefined || trioMixes !== undefined;
    const named: Record<string, RowMoneyBases> = {};
    for (const [key, basis] of bases.facts.get(row.id) ?? []) named[key] = { facts: basis };
    for (const [key, basis] of bases.estimates.get(row.id) ?? [])
      named[key] = { ...named[key], estimates: basis };
    const priced = Object.keys(named).length > 0;
    if ((budgets === undefined || budgets.size === 0) && !mixed && !priced) return row;
    // Proof: with `moneyBases` left off, `names the one basis a row's cost
    // sums are in, per kind, and none on a mixed parent` (budget-command.test.ts)
    // read none; watched 2026-10-23.
    let next: Row = priced ? { ...row, moneyBases: named } : row;
    if (mixed) {
      const pairs: Record<string, RateCardMixes> = {};
      for (const [key, pair] of factMixes ?? []) pairs[key] = { facts: pair };
      for (const [key, pair] of trioMixes ?? []) pairs[key] = { ...pairs[key], estimates: pair };
      const metrics = new Set([...(factMixes?.keys() ?? [])].map(factMetricOf));
      // Proof: with this strip skipped, `reads a parent whose leaves hold two
      // rate cards as mixed, naming both, with no cost sum`
      // (budget-command.test.ts) read the mixed sum; watched 2026-10-23.
      const measures = Object.fromEntries(
        Object.entries(row.measures).filter(([metric]) => !metrics.has(metric)),
      );
      next = { ...next, measures, mixedRateCards: pairs };
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
    // `spent` is the headroom read's: the row's `budgets` keep the bytes they
    // had (`wbs-measure-budgets` D49). `holdPerAttempt` rides along where a
    // hold is stated (D60), so an editor can show the hold it would replace;
    // a budget with none answers exactly the bytes it did.
    // Proof: with `spent` kept, `sets, replaces and clears a budget, undoably`
    // (budget-command.test.ts) read a `spent` the row never carried; watched 2026-10-23.
    // Proof: with `holdPerAttempt` stripped again, `holds the allowance of each
    // running attempt…` (budget-command.test.ts) read no `holdPerAttempt` on
    // the row; watched 2026-10-23.
    if (budgets !== undefined && budgets.size > 0)
      next = {
        ...next,
        budgets: Object.fromEntries(
          [...budgets].map(([key, { spent: _spent, ...reading }]) => [key, reading]),
        ),
      };
    return next;
  });
}
