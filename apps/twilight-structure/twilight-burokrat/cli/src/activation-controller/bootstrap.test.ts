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
