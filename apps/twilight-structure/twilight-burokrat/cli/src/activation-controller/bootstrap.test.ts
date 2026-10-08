import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { readBootstrapConfiguration } from './bootstrap';

const scratch: string[] = [];
afterEach(() => {
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'tool-wiki-bootstrap-'));
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
  return { path, directory, configuration, bytes };
}

test('bootstrap refuses unavailable authority as absent, unreadable or malformed', () => {
  const { path, directory, bytes } = fixture();
  const pinned = {
    identity: hashBytes(bytes),
    journalIssuerId: 'journal.issuer',
    publisherIssuerId: 'publisher.issuer',
  };
  expect(readBootstrapConfiguration(path, pinned).authorityGeneration).toBe(3);
  expect(() => readBootstrapConfiguration(path, { ...pinned, identity: 'invalid' })).toThrow(
    'bootstrap independent pin malformed',
  );
  expect(() => readBootstrapConfiguration(join(directory, 'absent'), pinned)).toThrow(
    'bootstrap configuration absent',
  );
  mkdirSync(join(directory, 'unreadable'));
  expect(() => readBootstrapConfiguration(join(directory, 'unreadable'), pinned)).toThrow(
    'bootstrap configuration unreadable',
  );
  writeFileSync(path, '{');
  expect(() => readBootstrapConfiguration(path, pinned)).toThrow(
    'bootstrap configuration malformed',
  );
  writeFileSync(path, bytes.trimEnd());
  expect(() =>
    readBootstrapConfiguration(path, { ...pinned, identity: hashBytes(bytes.trimEnd()) }),
  ).toThrow('bootstrap configuration malformed');
});

test('bootstrap refuses local relabel, wrong issuer and mismatched pinned bytes', () => {
  const { path, configuration, bytes } = fixture();
  const pinned = {
    identity: hashBytes(bytes),
    journalIssuerId: 'journal.issuer',
    publisherIssuerId: 'publisher.issuer',
  };
  expect(() => readBootstrapConfiguration(path, { ...pinned, identity: '0'.repeat(64) })).toThrow(
    'bootstrap configuration differs from independent pin',
  );
  expect(() =>
    readBootstrapConfiguration(path, { ...pinned, journalIssuerId: 'journal.other' }),
  ).toThrow('bootstrap journal issuer differs from independent pin');
  expect(() =>
    readBootstrapConfiguration(path, { ...pinned, publisherIssuerId: 'publisher.other' }),
  ).toThrow('bootstrap publisher issuer differs from independent pin');
  writeFileSync(
    path,
    serializeCanonical({
      ...configuration,
      reviewer: { ...configuration.reviewer, kind: 'local-cooperative' },
    }),
  );
  expect(() =>
    readBootstrapConfiguration(path, {
      ...pinned,
      identity: hashBytes(
        serializeCanonical({
          ...configuration,
          reviewer: { ...configuration.reviewer, kind: 'local-cooperative' },
        }),
      ),
    }),
  ).toThrow('bootstrap configuration malformed');
});

test('versioned provider bootstrap requires an independent descriptor pin without migrating legacy history', () => {
  const { path, configuration } = fixture();
  const descriptorIdentity = 'c'.repeat(64);
  const bytes = serializeCanonical({
    ...configuration,
    schemaVersion: 2,
    reviewProvider: { kind: 'github-actions-attestation-review', descriptorIdentity },
  });
  writeFileSync(path, bytes);
  const pin = {
    identity: hashBytes(bytes),
    journalIssuerId: 'journal.issuer',
    publisherIssuerId: 'publisher.issuer',
    reviewProviderIdentity: descriptorIdentity,
  };
  expect(readBootstrapConfiguration(path, pin).authorityGeneration).toBe(3);
  expect(() =>
    readBootstrapConfiguration(path, { ...pin, reviewProviderIdentity: undefined }),
  ).toThrow('bootstrap review provider pin absent');
  expect(() =>
    readBootstrapConfiguration(path, { ...pin, reviewProviderIdentity: 'd'.repeat(64) }),
  ).toThrow('bootstrap review provider differs from independent pin');
  const legacyBytes = serializeCanonical(configuration);
  writeFileSync(path, legacyBytes);
  expect(
    readBootstrapConfiguration(path, {
      ...pin,
      identity: hashBytes(legacyBytes),
      reviewProviderIdentity: undefined,
    }).schemaVersion,
  ).toBe(1);
  expect(() =>
    readBootstrapConfiguration(path, {
      ...pin,
      identity: hashBytes(legacyBytes),
    }),
  ).toThrow('legacy bootstrap has no external review provider');
});
