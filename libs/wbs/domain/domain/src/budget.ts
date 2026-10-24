import { DEFAULT_PERT_WEIGHTS } from './estimate';
import type { MeasureDefinition } from './measure-definition';
import { roundToScale, type StoredMeasureEstimate } from './measure-estimate';
import { definitionsOrUnowned, factMetricOf, type NodeAttempt } from './measure-fact';
import type { MixedRateCards } from './money-basis';
import { rollUpMeasureEstimates, rollUpMeasures } from './roll-up';
import type { StoredMeasure } from './step-values';

/**
 * How a budget is meant to be held (`wbs-measure-budgets` D5): `strict`
 * refuses an attempt's start once nothing remains or its hold would not fit
 * (`findExhaustedBudget`, design D69), `advisory` only reports. WBS records
 * facts past either (spec "Budgets are rows").
 */
export const BUDGET_POLICIES = ['strict', 'advisory'] as const;
export type BudgetPolicy = (typeof BUDGET_POLICIES)[number];

/** Whether a stored or posted value is one of the two budget policies. */
export function isBudgetPolicy(value: unknown): value is BudgetPolicy {
  return typeof value === 'string' && (BUDGET_POLICIES as readonly string[]).includes(value);
}

/**
 * One stated **budget** (CONTEXT.md): a cap on one measure for one work item,
 * bounding its whole subtree on every step (design D36, D37). `key` is the
 * definition key, never a legacy name. `holdPerAttempt` is what each running
 * attempt of unknown usage holds against it, in the measure's unit, or null
 * when the budget holds nothing (design D40).
 */
export interface StoredBudget {
  readonly workItemId: string;
  readonly key: string;
  readonly cap: number;
  readonly policy: BudgetPolicy;
  readonly holdPerAttempt: number | null;
}

/** One budget's whole identity: its work item and its definition key. */
export interface BudgetKey {
  readonly workItemId: string;
  readonly key: string;
}

/**
 * Why a budget cannot be set or cleared in a measure (design D35, D36), in
 * the order checked:
 *
 * - `unknown_measure` (404): no definition of the project's organization;
 * - `scheduling_measure_budget` (409): the scheduling measure (`time`), whose
 *   bound is a deadline the solver reads, not a budget;
 * - `scale_mismatch` (409): a fraction on an integer measure.
 *
 * A negative or non-finite cap or hold is not decided here: the command
 * boundary refuses it (`invalid_budget`, 400, `parseBudget`) and a journal
 * replay is checked by `isBudgetRecord` (design D36).
 */
export type BudgetRefusal = 'unknown_measure' | 'scheduling_measure_budget' | 'scale_mismatch';

/** {@link decideBudget}'s answer: the definition the budget is in, or why not. */
export type BudgetDecision =
  { ok: true; definition: MeasureDefinition } | { ok: false; reason: BudgetRefusal };

/**
 * Whether a budget in `key` may be set with `figures`, or cleared (null), on a
 * project whose organization holds `definitions` (null when no organization
 * owns it: the seeded four of design D19). A derived measure
 * (`agent_minutes`) may hold a budget: nobody types its facts, but they are
 * spent all the same.
 */
export function decideBudget(
  definitions: readonly MeasureDefinition[] | null,
  key: string,
  figures: { readonly cap: number; readonly holdPerAttempt: number | null } | null,
): BudgetDecision {
  const definition = definitionsOrUnowned(definitions).find((each) => each.key === key);
  // Proof: with this lookup made to match any definition, `refuses a key the
  // organization does not define, legacy names included` (budget.test.ts)
  // accepted `token_actual`; watched 2026-10-23.
  if (definition === undefined) return { ok: false, reason: 'unknown_measure' };
  // Proof: with this test removed, `refuses a budget, and a clear, in the
  // scheduling measure` (budget.test.ts) accepted `time`; watched 2026-10-23.
  if (definition.schedulesWork) return { ok: false, reason: 'scheduling_measure_budget' };
  if (figures === null) return { ok: true, definition };
  const stated = [
    figures.cap,
    ...(figures.holdPerAttempt === null ? [] : [figures.holdPerAttempt]),
  ];
  // Proof: with the integer test made `false`, `refuses a fraction on an
  // integer measure` (budget.test.ts) accepted 1.5 tokens; watched 2026-10-23.
  if (definition.scale === 'integer' && !stated.every(Number.isInteger))
    return { ok: false, reason: 'scale_mismatch' };
  return { ok: true, definition };
}

