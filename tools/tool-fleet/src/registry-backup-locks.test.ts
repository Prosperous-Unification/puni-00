import { expect, test } from 'bun:test';

import { prepareRegistryBackupAttempt } from './registry-backup-attempt';
import {
  reconcileRegistryBackupLocks,
  type RegistryBackupLockVersion,
} from './registry-backup-locks';
import { invokeRegistryCallback } from './registry-callback';
import { requireRejection, requireResolution } from './registry-rejection.fixture';
const attempt = prepareRegistryBackupAttempt({
  operationId: 'owned',
  token: '11111111-1111-4111-8111-111111111111',
  action: 'backup-snapshot',
  configurationSha256: 'a'.repeat(64),
  registryId: 'registry',
  journalRevision: 7,
  now: '2026-10-26T00:00:00.000Z',
  guardian: {
    pid: 42,
    startTicks: '100',
    pidNamespace: 'pid:[4026531836]',
    machineId: 'b'.repeat(32),
    bootId: '22222222-2222-4222-8222-222222222222',
  },
});
const encrypted = 'c'.repeat(64);
const version = (versionId: string, visible: boolean): RegistryBackupLockVersion => ({
  key: `locks/${encrypted}`,
  versionId,
  kind: 'object',
  sha256: encrypted,
  bytes: 234,
  visible,
});
const lock = {
  time: '2026-10-26T00:00:01.000Z',
  exclusive: true,
  hostname: attempt.utsHostname,
  username: 'root',
  pid: 43,
};
function fixture() {
  let versions: RegistryBackupLockVersion[] = [version('current', true), version('older', false)];
  const deleted: string[] = [];
  const inspected: string[] = [];
  return {
    deleted,
    inspected,
    get versions() {
      return versions;
    },
    set versions(selected: RegistryBackupLockVersion[]) {
      versions = selected;
    },
    ports: {
      census: () => invokeRegistryCallback(() => structuredClone(versions)),
      inspect: (observed: RegistryBackupLockVersion) =>
        invokeRegistryCallback(() => {
          inspected.push(observed.versionId);
          return JSON.stringify(lock);
        }),
      proveStopped: () => invokeRegistryCallback(() => undefined),
      removeVersion: (observed: RegistryBackupLockVersion) =>
        invokeRegistryCallback(() => {
          deleted.push(observed.versionId);
          versions = versions.filter((candidate) => candidate.versionId !== observed.versionId);
          const next = versions.find((candidate) => candidate.key === observed.key);
          if (next !== undefined) next.visible = true;
        }),
    },
  };
}
test('reconciliation deletes exact proven visible versions and rechecks a revealed older version', async () => {
  const selected = fixture();
  const receipt = await reconcileRegistryBackupLocks(
    [attempt],
    attempt.configurationSha256,
    selected.ports,
  );
  expect(selected.deleted).toEqual(['current', 'older']);
  expect(selected.inspected).toEqual(['current', 'older']);
  expect(receipt.attemptIds).toEqual([attempt.id]);
  expect(receipt.removed.map((version) => version.versionId)).toEqual(selected.deleted);
  expect(selected.versions).toEqual([]);
});
test('hidden historical versions and delete markers are preserved when no visible lock exists', async () => {
  const selected = fixture();
  selected.versions = [
    version('older', false),
    { key: `locks/${encrypted}`, versionId: 'marker', kind: 'delete-marker', visible: true },
  ];
  await reconcileRegistryBackupLocks([attempt], attempt.configurationSha256, selected.ports);
  expect(selected.deleted).toEqual([]);
  expect(selected.inspected).toEqual([]);
  expect(selected.versions).toHaveLength(2);
});
for (const fault of [
  'unknown-name',
  'hash',
  'duplicate-visible',
  'duplicate-version',
  'missing-version',
  'foreign',
  'configuration',
  'settled',
  'live',
  'unreadable',
  'malformed',
  'inspection-race',
  'delete-race',
  'foreign-revealed',
] as const) {
  test(`lock reconciliation refuses ${fault} without certifying cleanup`, async () => {
    const selected = fixture();
    const owned = structuredClone(attempt);
    if (fault === 'unknown-name') selected.versions[0].key = 'locks/unknown';
    if (fault === 'hash') {
      const first = selected.versions[0];
      if (first.kind === 'object') first.sha256 = 'd'.repeat(64);
    }
    if (fault === 'duplicate-visible') selected.versions[1].visible = true;
    if (fault === 'duplicate-version') selected.versions[1].versionId = 'current';
    if (fault === 'missing-version') selected.versions[0].versionId = '';
    if (fault === 'foreign')
      selected.ports.inspect = () =>
        invokeRegistryCallback(() => JSON.stringify({ ...lock, hostname: 'foreign-host' }));
    if (fault === 'configuration') owned.configurationSha256 = 'd'.repeat(64);
    if (fault === 'settled') {
      owned.state = 'settled';
      owned.settlementSha256 = 'd'.repeat(64);
    }
    if (fault === 'live')
      selected.ports.proveStopped = () =>
        invokeRegistryCallback(() => {
          throw new Error('origin live');
        });
    if (fault === 'unreadable')
      selected.ports.inspect = () =>
        invokeRegistryCallback(() => {
          throw new Error('EACCES');
        });
    if (fault === 'malformed') selected.ports.inspect = () => invokeRegistryCallback(() => '{}');
    if (fault === 'inspection-race')
      selected.ports.inspect = () =>
        invokeRegistryCallback(() => {
          selected.versions[0].versionId = 'changed';
          return JSON.stringify(lock);
        });
    if (fault === 'delete-race')
      selected.ports.removeVersion = () =>
        invokeRegistryCallback(() => {
          selected.versions = [];
        });
    if (fault === 'foreign-revealed')
      selected.ports.inspect = (observed) =>
        invokeRegistryCallback(() =>
          JSON.stringify({
            ...lock,
            hostname: observed.versionId === 'older' ? 'foreign' : lock.hostname,
          }),
        );
    expect(
      (
        await requireRejection(
          reconcileRegistryBackupLocks([owned], attempt.configurationSha256, selected.ports),
        )
      ).throwCause,
    ).toThrow();
    if (!['delete-race', 'foreign-revealed'].includes(fault)) expect(selected.deleted).toEqual([]);
  });
}
test('ordinary multiweek lock history does not consume an empty recovery mutation receipt', async () => {
  const selected = fixture();
  selected.versions = [];
  for (let index = 0; index < 5000; index++) {
    const digest = index.toString(16).padStart(64, '0');
    selected.versions.push({
      key: `locks/${digest}`,
      versionId: 'historical-version',
      kind: 'object',
      sha256: digest,
      bytes: 234,
      visible: false,
    });
    selected.versions.push({
      key: `locks/${digest}`,
      versionId: 'visible-delete-marker',
      kind: 'delete-marker',
      visible: true,
    });
  }
  const before = structuredClone(selected.versions);
  const receipt = await reconcileRegistryBackupLocks(
    [attempt],
    attempt.configurationSha256,
    selected.ports,
  );
  expect(receipt.removed).toEqual([]);
  expect(selected.versions).toEqual(before);
  expect(selected.inspected).toEqual([]);
  expect(JSON.stringify(receipt).length).toBeLessThan(1024);
});
test('historical-only corruption still refuses a no-active-lock recovery', async () => {
  const selected = fixture();
  selected.versions = [
    version('older', false),
    { key: `locks/${encrypted}`, versionId: 'marker', kind: 'delete-marker', visible: true },
  ];
  const older = selected.versions[0];
  if (older.kind !== 'object') throw new Error('Missing modeled object');
  older.sha256 = 'd'.repeat(64);
  expect(
    (
      await requireRejection(
        reconcileRegistryBackupLocks([attempt], attempt.configurationSha256, selected.ports),
      )
    ).throwCause,
  ).toThrow('corrupt');
  expect(selected.deleted).toEqual([]);
});
test('nonempty key without a visible latest version refuses incomplete provider history', async () => {
  const selected = fixture();
  selected.versions = [version('older', false)];
  expect(
    (
      await requireRejection(
        reconcileRegistryBackupLocks([attempt], attempt.configurationSha256, selected.ports),
      )
    ).throwCause,
  ).toThrow('latest');
  expect(selected.deleted).toEqual([]);
});
import { verifyRegistryBackupRepository } from './registry-backup-locks';
for (const fault of ['visible', 'identity', 'race', 'none'] as const) {
  test(`ordinary worker checks complete raw lock census and immutable repository identity: ${fault}`, async () => {
    const selected = fixture();
    if (fault !== 'visible') selected.versions = [];
    let inspected = false;
    const pending = verifyRegistryBackupRepository(selected.ports, 'a'.repeat(64), () =>
      invokeRegistryCallback(() => {
        inspected = true;
        if (fault === 'race') selected.versions = [version('new', true)];
        return fault === 'identity' ? 'b'.repeat(64) : 'a'.repeat(64);
      }),
    );
    if (fault === 'none') expect(await requireResolution(pending)).toBeUndefined();
    else expect((await requireRejection(pending)).throwCause).toThrow();
    if (fault === 'visible') expect(inspected).toBe(false);
  });
}

