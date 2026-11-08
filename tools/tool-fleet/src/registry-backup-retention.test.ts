import { createHash } from 'node:crypto';
import { chmod, mkdir, open, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { dlopen } from 'bun:ffi';
import { expect, test } from 'bun:test';

import { modelRegistryBackupEffects } from './registry-backup-reservation.fixture';
import type { RegistryBackupSnapshotVersion } from './registry-backup-retention';
import { createRegistryBackupStore } from './registry-backup-store';
import { scopeMaintenanceReaper } from './registry-maintenance-reaper.fixture';
import type { RegistryBackupReceipt } from './registry-maintenance-state';

scopeMaintenanceReaper();
const digest = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');
const id = (count: number) => count.toString(16).padStart(64, '0');
const sampledAt = '2026-11-01T00:00:00.000Z';
const dates = [
  '2026-10-31',
  '2026-10-30',
  '2026-10-29',
  '2026-10-28',
  '2026-10-27',
  '2026-10-26',
  '2026-10-25',
  '2026-10-18',
  '2026-10-11',
];
const snapshot = (count: number, time: string, journal: string) => ({
  id: id(count),
  short_id: id(count).slice(0, 8),
  time,
  tree: 'a'.repeat(64),
  paths: ['/registry/old', journal],
  hostname: 'proof',
  username: 'fixture',
  uid: 1000,
  gid: 1000,
  tags: ['puni-registry-owned'],
  program_version: 'restic 0.19.1',
  summary: { total_bytes_processed: 16 },
});
type Snapshot = ReturnType<typeof snapshot>;

async function fixture(
  run: (context: {
    store: ReturnType<typeof createRegistryBackupStore>;
    createStore: (
      overrides?: Partial<Parameters<typeof createRegistryBackupStore>[0]>,
    ) => ReturnType<typeof createRegistryBackupStore>;
    releaseAuthority: () => void;
    journal: string;
    repository: string;
    authority: { authorityDescriptor: number };
    snapshots: Snapshot[];
    inspect: (
      overrides?: Record<string, unknown>,
    ) => ReturnType<ReturnType<typeof createRegistryBackupStore>['inspectRetention']>;
    publish: (snapshots: readonly Snapshot[]) => Promise<void>;
  }) => Promise<void>,
) {
  const directory = await scratchAsync('registry-retention-');
  const repository = join(directory, 'repository');
  const journal = join(directory, 'journal');
  await mkdir(repository);
  await mkdir(journal);
  const executable = join(directory, 'restic');
  await writeFile(
    executable,
    '#!' +
      process.execPath +
      '\nimport ' +
      JSON.stringify(join(import.meta.dir, 'registry-backup-retention.fixture.ts')) +
      ';\n',
    { mode: 0o700 },
  );
  await writeFile(join(repository, 'config.json'), JSON.stringify({ id: 'c'.repeat(64) }));
  await writeFile(join(repository, 'failure'), '');
  await writeFile(join(repository, 'journal.json'), '{"revision":7}');
  const snapshots = dates.map((date, index) => snapshot(index + 1, date + 'T12:00:00Z', journal));
  await writeFile(join(repository, 'snapshots.json'), JSON.stringify(snapshots));
  const lock = await open(join(journal, 'authority.lock'), 'wx', 0o600);
  const native = dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } });
  if (native.symbols.flock(lock.fd, 2 | 4) !== 0) throw new Error('Fixture lock refused');
  const authority = { authorityDescriptor: lock.fd };
  const binarySha256 = digest(await readFile(executable));
  const createStore = (overrides: Partial<Parameters<typeof createRegistryBackupStore>[0]> = {}) =>
    createRegistryBackupStore({
      effects: modelRegistryBackupEffects(),
      signal: new AbortController().signal,
      repositoryId: 'c'.repeat(64),
      binary: executable,
      binarySha256,
      environment: { RESTIC_REPOSITORY: repository },
      admit: () => {
        throw new Error('Retention must not grant admission');
      },
      ...overrides,
    });
  const store = createStore();
  const releaseAuthority = () => {
    if (native.symbols.flock(lock.fd, 8) !== 0) throw new Error('Fixture lock release failed');
  };
  const publish = async (records: readonly Snapshot[]) => {
    snapshots.splice(0, snapshots.length, ...records);
    await writeFile(join(repository, 'snapshots.json'), JSON.stringify(snapshots));
  };
  const inspect = (overrides: Record<string, unknown> = {}) =>
    store.inspectRetention(
      {
        registryId: 'proof',
        journalPath: journal,
        sampledAt,
        lastVerified: null,
        recoveryPins: [],
        observeSnapshotVersions: () =>
          Promise.resolve(
            snapshots.map(({ id: snapshotId }) => ({
              kind: 'object' as const,
              snapshotId,
              versionId: 'current',
              visible: true,
              bytes: 128,
            })),
          ),
        ...overrides,
      },
      authority,
    );
  try {
    await run({
      store,
      createStore,
      releaseAuthority,
      journal,
      repository,
      authority,
      snapshots,
      inspect,
      publish,
    });
  } finally {
    await lock.close();
    native.close();
    await rm(directory, { recursive: true });
  }
}

