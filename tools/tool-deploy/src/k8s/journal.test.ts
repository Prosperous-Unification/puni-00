import { chmodSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import { fileJournal, type JournalRecord } from './journal';
import { migrationIdentityOf, sealMigrationCapture } from './migration-capture';
import { initialState, type ReleaseRequest } from './release';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function directory(): string {
  const root = scratchSync('wbs-release-journal-');
  roots.push(root);
  return root;
}

const digest = `sha256:${'1'.repeat(64)}`;
const identity = {
  sourceSha: 'a'.repeat(40),
  images: {
    backend: `r/be@${digest}`,
    gateway: `r/gw@${digest}`,
    frontend: `r/fe@${digest}`,
    mcp: `r/mcp@${digest}`,
  },
};
const request: ReleaseRequest = {
  environment: 'local',
  cluster: { context: 'lab', uid: 'u' },
  namespaces: { app: 'wbs', backend: 'wbs-solver' },
  release: identity,
  expectedCurrent: identity,
  admission: { package: 'p', activation: 'a' },
  flux: null,
  recovers: null,
};

const fixedState = { ...initialState(request), phase: 'migrated' as const };

function record(): JournalRecord {
  return {
    schemaVersion: 2,
    request,
    state: fixedState,
    history: [{ phase: 'migrated', at: '2026-09-18T00:00:00.000Z' }],
  };
}

describe('fileJournal', () => {
  it('reads back what it wrote and leaves no temporary file', () => {
    const root = directory();
    const journal = fileJournal(join(root, 'release.json'));
    journal.write(record());
    expect(journal.read()).toEqual(record());
    expect(readdirSync(root)).toEqual(['release.json']);
  });

  it('answers null only when no journal exists', () => {
    expect(fileJournal(join(directory(), 'release.json')).read()).toBeNull();
  });

  it('rejects an unknown phase', () => {
    const path = join(directory(), 'release.json');
    writeFileSync(
      path,
      JSON.stringify({ ...record(), state: { ...record().state, phase: 'half-migrated' } }),
    );
    expect(() => fileJournal(path).read()).toThrow('unknown phase half-migrated');
  });

  it('rejects a journal that is not JSON', () => {
    const path = join(directory(), 'release.json');
    writeFileSync(path, '{"schemaVersion":1,');
    expect(() => fileJournal(path).read()).toThrow('is not JSON');
  });

  it('rejects a newer schema', () => {
    const path = join(directory(), 'release.json');
    writeFileSync(path, JSON.stringify({ ...record(), schemaVersion: 3 }));
    expect(() => fileJournal(path).read()).toThrow('unsupported schema version');
  });

  it('refuses a legacy in-flight journal without replacing its bytes', () => {
    const path = join(directory(), 'release.json');
    const legacy = JSON.stringify({ ...record(), schemaVersion: 1 });
    writeFileSync(path, legacy);
    expect(() => fileJournal(path).read()).toThrow('legacy migration capture');
    expect(readFileSync(path, 'utf8')).toBe(legacy);
  });

  it('rejects a changed capture from disk before returning a journal record', () => {
    const path = join(directory(), 'release.json');
    const original = record();
    const capture = sealMigrationCapture(
      migrationIdentityOf(original.request, original.state.transactionId),
      [],
      [],
    );
    const malformed = {
      ...original,
      state: { ...original.state, capture: { ...capture, bytes: ` ${capture.bytes}` } },
    };
    const bytes = JSON.stringify(malformed);
    writeFileSync(path, bytes);
    expect(() => fileJournal(path).read()).toThrow('original SHA-256');
    expect(readFileSync(path, 'utf8')).toBe(bytes);
  });

  it('distinguishes an unreadable journal from an absent one', () => {
    const path = join(directory(), 'release.json');
    writeFileSync(path, JSON.stringify(record()));
    chmodSync(path, 0o000);
    expect(() => fileJournal(path).read()).toThrow('is unreadable');
  });
});
