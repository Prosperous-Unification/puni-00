import type { BudgetRead, BudgetReading, MixedRateCards } from '@wbs/domain';

import type { StartableWork } from './startable';

/** A budget as the headroom read names it: the reading and the work item stating it. */
export interface BoundingBudget extends BudgetReading {
  /** The work item whose budget this is: the step's own, or an ancestor's. */
  readonly workItemId: string;
}

/**
 * One measure's headroom over one step (design D41, D46): the tightest
 * **strict** budget among its work item and ancestors, which the coordinator
 * refuses on, and apart the tightest advisory or derived one, which it only
 * reports. `mixedRateCards` names a budget in the chain that cannot be read
 * because a sum it needs mixes bases (design D44); the coordinator must then
 * treat the key as unknown, never as unbounded.
 */
export interface MeasureHeadroom {
  readonly strict?: BoundingBudget;
  readonly advisory?: BoundingBudget;
  readonly mixedRateCards?: MixedRateCards;
  /** The work item whose budget the mix blocks, beside `mixedRateCards`. */
  readonly mixedAt?: string;
}

/** One claimed or startable step with its headroom per measure. */
export interface StepHeadroom {
  readonly workItemId: string;
  readonly stepId: string;
  readonly state: 'startable' | 'claimed';
  /** By definition key; empty when neither the work item nor an ancestor has a budget. */
  readonly budgets: Record<string, MeasureHeadroom>;
}

/**
 * The headroom read (`wbs-measure-budgets` task 3.2, design D41): what the
 * Twilight coordinator refuses the next attempt on. Startable steps first,
 * fitting or not, in the startable read's order, then claimed steps.
 */
export interface BudgetHeadroom {
  readonly steps: StepHeadroom[];
}

/**
 * Every claimed or startable step of `startable` with, per measure, the
 * strict and the advisory budget with the least `remaining` among its work
 * item and its ancestors: a parent's budget bounds its subtree, so the
 * tightest of the chain is the one an attempt would cross first, and an
 * advisory one never hides a strict one (design D46).
 *
 * Never refused as a whole: a budget in the chain that `read.blocked` names
 * is reported on that step and key only, so a mix in `cost` leaves `tokens`
 * and every other step alone (design D44).
 */
export function findBudgetHeadroom(
  rows: readonly { readonly id: string; readonly parentId: string | null }[],
  startable: StartableWork,
  read: BudgetRead,
): BudgetHeadroom {
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId] as const));
  const nodes = [
    ...[...startable.leaves, ...startable.doesNotFit].flatMap((leaf) =>
      leaf.stepIds.map((stepId) => ({
        workItemId: leaf.workItemId,
        stepId,
        state: 'startable' as const,
      })),
    ),
    ...startable.claimed.map(({ workItemId, stepId }) => ({
      workItemId,
      stepId,
      state: 'claimed' as const,
    })),
  ];
  const steps: StepHeadroom[] = [];
  for (const node of nodes) {
    const budgets = new Map<
      string,
      { strict?: BoundingBudget; advisory?: BoundingBudget; mix?: [MixedRateCards, string] }
    >();
    for (let at: string | null | undefined = node.workItemId; typeof at === 'string';) {
      for (const [key, reading] of read.readings.get(at) ?? []) {
        const held = budgets.get(key) ?? {};
        // Proof: with the policy split removed (one tightest budget whatever
        // its policy), `keeps an exhausted strict budget beside a looser
        // advisory one` (budget-headroom.test.ts) lost the strict one; watched 2026-10-23.
        const slot = reading.policy === 'strict' ? 'strict' : 'advisory';
        const tightest = held[slot];
        // Proof: with `>=` here (the nearest budget kept), `reports the
        // tightest budget among a step's work item and its ancestors`
        // (budget-headroom.test.ts) read the leaf's looser one; watched 2026-10-23.
        if (tightest === undefined || reading.remaining < tightest.remaining)
          held[slot] = { ...reading, workItemId: at };
        budgets.set(key, held);
      }
      for (const [key, pair] of read.blocked.get(at) ?? []) {
        const held = budgets.get(key) ?? {};
        // Proof: with this mark skipped, `names a blocked cost budget on its
        // step alone, tokens kept` (budget-headroom.test.ts) read no mix;
        // watched 2026-10-23.
        held.mix ??= [pair, at];
        budgets.set(key, held);
      }
      at = parentOf.get(at);
    }
    const named: Record<string, MeasureHeadroom> = {};
    for (const [key, { strict, advisory, mix }] of budgets)
      named[key] = {
        ...(strict === undefined ? {} : { strict }),
        ...(advisory === undefined ? {} : { advisory }),
        ...(mix === undefined ? {} : { mixedRateCards: mix[0], mixedAt: mix[1] }),
      };
    steps.push({ ...node, budgets: named });
  }
  return { steps };
}
