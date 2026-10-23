import { readFileSync } from 'node:fs';

import { parseOrThrow, type } from '@shared/validation';
import { digestOf } from '@twilight-burokrat/contracts';

import { USAGE_CATEGORIES, type UsageTokens } from './harness-usage';

const Price = type('number>=0');

/** Per-million prices in the card's currency; `cacheWriteExtended` exists only where sold. */
const RateCardEntry = type({
  provider: 'string>=1',
  model: 'string>=1',
  prices: type({
    input: Price,
    cacheWrite: Price,
    'cacheWriteExtended?': Price,
    cacheRead: Price,
    output: Price,
  }),
  source: 'string>=1',
  accessedAt: /^\d{4}-\d{2}-\d{2}$/,
});

export const RateCard = type({
  schemaVersion: '1',
  currency: /^[A-Z]{3}$/,
  unit: "'perMillionTokens'",
  entries: RateCardEntry.array().atLeastLength(1),
  'notes?': 'string[]',
});
export type RateCard = typeof RateCard.infer;

export type UnpricedReason = 'unknown-model' | 'missing-category';

export type Priced =
  | { readonly kind: 'priced'; readonly micros: number }
  | { readonly kind: 'unpriced'; readonly reason: UnpricedReason };

/** A loaded card with its digest, which the breakdown names as the price identity. */
export interface LoadedRateCard {
  readonly card: RateCard;
  readonly digest: string;
  readonly path: string;
}

/** @throws when the file is missing, unreadable, not JSON or not a rate card. */
export function loadRateCard(path: string): LoadedRateCard {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    throw new Error(`rate card is missing, unreadable or not JSON: ${JSON.stringify(path)}`, {
      cause,
    });
  }
  let card: RateCard;
  try {
    card = parseOrThrow(RateCard, parsed);
  } catch (cause) {
    throw new Error(`rate card is malformed: ${JSON.stringify(path)}`, { cause });
  }
  const models = new Set<string>();
  for (const entry of card.entries) {
    if (models.has(entry.model)) {
      throw new Error(`rate card lists a model twice: ${JSON.stringify(entry.model)}`);
    }
    models.add(entry.model);
  }
  return { card, digest: digestOf(card), path };
}

/** Micro-units for `tokens` at `pricePerMillion`, rounded half up once per category. */
function microsFor(tokens: number, pricePerMillion: number): number {
  return Math.round(tokens * pricePerMillion);
}

/**
 * Prices one row's tokens. A model the card does not list, or a non-zero category the entry
 * does not price, leaves the row unpriced with its reason; it is never charged as zero.
 */
export function priceTokens(card: RateCard, model: string, tokens: UsageTokens): Priced {
  const entry = card.entries.find((candidate) => candidate.model === model);
  // Proof: returning `{ kind: 'priced', micros: 0 }` here failed `an unlisted model stays
  // unpriced` (2026-10-22).
  if (entry === undefined) return { kind: 'unpriced', reason: 'unknown-model' };
  let micros = 0;
  for (const category of USAGE_CATEGORIES) {
    const count = tokens[category];
    if (count === 0) continue;
    const price = entry.prices[category];
    // Proof: treating a missing extended price as 0 failed `a missing category stays unpriced`.
    if (price === undefined) return { kind: 'unpriced', reason: 'missing-category' };
    micros += microsFor(count, price);
  }
  return { kind: 'priced', micros };
}
