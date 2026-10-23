import type { MeasureDefinition } from './measure-definition';

/**
 * What a money figure was priced with (`wbs-measure-budgets` D6, design D43):
 * the currency its micro-units are in, and the digest of the rate card that
 * turned usage into that money. Two figures add only under one basis; WBS
 * converts nothing.
 */
export interface MoneyBasis {
  readonly currency: string;
  readonly rateCardDigest: string;
}

/** The most characters a rate card digest may carry: a bound, not a format. */
export const LONGEST_RATE_CARD_DIGEST = 128;

/**
 * Why a write cannot carry, or must carry, a rate card digest (design D43):
 *
 * - `rate_card_required` (409): a figure written in a money measure without
 *   one, which would add to priced figures under no basis at all;
 * - `rate_card_forbidden` (409): a digest on a measure that is not money,
 *   where it would describe nothing.
 */
export type RateCardRefusal = 'rate_card_required' | 'rate_card_forbidden';

/** {@link decideRateCard}'s answer: the basis to store (null off money), or why not. */
export type RateCardDecision =
  { ok: true; basis: MoneyBasis | null } | { ok: false; reason: RateCardRefusal };

/**
 * The basis a figure in `definition` is written under, given the digest the
 * caller sent (undefined when none). A clear (`writing` false) needs none and
 * stores none, but a digest sent with it is still refused off money.
 *
 * The currency is the definition's at the moment of the write, so a figure
 * keeps the currency it was priced in if the definition's changes later.
 *
 * @throws when a money definition has no currency: `createMeasure` refuses one
 * (`currency_required`), so such a definition is drifted trusted state.
 */
export function decideRateCard(
  definition: MeasureDefinition,
  rateCardDigest: string | undefined,
  writing: boolean,
): RateCardDecision {
  if (definition.kind !== 'money') {
    // Proof: with this refusal skipped, `refuses a digest on a measure that is
    // not money` (money-basis.test.ts) stored tokens with no complaint;
    // watched 2026-10-23.
    return rateCardDigest === undefined
      ? { ok: true, basis: null }
      : { ok: false, reason: 'rate_card_forbidden' };
  }
  if (!writing) return { ok: true, basis: null };
  // Proof: with this refusal skipped, `requires a digest on a money write, not
  // on a clear` (money-basis.test.ts) admitted an unpriced cost; watched 2026-10-23.
  if (rateCardDigest === undefined) return { ok: false, reason: 'rate_card_required' };
  if (definition.currency === null)
    throw new Error(`money measure ${definition.key} has no currency`);
  return { ok: true, basis: { currency: definition.currency, rateCardDigest } };
}

/**
 * The two bases a mix is named by, each the whole basis (currency and digest:
 * the same digest in two currencies is two bases) or null for an unpriced
 * figure, sorted with null first, then by currency, then by digest, so one mix
 * always reads the same pair.
 */
export type MixedRateCards = [MoneyBasis | null, MoneyBasis | null];

/** One money figure where a subtree's bases are gathered: its row, its key, its basis. */
export interface PricedFigure {
  readonly workItemId: string;
  readonly key: string;
  readonly basis?: MoneyBasis;
}

/**
 * Every row whose subtree holds figures in one money key under two or more
 * bases, with the first two (design D44). A basis is the pair currency and
 * digest; a figure without one counts as the basis null, so a priced and an
 * unpriced figure mix too.
 *
 * Callers fold facts and trios **separately** (D44): a fact and a trio on two
 * cards are never added, so one call per kind decides each kind's sums.
 *
 * Only a leaf's figures count, as the roll-up folds count only a leaf's
 * (`foldByStep`): a row with children holds no figures of its own. Keys
 * outside `moneyKeys` are ignored. A row or key with one basis is absent.
 */
