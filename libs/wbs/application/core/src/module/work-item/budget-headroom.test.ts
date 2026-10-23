import type { BudgetReading } from '@wbs/domain';
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

describe('findBudgetHeadroom', () => {
  it('reports the tightest budget among a step’s work item and its ancestors', () => {
    const read = findBudgetHeadroom(
      ROWS,
      startable(true),
      new Map([
        ['A', new Map([['tokens', reading(80)]])],
        [
          'P',
          new Map([
            ['tokens', reading(30)],
            ['cost', reading(5)],
          ]),
        ],
      ]),
      new Map(),
    );
    expect(read).toEqual({
      steps: [
        {
          workItemId: 'A',
          stepId: 'dev',
          state: 'startable',
          budgets: {
            tokens: { ...reading(30), workItemId: 'P' },
            cost: { ...reading(5), workItemId: 'P' },
          },
        },
        {
          workItemId: 'A',
          stepId: 'qa',
          state: 'claimed',
          budgets: {
            tokens: { ...reading(30), workItemId: 'P' },
            cost: { ...reading(5), workItemId: 'P' },
          },
        },
      ],
    });
  });

  it('answers a step under no budget with none', () => {
    expect(findBudgetHeadroom(ROWS, startable(), new Map(), new Map())).toEqual({
      steps: [{ workItemId: 'A', stepId: 'dev', state: 'startable', budgets: {} }],
    });
  });

  it('refuses when a row of a step’s chain mixes rate cards', () => {
    expect(
      findBudgetHeadroom(
        ROWS,
        startable(),
        new Map(),
        new Map([['P', new Map([['cost', ['a', 'b'] as [string, string]]])]]),
      ),
    ).toEqual({ kind: 'mixed_rate_cards', digests: ['a', 'b'] });
  });
});