/** Where a budget reading's cap came from: a person, or the pessimistic point (design D38). */
export type BudgetSource = 'stated' | 'derived';

/**
 * One row's budget in one measure as the row read answers it (design D39):
 * the cap, its policy and source, what remains after the subtree's facts and
 * holds (negative past the cap), whether the facts alone crossed it, and,
 * only where the budget states a hold, what running attempts hold.
 */
export interface BudgetReading {
  cap: number;
  policy: BudgetPolicy;
  source: BudgetSource;
  /**
   * The subtree's facts in the key (design D39). The headroom read answers
   * it; the row read leaves it out, so its `budgets` keep their bytes
   * (`wbs-measure-budgets` D49).
   */
  spent: number;
  /**
   * The stated budget's allowance per running attempt of unknown usage, only
   * where it states one (design D40). The headroom read answers it; the row
   * read leaves it out, as it does `spent` (D49).
   */
  holdPerAttempt?: number;
  remaining: number;
  exceeded: boolean;
  held?: number;
}

/** Everything {@link readBudgets} folds, all of one project. */
export interface BudgetReads {
  readonly rows: readonly { readonly id: string; readonly parentId: string | null }[];
  /** The definitions the project's figures are in (`definitionsOrUnowned`). */
  readonly definitions: readonly MeasureDefinition[];
  readonly budgets: readonly StoredBudget[];
  /** Every fact, the derived `agent_minutes` ones included (design D20). */
  readonly facts: readonly StoredMeasure[];
  readonly estimates: readonly StoredMeasureEstimate[];
  /** Every attempt; only running ones hold. */
  readonly attempts: readonly NodeAttempt[];
  /** The project's budget factor (design D38). */
  readonly factor: number;
  /** Rows and keys whose money **facts** mix bases: no spend can be summed there (design D44). */
  readonly mixedFacts: ReadonlyMap<string, ReadonlyMap<string, MixedRateCards>>;
  /** Rows and keys whose money **trios** mix bases: no derived cap can be summed there. */
  readonly mixedEstimates: ReadonlyMap<string, ReadonlyMap<string, MixedRateCards>>;
}

/**
 * {@link readBudgets}' answer: the readings, and apart the rows and keys
 * where a budget exists (stated, or derivable) but cannot be read because a
 * sum it needs mixes rate cards, with the pair that blocks it (design D44).
 */
export interface BudgetRead {
  readonly readings: Map<string, Map<string, BudgetReading>>;
  readonly blocked: Map<string, Map<string, BlockedBudget>>;
}

/**
 * A budget that exists but cannot be read (design D44, D52): the pair of
 * bases that blocks it, and its policy and source, so a reader can still tell
 * a blocked strict budget, which refuses a start (design D69), from a blocked
 * advisory or derived one, which it never does.
 */
export interface BlockedBudget {
  readonly bases: MixedRateCards;
  readonly policy: BudgetPolicy;
  readonly source: BudgetSource;
}

/**
 * Every row's budgets by definition key (`wbs-measure-budgets` D5, tasks 3.1
 * and 3.2): the stated budget where one is stored, else a derived one where
 * the row's subtree holds a trio in the key (design D38), each read against
 * the subtree's facts summed over every step and the holds of its running
 * attempts (design D39, D40).
 *
 * A derived budget exists only where every leaf step node of the subtree
 * holding facts in the key also holds a trio in it: a cap made of some step
 * nodes' estimates against every step node's spend would compare unlike sums
 * (design D38). Only a three-point trio seeds or covers one: a single-point
 * tokens trio is the legacy token estimate (D28), and every plan Navigator
 * writes holds one, so it derives nothing (design D68). A row with neither
 * budget is absent. A stated budget whose facts mix bases, or a
 * derived one whose facts or trios do, is not read and is named in `blocked`
 * instead. The scheduling measure has no budget (design D35).
 *
 * Holds (design D39): a running attempt of a typed measure holds until a fact
 * on its node is recorded at or after its start; in a derived measure
 * (`agent_minutes`) it holds for as long as it runs, since its facts come
 * from ended spans only.
 *
 * @throws when a budget or trio names a key `definitions` does not hold: the
 * stores refuse to write one and `deleteMeasure` refuses a referenced
 * definition, so such a row is drifted trusted state.
 */