test('complete recovery coverage selects seven days and four Monday weeks across storage rebinds', () =>
  fixture(async ({ snapshots, journal, publish, inspect }) => {
    await publish([
      ...snapshots,
      { ...snapshot(10, '2026-10-31T10:00:00Z', journal), paths: ['/registry/new', journal] },
      snapshot(11, '2026-10-01T00:00:00Z', journal),
    ]);
    const plan = await inspect();
    expect(plan.coverage).toEqual({
      complete: true,
      daily: {
        required: 7,
        observed: 10,
        buckets: [
          '2026-10-31',
          '2026-10-30',
          '2026-10-29',
          '2026-10-28',
          '2026-10-27',
          '2026-10-26',
          '2026-10-25',
        ],
      },
      weekly: {
        required: 4,
        observed: 5,
        buckets: ['2026-10-26', '2026-10-19', '2026-10-12', '2026-10-05'],
      },
    });
    expect(plan.eligibleSnapshotIds).toEqual([id(10), id(11)]);
    expect(plan.retained.find((entry) => entry.snapshotId === id(1))?.reasons).toEqual([
      'daily',
      'weekly',
    ]);
    expect(plan.retained.map((entry) => entry.snapshotId)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(id),
    );
  }));

test('bootstrap and empty catalogues preserve all snapshots with explicit incomplete coverage', () =>
  fixture(async ({ snapshots, publish, inspect }) => {
    await publish(snapshots.slice(0, 2));
    const bootstrap = await inspect();
    expect(bootstrap.coverage.complete).toBe(false);
    expect(bootstrap.eligibleSnapshotIds).toEqual([]);
    expect(bootstrap.retained.every((entry) => entry.reasons.includes('incomplete-coverage'))).toBe(
      true,
    );
    await publish([]);
    const empty = await inspect();
    expect(empty.catalogue).toEqual([]);
    expect(empty.coverage.daily.observed).toBe(0);
    expect(empty.coverage.weekly.observed).toBe(0);
    expect(empty.coverage.complete).toBe(false);
  }));

test('last verified and explicit recovery pins retain exact old snapshots and bind journal metadata', () =>
  fixture(async ({ snapshots, journal, publish, inspect }) => {
    await publish([
      ...snapshots,
      snapshot(10, '2026-10-01T00:00:00Z', journal),
      snapshot(11, '2026-09-01T00:00:00Z', journal),
    ]);
    const lastVerified: RegistryBackupReceipt = {
      snapshotId: id(10),
      verifiedAt: '2026-10-02T00:00:00.000Z',
      registryId: 'proof',
      storageId: 'old',
      registryPath: '/registry/old',
      journalPath: journal,
      journalRevision: 7,
      journalSha256: digest('{"revision":7}'),
      censusSha256: 'a'.repeat(64),
      bytes: 16,
    };
    const plan = await inspect({ lastVerified, recoveryPins: [id(11)] });
    expect(plan.eligibleSnapshotIds).toEqual([]);
    expect(plan.retained.find((entry) => entry.snapshotId === id(10))?.reasons).toEqual([
      'last-verified',
    ]);
    expect(plan.retained.find((entry) => entry.snapshotId === id(11))?.reasons).toEqual([
      'recovery-pin',
    ]);
    for (const changed of [
      { registryId: 'foreign' },
      { registryPath: '/registry/other' },
      { journalPath: '/journal/other' },
      { bytes: 17 },
      { journalSha256: 'b'.repeat(64) },
      { journalRevision: 8 },
      { verifiedAt: '2026-09-30T00:00:00.000Z' },
      { snapshotId: id(99) },
    ])
      await requireRefusal(inspect({ lastVerified: { ...lastVerified, ...changed } }));
  }));

