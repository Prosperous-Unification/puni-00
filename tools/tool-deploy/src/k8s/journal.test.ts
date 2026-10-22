import { chmodSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import { fileJournal, type JournalRecord } from './journal';
import { migrationIdentityOf, sealMigrationCapture } from './migration-capture';
import { initialState, type ReleaseRequest } from './release';
import { sealReplayReceipt } from './replay-receipt';
import { sealStorageOwnership } from './storage-ownership';

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

const seed = initialState(request);
const fixedState = {
  ...seed,
  phase: 'migrated' as const,
  controllers: {
    forward: {
      ownership: sealStorageOwnership(
        {
          transactionId: seed.transactionId,
          clusterUid: request.cluster.uid,
          namespace: request.namespaces.backend,
          storage: {
            namespace: request.namespaces.backend,
            pvcName: 'wbs-data',
            pvcUid: 'pvc',
            volumeName: 'disk',
            pvUid: 'pv',
            databasePath: '/data/wbs.sqlite',
          },
          flux: null,
        },
        {
          fluxUid: null,
          owner: {
            kind: 'CronJob',
            name: 'sqlite-backup',
            uid: 'backup',
            resourceVersion: '1',
            templateSha256: 'a'.repeat(64),
            suspension: { kind: 'absent' },
          },
        },
        'token',
      ),
      stage: 'drained' as const,
    },
    rollback: null,
  },
  replayForward: sealReplayReceipt(
    request,
    seed.transactionId,
    'forward',
    [],
    { image: identity.images.backend, capabilities: [] },
    { image: identity.images.backend, capabilities: [] },
  ),
};

function record(): JournalRecord {
  return {
    schemaVersion: 4,
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
    writeFileSync(path, JSON.stringify({ ...record(), schemaVersion: 5 }));
    expect(() => fileJournal(path).read()).toThrow('unsupported schema version');
  });

  for (const schemaVersion of [1, 2, 3]) {
    it(`refuses a legacy in-flight journal schema ${String(schemaVersion)} without replacing its bytes`, () => {
      const path = join(directory(), 'release.json');
      const legacy = JSON.stringify({ ...record(), schemaVersion });
      writeFileSync(path, legacy);
      expect(() => fileJournal(path).read()).toThrow('legacy migration capture');
      expect(readFileSync(path, 'utf8')).toBe(legacy);
    });
  }

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

it('refuses missing or malformed controller lifecycle trusted state', () => {
  const path = join(directory(), 'release.json');
  const valid = record();
  const { controllers: _controllers, ...missing } = valid.state;
  writeFileSync(path, JSON.stringify({ ...valid, state: missing }));
  expect(() => fileJournal(path).read()).toThrow('controller lifecycle');
  writeFileSync(
    path,
    JSON.stringify({ ...valid, state: { ...valid.state, controllers: { stage: 'suspended' } } }),
  );
  expect(() => fileJournal(path).read()).toThrow();
});

it('refuses missing source drain and restore acknowledgments in durable phase history', () => {
  const path = join(directory(), 'release.json');
  const valid = record();
  writeFileSync(
    path,
    JSON.stringify({
      ...valid,
      state: { ...valid.state, controllers: { forward: null, rollback: null } },
    }),
  );
  expect(() => fileJournal(path).read()).toThrow('missing forward controller interval');
  const forward = valid.state.controllers.forward;
  writeFileSync(
    path,
    JSON.stringify({
      ...valid,
      state: {
        ...valid.state,
        controllers: { forward: { ...forward, stage: 'suspended' }, rollback: null },
      },
    }),
  );
  expect(() => fileJournal(path).read()).toThrow('drain acknowledgment');
  writeFileSync(
    path,
    JSON.stringify({ ...valid, state: { ...valid.state, phase: 'backend-ready' } }),
  );
  expect(() => fileJournal(path).read()).toThrow('restore acknowledgment');
});