export function readBudgets(reads: BudgetReads): BudgetRead {
  const { rows, definitions, budgets, facts, estimates, attempts, factor } = reads;
  const { mixedFacts, mixedEstimates } = reads;
  // Proof: with the single-point trios kept here, `derives nothing from a
  // single-point tokens trio, the legacy token estimate` (budget.test.ts) read
  // derived tokens budgets on A and P; watched 2026-10-24.
  const ranged = estimates.filter((each) => !each.singlePoint);
  const keys = [...new Set([...budgets.map(({ key }) => key), ...ranged.map(({ key }) => key)])];
  const definitionOf = (key: string): MeasureDefinition => {
    const found = definitions.find((each) => each.key === key);
    if (found === undefined)
      throw new Error(`a budget or trio names ${key}, which no definition of its project holds`);
    return found;
  };
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId] as const));
  const running = attempts.filter((attempt) => attempt.endedAt === null);
  const readings = new Map<string, Map<string, BudgetReading>>();
  const blocked = new Map<string, Map<string, BlockedBudget>>();
  const hasChildren = new Set(rows.flatMap((row) => (row.parentId === null ? [] : [row.parentId])));
  const markUp = (marked: Set<string>, from: string): void => {
    for (let at: string | null | undefined = from; typeof at === 'string';) {
      marked.add(at);
      at = parentOf.get(at);
    }
  };
  for (const key of keys.sort()) {
    const definition = definitionOf(key);
    if (definition.schedulesWork) continue;
    const metric = factMetricOf(key);
    // Proof: with the subtree fold replaced by the row's own facts, `reads a
    // parent's budget against its three leaves' facts` (budget.test.ts) read
    // the parent within budget; watched 2026-10-23.
    const spentOf = totalsByRow(rollUpMeasures(rows, facts, metric), (value) => value);
    const pessimisticOf = totalsByRow(
      rollUpMeasureEstimates(rows, ranged, key, DEFAULT_PERT_WEIGHTS, 'real'),
      (figure) => figure.pessimistic,
    );
    // Rows over a leaf step node that spends in this key and estimates
    // nothing in it: no derived budget there (D38). Spend and pessimistic
    // points fold per step, so coverage is per step node too.
    const estimating = new Set(
      ranged
        .filter((each) => each.key === key)
        .map(({ workItemId, stepId }) => stepNodeOf(workItemId, stepId)),
    );
    const uncovered = new Set<string>();
    for (const fact of facts) {
      if (fact.metric !== metric || hasChildren.has(fact.workItemId)) continue;
      // Proof: with this mark skipped, `derives no budget over a leaf that
      // spends without an estimate` (budget.test.ts) derived P's cap from A
      // alone; watched 2026-10-23. With the node keyed by work item alone,
      // `derives no budget where a step spends without a trio beside another
      // step's` (budget.test.ts) derived A's cap from dev against dev and qa;
      // watched 2026-10-24.
      if (!estimating.has(stepNodeOf(fact.workItemId, fact.stepId)))
        markUp(uncovered, fact.workItemId);
    }
    // The running attempts whose usage in this key is unknown: no fact on
    // their node recorded at or after their start, or any running attempt
    // at all in a derived measure.
    const unknown = running.filter(
      (attempt) =>
        // Proof: with this test removed, `holds agent minutes for every
        // running attempt, a fact from an earlier end beside it` (budget.test.ts)
        // read the second attempt as known; watched 2026-10-23.
        definition.derived ||
        !facts.some(
          (fact) =>
            fact.metric === metric &&
            fact.workItemId === attempt.workItemId &&
            fact.stepId === attempt.stepId &&
            fact.recordedAt >= attempt.startedAt,
        ),
    );
    const unknownIn = new Map<string, number>();
    for (const attempt of unknown) {
      for (let at: string | null | undefined = attempt.workItemId; typeof at === 'string';) {
        unknownIn.set(at, (unknownIn.get(at) ?? 0) + 1);
        at = parentOf.get(at);
      }
    }
    for (const row of rows) {
      const stated = budgets.find((each) => each.workItemId === row.id && each.key === key);
      const pessimistic = uncovered.has(row.id) ? undefined : pessimisticOf.get(row.id);
      if (stated === undefined && pessimistic === undefined) continue;
      // Proof: with this skip removed, `reads no budget where the facts mix
      // bases, and a derived one only where neither kind does` (budget.test.ts)
      // read the parent's cost budget; watched 2026-10-23.
      const mix =
        mixedFacts.get(row.id)?.get(key) ??
        (stated === undefined ? mixedEstimates.get(row.id)?.get(key) : undefined);
      if (mix !== undefined) {
        const byKey = blocked.get(row.id) ?? new Map<string, BlockedBudget>();
        // Proof: with the policy taken as `advisory` whatever the budget,
        // `names a blocked budget with its policy and source` (budget.test.ts)
        // read the stated strict budget as advisory; watched 2026-10-23.
        byKey.set(
          key,
          stated === undefined
            ? { bases: mix, policy: 'advisory', source: 'derived' }
            : { bases: mix, policy: stated.policy, source: 'stated' },
        );
        blocked.set(row.id, byKey);
        continue;
      }
      const spent = spentOf.get(row.id) ?? 0;
      const reading: BudgetReading =
        stated === undefined
          ? derivedReading(roundToScale((pessimistic ?? 0) * factor, definition.scale), spent)
          : statedReading(stated, spent, unknownIn.get(row.id) ?? 0);
      const byKey = readings.get(row.id) ?? new Map<string, BudgetReading>();
      byKey.set(key, reading);
      readings.set(row.id, byKey);
    }
  }
  return { readings, blocked };
}