test('UTC offset and Monday year boundary selection preserve nanosecond newest ordering', () =>
  fixture(async ({ journal, publish, inspect }) => {
    await publish([
      snapshot(1, '2026-01-05T00:30:00+01:00', journal),
      snapshot(2, '2026-01-04T23:30:00.000000001Z', journal),
      snapshot(3, '2026-01-05T00:00:00Z', journal),
      snapshot(4, '2026-01-01T00:00:00Z', journal),
    ]);
    const plan = await inspect();
    expect(plan.catalogue.map((entry) => entry.snapshotId)).toEqual([id(3), id(2), id(1), id(4)]);
    expect(plan.coverage.weekly.buckets).toEqual(['2026-01-05', '2025-12-29']);
    expect(plan.coverage.daily.buckets).toEqual(['2026-01-05', '2026-01-04', '2026-01-01']);
  }));

for (const [name, change] of [
  ['short identity', { id: 'abcdef12' }],
  ['future timestamp', { time: '2026-11-01T00:00:00.000000001Z' }],
  ['invalid leap day', { time: '2026-02-29T12:00:00Z' }],
  ['invalid zone', { time: '2026-10-01T00:00:00+24:00' }],
  ['invalid hour', { time: '2026-10-01T24:00:00Z' }],
  ['missing timestamp offset', { time: '2026-10-01T12:00:00' }],
  ['malformed nanoseconds', { time: '2026-10-01T12:00:00.0000000001Z' }],
  ['foreign ownership', { hostname: 'foreign' }],
  ['ambiguous path', { paths: ['/registry/old', '/journal/other'] }],
  ['nested paths', { paths: ['/journal', '/journal/registry'] }],
  ['unnormalized path', { paths: ['/registry/../registry/old', '/journal'] }],
  ['missing operation ownership', { tags: [] }],
  ['malformed summary', { summary: { total_bytes_processed: Number.MAX_SAFE_INTEGER + 1 } }],
] as const)
  test('catalogue refuses ' + name, () =>
    fixture(async ({ snapshots, publish, inspect }) => {
      await publish([{ ...snapshots[0], ...change } as Snapshot]);
      await requireRefusal(inspect());
    }),
  );

test('catalogue refuses duplicate records, malformed and partial JSON, missing and extra exact visible identities', () =>
  fixture(async ({ snapshots, repository, publish, inspect }) => {
    await publish([snapshots[0], snapshots[0]]);
    await requireRefusal(inspect());
    await publish([snapshots[0]]);
    for (const output of [
      '[',
      '{}',
      '[null]',
      JSON.stringify([{ ...snapshots[0], id: id(99) }]),
      '[]',
    ]) {
      await writeFile(join(repository, 'snapshots.json'), output);
      await requireRefusal(inspect());
    }
  }));

