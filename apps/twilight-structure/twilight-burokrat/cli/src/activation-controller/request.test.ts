import { expect, test } from 'bun:test';

import { serializeCanonical } from '../evidence/content-manifest';
import { createActivationRequest, decodeActivationRequest, requireCurrentRequest } from './request';

const sha = (digit: string): string => digit.repeat(64);
const commit = (digit: string): string => digit.repeat(40);

function candidate() {
  return {
    repositoryId: 8241,
    subject: { kind: 'pull-request' as const, number: 282 },
    targetRef: 'refs/heads/main',
    headSha: commit('a'),
    baseSha: commit('b'),
    policyIdentity: sha('1'),
    mappingIdentity: sha('2'),
    toolkitIdentity: sha('3'),
    authorityIdentity: sha('7'),
    auditGeneration: 4,
  };
}

test('request binds repository head base and trust even when the source tree is unchanged', () => {
  const original = createActivationRequest(candidate());
  expect(decodeActivationRequest(original.bytes)).toEqual(original.request);
  const revisions = [
    { repositoryId: 8242 },
    { subject: { kind: 'pull-request' as const, number: 283 } },
    { targetRef: 'refs/heads/staging' },
    { headSha: commit('c') },
    { baseSha: commit('d') },
    { policyIdentity: sha('4') },
    { mappingIdentity: sha('5') },
    { toolkitIdentity: sha('6') },
    { authorityIdentity: sha('8') },
    { auditGeneration: 5 },
  ];
  for (const revision of revisions) {
    const changed = createActivationRequest({ ...candidate(), ...revision });
    expect(changed.identity).not.toBe(original.identity);
    expect(() => {
      requireCurrentRequest(original.request, changed.request);
    }).toThrow('activation request identity changed');
  }
});

test('canonical request decoder refuses missing, malformed, extra and altered identities', () => {
  const original = createActivationRequest(candidate());
  const malformed = [
    { ...original.request, headSha: 'wrong' },
    { ...original.request, policyIdentity: 'wrong' },
    { ...original.request, auditGeneration: 0 },
    { ...original.request, authorityIdentity: undefined },
    { ...original.request, repositoryId: undefined },
    { ...original.request, extra: 'candidate-controlled' },
  ];
  for (const request of malformed) {
    expect(() => decodeActivationRequest(JSON.stringify(request))).toThrow();
  }
  expect(() => decodeActivationRequest(JSON.stringify(original.request))).toThrow(
    'activation request bytes are not canonical',
  );
  expect(() =>
    decodeActivationRequest(serializeCanonical({ ...original.request, headSha: commit('c') })),
  ).toThrow('activation request identity differs from its canonical fields');
  const { subject: _subject, targetRef: _targetRef, ...oldBody } = original.request;
  expect(() => decodeActivationRequest(serializeCanonical(oldBody))).toThrow();
});

test('different PR, protected revision and retargeting cannot borrow one request', () => {
  const pr = createActivationRequest(candidate());
  const otherPr = createActivationRequest({
    ...candidate(),
    subject: { kind: 'pull-request', number: 283 },
  });
  const protectedRevision = createActivationRequest({
    ...candidate(),
    subject: { kind: 'protected-revision', ref: 'refs/heads/main' },
  });
  const retargeted = createActivationRequest({ ...candidate(), targetRef: 'refs/heads/staging' });
  for (const changed of [otherPr, protectedRevision, retargeted]) {
    expect(changed.identity).not.toBe(pr.identity);
    expect(() => {
      requireCurrentRequest(pr.request, changed.request);
    }).toThrow('activation request identity changed');
  }
  expect(() =>
    createActivationRequest({
      ...candidate(),
      subject: { kind: 'protected-revision', ref: 'refs/heads/other' },
    }),
  ).toThrow();
});

test('merge-group verified ref and ordered member composition bind the request', () => {
  const members = [
    { repositoryId: 8241, pullRequestNumber: 282, headSha: commit('a') },
    { repositoryId: 8241, pullRequestNumber: 283, headSha: commit('c') },
  ];
  const group = {
    ...candidate(),
    subject: {
      kind: 'merge-group' as const,
      groupRef: 'refs/heads/gh-readonly-queue/main/group-1',
      members,
    },
  };
  const original = createActivationRequest(group);
  const reordered = createActivationRequest({
    ...group,
    subject: { ...group.subject, members: [...members].reverse() },
  });
  expect(reordered.identity).not.toBe(original.identity);
  expect(() => {
    requireCurrentRequest(original.request, reordered.request);
  }).toThrow('activation request identity changed');
  expect(() =>
    createActivationRequest({ ...group, subject: { ...group.subject, members: [] } }),
  ).toThrow();
});
