import type { BudgetRead, BudgetReading, BudgetSource, MixedRateCards } from '@wbs/domain';

import type { StartableWork } from './startable';

/** A budget as the headroom read names it: the reading and the work item stating it. */
export interface BoundingBudget extends BudgetReading {
  /** The work item whose budget this is: the step's own, or an ancestor's. */
  readonly workItemId: string;
}

/**
 * A budget in the chain that cannot be read (design D44, D52): the work item
 * stating it, the pair of bases that blocks it, and its source.
 */
export interface BlockedBound {
  readonly workItemId: string;
  readonly bases: MixedRateCards;
  readonly source: BudgetSource;
}

/**
 * One measure's headroom over one step (design D41, D46, D52): the tightest
 * readable **strict** budget among its work item and ancestors and apart the
 * tightest readable advisory or derived one, each with the nearest budget of
 * that policy a rate-card mix keeps from being read in `blocked`.
 *
 * A reading for display and ranking: the write decides. `startAttempt`
 * refuses `budget_exhausted` inside its unit of work when `strict.remaining
 * <= 0`, the start's hold would take it below zero, or `blocked.strict` is
 * present (its remainder is unknown, never unbounded); advisory budgets,
 * read or blocked, never refuse (`findExhaustedBudget`, design D69).
 */
export interface MeasureHeadroom {
  readonly strict?: BoundingBudget;
  readonly advisory?: BoundingBudget;
  readonly blocked?: { readonly strict?: BlockedBound; readonly advisory?: BlockedBound };
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
 * The headroom read (`wbs-measure-budgets` task 3.2, design D41): what a
 * coordinator ranks and shows; the start itself is admitted inside its write
 * (design D69). Startable steps first,
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
 * is reported on that step and key only, with its policy (design D52), so a
 * mix in `cost` leaves `tokens` and every other step alone (design D44).
 *
 * Not a snapshot: `startable` and `read` come from separate reads, so a write
 * between them can pair a step with budgets a moment newer (design D50).
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
      {
        strict?: BoundingBudget;
        advisory?: BoundingBudget;
        blockedStrict?: BlockedBound;
        blockedAdvisory?: BlockedBound;
      }
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
      for (const [key, { bases, policy, source }] of read.blocked.get(at) ?? []) {
        const held = budgets.get(key) ?? {};
        // The nearest blocked budget per policy: walking up, the first one
        // found of each policy stays.
        // Proof: with every blocked budget kept in the advisory slot, `keeps a
        // blocked strict budget behind a nearer blocked advisory one`
        // (budget-headroom.test.ts) read no blocked strict; watched 2026-10-23.
        if (policy === 'strict') held.blockedStrict ??= { workItemId: at, bases, source };
        else held.blockedAdvisory ??= { workItemId: at, bases, source };
        budgets.set(key, held);
      }
      at = parentOf.get(at);
    }
    const named: Record<string, MeasureHeadroom> = {};
    for (const [key, { strict, advisory, blockedStrict, blockedAdvisory }] of budgets) {
      const blocked =
        blockedStrict === undefined && blockedAdvisory === undefined
          ? {}
          : {
              blocked: {
                ...(blockedStrict === undefined ? {} : { strict: blockedStrict }),
                ...(blockedAdvisory === undefined ? {} : { advisory: blockedAdvisory }),
              },
            };
      named[key] = {
        ...(strict === undefined ? {} : { strict }),
        ...(advisory === undefined ? {} : { advisory }),
        ...blocked,
      };
    }
    steps.push({ ...node, budgets: named });
  }
  return { steps };
}