function derivedReading(cap: number, spent: number): BudgetReading {
  return {
    cap,
    policy: 'advisory',
    source: 'derived',
    spent,
    remaining: cap - spent,
    // Proof: with `>=` here, `reports a derived budget exceeded only once the
    // facts cross its cap` (budget.test.ts) read a derived cap spent to the
    // cap exceeded; watched 2026-10-23.
    exceeded: spent > cap,
  };
}

function statedReading(
  budget: StoredBudget,
  spent: number,
  unknownAttempts: number,
): BudgetReading {
  const { cap, policy, holdPerAttempt } = budget;
  // Proof: with the hold left out of `remaining`, `holds the allowance of each
  // running attempt of unknown usage, and releases it on its end`
  // (budget.test.ts) read 500 remaining; watched 2026-10-23.
  const held = holdPerAttempt === null ? undefined : holdPerAttempt * unknownAttempts;
  return {
    cap,
    policy,
    source: 'stated',
    spent,
    remaining: cap - spent - (held ?? 0),
    // Proof: with `>=` here, `reports exceeded only once the facts cross the
    // cap` (budget.test.ts) read a budget spent to the cap exceeded; watched 2026-10-23.
    exceeded: spent > cap,
    ...(held === undefined || holdPerAttempt === null ? {} : { held, holdPerAttempt }),
  };
}

/** One step node's identity as a set member: work item and step. */
function stepNodeOf(workItemId: string, stepId: string): string {
  return JSON.stringify([workItemId, stepId]);
}

/** Each row's figures summed across its steps. */
function totalsByRow<T>(
  byRow: ReadonlyMap<string, ReadonlyMap<string, T>>,
  figureOf: (figure: T) => number,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [rowId, byStep] of byRow) {
    if (byStep.size === 0) continue;
    let sum = 0;
    for (const figure of byStep.values()) sum += figureOf(figure);
    totals.set(rowId, sum);
  }
  return totals;
}
