import { POSITION_STEP } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import type { StampedClaim } from '../../ports/claim-store';
import { labelledRow } from '../../testing/work-item-fixture';
import { findPersonWork, type PersonWorkReads } from './person-work';

const KAT = { personId: 'kat', name: 'Kat' };

/** Root `080` (frozen) over leaves `w-1`, `w-2`, `w-3`, and root `w-090` (derived `010`). */
const rows = [
  labelledRow({ id: 'w-080', frozenNumber: '080', name: 'Billing' }),
  labelledRow({ id: 'w-1', parentId: 'w-080', name: 'One' }),
  labelledRow({ id: 'w-2', parentId: 'w-080', position: POSITION_STEP * 2, name: 'Two' }),
  labelledRow({ id: 'w-3', parentId: 'w-080', position: POSITION_STEP * 3, name: 'Three' }),
  labelledRow({ id: 'w-090', position: POSITION_STEP * 2, name: 'Later' }),
];

function stamped(
  over: Partial<StampedClaim> & Pick<StampedClaim, 'id' | 'workItemId'>,
): StampedClaim {
  return {
    stepId: null,
    personId: 'kat',
    runId: null,
    parentClaimId: null,
    accountId: 'account-f',
    claimedAt: 100,
    leaseExpiresAt: null,
    leaseRevokedAt: null,
    ...over,
  };
}

function reads(over: Partial<PersonWorkReads> = {}): PersonWorkReads {
  return {
    person: KAT,
    rows,
    stepIds: ['plan', 'review'],
    assignments: [],
    claims: [],
    ...over,
  };
}

describe('findPersonWork', () => {
  it('lists three assignments and one claim with their ids and numbers (the spec scenario)', () => {
    const work = findPersonWork(
      reads({
        assignments: ['w-3', 'w-1', 'w-2'].map((workItemId) => ({
          workItemId,
          stepId: 'review',
          personId: 'kat',
        })),
        claims: [
          stamped({
            id: 'c-1',
            workItemId: 'w-2',
            stepId: 'plan',
            runId: 'run-7',
            parentClaimId: 'c-0',
            claimedAt: 300,
            leaseExpiresAt: 900,
          }),
        ],
      }),
    );
    expect(work).toEqual({
      person: KAT,
      assignments: [
        {
          workItemId: 'w-1',
          number: '080.1',
          numberIsFrozen: false,
          name: 'One',
          stepId: 'review',
        },
        {
          workItemId: 'w-2',
          number: '080.2',
          numberIsFrozen: false,
          name: 'Two',
          stepId: 'review',
        },
        {
          workItemId: 'w-3',
          number: '080.3',
          numberIsFrozen: false,
          name: 'Three',
          stepId: 'review',
        },
      ],
      claims: [
        {
          workItemId: 'w-2',
          number: '080.2',
          numberIsFrozen: false,
          name: 'Two',
          stepId: 'plan',
          claimId: 'c-1',
          runId: 'run-7',
          parentClaimId: 'c-0',
          claimedAt: 300,
          leaseExpiresAt: 900,
        },
      ],
    });
  });

  it("lists one person's assignments and claims, and no one else's", () => {
    const work = findPersonWork(
      reads({
        assignments: [
          { workItemId: 'w-1', stepId: 'plan', personId: 'kat' },
          { workItemId: 'w-1', stepId: 'review', personId: 'ada' },
        ],
        claims: [
          stamped({ id: 'c-kat', workItemId: 'w-1', stepId: 'plan' }),
          stamped({ id: 'c-ada', workItemId: 'w-1', stepId: 'review', personId: 'ada' }),
        ],
      }),
    );
    expect(work.assignments.map(({ stepId }) => stepId)).toEqual(['plan']);
    expect(work.claims.map(({ claimId }) => claimId)).toEqual(['c-kat']);
  });

  it('orders by tree then step, and keeps frozen numbers beside derived ones', () => {
    const work = findPersonWork(
      reads({
        assignments: [
          { workItemId: 'w-090', stepId: 'plan', personId: 'kat' },
          { workItemId: 'w-1', stepId: 'review', personId: 'kat' },
          { workItemId: 'w-1', stepId: 'plan', personId: 'kat' },
        ],
        claims: [
          stamped({ id: 'c-step', workItemId: 'w-090', stepId: 'review' }),
          stamped({ id: 'c-subtree', workItemId: 'w-080' }),
        ],
      }),
    );
    expect(work.assignments.map(({ workItemId, stepId }) => `${workItemId}:${stepId}`)).toEqual([
      'w-1:plan',
      'w-1:review',
      'w-090:plan',
    ]);
    expect(work.claims.map(({ claimId, number }) => `${claimId}@${number}`)).toEqual([
      'c-subtree@080',
      'c-step@010',
    ]);
    expect(work.claims.map(({ numberIsFrozen }) => numberIsFrozen)).toEqual([true, false]);
  });

  it('answers empty lists for a person who holds nothing', () => {
    expect(findPersonWork(reads())).toEqual({ person: KAT, assignments: [], claims: [] });
  });

  it('throws on an assignment to a row or a step the read does not hold', () => {
    expect(() =>
      findPersonWork(
        reads({ assignments: [{ workItemId: 'gone', stepId: 'plan', personId: 'kat' }] }),
      ),
    ).toThrow('work item gone is not a row of this read');
    expect(() =>
      findPersonWork(
        reads({ assignments: [{ workItemId: 'w-1', stepId: 'gone', personId: 'kat' }] }),
      ),
    ).toThrow('step gone is not a step of this project');
  });
});