test('recovery inspection binds a deterministic complete census despite collation-equivalent version identities', async () => {
  const { createHash } = await import('node:crypto');
  const selected = fixture();
  selected.versions = [version('é', true), version('e\u0301', false)];
  let calls = 0;
  const hashes: string[] = [];
  const receipt = await reconcileRegistryBackupLocks([attempt], attempt.configurationSha256, {
    ...selected.ports,
    census: () =>
      invokeRegistryCallback(() => {
        calls++;
        const observed = structuredClone(selected.versions);
        return calls % 2 === 0 ? observed.reverse() : observed;
      }),
    inspect: (_observed, censusSha256) =>
      invokeRegistryCallback(() => {
        hashes.push(censusSha256);
        return JSON.stringify(lock);
      }),
  });
  const expected = createHash('sha256')
    .update(JSON.stringify([version('e\u0301', false), version('é', true)]))
    .digest('hex');
  expect(hashes[0]).toBe(expected);
  expect(new Set(hashes).size).toBe(2);
  expect(receipt.removed.map((entry) => entry.versionId)).toEqual(['é', 'e\u0301']);
});

test('recovery inspection does not invent a new census from property insertion order', async () => {
  const selected = fixture();
  let calls = 0;
  const receipt = await reconcileRegistryBackupLocks([attempt], attempt.configurationSha256, {
    ...selected.ports,
    census: () =>
      invokeRegistryCallback(() => {
        calls++;
        return calls % 2 === 0
          ? selected.versions.map(
              (observed) =>
                Object.fromEntries(Object.entries(observed).reverse()) as RegistryBackupLockVersion,
            )
          : structuredClone(selected.versions);
      }),
  });
  expect(receipt.removed.map((observed) => observed.versionId)).toEqual(['current', 'older']);
});