test('version bookends include hidden history and markers and refuse unstable or incomplete census', () =>
  fixture(async ({ snapshots, inspect }) => {
    const versions: RegistryBackupSnapshotVersion[] = snapshots.map(({ id: snapshotId }) => ({
      kind: 'object',
      snapshotId,
      versionId: 'current',
      visible: true,
      bytes: 128,
    }));
    versions.push(
      { kind: 'object', snapshotId: id(1), versionId: 'history', visible: false, bytes: 127 },
      { kind: 'delete-marker', snapshotId: id(99), versionId: 'marker', visible: true },
    );
    const stable = await inspect({
      observeSnapshotVersions: () => Promise.resolve([...versions].reverse()),
    });
    expect(stable.catalogue).toHaveLength(9);
    let observations = 0;
    await requireRefusal(
      inspect({
        observeSnapshotVersions: () =>
          Promise.resolve(
            ++observations === 1
              ? versions
              : versions.map((version) =>
                  version.versionId === 'history' ? { ...version, bytes: 126 } : version,
                ),
          ),
      }),
    );
    for (const broken of [
      undefined,
      versions.slice(1),
      [...versions, versions[0]],
      [{ kind: 'object', snapshotId: id(1), versionId: 'history', visible: false, bytes: 128 }],
      [{ kind: 'object', snapshotId: id(1), versionId: '', visible: true, bytes: 128 }],
      [{ kind: 'object', snapshotId: id(1), versionId: 'v', visible: true, bytes: -1 }],
    ])
      await requireRefusal(inspect({ observeSnapshotVersions: () => Promise.resolve(broken) }));
  }));

test('pins and mandatory inputs cannot silently drop protection', () =>
  fixture(async ({ inspect, journal }) => {
    for (const overrides of [
      { recoveryPins: [id(1), id(1)] },
      { recoveryPins: ['abcdef12'] },
      { recoveryPins: [id(99)] },
      { recoveryPins: undefined },
      { lastVerified: undefined },
      { sampledAt: 'tomorrow' },
      { registryId: '' },
      { journalPath: journal + '/..' },
    ])
      await requireRefusal(inspect(overrides));
  }));

test('production catalogue refuses repository changes and unreadable subprocess dependency output', () =>
  fixture(async ({ inspect, repository }) => {
    await writeFile(join(repository, 'config.json'), JSON.stringify({ id: 'd'.repeat(64) }));
    await requireRefusal(inspect());
    await writeFile(join(repository, 'config.json'), JSON.stringify({ id: 'c'.repeat(64) }));
    await writeFile(join(repository, 'failure'), 'exit');
    await requireRefusal(inspect());
    await writeFile(join(repository, 'failure'), '');
    await rm(join(repository, 'snapshots.json'));
    await requireRefusal(inspect());
    await mkdir(join(repository, 'snapshots.json'));
    await requireRefusal(inspect());
  }));

test('bounded observations and snapshot parser reject record, byte and arithmetic overflow', () =>
  fixture(async ({ snapshots, inspect, repository }) => {
    const version = {
      kind: 'object',
      snapshotId: id(1),
      versionId: 'v',
      visible: true,
      bytes: 128,
    };
    for (const versions of [
      Array.from({ length: 8193 }, (_, index) => ({ ...version, snapshotId: id(index + 1) })),
      [
        { ...version, bytes: Number.MAX_SAFE_INTEGER },
        { ...version, snapshotId: id(2), bytes: 1 },
      ],
      Array.from({ length: 4096 }, (_, index) => ({
        ...version,
        snapshotId: id(index + 1),
        versionId: 'x'.repeat(1024),
      })),
      [{ ...version, versionId: 'x'.repeat(1025) }],
      [{ ...version, unexpected: true }],
      [
        { ...version, visible: false },
        { ...version, versionId: 'other', visible: false },
      ],
      [version, { ...version, versionId: 'other' }],
    ])
      await requireRefusal(inspect({ observeSnapshotVersions: () => Promise.resolve(versions) }));
    await writeFile(
      join(repository, 'snapshots.json'),
      JSON.stringify(
        Array.from({ length: 2049 }, (_, index) => ({ ...snapshots[0], id: id(index + 1) })),
      ),
    );
    await requireRefusal(inspect());
    await writeFile(
      join(repository, 'snapshots.json'),
      ' '.repeat(8 * 1024 ** 2) + JSON.stringify(snapshots),
    );
    await requireRefusal(inspect());
  }));

