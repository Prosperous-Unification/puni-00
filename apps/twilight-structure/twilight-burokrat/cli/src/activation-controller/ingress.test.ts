import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { hashBytes, hashCanonical, serializeCanonical } from '../judge-facade';
import { assertObservedRequestCurrent, prepareObservedRequest } from './ingress';
import { createActivationRequest, decodeActivationRequest } from './request';

const scratch: string[] = [];
afterEach(() => {
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function mounted() {
  const directory = mkdtempSync(join(tmpdir(), 'activation-ingress-'));
  scratch.push(directory);
  const path = join(directory, 'bootstrap.json');
  const configuration = {
    schemaVersion: 1,
    authorityGeneration: 3,
    reviewer: {
      kind: 'external-audit-provider',
      providerId: 'review.provider',
      executorId: 'review.executor',
      protocolIdentity: 'a'.repeat(64),
      promptIdentity: 'b'.repeat(64),
    },
    journal: {
      kind: 'authenticated-external-journal',
      verifierId: 'journal.verifier',
      issuerId: 'journal.issuer',
      endpoint: 'https://journal.example.invalid/v1',
    },
    publisher: {
      kind: 'immutable-external-store',
      issuerId: 'publisher.issuer',
      endpoint: 'https://store.example.invalid/activations',
    },
    admission: {
      requiredWorkflow: '.github/workflows/trusted-wiki.yml',
      protectedBranch: 'main',
    },
  };
  const bytes = serializeCanonical(configuration);
  writeFileSync(path, bytes);
  return {
    path,
    configuration,
    pin: {
      identity: hashBytes(bytes),
      journalIssuerId: 'journal.issuer',
      publisherIssuerId: 'publisher.issuer',
    },
    observed: {
      repositoryId: 8241,
      subject: { kind: 'pull-request' as const, number: 282 },
      targetRef: 'refs/heads/main',
      headSha: '1'.repeat(40),
      baseSha: '2'.repeat(40),
      policyIdentity: '3'.repeat(64),
      mappingIdentity: '4'.repeat(64),
      toolkitIdentity: '5'.repeat(64),
    },
  };
}

test('ingress reads pinned bootstrap before it can freeze a candidate request', () => {
  const fixture = mounted();
  const frozen = prepareObservedRequest(fixture.path, fixture.pin, fixture.observed);
  expect(frozen.request.auditGeneration).toBe(3);
  expect(() =>
    prepareObservedRequest(join(dirname(fixture.path), 'absent'), fixture.pin, fixture.observed),
  ).toThrow('bootstrap configuration absent');
  expect(() =>
    prepareObservedRequest(
      fixture.path,
      { ...fixture.pin, journalIssuerId: 'wrong.issuer' },
      fixture.observed,
    ),
  ).toThrow('bootstrap journal issuer differs from independent pin');
  expect(() =>
    prepareObservedRequest(
      fixture.path,
      { ...fixture.pin, identity: '0'.repeat(64) },
      fixture.observed,
    ),
  ).toThrow('bootstrap configuration differs from independent pin');
  const unreadable = join(dirname(fixture.path), 'unreadable');
  mkdirSync(unreadable);
  expect(() => prepareObservedRequest(unreadable, fixture.pin, fixture.observed)).toThrow(
    'bootstrap configuration unreadable',
  );
  writeFileSync(fixture.path, '{');
  expect(() => prepareObservedRequest(fixture.path, fixture.pin, fixture.observed)).toThrow(
    'bootstrap configuration malformed',
  );
  const relabelled = serializeCanonical({
    ...fixture.configuration,
    reviewer: { ...fixture.configuration.reviewer, kind: 'local-cooperative' },
  });
  writeFileSync(fixture.path, relabelled);
  expect(() =>
    prepareObservedRequest(
      fixture.path,
      { ...fixture.pin, identity: hashBytes(relabelled) },
      fixture.observed,
    ),
  ).toThrow('bootstrap configuration malformed');
});

test('ingress rechecks the persisted request against the observed candidate and authority', () => {
  const fixture = mounted();
  const frozen = prepareObservedRequest(fixture.path, fixture.pin, fixture.observed);
  assertObservedRequestCurrent(frozen.request, fixture.path, fixture.pin, fixture.observed);
  for (const changed of [
    { repositoryId: 8242 },
    { subject: { kind: 'pull-request' as const, number: 283 } },
    { subject: { kind: 'protected-revision' as const, ref: 'refs/heads/main' } },
    { targetRef: 'refs/heads/staging' },
    { headSha: '6'.repeat(40) },
    { baseSha: '7'.repeat(40) },
    { policyIdentity: '8'.repeat(64) },
    { mappingIdentity: '9'.repeat(64) },
    { toolkitIdentity: 'a'.repeat(64) },
  ]) {
    expect(() => {
      assertObservedRequestCurrent(frozen.request, fixture.path, fixture.pin, {
        ...fixture.observed,
        ...changed,
      });
    }).toThrow('activation request identity changed');
  }
  const changedBytes = serializeCanonical({ ...fixture.configuration, authorityGeneration: 4 });
  writeFileSync(fixture.path, changedBytes);
  expect(() => {
    assertObservedRequestCurrent(
      frozen.request,
      fixture.path,
      { ...fixture.pin, identity: hashBytes(changedBytes) },
      fixture.observed,
    );
  }).toThrow('activation request identity changed');
});

test('ingress refuses reordered members of the same qualified merge-group ref', () => {
  const fixture = mounted();
  const members = [
    { repositoryId: 8241, pullRequestNumber: 282, headSha: '1'.repeat(40) },
    { repositoryId: 8241, pullRequestNumber: 283, headSha: '6'.repeat(40) },
  ];
  const group = {
    ...fixture.observed,
    subject: {
      kind: 'merge-group' as const,
      groupRef: 'refs/heads/gh-readonly-queue/main/group-1',
      members,
    },
  };
  const frozen = prepareObservedRequest(fixture.path, fixture.pin, group);
  expect(() => {
    assertObservedRequestCurrent(frozen.request, fixture.path, fixture.pin, {
      ...group,
      subject: { ...group.subject, members: [...members].reverse() },
    });
  }).toThrow('activation request identity changed');
});

test('ingress accepts a current later audit generation under the same pinned authority', () => {
  const fixture = mounted();
  const first = prepareObservedRequest(fixture.path, fixture.pin, fixture.observed);
  const { requestIdentity: _identity, schemaVersion: _version, ...fields } = first.request;
  const later = createActivationRequest({ ...fields, auditGeneration: 4 }).request;
  expect(() => {
    assertObservedRequestCurrent(later, fixture.path, fixture.pin, fixture.observed);
  }).not.toThrow();
});

function installedRefusal(
  fixture: ReturnType<typeof mounted>,
  original: Parameters<typeof prepareObservedRequest>[2],
  changed: Parameters<typeof prepareObservedRequest>[2],
): void {
  const frozen = prepareObservedRequest(fixture.path, fixture.pin, original);
  const other = prepareObservedRequest(fixture.path, fixture.pin, changed);
  expect(other.identity).not.toBe(frozen.identity);
  expect(() => {
    assertObservedRequestCurrent(frozen.request, fixture.path, fixture.pin, changed);
  }).toThrow('activation request identity changed');
}

test('same commits do not alias different PR subjects', () => {
  const fixture = mounted();
  installedRefusal(fixture, fixture.observed, {
    ...fixture.observed,
    subject: { kind: 'pull-request', number: 283 },
  });
});

test('PR and protected revision cannot share approval', () => {
  const fixture = mounted();
  installedRefusal(fixture, fixture.observed, {
    ...fixture.observed,
    subject: { kind: 'protected-revision', ref: fixture.observed.targetRef },
  });
});

test('retargeting the same base changes admission', () => {
  const fixture = mounted();
  installedRefusal(fixture, fixture.observed, {
    ...fixture.observed,
    targetRef: 'refs/heads/release',
  });
});

test('ordered group members bind the request', () => {
  const fixture = mounted();
  const members = [
    { repositoryId: 8241, pullRequestNumber: 282, headSha: '1'.repeat(40) },
    { repositoryId: 8241, pullRequestNumber: 283, headSha: '6'.repeat(40) },
  ];
  const group = {
    ...fixture.observed,
    subject: {
      kind: 'merge-group' as const,
      groupRef: 'refs/heads/gh-readonly-queue/main/group-1',
      members,
    },
  };
  installedRefusal(fixture, group, {
    ...group,
    subject: { ...group.subject, members: [...members].reverse() },
  });
  const [first, second] = members;
  installedRefusal(fixture, group, {
    ...group,
    subject: { ...group.subject, members: [first, { ...second, headSha: '7'.repeat(40) }] },
  });
  installedRefusal(fixture, group, {
    ...group,
    subject: { ...group.subject, members: [first] },
  });
});

test('old request schema cannot acquire default authority', () => {
  const fixture = mounted();
  const frozen = prepareObservedRequest(fixture.path, fixture.pin, fixture.observed);
  const { subject: _subject, targetRef: _targetRef, ...beforeSubjects } = frozen.request;
  const { authorityIdentity: _authority, ...beforeAuthority } = frozen.request;
  for (const legacy of [beforeSubjects, beforeAuthority, { ...frozen.request, schemaVersion: 0 }]) {
    const { requestIdentity: _identity, ...body } = legacy;
    const rehashed = { ...body, requestIdentity: hashCanonical(body) };
    expect(() => decodeActivationRequest(serializeCanonical(rehashed))).toThrow();
    expect(() => {
      assertObservedRequestCurrent(
        rehashed as unknown as typeof frozen.request,
        fixture.path,
        fixture.pin,
        fixture.observed,
      );
    }).toThrow();
  }
});

test('current request separates authority and audit generation', () => {
  const fixture = mounted();
  const first = prepareObservedRequest(fixture.path, fixture.pin, fixture.observed);
  const { requestIdentity: _identity, schemaVersion: _version, ...fields } = first.request;
  const advanced = createActivationRequest({ ...fields, auditGeneration: 9 }).request;
  expect(() => {
    assertObservedRequestCurrent(advanced, fixture.path, fixture.pin, fixture.observed);
  }).not.toThrow();
  const rotated = serializeCanonical({
    ...fixture.configuration,
    publisher: { ...fixture.configuration.publisher, endpoint: 'https://other.example.invalid' },
  });
  writeFileSync(fixture.path, rotated);
  expect(() => {
    assertObservedRequestCurrent(
      advanced,
      fixture.path,
      { ...fixture.pin, identity: hashBytes(rotated) },
      fixture.observed,
    );
  }).toThrow('activation request identity changed');
});
