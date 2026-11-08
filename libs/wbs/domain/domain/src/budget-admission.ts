import { type BudgetReads, readBudgets } from './budget';
import type { NodeAttempt } from './measure-fact';

/**
 * The strict budget that refuses an attempt's start (`wbs-measure-budgets`
 * D69): the work item stating it, its measure key, what remained before this
 * attempt (null when a rate-card mix keeps it from being read, D52) and what
 * this attempt would hold against it (the budget's `holdPerAttempt`, or 0
 * when it states none or the attempt's usage is already known).
 */
export interface BudgetExhausted {
  readonly workItemId: string;
  readonly measure: string;
  readonly remaining: number | null;
  readonly hold: number;
  /** A strict budget a mix of rate cards keeps from being read: its remainder is unknown. */
  readonly blocked: boolean;
}

/**
 * Whether `attempt` may start under the project's budgets (design D69), as
 * {@link readBudgets} reads them with and without it: the first strict budget
 * of the attempt's work item and its ancestors, nearest first and then by key,
 * that has nothing left (`remaining <= 0`), or that this attempt's hold would
 * take below zero, or that a rate-card mix blocks (D52). Null admits it.
 *
 * Advisory and derived budgets never refuse: they report (D5, D38). A strict
 * budget without a hold refuses only once nothing remains, so spending to
 * the cap refuses the next attempt as the panel warns (D61).
 *
 * @throws when a strict budget readable without the attempt is unreadable
 * with it: a running attempt adds a hold and no fact, so the two reads agree
 * on which budgets exist, and a disagreement is a broken fold.
 */
export function findExhaustedBudget(
  reads: BudgetReads,
  attempt: NodeAttempt,
): BudgetExhausted | null {
  const parentOf = new Map(reads.rows.map((row) => [row.id, row.parentId] as const));
  const strictOnChain = (from: string): boolean => {
    for (let at: string | null | undefined = from; typeof at === 'string';) {
      const here = at;
      if (reads.budgets.some((each) => each.workItemId === here && each.policy === 'strict'))
        return true;
      at = parentOf.get(at);
    }
    return false;
  };
  // Only a stated budget is strict (D38), so a chain without one admits.
  if (!strictOnChain(attempt.workItemId)) return null;
  const before = readBudgets(reads);
  const after = readBudgets({ ...reads, attempts: [...reads.attempts, attempt] });
  for (let at: string | null | undefined = attempt.workItemId; typeof at === 'string';) {
    const here = at;
    const refusals: BudgetExhausted[] = [];
    for (const [key, reading] of before.readings.get(here) ?? []) {
      if (reading.policy !== 'strict') continue;
      const held = after.readings.get(here)?.get(key);
      if (held === undefined)
        throw new Error(`the strict ${key} budget of ${here} vanished when an attempt was added`);
      const hold = held.remaining === reading.remaining ? 0 : (reading.holdPerAttempt ?? 0);
      // Proof: with `held.remaining < 0` alone (an exhausted budget without a
      // hold admitted), `refuses at a strict budget spent to its cap, hold or
      // none` (budget-admission.test.ts) admitted the start; watched 2026-10-24.
      // With `reading.remaining <= 0` alone (this attempt's hold not added),
      // `admits while the hold fits and refuses the attempt it would not`
      // admitted the second start; watched 2026-10-24.
      if (reading.remaining <= 0 || held.remaining < 0)
        refusals.push({
          workItemId: here,
          measure: key,
          remaining: reading.remaining,
          hold,
          blocked: false,
        });
    }
    for (const [key, { policy }] of before.blocked.get(here) ?? []) {
      // Proof: with this policy test removed, `never refuses on an advisory
      // or derived budget, readable or blocked` (budget-admission.test.ts)
      // refused on the blocked advisory one; watched 2026-10-24.
      if (policy !== 'strict') continue;
      const stated = reads.budgets.find((each) => each.workItemId === here && each.key === key);
      refusals.push({
        workItemId: here,
        measure: key,
        remaining: null,
        hold: stated?.holdPerAttempt ?? 0,
        blocked: true,
      });
    }
    const first = refusals.sort((left, right) => left.measure.localeCompare(right.measure)).at(0);
    if (first !== undefined) return first;
    at = parentOf.get(at);
  }
  return null;
}
