import type { MeasureDefinitionView, WorkItemView } from '@/lib/wbs-api';

/**
 * The five definitions be-01 seeds for every organization (`wbs-measure-budgets`
 * D1, D15), as `GET /api/measures` lists them: the fixture the table's and the
 * panel's suites read.
 */
export const SEEDED_MEASURES: readonly MeasureDefinitionView[] = [
  {
    id: 'm-time',
    key: 'time',
    name: 'Time',
    unit: 'days',
    kind: 'duration',
    scale: 'real',
    threePoint: true,
    showByDefault: true,
    schedulesWork: true,
    derived: false,
    order: 1,
    currency: null,
  },
  {
    id: 'm-tokens',
    key: 'tokens',
    name: 'Tokens',
    unit: 'tokens',
    kind: 'count',
    scale: 'integer',
    threePoint: true,
    showByDefault: false,
    schedulesWork: false,
    derived: false,
    order: 2,
    currency: null,
  },
  {
    id: 'm-hours',
    key: 'hours',
    name: 'Hours',
    unit: 'hours',
    kind: 'duration',
    scale: 'real',
    threePoint: false,
    showByDefault: false,
    schedulesWork: false,
    derived: false,
    order: 3,
    currency: null,
  },
  {
    id: 'm-cost',
    key: 'cost',
    name: 'Cost',
    unit: 'micro-USD',
    kind: 'money',
    scale: 'integer',
    threePoint: true,
    showByDefault: false,
    schedulesWork: false,
    derived: false,
    order: 4,
    currency: 'USD',
  },
  {
    id: 'm-agent-minutes',
    key: 'agent_minutes',
    name: 'Agent minutes',
    unit: 'minutes',
    kind: 'duration',
    scale: 'integer',
    threePoint: false,
    showByDefault: false,
    schedulesWork: false,
    derived: true,
    order: 5,
    currency: null,
  },
];

/** One seeded definition by key, thrown on a key the seed does not hold. */
export function seededMeasure(key: string): MeasureDefinitionView {
  const found = SEEDED_MEASURES.find((definition) => definition.key === key);
  if (found === undefined) throw new Error(`no seeded measure "${key}"`);
  return found;
}

/** Card A and card B, two rate cards in one currency. */
export const CARD_A = { currency: 'USD', rateCardDigest: 'sha256:aaaa1111bbbb2222' } as const;
export const CARD_B = { currency: 'USD', rateCardDigest: 'sha256:cccc3333dddd4444' } as const;

/**
 * The measure fields of a row that holds a strict exceeded tokens budget, an
 * advisory cost budget priced on card A, and agent minutes: the panel's
 * richest state.
 */
export const RICH_MEASURES: Pick<
  WorkItemView,
  'measures' | 'measureEstimates' | 'budgets' | 'moneyBases' | 'actuals'
> = {
  actuals: { 'step-dev': 2 },
  measures: {
    token_actual: { 'step-dev': 1200 },
    cost: { 'step-dev': 1_800_000 },
    agent_minutes: { 'step-dev': 95 },
  },
  measureEstimates: {
    tokens: {
      'step-dev': {
        optimistic: 500,
        realistic: 800,
        pessimistic: 1400,
        singlePoint: false,
        expected: 850,
        variance: 350,
      },
    },
    cost: {
      'step-dev': {
        optimistic: 1_000_000,
        realistic: 1_500_000,
        pessimistic: 3_000_000,
        singlePoint: false,
        expected: 1_666_667,
        variance: 133_333,
      },
    },
  },
  budgets: {
    tokens: { cap: 1000, policy: 'strict', source: 'stated', remaining: -200, exceeded: true },
    cost: {
      cap: 3_000_000,
      policy: 'advisory',
      source: 'derived',
      remaining: 1_200_000,
      exceeded: false,
    },
  },
  moneyBases: { cost: { facts: CARD_A, estimates: CARD_A } },
};
