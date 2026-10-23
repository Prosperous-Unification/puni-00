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
    ).toEqual({ kind: 'blocked', bases: [CARD_A, CARD_B] });
    expect(budgetReadingOf({}, 'cost')).toEqual({ kind: 'none' });
  });
});
