import { describe, expect, it } from 'vitest';

import {
  CARD_A,
  CARD_B,
  RICH_MEASURES,
  SEEDED_MEASURES,
  seededMeasure,
} from '@/testing/measure-fixtures';

import {
  budgetReadingOf,
  facetOfColumn,
  facetsOf,
  factKeyOf,
  formatMeasureValue,
  isMeasureToggles,
  measureColumnId,
  measureFiguresOf,
  mixedSentence,
  shownDefinitions,
  storedValueOf,
  TYPED_FIGURE_HELP,
  typedValueOf,
  unitLabelOf,
} from './measure-reading';

describe('which measures have columns', () => {
  it('a fresh reader sees no measure column but time, which has its own', () => {
    expect(shownDefinitions(SEEDED_MEASURES, {})).toEqual([]);
  });

  it('shows what the reader enabled and hides what they turned off', () => {
    const custom = { ...seededMeasure('tokens'), key: 'gpu', showByDefault: true };
    expect(
      shownDefinitions([...SEEDED_MEASURES, custom], { tokens: true, gpu: false }).map(
        (definition) => definition.key,
      ),
    ).toEqual(['tokens']);
    expect(shownDefinitions([...SEEDED_MEASURES, custom], {}).map((each) => each.key)).toEqual([
      'gpu',
    ]);
  });

  it('never gives the scheduling measure columns of its own', () => {
    expect(shownDefinitions(SEEDED_MEASURES, { time: true })).toEqual([]);
  });

  it('offers only the fact of a measure without three points', () => {
    expect(facetsOf(seededMeasure('tokens'))).toEqual(['estimate', 'fact', 'variance']);
    expect(facetsOf(seededMeasure('hours'))).toEqual(['fact']);
    expect(facetsOf(seededMeasure('agent_minutes'))).toEqual(['fact']);
  });

  it('names columns by key and facet and reads the facet back', () => {
    expect(measureColumnId('agent_minutes', 'fact')).toBe('measure-agent_minutes-fact');
    expect(facetOfColumn('measure-agent_minutes-fact')).toBe('fact');
    expect(facetOfColumn('step-dev-final')).toBeNull();
    expect(facetOfColumn('measure-tokens-total')).toBeNull();
  });

  it('accepts only a record of booleans out of storage', () => {
    expect(isMeasureToggles({ tokens: true })).toBe(true);
    expect(isMeasureToggles({ tokens: 'yes' })).toBe(false);
    expect(isMeasureToggles(['tokens'])).toBe(false);
    expect(isMeasureToggles(null)).toBe(false);
  });
});

