import type { BlockedBudget, BudgetRead, BudgetReading, MixedRateCards } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { findBudgetHeadroom } from './budget-headroom';
import type { StartableWork } from './startable';

const ROWS = [
  { id: 'P', parentId: null },
  { id: 'A', parentId: 'P' },
];

const reading = (remaining: number): BudgetReading => ({
  cap: 100,
  policy: 'strict',
  source: 'stated',
  spent: 100 - remaining,
  remaining,
  exceeded: false,
});

const startable = (claimed = false): StartableWork => ({
  leaves: [
    {
      workItemId: 'A',
      number: '1.1',
      numberIsFrozen: false,
      name: 'A',
      stepIds: ['dev'],
      assignees: [],
      teams: [],
      unfinishedPredecessorIds: [],
      subtreeClaim: null,
      fits: true,
    },
  ],
  doesNotFit: [],
  claimed: claimed
    ? [
        {
          workItemId: 'A',
          number: '1.1',
          numberIsFrozen: false,
          name: 'A',
          stepId: 'qa',
          claimId: 'c',
          holder: { personId: 'p', name: 'P' },
          assignee: null,
          runId: null,
          parentClaimId: null,
          claimedAt: 1,
        },
      ]
    : [],
  subtreeClaims: [],
  resources: [],
  occupancyScope: 'project',
});

const advisory = (remaining: number): BudgetReading => ({
  ...reading(remaining),
  policy: 'advisory',
  source: 'derived',
});

const readOf = (
  readings: [string, [string, BudgetReading][]][],
  blocked: [string, [string, BlockedBudget][]][] = [],
): BudgetRead => ({
  readings: new Map(readings.map(([row, keys]) => [row, new Map(keys)])),
  blocked: new Map(blocked.map(([row, keys]) => [row, new Map(keys)])),
});

describe('findBudgetHeadroom', () => {
  it('reports the tightest budget among a step’s work item and its ancestors', () => {
    const read = findBudgetHeadroom(
      ROWS,
      startable(true),
      readOf([
        ['A', [['tokens', reading(80)]]],
        [
          'P',
          [
            ['tokens', reading(30)],
            ['cost', reading(5)],
          ],
        ],
      ]),
    );
    const both = {
      tokens: { strict: { ...reading(30), workItemId: 'P' } },
      cost: { strict: { ...reading(5), workItemId: 'P' } },
    };
    expect(read).toEqual({
      steps: [
        { workItemId: 'A', stepId: 'dev', state: 'startable', budgets: both },
        { workItemId: 'A', stepId: 'qa', state: 'claimed', budgets: both },
      ],
    });
  });

  it('keeps an exhausted strict budget beside a looser advisory one', () => {
    const read = findBudgetHeadroom(
      ROWS,
      startable(),
      readOf([
        ['A', [['tokens', advisory(-200)]]],
        ['P', [['tokens', reading(0)]]],
      ]),
    );
    expect(read.steps[0]?.budgets['tokens']).toEqual({
      strict: { ...reading(0), workItemId: 'P' },
      advisory: { ...advisory(-200), workItemId: 'A' },
    });
  });

  it('answers a step under no budget with none', () => {
    expect(findBudgetHeadroom(ROWS, startable(), readOf([]))).toEqual({
      steps: [{ workItemId: 'A', stepId: 'dev', state: 'startable', budgets: {} }],
    });
  });

  it('names a blocked cost budget on its step alone, tokens kept', () => {
    const pair: MixedRateCards = [null, { currency: 'USD', rateCardDigest: 'x' }];
    const read = findBudgetHeadroom(
      ROWS,
      startable(),
      readOf(
        [['A', [['tokens', reading(10)]]]],
        [['P', [['cost', { bases: pair, policy: 'advisory', source: 'derived' }]]]],
      ),
    );
    // A derived budget blocked: only `blocked.advisory`, which never refuses.
    expect(read.steps[0]?.budgets).toEqual({
      tokens: { strict: { ...reading(10), workItemId: 'A' } },
      cost: { blocked: { advisory: { workItemId: 'P', bases: pair, source: 'derived' } } },
    });
  });

  it('keeps a blocked strict budget behind a nearer blocked advisory one', () => {
    const near: MixedRateCards = [null, { currency: 'USD', rateCardDigest: 'x' }];
    const far: MixedRateCards = [
      { currency: 'USD', rateCardDigest: 'a' },
      { currency: 'USD', rateCardDigest: 'b' },
    ];
    const read = findBudgetHeadroom(
      ROWS,
      startable(),
      readOf(
        [],
        [
          ['A', [['cost', { bases: near, policy: 'advisory', source: 'derived' }]]],
          ['P', [['cost', { bases: far, policy: 'strict', source: 'stated' }]]],
        ],
      ),
    );
    expect(read.steps[0]?.budgets['cost']).toEqual({
      blocked: {
        strict: { workItemId: 'P', bases: far, source: 'stated' },
        advisory: { workItemId: 'A', bases: near, source: 'derived' },
      },
    });
  });
});