test('census bookends cannot mutate mandatory inputs or lose current visibility', () =>
  fixture(async ({ inspect, snapshots }) => {
    const pins = [id(1)];
    const versions = snapshots.map(({ id: snapshotId }) => ({
      kind: 'object',
      snapshotId,
      versionId: 'v',
      visible: true,
      bytes: 128,
    }));
    const plan = await inspect({
      recoveryPins: pins,
      observeSnapshotVersions: () => {
        pins.splice(0);
        return Promise.resolve(versions);
      },
    });
    expect(plan.retained.find((entry) => entry.snapshotId === id(1))?.reasons).toContain(
      'recovery-pin',
    );
  }));

const binary = process.env['PUNI_TEST_RESTIC_BINARY'];
test.skipIf(binary === undefined)(
  'actual pinned restic catalogue detects missing, corrupt and unreadable snapshot ciphertext',
  async () => {
    if (binary === undefined) throw new Error('Missing requested native restic');
    expect(digest(await readFile(binary))).toBe(
      '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
    );
    const directory = await scratchAsync('registry-retention-native-');
    const registry = join(directory, 'registry');
    const journal = join(directory, 'journal');
    const repository = join(directory, 'repository');
    await mkdir(registry);
    await mkdir(journal);
    await writeFile(join(registry, 'blob'), 'known bytes');
    await writeFile(join(journal, 'journal.json'), '{"revision":7}');
    const environment = {
      RESTIC_REPOSITORY: repository,
      RESTIC_PASSWORD: 'owned-retention-fixture',
    };
    const execute = async (arguments_: string[]) => {
      const child = Bun.spawn([binary, '--no-cache', ...arguments_], {
        env: { PATH: '/usr/bin:/bin', ...environment },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      if (status !== 0) throw new Error('Native fixture dependency failed: ' + stderr);
      return stdout;
    };
    expect(await execute(['version'])).toContain('restic 0.19.1');
    await execute(['init']);
    const configuration = JSON.parse(await execute(['cat', 'config'])) as { id: string };
    const store = createRegistryBackupStore({
      effects: modelRegistryBackupEffects(),
      signal: new AbortController().signal,
      repositoryId: configuration.id,
      binary,
      binarySha256: digest(await readFile(binary)),
      sourceLimits: {
        registry: {
          maximumLogicalBytes: 1048576,
          maximumEntries: 100,
          maximumDepth: 10,
          maximumMetadataBytes: 65536,
          maximumFanout: 100,
        },
        journal: {
          maximumLogicalBytes: 1048576,
          maximumEntries: 100,
          maximumDepth: 10,
          maximumMetadataBytes: 65536,
          maximumFanout: 100,
        },
      },
      environment,
      admit: () => Promise.resolve(),
    });
    const lock = await open(join(journal, 'authority.lock'), 'wx', 0o600);
    const native = dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } });
    if (native.symbols.flock(lock.fd, 2 | 4) !== 0) throw new Error('Native fixture lock refused');
    const authority = { authorityDescriptor: lock.fd };
    const observeSnapshotVersions = async (): Promise<RegistryBackupSnapshotVersion[]> =>
      Promise.all(
        (await readdir(join(repository, 'snapshots')))
          .filter((name) => /^[a-f0-9]{64}$/.test(name))
          .map(async (snapshotId) => ({
            kind: 'object' as const,
            snapshotId,
            versionId: 'owned-immutable',
            visible: true,
            bytes: (await readFile(join(repository, 'snapshots', snapshotId))).byteLength,
          })),
      );
    const inspect = (
      observe = observeSnapshotVersions,
      lastVerified: RegistryBackupReceipt | null = null,
    ) =>
      store.inspectRetention(
        {
          registryId: 'proof',
          journalPath: journal,
          sampledAt: new Date().toISOString(),
          lastVerified,
          recoveryPins: [],
          observeSnapshotVersions: observe,
        },
        authority,
      );
    try {
      expect((await inspect()).catalogue).toEqual([]);
      const receipt = await store.snapshot(
        {
          operationId: 'retention-owned',
          registryId: 'proof',
          storageId: 'owned',
          registryPath: registry,
          journalPath: journal,
          journalRevision: 7,
          maximumBytes: 1024 ** 2,
          journalMaximumBytes: 1024 ** 2,
          censusSha256: 'a'.repeat(64),
        },
        authority,
      );
      expect((await inspect(observeSnapshotVersions, receipt)).retained[0]?.reasons).toContain(
        'last-verified',
      );
      const versions = await observeSnapshotVersions();
      const ciphertext = join(repository, 'snapshots', receipt.snapshotId);
      const original = await readFile(ciphertext);
      await chmod(ciphertext, 0o600);
      await writeFile(ciphertext, 'corrupt snapshot');
      await requireRefusal(inspect(() => Promise.resolve(versions)));
      await writeFile(ciphertext, original);
      await rm(ciphertext);
      await requireRefusal(inspect(() => Promise.resolve(versions)));
      await writeFile(ciphertext, original, { mode: 0o600 });
      await chmod(ciphertext, 0o000);
      await requireRefusal(inspect(() => Promise.resolve(versions)));
    } finally {
      await lock.close();
      native.close();
      await rm(directory, { recursive: true });
    }
  },
  30000,
);

