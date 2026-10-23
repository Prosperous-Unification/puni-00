import type { BudgetReading, MixedRateCards } from '@wbs/domain';

import type { StartableWork } from './startable';

/** A budget as the headroom read names it: the reading and the work item stating it. */
export interface BoundingBudget extends BudgetReading {
  /** The work item whose budget this is: the step's own, or an ancestor's. */
  readonly workItemId: string;
}

/** One claimed or startable step with its tightest budget per measure. */
export interface StepHeadroom {
  readonly workItemId: string;
  readonly stepId: string;
  readonly state: 'startable' | 'claimed';
  /** By definition key; empty when neither the work item nor an ancestor has a budget. */
  readonly budgets: Record<string, BoundingBudget>;
}

/**
 * The headroom read (`wbs-measure-budgets` task 3.2, design D41): what the
 * Twilight coordinator refuses the next attempt on. Startable steps first,
 * fitting or not, in the startable read's order, then claimed steps.
 */
export interface BudgetHeadroom {
  readonly steps: StepHeadroom[];
}

/** The headroom read refused: a budget it would report sums two rate cards (design D44). */
export interface MixedHeadroom {
  readonly kind: 'mixed_rate_cards';
  readonly digests: MixedRateCards;
}

/**
 * Every claimed or startable step of `startable` with, per measure, the
 * budget with the least `remaining` among its work item and its ancestors:
 * a parent's budget bounds its subtree, so the tightest of the chain is the
 * one an attempt would cross first.
 *
 * Refused `mixed_rate_cards`, naming the first pair found, when any row of a
 * reported step's chain mixes rate cards in a key: its budget there cannot be
 * read, and a coordinator reading none would admit the attempt unbounded.
 */
export function findBudgetHeadroom(
  rows: readonly { readonly id: string; readonly parentId: string | null }[],
  startable: StartableWork,
  readings: ReadonlyMap<string, ReadonlyMap<string, BudgetReading>>,
  mixed: ReadonlyMap<string, ReadonlyMap<string, MixedRateCards>>,
): BudgetHeadroom | MixedHeadroom {
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
    const budgets = new Map<string, BoundingBudget>();
    for (let at: string | null | undefined = node.workItemId; typeof at === 'string';) {
      // Proof: with this refusal skipped, `refuses the headroom read while a
      // bounding budget mixes rate cards, naming both` (budget-command.test.ts)
      // answered the step with no cost budget; watched 2026-10-23.
      const mix = mixed.get(at)?.values().next().value;
      if (mix !== undefined) return { kind: 'mixed_rate_cards', digests: mix };
      for (const [key, reading] of readings.get(at) ?? []) {
        const held = budgets.get(key);
        // Proof: with `>=` here (the nearest budget kept), `reports the
        // tightest budget among a step's work item and its ancestors`
        // (budget-headroom.test.ts) read the leaf's looser one; watched 2026-10-23.
        if (held === undefined || reading.remaining < held.remaining)
          budgets.set(key, { ...reading, workItemId: at });
      }
      at = parentOf.get(at);
    }
    steps.push({ ...node, budgets: Object.fromEntries(budgets) });
  }
  return { steps };
}
