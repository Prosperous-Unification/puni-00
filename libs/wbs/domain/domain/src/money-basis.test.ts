import { describe, expect, it } from 'bun:test';

import { type MeasureDefinition, SEEDED_MEASURE_DEFINITIONS } from './measure-definition';
import { decideRateCard, mixedRateCardsOf } from './money-basis';

const definition = (key: string): MeasureDefinition => {
  const found = SEEDED_MEASURE_DEFINITIONS.find((each) => each.key === key);
  if (found === undefined) throw new Error(key);
  return { id: `m-${key}`, ...found };
};

describe('decideRateCard', () => {
  it('records the definition’s currency beside the digest on a money write', () => {
    expect(decideRateCard(definition('cost'), 'card-a', true)).toEqual({
      ok: true,
      basis: { currency: 'USD', rateCardDigest: 'card-a' },
    });
  });

  it('requires a digest on a money write, not on a clear', () => {
    expect(decideRateCard(definition('cost'), undefined, true)).toEqual({
      ok: false,
      reason: 'rate_card_required',
    });
    expect(decideRateCard(definition('cost'), undefined, false)).toEqual({ ok: true, basis: null });
  });

  it('refuses a digest on a measure that is not money', () => {
    expect(decideRateCard(definition('tokens'), 'card-a', true)).toEqual({
      ok: false,
      reason: 'rate_card_forbidden',
    });
    expect(decideRateCard(definition('tokens'), 'card-a', false)).toEqual({
      ok: false,
      reason: 'rate_card_forbidden',
    });
    expect(decideRateCard(definition('tokens'), undefined, true)).toEqual({
      ok: true,
      basis: null,
    });
  });
});

describe('mixedRateCardsOf', () => {
  const rows = [
    { id: 'P', parentId: null },
    { id: 'A', parentId: 'P' },
    { id: 'B', parentId: 'P' },
  ];
  const priced = (workItemId: string, rateCardDigest: string) => ({
    workItemId,
    key: 'cost',
    basis: { currency: 'USD', rateCardDigest },
  });

  it('names the two bases a parent mixes, and leaves each leaf alone', () => {
    // The spec scenario "Two cards in one subtree".
    const mixed = mixedRateCardsOf(
      rows,
      [priced('A', 'card-b'), priced('B', 'card-a')],
      new Set(['cost']),
    );
    expect([...mixed]).toEqual([
      [
        'P',
        new Map([
          [
            'cost',
            [
              { currency: 'USD', rateCardDigest: 'card-a' },
              { currency: 'USD', rateCardDigest: 'card-b' },
            ],
          ],
        ]),
      ],
    ]);
  });

  it('counts an unpriced figure as a basis of its own, named null first', () => {
    const mixed = mixedRateCardsOf(
      rows,
      [priced('A', 'card-a'), { workItemId: 'B', key: 'cost' }],
      new Set(['cost']),
    );
    expect(mixed.get('P')?.get('cost')).toEqual([
      null,
      { currency: 'USD', rateCardDigest: 'card-a' },
    ]);
  });

  it('reads one digest in two currencies as mixed', () => {
    const mixed = mixedRateCardsOf(
      rows,
      [
        { workItemId: 'A', key: 'cost', basis: { currency: 'USD', rateCardDigest: 'x' } },
        { workItemId: 'B', key: 'cost', basis: { currency: 'EUR', rateCardDigest: 'x' } },
      ],
      new Set(['cost']),
    );
    expect(mixed.get('P')?.get('cost')).toEqual([
      { currency: 'EUR', rateCardDigest: 'x' },
      { currency: 'USD', rateCardDigest: 'x' },
    ]);
  });

  it('reads one basis as no mix, and ignores keys that are not money', () => {
    expect(
      mixedRateCardsOf(rows, [priced('A', 'card-a'), priced('B', 'card-a')], new Set(['cost']))
        .size,
    ).toBe(0);
    expect(
      mixedRateCardsOf(
        rows,
        [{ workItemId: 'A', key: 'tokens' }, priced('B', 'card-a')],
        new Set(['cost']),
      ).size,
    ).toBe(0);
  });
});