async function requireRefusal(pending: Promise<unknown>): Promise<void> {
  try {
    await pending;
  } catch (cause) {
    expect(cause).toBeInstanceOf(Error);
    return;
  }
  throw new Error('Expected production retention consumer to refuse');
}

test('operation tags preserve the existing bounded operation identity contract', () =>
  fixture(async ({ snapshots, publish, inspect }) => {
    await publish([
      { ...snapshots[0], tags: ['puni-registry-backup:operation/' + 'x'.repeat(230)] },
    ]);
    expect((await inspect()).catalogue[0]?.snapshotId).toBe(id(1));
  }));

test('snapshot count and full hidden-history bounds cannot hide behind later catalogue mismatch', () =>
  fixture(async ({ snapshots, journal, inspect, publish }) => {
    const visible = snapshots.map(({ id: snapshotId }) => ({
      kind: 'object' as const,
      snapshotId,
      versionId: 'current',
      visible: true,
      bytes: 128,
    }));
    const hidden = (count: number, length: number) =>
      Array.from({ length: count }, (_, index) => ({
        kind: 'object',
        snapshotId: id(1),
        versionId: index.toString().padStart(length, 'x'),
        visible: false,
        bytes: 0,
      }));
    for (const versions of [
      [...visible, ...hidden(8184, 10)],
      [...visible, ...hidden(4096, 1024)],
      visible.map((version, index) => ({
        ...version,
        bytes: index === 0 ? Number.MAX_SAFE_INTEGER : 1,
      })),
    ])
      await requireRefusal(inspect({ observeSnapshotVersions: () => Promise.resolve(versions) }));
    await publish(
      Array.from({ length: 2049 }, (_, index) =>
        snapshot(index + 1, '2026-10-31T00:00:00Z', journal),
      ),
    );
    await requireRefusal(inspect());
  }));

test('duplicate restic records refuse even when the physical census is unique and complete', () =>
  fixture(async ({ snapshots, repository, inspect }) => {
    await writeFile(
      join(repository, 'snapshots.json'),
      JSON.stringify([...snapshots, snapshots[0]]),
    );
    await requireRefusal(inspect());
  }));

test('version guard faults refuse at the observation boundary before launching restic', () =>
  fixture(async ({ snapshots, inspect }) => {
    const visible = snapshots.map(({ id: snapshotId }) => ({
      kind: 'object',
      snapshotId,
      versionId: 'v',
      visible: true,
      bytes: 128,
    }));
    for (const broken of [
      [...visible, visible[0]],
      [...visible, { ...visible[0], versionId: 'other' }],
      [
        ...visible,
        { kind: 'object', snapshotId: id(99), versionId: 'invisible', visible: false, bytes: 128 },
      ],
    ])
      await requireRefusal(inspect({ observeSnapshotVersions: () => Promise.resolve(broken) }));
  }));