export function mixedRateCardsOf(
  rows: readonly { readonly id: string; readonly parentId: string | null }[],
  figures: readonly PricedFigure[],
  moneyKeys: ReadonlySet<string>,
): Map<string, Map<string, MixedRateCards>> {
  const mixed = new Map<string, Map<string, MixedRateCards>>();
  for (const [rowId, byKey] of basesByRow(rows, figures, moneyKeys)) {
    for (const [key, held] of byKey) {
      // Proof: with `> 2` here, `names the two bases a parent mixes, and
      // leaves each leaf alone` (money-basis.test.ts) read the parent unmixed;
      // watched 2026-10-23.
      if (held.size < 2) continue;
      const [first, second] = [...held.values()].sort(compareBases);
      const found = mixed.get(rowId) ?? new Map<string, MixedRateCards>();
      found.set(key, [first ?? null, second ?? null]);
      mixed.set(rowId, found);
    }
  }
  return mixed;
}

/**
 * Every row whose subtree holds figures in one money key under exactly one
 * basis, and that basis priced (`wbs-measure-budgets` D49): what the row
 * read's sums in that key are in. The counterpart of {@link mixedRateCardsOf}
 * over the same figures, one kind per call. A key whose figures are all
 * unpriced is absent, as is a mixed one.
 */
export function soleMoneyBasesOf(
  rows: readonly { readonly id: string; readonly parentId: string | null }[],
  figures: readonly PricedFigure[],
  moneyKeys: ReadonlySet<string>,
): Map<string, Map<string, MoneyBasis>> {
  const sole = new Map<string, Map<string, MoneyBasis>>();
  for (const [rowId, byKey] of basesByRow(rows, figures, moneyKeys)) {
    for (const [key, held] of byKey) {
      const [basis] = [...held.values()];
      // Proof: with the size test removed, `names the one basis a subtree is
      // priced in, and none where it mixes or is unpriced` (money-basis.test.ts)
      // named a basis on the mixed parent; watched 2026-10-23.
      if (held.size !== 1 || basis === null) continue;
      const found = sole.get(rowId) ?? new Map<string, MoneyBasis>();
      found.set(key, basis);
      sole.set(rowId, found);
    }
  }
  return sole;
}

/** Per row and money key, every distinct basis its subtree's leaves hold, by identity. */
function basesByRow(
  rows: readonly { readonly id: string; readonly parentId: string | null }[],
  figures: readonly PricedFigure[],
  moneyKeys: ReadonlySet<string>,
): Map<string, Map<string, Map<string, MoneyBasis | null>>> {
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId] as const));
  const hasChildren = new Set(rows.flatMap((row) => (row.parentId === null ? [] : [row.parentId])));
  const basesOf = new Map<string, Map<string, Map<string, MoneyBasis | null>>>();
  for (const figure of figures) {
    if (!moneyKeys.has(figure.key) || hasChildren.has(figure.workItemId)) continue;
    const basis = figure.basis ?? null;
    // Proof: with the identity made the digest alone, `reads one digest in two
    // currencies as mixed` (money-basis.test.ts) read USD/x and EUR/x as one
    // basis; watched 2026-10-23.
    const identity = basis === null ? '' : `${basis.currency}\u0000${basis.rateCardDigest}`;
    for (let at: string | null | undefined = figure.workItemId; typeof at === 'string';) {
      const byKey = basesOf.get(at) ?? new Map<string, Map<string, MoneyBasis | null>>();
      const held = byKey.get(figure.key) ?? new Map<string, MoneyBasis | null>();
      held.set(identity, basis);
      byKey.set(figure.key, held);
      basesOf.set(at, byKey);
      at = parentOf.get(at);
    }
  }
  return basesOf;
}

function compareBases(left: MoneyBasis | null, right: MoneyBasis | null): number {
  if (left === null) return right === null ? 0 : -1;
  if (right === null) return 1;
  if (left.currency !== right.currency) return left.currency < right.currency ? -1 : 1;
  if (left.rateCardDigest === right.rateCardDigest) return 0;
  return left.rateCardDigest < right.rateCardDigest ? -1 : 1;
}