describe('a row’s figures in one measure', () => {
  it('reads facts under the legacy names for tokens and hours', () => {
    expect(factKeyOf('tokens')).toBe('token_actual');
    expect(factKeyOf('hours')).toBe('hours_actual');
    expect(factKeyOf('cost')).toBe('cost');
  });

  it('sums expected, facts and variance over the steps as the read states them', () => {
    const figures = measureFiguresOf(
      {
        measures: { token_actual: { a: 300, b: 100 } },
        measureEstimates: {
          tokens: {
            a: {
              optimistic: 100,
              realistic: 200,
              pessimistic: 600,
              singlePoint: false,
              expected: 250,
              variance: 50,
            },
          },
        },
      },
      seededMeasure('tokens'),
    );
    expect(figures.estimate).toEqual({
      kind: 'value',
      value: 250,
      singlePoint: false,
      basis: null,
    });
    expect(figures.fact).toEqual({ kind: 'value', value: 400, singlePoint: false, basis: null });
    // Step b's fact has no trio beside it, so it brings no variance: the read's 50 stands.
    expect(figures.variance).toEqual({ kind: 'value', value: 50, singlePoint: false, basis: null });
  });

  it('keeps absence apart from a recorded zero', () => {
    const none = measureFiguresOf({ measures: {} }, seededMeasure('tokens'));
    expect(none.fact).toEqual({ kind: 'absent' });
    expect(none.estimate).toEqual({ kind: 'absent' });
    expect(none.variance).toEqual({ kind: 'absent' });
    const zero = measureFiguresOf(
      { measures: { token_actual: { a: 0 } } },
      seededMeasure('tokens'),
    );
    expect(zero.fact).toEqual({ kind: 'value', value: 0, singlePoint: false, basis: null });
  });

  it('marks a legacy single figure', () => {
    const figures = measureFiguresOf(
      {
        measureEstimates: {
          tokens: {
            a: {
              optimistic: 90,
              realistic: 90,
              pessimistic: 90,
              singlePoint: true,
              expected: 90,
            },
          },
        },
      },
      seededMeasure('tokens'),
    );
    expect(figures.estimate).toMatchObject({ kind: 'value', value: 90, singlePoint: true });
  });

  it('names a mixed key and never sums it', () => {
    const figures = measureFiguresOf(
      { mixedRateCards: { cost: { facts: [CARD_A, CARD_B] } } },
      seededMeasure('cost'),
    );
    expect(figures.fact).toEqual({ kind: 'mixed', bases: [CARD_A, CARD_B] });
    expect(figures.variance).toEqual({ kind: 'mixed', bases: [CARD_A, CARD_B] });
    expect(figures.estimate).toEqual({ kind: 'absent' });
    expect(mixedSentence([CARD_A, null])).toBe(
      'Mixed rate cards: USD · card sha256:aaaa1… and unpriced — WBS adds no figures priced on different cards.',
    );
  });

  it('carries the one basis a money sum is priced in', () => {
    const figures = measureFiguresOf(RICH_MEASURES, seededMeasure('cost'));
    expect(figures.fact).toMatchObject({ kind: 'value', value: 1_800_000, basis: CARD_A });
  });
});

describe('formatting a figure', () => {
  it('reads micro-units of a currency as that currency', () => {
    expect(formatMeasureValue(1_500_000, seededMeasure('cost'))).toBe('$1.50');
    expect(formatMeasureValue(133_333, seededMeasure('cost'), true)).toBe('+$0.13');
    expect(unitLabelOf(seededMeasure('cost'))).toBe('USD');
  });

  it('groups counts and keeps two decimals on a real scale', () => {
    expect(formatMeasureValue(12000, seededMeasure('tokens'))).toBe('12,000');
    expect(formatMeasureValue(-200, seededMeasure('tokens'), true)).toBe('-200');
    expect(formatMeasureValue(1.256, seededMeasure('hours'))).toBe('1.26');
    expect(unitLabelOf(seededMeasure('tokens'))).toBe('tokens');
  });

  it('turns typed currency back into micro-units and refuses what is not a figure', () => {
    expect(storedValueOf('1.50', seededMeasure('cost'))).toBe(1_500_000);
    expect(storedValueOf('12,000', seededMeasure('tokens'))).toBe(12000);
    expect(storedValueOf('', seededMeasure('tokens'))).toBeNull();
    expect(storedValueOf('12k', seededMeasure('tokens'))).toBeNull();
    expect(typedValueOf(1_500_000, seededMeasure('cost'))).toBe('1.5');
  });
});

describe('a budget reading', () => {
  it('works spent back from the cap, the remainder and the holds', () => {
    expect(
      budgetReadingOf(
        {
          budgets: {
            tokens: {
              cap: 500,
              policy: 'strict',
              source: 'stated',
              remaining: 200,
              exceeded: false,
              held: 300,
            },
          },
        },
        'tokens',
      ),
    ).toEqual({
      kind: 'budget',
      policy: 'strict',
      source: 'stated',
      cap: 500,
      spent: 0,
      held: 300,
      remaining: 200,
      exceeded: false,
      refusing: false,
      fill: 0,
    });
  });

  it('fills the bar to the edge past the cap', () => {
    expect(budgetReadingOf(RICH_MEASURES, 'tokens')).toMatchObject({
      spent: 1200,
      exceeded: true,
      fill: 1,
    });
  });

  it('says a budget mixed facts keep from being read is blocked, not absent', () => {
    expect(
      budgetReadingOf({ mixedRateCards: { cost: { facts: [CARD_A, CARD_B] } } }, 'cost'),
    ).toEqual({ kind: 'blocked', of: 'facts', bases: [CARD_A, CARD_B] });
    expect(budgetReadingOf({}, 'cost')).toEqual({ kind: 'none' });
  });
});