test('mandatory validation refuses before external observation', () =>
  fixture(async ({ inspect }) => {
    let observations = 0;
    for (const overrides of [
      { lastVerified: undefined },
      { recoveryPins: undefined },
      { registryId: '' },
      { recoveryPins: ['short'] },
    ]) {
      await requireRefusal(
        inspect({
          ...overrides,
          observeSnapshotVersions: () => {
            observations++;
            return Promise.resolve([]);
          },
        }),
      );
      expect(observations).toBe(0);
    }
  }));

test('full coherent version rows refuse malformed fields and duplicated hidden identities', () =>
  fixture(async ({ snapshots, inspect }) => {
    const versions = snapshots.map(({ id: snapshotId }) => ({
      kind: 'object',
      snapshotId,
      versionId: 'v',
      visible: true,
      bytes: 128,
    }));
    for (const change of [
      { bytes: -1 },
      { versionId: '' },
      { unexpected: true },
      { snapshotId: 'short' },
    ])
      await requireRefusal(
        inspect({
          observeSnapshotVersions: () =>
            Promise.resolve(
              versions.map((version, index) => (index === 0 ? { ...version, ...change } : version)),
            ),
        }),
      );
    const hidden = {
      kind: 'object',
      snapshotId: id(1),
      versionId: 'history',
      visible: false,
      bytes: 128,
    };
    await requireRefusal(
      inspect({ observeSnapshotVersions: () => Promise.resolve([...versions, hidden, hidden]) }),
    );
  }));

test('contents path guards reject normalized and nested aliases with otherwise matching journal ownership', () =>
  fixture(async ({ snapshots, journal, publish, inspect }) => {
    for (const path of ['/registry/../registry/old', journal + '/registry', '/']) {
      await publish([{ ...snapshots[0], paths: [path, journal] }]);
      await requireRefusal(inspect());
    }
  }));

test('retention refuses authority lost during the final version bookend', () =>
  fixture(async ({ snapshots, releaseAuthority, inspect }) => {
    let observations = 0;
    await requireRefusal(
      inspect({
        observeSnapshotVersions: () => {
          if (++observations === 2) releaseAuthority();
          return Promise.resolve(
            snapshots.map(({ id: snapshotId }) => ({
              kind: 'object',
              snapshotId,
              versionId: 'v',
              visible: true,
              bytes: 128,
            })),
          );
        },
      }),
    );
  }));

test('retention requires configured identity and cancellation reaches the external observation', () =>
  fixture(async ({ createStore, journal, authority }) => {
    let observations = 0;
    const request = {
      registryId: 'proof',
      journalPath: journal,
      sampledAt,
      lastVerified: null,
      recoveryPins: [],
      observeSnapshotVersions: () => {
        observations++;
        return Promise.resolve([]);
      },
    };
    for (const repositoryId of [undefined, 'short']) {
      await requireRefusal(createStore({ repositoryId }).inspectRetention(request, authority));
      expect(observations).toBe(0);
    }
    const cancellation = new AbortController();
    const store = createStore({ signal: cancellation.signal });
    const pending = store.inspectRetention(
      {
        ...request,
        observeSnapshotVersions: (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                reject(new Error('Observed cancellation', { cause: signal.reason }));
              },
              { once: true },
            );
            cancellation.abort(new Error('controlled cancellation'));
          }),
      },
      authority,
    );
    await requireRefusal(pending);
  }));

test(
  'whole retention observation cycle initiates cancellation within sixty seconds',
  () =>
    fixture(async ({ createStore, journal, authority }) => {
      const startedAt = Date.now();
      const pending = createStore().inspectRetention(
        {
          registryId: 'proof',
          journalPath: journal,
          sampledAt,
          lastVerified: null,
          recoveryPins: [],
          observeSnapshotVersions: (signal) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener(
                'abort',
                () => {
                  reject(new Error('Observed cancellation', { cause: signal.reason }));
                },
                { once: true },
              );
            }),
        },
        authority,
      );
      await requireRefusal(pending);
      expect(Date.now() - startedAt).toBeLessThan(64000);
    }),
  65000,
);

test('final repository identity replacement refuses a stable snapshot catalogue', () =>
  fixture(async ({ repository, inspect }) => {
    await writeFile(join(repository, 'failure'), 'replace-config');
    await requireRefusal(inspect());
  }));

