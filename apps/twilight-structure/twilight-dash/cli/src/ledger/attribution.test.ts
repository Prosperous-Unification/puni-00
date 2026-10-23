import { expect, test } from 'bun:test';

import type { AcceptedOutcome } from './accepted-outcomes';
import { attributeRow } from './attribution';
import type { HarnessUsageRow } from './harness-usage';

const outcomes: AcceptedOutcome[] = [
  {
    pullRequest: 10,
    headBranch: 'plan/x',
    memberBranches: ['feat/a'],
    nestedPullRequests: [8],
    mergedAt: '2026-10-17T00:00:00.000Z',
    mergeSha: 'm10',
    subject: 's',
  },
  {
    pullRequest: 11,
    headBranch: 'feat/c',
    memberBranches: [],
    nestedPullRequests: [],
    mergedAt: '2026-10-18T00:00:00.000Z',
    mergeSha: 'm11',
    subject: 's',
  },
  {
    pullRequest: 13,
    headBranch: 'feat/c',
    memberBranches: [],
    nestedPullRequests: [],
    mergedAt: '2026-10-20T00:00:00.000Z',
    mergeSha: 'm13',
    subject: 's',
  },
];

function row(branch: string | null, instant = '2026-10-16T10:00:00.000Z'): HarnessUsageRow {
  return {
    harness: 'claude-code',
    harnessVersion: 'v',
    sessionId: 's',
    requestId: 'r',
    model: 'm',
    instant,
    branch,
    tokens: { input: 1, cacheWrite: 0, cacheWriteExtended: 0, cacheRead: 0, output: 0 },
    source: { path: 'p', line: 1 },
  };
}

test('a single accepted reference wins over the branch, nested numbers map to their parent', () => {
  expect(
    attributeRow(
      row('feat/zzz'),
      { harness: 'claude-code', sessionId: 's', pullRequestReferences: [8] },
      outcomes,
    ),
  ).toEqual({ kind: 'outcome', mergeSha: 'm10', rule: 'pull-request-reference' });
  expect(
    attributeRow(
      row('feat/zzz'),
      { harness: 'claude-code', sessionId: 's', pullRequestReferences: [999] },
      outcomes,
    ),
  ).toEqual({ kind: 'unattributed', reason: 'branch-not-accepted' });
});

test('a session that opened two pull requests is ambiguous', () => {
  expect(
    attributeRow(
      row('feat/a'),
      { harness: 'claude-code', sessionId: 's', pullRequestReferences: [10, 11] },
      outcomes,
    ),
  ).toEqual({ kind: 'unattributed', reason: 'ambiguous-references' });
});

test('branch rules: member branch, default branch, no branch, reused branch by time', () => {
  expect(attributeRow(row('feat/a'), undefined, outcomes)).toEqual({
    kind: 'outcome',
    mergeSha: 'm10',
    rule: 'branch',
  });
  expect(attributeRow(row('main'), undefined, outcomes)).toEqual({
    kind: 'unattributed',
    reason: 'on-default-branch',
  });
  expect(attributeRow(row(null), undefined, outcomes)).toEqual({
    kind: 'unattributed',
    reason: 'no-branch',
  });
  expect(
    attributeRow(row('feat/c', '2026-10-17T12:00:00.000Z'), undefined, outcomes),
  ).toMatchObject({ mergeSha: 'm11' });
  expect(
    attributeRow(row('feat/c', '2026-10-19T12:00:00.000Z'), undefined, outcomes),
  ).toMatchObject({ mergeSha: 'm13' });
  expect(
    attributeRow(row('feat/c', '2026-10-21T12:00:00.000Z'), undefined, outcomes),
  ).toMatchObject({ mergeSha: 'm13' });
});
