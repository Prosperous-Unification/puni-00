import type { Claim } from '@wbs/domain';
import { expect, it } from 'bun:test';

import { findReassignedClaimedSteps } from './claims';

const claimOn = (workItemId: string, id: string): Claim => ({
  id,
  workItemId,
  stepId: 'review',
  personId: 'claire',
  runId: `run-${workItemId}`,
  parentClaimId: null,
  accountId: 'account-f',
});

it('lists reassigned claimed steps in tree order, whatever order the leaves come in', () => {
  // `z` is first among its siblings by position though its id sorts last.
  const rows = [
    { id: 'p', parentId: null, position: 0 },
    { id: 'a', parentId: 'p', position: 1 },
    { id: 'z', parentId: 'p', position: 0 },
  ];
  const listed = findReassignedClaimedSteps({
    rows,
    leafIds: ['a', 'z'],
    stepId: 'review',
    personId: 'kat',
    previous: new Map(),
    claims: [claimOn('a', 'claim-a'), claimOn('z', 'claim-z')],
  });
  expect(listed.map((each) => each.holder.claimId)).toEqual(['claim-z', 'claim-a']);
});