test('canonical journal authority refuses a symlink alias before external observation', () =>
  fixture(async ({ journal, inspect }) => {
    await symlink(journal, journal + '-alias');
    let observations = 0;
    try {
      await requireRefusal(
        inspect({
          journalPath: journal + '-alias',
          observeSnapshotVersions: () => {
            observations++;
            return Promise.resolve([]);
          },
        }),
      );
      expect(observations).toBe(0);
    } finally {
      await rm(journal + '-alias');
    }
  }));

test('catalogue requires the single bounded operation tag produced by the store', () =>
  fixture(async ({ snapshots, publish, inspect }) => {
    for (const tags of [
      ['foreign-operation'],
      ['puni-registry-'],
      ['puni-registry-one', 'puni-registry-two'],
    ]) {
      await publish([{ ...snapshots[0], tags }]);
      await requireRefusal(inspect());
    }
  }));

test('daily and weekly minimums independently preserve all existing recovery points', () =>
  fixture(async ({ journal, publish, inspect }) => {
    for (const days of [
      dates.slice(0, 7),
      ['2026-10-31', '2026-10-18', '2026-10-11', '2026-10-04'],
    ]) {
      await publish([
        ...days.map((day, index) => snapshot(index + 1, day + 'T12:00:00Z', journal)),
        snapshot(20, '2026-10-31T10:00:00Z', journal),
      ]);
      const plan = await inspect();
      expect(plan.coverage.complete).toBe(false);
      expect(plan.eligibleSnapshotIds).toEqual([]);
      expect(plan.retained.map((entry) => entry.snapshotId)).toContain(id(20));
    }
    await publish(
      [
        '2026-10-31',
        '2026-10-30',
        '2026-10-29',
        '2026-10-28',
        '2026-10-18',
        '2026-10-11',
        '2026-10-04',
      ]
        .map((day, index) => snapshot(index + 1, day + 'T12:00:00Z', journal))
        .concat(snapshot(20, '2026-10-31T10:00:00Z', journal)),
    );
    const complete = await inspect();
    expect(complete.coverage.complete).toBe(true);
    expect(complete.eligibleSnapshotIds).toEqual([id(20)]);
  }));

test('future sample time cannot authorize future recovery points', () =>
  fixture(async ({ inspect }) => {
    await requireRefusal(inspect({ sampledAt: '9999-01-01T00:00:00Z' }));
  }));

test('opaque distinct Unicode version IDs remain stable across reordered physical bookends', () =>
  fixture(async ({ snapshots, inspect }) => {
    const versions: RegistryBackupSnapshotVersion[] = snapshots.map(({ id: snapshotId }) => ({
      kind: 'object',
      snapshotId,
      versionId: 'current',
      visible: true,
      bytes: 128,
    }));
    versions.push(
      { kind: 'object', snapshotId: id(1), versionId: 'é', visible: false, bytes: 1 },
      { kind: 'object', snapshotId: id(1), versionId: 'e\u0301', visible: false, bytes: 1 },
    );
    let observations = 0;
    const plan = await inspect({
      observeSnapshotVersions: () =>
        Promise.resolve(++observations === 1 ? versions : [...versions].reverse()),
    });
    expect(plan.catalogue).toHaveLength(9);
    expect(plan.snapshotVersionsSha256).toHaveLength(64);
  }));

test('pinned restic year zero timestamps preserve complete UTC day and Monday bucket dates', () =>
  fixture(async ({ journal, publish, inspect }) => {
    await publish([
      snapshot(1, '0000-01-01T00:00:00+01:00', journal),
      snapshot(2, '0000-01-01T00:00:00Z', journal),
    ]);
    const plan = await inspect();
    expect(plan.coverage.daily.buckets).toEqual(['0000-01-01', '-000001-12-31']);
    expect(plan.coverage.weekly.buckets).toEqual(['-000001-12-27']);
    expect(plan.catalogue.map((entry) => entry.snapshotId)).toEqual([id(2), id(1)]);
  }));
