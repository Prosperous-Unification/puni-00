import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { listAcceptedOutcomes, readRepositorySlug } from './accepted-outcomes';
import { fixtureRepository, period, slug } from './fixtures.test-support';

test('a plan branch carries nested pull requests and a hand merge has no branches', () => {
  const repository = fixtureRepository(scratchSync('ledger-repo'));
  expect(readRepositorySlug(repository)).toBe(slug);
  const outcomes = listAcceptedOutcomes(repository, period);
  expect(outcomes.map((outcome) => outcome.pullRequest)).toEqual([10, 11, null]);
  expect(outcomes[0]).toMatchObject({
    headBranch: 'plan/x',
    memberBranches: ['feat/b', 'feat/a'],
    nestedPullRequests: [8, 9],
    mergedAt: '2026-10-17T00:00:00.000Z',
  });
  expect(outcomes[2]).toMatchObject({
    headBranch: null,
    memberBranches: [],
    subject: 'Merge branch feat/d by hand',
  });
});

test('a repository without main or without a GitHub origin refuses', () => {
  const empty = scratchSync('ledger-empty-repo');
  expect(() => listAcceptedOutcomes(empty, period)).toThrow(/git log failed/);
  expect(() => readRepositorySlug(empty)).toThrow(/git remote failed/);
});
