import { chmod, lstat, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { dlopen } from 'bun:ffi';
import { expect, test } from 'bun:test';

import { modelRegistryBackupEffects } from './registry-backup-reservation.fixture';
import { openBackupSourceFixture } from './registry-backup-source.fixture';
import { createRegistryBackupStore } from './registry-backup-store';
import { scopeMaintenanceReaper } from './registry-maintenance-reaper.fixture';
import { requireRejection } from './registry-rejection.fixture';

scopeMaintenanceReaper();

const binary = process.env['PUNI_TEST_RESTIC_BINARY'];
test.skipIf(binary === undefined)(
  'pinned backup verifies both contents roots and matching journal before a receipt; corrupt packs refuse',
  async () => {
    if (binary === undefined) throw new Error('Missing requested native restic');
    const directory = await scratchAsync('registry-backup-store-');
    const registry = join(directory, 'registry/contents');
    const journal = join(directory, 'journal/contents');
    await mkdir(registry, { recursive: true });
    await mkdir(journal, { recursive: true });
    await writeFile(join(registry, 'blob'), 'known native bytes');
    await writeFile(join(journal, 'journal.json'), '{"revision":7}');
    const environment = {
      RESTIC_REPOSITORY: join(directory, 'repository'),
      RESTIC_PASSWORD: 'owned-disposable-fixture',
    };
    const initialized = Bun.spawn([binary, 'init'], {
      env: { PATH: '/usr/bin:/bin', ...environment },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await initialized.exited).toBe(0);
    await Promise.all([
      new Response(initialized.stdout).text(),
      new Response(initialized.stderr).text(),
    ]);
    let admitted = false;
    const sourceLimits = {
      registry: {
        maximumLogicalBytes: 1125899906842624,
        maximumEntries: 1000000,
        maximumDepth: 128,
        maximumMetadataBytes: 268435456,
        maximumFanout: 1000000,
      },
      journal: {
        maximumLogicalBytes: 1125899906842624,
        maximumEntries: 1000000,
        maximumDepth: 128,
        maximumMetadataBytes: 268435456,
        maximumFanout: 1000000,
      },
    };
    const store = createRegistryBackupStore({
      effects: modelRegistryBackupEffects(),
      signal: new AbortController().signal,
      sourceLimits,
      binary,
      binarySha256: '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
      environment,
      admit: () =>
        Promise.resolve().then(() => {
          admitted = true;
        }),
    });
    const lock = await open(join(journal, 'authority.lock'), 'wx', 0o600);
    const native = dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } });
    if (native.symbols.flock(lock.fd, 2 | 4) !== 0)
      throw new Error('Owned backup lock acquisition failed');
    const authority = { authorityDescriptor: lock.fd };
    try {
      const receipt = await store.snapshot(
        {
          operationId: 'backup-proof',
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
      expect(admitted).toBe(true);
      const snapshots = Bun.spawn([binary, '--no-cache', 'snapshots', '--json'], {
        env: { PATH: '/usr/bin:/bin', ...environment },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(await snapshots.exited).toBe(0);
      expect(await new Response(snapshots.stderr).text()).toBe('');
      const captured: unknown = JSON.parse(await new Response(snapshots.stdout).text());
      expect(captured).toEqual([expect.objectContaining({ hostname: 'proof' })]);
      expect(receipt).toMatchObject({
        registryPath: registry,
        journalPath: journal,
        journalRevision: 7,
      });
      const restored = join(directory, 'restored');
      await mkdir(restored);
      await mkdir(join(restored, 'registry'));
      await mkdir(join(restored, 'journal'));
      await store.restore(
        receipt,
        {
          registryPath: join(restored, 'registry'),
          journalPath: join(restored, 'journal'),
        },
        undefined,
        authority,
      );
      expect(await readFile(join(restored, 'registry/blob'), 'utf8')).toBe('known native bytes');
      expect(await readFile(join(restored, 'journal/journal.json'), 'utf8')).toBe('{"revision":7}');
      const { readdir } = await import('node:fs/promises');
      const packs = await readdir(join(environment.RESTIC_REPOSITORY, 'data'), { recursive: true });
      const pack = packs.find((path) => /^[a-f0-9]{2}\/[a-f0-9]{64}$/.test(path));
      if (pack === undefined) throw new Error('No native pack');
      await chmod(join(environment.RESTIC_REPOSITORY, 'data', pack), 0o600);
      await writeFile(join(environment.RESTIC_REPOSITORY, 'data', pack), 'injected corruption');
      await requireRefusal(
        store.verify(receipt, authority),
        'Fixed maintenance child failed (exit 1)',
      );
    } finally {
      await lock.close();
      native.close();
      await rm(directory, { recursive: true });
      expect((await requireRejection(lstat(directory))).cause).toMatchObject({ code: 'ENOENT' });
      console.log(
        JSON.stringify({ fixture: directory, cleanup: 'removed-after-child-and-lock-close' }),
      );
    }
  },
  30000,
);

async function requireRefusal(pending: Promise<unknown>, expected: string): Promise<void> {
  try {
    await pending;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    expect(cause.message).toContain(expected);
    return;
  }
  throw new Error('Expected production path to refuse');
}

test('backup credentials refuse loader and arbitrary environment fields before process execution', () => {
  expect(() =>
    createRegistryBackupStore({
      effects: modelRegistryBackupEffects(),
      signal: new AbortController().signal,
      binary: '/unused',
      binarySha256: 'a'.repeat(64),
      environment: { RESTIC_REPOSITORY: 'fixture', LD_PRELOAD: '/attacker' },
      admit: () => Promise.resolve(),
    }),
  ).toThrow('backup environment');
});

test('backup work refuses missing authority before launching its pinned dependency', async () => {
  const store = createRegistryBackupStore({
    effects: modelRegistryBackupEffects(),
    signal: new AbortController().signal,
    binary: '/absent-dependency',
    binarySha256: 'a'.repeat(64),
    environment: { RESTIC_REPOSITORY: '/owned' },
    admit: () => Promise.resolve(),
  });
  await requireRefusal(
    store.verify(
      {
        snapshotId: 'a'.repeat(64),
        verifiedAt: new Date().toISOString(),
        registryId: 'proof',
        storageId: 'owned',
        registryPath: '/registry',
        journalPath: '/journal',
        journalRevision: 1,
        journalSha256: 'b'.repeat(64),
        censusSha256: 'c'.repeat(64),
        bytes: 1,
      },
      undefined as never,
    ),
    'Missing backup authority',
  );
});

test.skipIf(binary === undefined)(
  'snapshot refuses missing explicit source limits before creating backup content',
  async () => {
    if (binary === undefined) throw new Error('Missing requested restic');
    const { openBackupSourceFixture } = await import('./registry-backup-source.fixture');
    const fixture = await openBackupSourceFixture();
    const environment = {
      RESTIC_REPOSITORY: join(fixture.directory, 'repository'),
      RESTIC_PASSWORD: 'disposable',
    };
    const initialized = Bun.spawn([binary, 'init'], {
      env: { PATH: '/usr/bin:/bin', ...environment },
      stdout: 'ignore',
      stderr: 'pipe',
    });
    expect(await initialized.exited).toBe(0);
    expect(await new Response(initialized.stderr).text()).toBe('');
    const store = createRegistryBackupStore({
      effects: modelRegistryBackupEffects(),
      signal: new AbortController().signal,
      binary,
      binarySha256: '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
      environment,
      admit: () => Promise.resolve(),
    });
    try {
      await requireRefusal(store.snapshot(fixture.source, fixture.authority), 'source limits');
    } finally {
      await fixture.close();
    }
  },
  30000,
);

for (const fault of [
  'admission',
  'metadata-change',
  'root-replaced',
  'authority-lost',
  'logical',
  'entries',
  'depth',
  'fanout',
  'metadata',
  'empty-metadata',
  'unreadable',
  'absent',
  'cancelled',
  'request-mutation',
  'context-mutation',
  'limits-mutation',
] as const) {
  test.skipIf(binary === undefined)(
    'actual snapshot refuses ' +
      fault +
      ' before backup content; prior journal remains authoritative',
    async () => {
      if (binary === undefined) throw new Error('Missing requested restic');
      const fixture = await openBackupSourceFixture();
      const controller = new AbortController();
      const environment = {
        RESTIC_REPOSITORY: join(fixture.directory, 'repository'),
        RESTIC_PASSWORD: 'disposable',
      };
      const initialized = Bun.spawn([binary, 'init'], {
        env: { PATH: '/usr/bin:/bin', ...environment },
        stdout: 'ignore',
        stderr: 'pipe',
      });
      expect(await initialized.exited).toBe(0);
      expect(await new Response(initialized.stderr).text()).toBe('');
      const previous = await readFile(join(fixture.source.journalPath, 'journal.json'), 'utf8');
      await writeFile(join(fixture.source.registryPath, 'blob'), 'a');
      if (fault === 'logical') {
        const sparse = await open(join(fixture.source.registryPath, 'sparse'), 'wx');
        try {
          await sparse.truncate(1024 ** 2 + 1);
          expect((await sparse.stat()).blocks * 512).toBeLessThan(1024 ** 2);
        } finally {
          await sparse.close();
        }
      }
      if (fault === 'entries') fixture.limits.registry.maximumEntries = 1;
      if (fault === 'metadata') fixture.limits.registry.maximumMetadataBytes = 1;
      if (fault === 'empty-metadata') {
        fixture.limits.registry.maximumMetadataBytes = 1000;
        for (let index = 0; index < 20; index++)
          await writeFile(join(fixture.source.registryPath, 'empty-' + String(index)), '');
      }
      if (fault === 'depth') {
        fixture.limits.registry.maximumDepth = 1;
        await mkdir(join(fixture.source.registryPath, 'nested'));
        await writeFile(join(fixture.source.registryPath, 'nested/file'), '');
      }
      if (fault === 'fanout') {
        fixture.limits.registry.maximumFanout = 1;
        await writeFile(join(fixture.source.registryPath, 'second'), '');
      }
      if (fault === 'unreadable') await chmod(join(fixture.source.registryPath, 'blob'), 0);
      if (fault === 'absent') await rm(join(fixture.source.journalPath, 'journal.json'));
      let inspected = false;
      const store = createRegistryBackupStore({
        effects: modelRegistryBackupEffects(),
        signal: controller.signal,
        binary,
        binarySha256: '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
        environment,
        sourceLimits: fixture.limits,
        admit: async (request) => {
          if (request.phase !== 'snapshot') {
            inspected = true;
            if (fault === 'cancelled') controller.abort(new Error('cancelled source'));
            return;
          }
          expect(inspected).toBe(true);
          expect(request.source.scope).toBe('contents-metadata-only');
          if (
            [
              'admission',
              'metadata-change',
              'root-replaced',
              'authority-lost',
              'request-mutation',
              'context-mutation',
              'limits-mutation',
            ].includes(fault)
          )
            expect(request.source.registry.logicalBytes).toBe(1);
          if (fault === 'admission') throw new Error('closed snapshot admission');
          if (fault === 'request-mutation') {
            await writeFile(join(fixture.source.registryPath, 'blob'), 'b');
            const { observeRegistryBackupSource } = await import('./registry-backup-source');
            Object.assign(
              request.source,
              await observeRegistryBackupSource(
                fixture.source,
                fixture.limits,
                fixture.authority,
                controller.signal,
              ),
            );
          }
          if (fault === 'context-mutation') {
            fixture.source.registryId = 'forged';
            await writeFile(join(fixture.source.registryPath, 'blob'), 'b');
            const { observeRegistryBackupSource } = await import('./registry-backup-source');
            Object.assign(
              request.source,
              await observeRegistryBackupSource(
                fixture.source,
                fixture.limits,
                fixture.authority,
                controller.signal,
              ),
            );
          }
          if (fault === 'limits-mutation') {
            fixture.limits.registry.maximumLogicalBytes = 1;
            await writeFile(join(fixture.source.registryPath, 'blob'), 'bb');
            const { observeRegistryBackupSource } = await import('./registry-backup-source');
            fixture.limits.registry.maximumLogicalBytes = 1048576;
            Object.assign(
              request.source,
              await observeRegistryBackupSource(
                fixture.source,
                fixture.limits,
                fixture.authority,
                controller.signal,
              ),
            );
          }
          if (fault === 'metadata-change')
            await writeFile(join(fixture.source.registryPath, 'blob'), 'b');
          if (fault === 'root-replaced') {
            await rename(fixture.source.registryPath, fixture.source.registryPath + '-old');
            await mkdir(fixture.source.registryPath);
            await writeFile(join(fixture.source.registryPath, 'blob'), 'a');
          }
          if (fault === 'authority-lost') {
            await rename(
              join(fixture.source.journalPath, 'authority.lock'),
              join(fixture.source.journalPath, 'authority-old'),
            );
            await writeFile(join(fixture.source.journalPath, 'authority.lock'), '');
          }
        },
      });
      try {
        await requireRejection(store.snapshot(fixture.source, fixture.authority));
        const snapshots = Bun.spawn([binary, '--no-cache', '--no-lock', 'snapshots', '--json'], {
          env: { PATH: '/usr/bin:/bin', ...environment },
          stdout: 'pipe',
          stderr: 'pipe',
        });
        expect(await snapshots.exited).toBe(0);
        expect(await new Response(snapshots.stderr).text()).toBe('');
        expect(JSON.parse(await new Response(snapshots.stdout).text())).toEqual([]);
        if (fault !== 'absent')
          expect(await readFile(join(fixture.source.journalPath, 'journal.json'), 'utf8')).toBe(
            previous,
          );
      } finally {
        await chmod(join(fixture.source.registryPath, 'blob'), 0o600);
        await fixture.close();
      }
    },
    30000,
  );
}

for (const fault of [
  'xattr-list-error',
  'xattr-value-error',
  'cross-device',
  'unsafe-size',
  'file-stat-change',
  'authority-bookend',
  'stat-absent-time',
  'stat-null-time',
  'stat-malformed-owner',
  'stat-excess-inode',
  'stat-excess-time',
  'raw-name',
  'read-cleanup',
  'cancel-during-read',
]) {
  test.skipIf(binary === undefined)(
    'actual store refuses controlled ' + fault + ' metadata dependency fault before backup content',
    async () => {
      const child = Bun.spawn(
        [process.execPath, import.meta.dir + '/registry-backup-source.fixture.ts', fault],
        { env: { ...process.env, PUNI_SOURCE_CONSUMER: 'store' }, stdout: 'pipe', stderr: 'pipe' },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe('');
      const observed = JSON.parse(stdout) as {
        refused: boolean;
        snapshots: unknown;
        closed: number;
        aggregate: boolean;
      };
      expect(observed.refused).toBe(true);
      expect(observed.snapshots).toEqual([]);
      expect(observed.closed).toBeGreaterThan(0);
      if (fault === 'read-cleanup') expect(observed.aggregate).toBe(true);
    },
    30000,
  );
}

for (const fault of [
  'progress-nan',
  'progress-absent',
  'progress-infinity',
  'progress-negative',
  'progress-zero',
  'progress-fractional',
  'progress-string',
  'progress-null',
  'progress-unsafe',
  'progress-excess',
  'root-stat-coercion',
  'root-stat-width',
]) {
  test.skipIf(binary === undefined)(
    'actual snapshot rejects ' +
      fault +
      ' at its first metadata boundary before coercion or another read',
    async () => {
      const child = Bun.spawn(
        [process.execPath, import.meta.dir + '/registry-backup-source.fixture.ts', fault],
        { env: { ...process.env, PUNI_SOURCE_CONSUMER: 'store' }, stdout: 'pipe', stderr: 'pipe' },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe('');
      const observed = JSON.parse(stdout) as {
        refused: boolean;
        snapshots: unknown;
        message: string;
        snapshotAdmitted: boolean;
        journalReads: number;
        journalCloses: number;
        rootSamples: number;
        rootInjected: boolean;
        coercedRootIdentity: boolean;
      };
      expect(observed.refused).toBe(true);
      expect(observed.snapshots).toEqual([]);
      expect(observed.snapshotAdmitted).toBe(false);
      if (fault.startsWith('progress-')) {
        expect(observed.message).toBe('Malformed backup source journal read progress');
        expect(observed.journalReads).toBe(1);
        expect(observed.journalCloses).toBe(1);
      } else {
        expect(observed.message).toBe('Malformed required Linux backup source stat fields');
        expect(observed.rootInjected).toBe(true);
        expect(observed.coercedRootIdentity).toBe(false);
        expect(observed.rootSamples).toBe(1);
        expect(observed.journalReads).toBe(0);
      }
    },
    30000,
  );
}

test.skipIf(binary === undefined)(
  'actual snapshot accepts positive partial journal reads and verifies the completed source journal',
  async () => {
    const child = Bun.spawn(
      [process.execPath, import.meta.dir + '/registry-backup-source.fixture.ts', 'progress-short'],
      { env: { ...process.env, PUNI_SOURCE_CONSUMER: 'store' }, stdout: 'pipe', stderr: 'pipe' },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    const observed = JSON.parse(stdout) as {
      refused: boolean;
      snapshotId: string;
      snapshotAdmitted: boolean;
      journalReads: number;
      journalCloses: number;
    };
    expect(observed.refused).toBe(false);
    expect(observed.snapshotId).toMatch(/^[a-f0-9]{64}$/);
    expect(observed.snapshotAdmitted).toBe(true);
    expect(observed.journalReads).toBeGreaterThan(2);
    expect(observed.journalCloses).toBe(2);
  },
  30000,
);