describe('figures below one unit (review S2-2)', () => {
  const jpy = { ...seededMeasure('cost'), unit: 'micro-JPY', currency: 'JPY' };

  it('never shows a non-zero figure as zero', () => {
    expect(formatMeasureValue(1500, seededMeasure('cost'))).toBe('$0.0015');
    expect(formatMeasureValue(4999, seededMeasure('cost'))).toBe('$0.0050');
    expect(formatMeasureValue(400_000, jpy)).toBe('¥0.40');
    expect(formatMeasureValue(1, seededMeasure('cost'), true)).toBe('+$0.000001');
    expect(formatMeasureValue(-2_000, seededMeasure('cost'), true)).toBe('-$0.0020');
    expect(formatMeasureValue(0.004, seededMeasure('hours'))).toBe('0.004');
  });

  it('keeps the currency’s own digits where they already show the figure', () => {
    expect(formatMeasureValue(0, seededMeasure('cost'))).toBe('$0.00');
    expect(formatMeasureValue(133_333, seededMeasure('cost'))).toBe('$0.13');
    expect(formatMeasureValue(2_400_000, jpy)).toBe('¥2');
  });
});

describe('typed figures (review S3)', () => {
  it('refuses a comma that does not group thousands', () => {
    expect(storedValueOf('1,5', seededMeasure('tokens'))).toBeNull();
    expect(storedValueOf('12,00', seededMeasure('tokens'))).toBeNull();
    expect(storedValueOf('1,234,567.5', seededMeasure('hours'))).toBe(1_234_567.5);
    expect(storedValueOf('1234', seededMeasure('tokens'))).toBe(1234);
    expect(TYPED_FIGURE_HELP).toMatch(/commas only between thousands/);
  });

  it('turns currency into micro-units on the digits, without float error', () => {
    expect(storedValueOf('0.29', seededMeasure('cost'))).toBe(290_000);
    expect(storedValueOf('1,234.567891', seededMeasure('cost'))).toBe(1_234_567_891);
    expect(storedValueOf('0.0000001', seededMeasure('cost'))).toBeNull();
  });
});

describe('when the write refuses the next attempt (review S2-3, S3-1)', () => {
  const strict = (remaining: number, exceeded: boolean, held?: number, holdPerAttempt?: number) =>
    budgetReadingOf(
      {
        budgets: {
          tokens: {
            cap: 1000,
            policy: 'strict',
            source: 'stated',
            remaining,
            exceeded,
            ...(held === undefined ? {} : { held }),
            ...(holdPerAttempt === undefined ? {} : { holdPerAttempt }),
          },
        },
      },
      'tokens',
    );

  it('refuses at the cap and on holds, not only once facts cross it', () => {
    expect(strict(0, false)).toMatchObject({ spent: 1000, refusing: true, exceeded: false });
    expect(strict(-300, false, 600)).toMatchObject({ spent: 700, refusing: true, exceeded: false });
    expect(strict(-200, true)).toMatchObject({ refusing: true, exceeded: true });
    expect(strict(1, false)).toMatchObject({ refusing: false });
  });

  it("refuses when less remains than one attempt's hold, as the write does", () => {
    expect(strict(200, false, 0, 300)).toMatchObject({ remaining: 200, refusing: true });
    expect(strict(300, false, 0, 300)).toMatchObject({ refusing: false });
    expect(strict(200, false)).toMatchObject({ refusing: false });
  });

  it('never refuses on an advisory budget', () => {
    expect(
      budgetReadingOf(
        {
          budgets: {
            tokens: {
              cap: 10,
              policy: 'advisory',
              source: 'stated',
              remaining: -5,
              exceeded: true,
            },
          },
        },
        'tokens',
      ),
    ).toMatchObject({ refusing: false, exceeded: true });
  });
});
