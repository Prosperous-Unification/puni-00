import { createHash } from 'node:crypto';
import { chmod, type FileHandle, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import type { RegistryBackupReservation } from './registry-backup-reservation';
import { openBackupSourceFixture } from './registry-backup-source.fixture';
import { createRegistryBackupStore } from './registry-backup-store';
import { scopeMaintenanceReaper } from './registry-maintenance-reaper.fixture';
import { requireRejection } from './registry-rejection.fixture';

scopeMaintenanceReaper();

test('store refuses unavailable durable effect authority before a real child can launch', async () => {
  const fixture = await openBackupSourceFixture();
  const binary = join(fixture.directory, 'restic');
  const marker = join(fixture.directory, 'launched');
  const executable = `#!/bin/sh\nprintf launched > '${marker}'\nprintf '{"id":"${'f'.repeat(64)}"}'\n`;
  await writeFile(binary, executable);
  await chmod(binary, 0o700);
  const store = createRegistryBackupStore({
    signal: new AbortController().signal,
    binary,
    binarySha256: createHash('sha256').update(executable).digest('hex'),
    environment: { RESTIC_REPOSITORY: '/controlled-unused' },
    admit: () => Promise.resolve(),
    effects: {
      bindPhase: () => Promise.resolve(),
      consumeEffect: () => Promise.reject(new Error('Missing trusted backup effect budget')),
      settleEffect: () => Promise.resolve(),
    },
  });
  try {
    expect(
      (
        await requireRejection(
          store.inspectRepository(fixture.source.journalPath, fixture.authority),
        )
      ).throwCause,
    ).toThrow('Missing trusted backup effect budget');
    expect((await requireRejection(readFile(marker))).cause).toMatchObject({ code: 'ENOENT' });
  } finally {
    await fixture.close();
  }
});

// The persistence tests below use real ordinary files/flocks and modeled whole-volume counters.
import { mkdir, readdir, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

import { openRegistryBackupReservation } from './registry-backup-reservation';

const binding = {
  operationId: 'source-proof',
  tokenSha256: 'a'.repeat(64),
  registryId: 'proof',
  storageId: 'owned',
  repositoryId: 'f'.repeat(64),
  configurationSha256: 'b'.repeat(64),
  profileSha256: 'c'.repeat(64),
};
const attempt = {
  id: '00000000-0000-4000-8000-000000000001',
  revision: 7,
  action: 'backup-preflight' as const,
};
const effect = {
  slot: 'repository-initial' as const,
  kind: 'read' as const,
  targetSha256: 'd'.repeat(64),
};
const capacity = {
  usableBytes: 1073741824,
  allocationUnitBytes: 4096,
  usedBytes: 1024,
  totalInodes: 100000,
  usedInodes: 10,
};
async function reservationFixture() {
  const source = await openBackupSourceFixture();
  const directory = join(dirname(source.source.journalPath), 'backup-effects');
  await mkdir(directory, { mode: 0o700 });
  const path = join(directory, 'state.json');
  await writeFile(
    path,
    JSON.stringify({
      schemaVersion: 1,
      scope: 'effect-lineage-only',
      generation: 0,
      binding: null,
      snapshot: null,
      inspection: false,
      attempts: [],
      effects: [],
      closedOperationId: null,
    }) + '\n',
    { mode: 0o600 },
  );
  await writeFile(join(directory, 'state.lock'), '', { mode: 0o600 });
  const configuration = {
    journalPath: source.source.journalPath,
    authorityDescriptor: source.authority.authorityDescriptor,
    authorityUid: process.getuid?.(),
    uid: process.getuid?.(),
    journalMaximumBytes: 1073741824,
    binding,
    attempt,
    signal: new AbortController().signal,
    measure: () => Promise.resolve(capacity),
    requireLineage: () => Promise.resolve(),
  };
  const port = openRegistryBackupReservation(configuration);
  return { ...source, stateDirectory: directory, path, configuration, port };
}

test('durable phase binding repeats without allocating and consumption survives a new port', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    const bound = await readFile(fixture.path, 'utf8');
    await fixture.port.bindPhase({ phase: 'inspection' });
    expect(await readFile(fixture.path, 'utf8')).toBe(bound);
    const ticket = await fixture.port.consumeEffect(effect);
    expect(
      (JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation).effects,
    ).toEqual([
      {
        ...effect,
        id: ticket.id,
        state: 'consumed',
        attemptId: attempt.id,
        revision: 7,
        action: 'backup-preflight',
      },
    ]);
    expect(
      (
        await requireRejection(
          openRegistryBackupReservation(fixture.configuration).consumeEffect(effect),
        )
      ).throwCause,
    ).toThrow('replay');
    await fixture.port.settleEffect(ticket);
    expect(
      (JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation).effects[0]
        .state,
    ).toBe('terminal');
    expect((await requireRejection(fixture.port.consumeEffect(effect))).throwCause).toThrow(
      'replay',
    );
  } finally {
    await fixture.close();
  }
});

for (const fault of [
  'missing',
  'unreadable',
  'malformed',
  'replacement',
  'foreign-entry',
  'public-directory',
  'hardlink',
  'stale-generation',
] as const) {
  test(`trusted effect state refuses ${fault} without consumption`, async () => {
    const fixture = await reservationFixture();
    try {
      await fixture.port.bindPhase({ phase: 'inspection' });
      if (fault === 'missing') await unlink(fixture.path);
      if (fault === 'unreadable') await chmod(fixture.path, 0o000);
      if (fault === 'malformed') {
        const stored = JSON.parse(
          await readFile(fixture.path, 'utf8'),
        ) as RegistryBackupReservation;
        Object.assign(stored, { scope: 'unrecognized' });
        await writeFile(fixture.path, JSON.stringify(stored));
      }
      if (fault === 'foreign-entry')
        await writeFile(join(fixture.stateDirectory, 'state.unknown'), '{}', { mode: 0o600 });
      if (fault === 'replacement')
        await writeFile(join(fixture.stateDirectory, 'state.pending'), '{}', { mode: 0o600 });
      if (fault === 'public-directory') await chmod(fixture.stateDirectory, 0o755);
      if (fault === 'hardlink')
        await import('node:fs/promises').then(({ link }) =>
          link(fixture.path, join(fixture.directory, 'alias')),
        );
      if (fault === 'stale-generation') {
        const stored = JSON.parse(
          await readFile(fixture.path, 'utf8'),
        ) as RegistryBackupReservation;
        stored.generation = -1;
        await writeFile(fixture.path, JSON.stringify(stored));
      }
      expect(
        (await requireRejection(inspectThroughStore(fixture, fixture.port))).throwCause,
      ).toThrow();
    } finally {
      await chmod(fixture.stateDirectory, 0o700);
      await fixture.close();
    }
  });
}
for (const field of [
  'operationId',
  'tokenSha256',
  'registryId',
  'storageId',
  'repositoryId',
  'configurationSha256',
  'profileSha256',
] as const) {
  test(`operation effect authority refuses changed ${field}`, async () => {
    const fixture = await reservationFixture();
    try {
      await fixture.port.bindPhase({ phase: 'inspection' });
      const changed = {
        ...binding,
        [field]: field.endsWith('Sha256') || field === 'repositoryId' ? 'e'.repeat(64) : 'foreign',
      };
      expect(
        (
          await requireRejection(
            inspectThroughStore(
              fixture,
              openRegistryBackupReservation({ ...fixture.configuration, binding: changed }),
            ),
          )
        ).throwCause,
      ).toThrow('binding');
      expect(
        (JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation).effects,
      ).toEqual([]);
    } finally {
      await fixture.close();
    }
  });
}

test('new canonical action attempt cannot refill a spent fixed slot', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    const ticket = await fixture.port.consumeEffect(effect);
    await fixture.port.settleEffect(ticket);
    const repeated = openRegistryBackupReservation({
      ...fixture.configuration,
      attempt: { ...attempt, id: '00000000-0000-4000-8000-000000000002', revision: 8 },
    });
    await repeated.bindPhase({ phase: 'inspection' });
    expect((await requireRejection(repeated.consumeEffect(effect))).throwCause).toThrow('replay');
  } finally {
    await fixture.close();
  }
});

test('inspection and recovery bindings cannot authorize snapshot or normal lock effects', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    expect(
      (
        await requireRejection(
          fixture.port.consumeEffect({ ...effect, slot: 'snapshot-create', kind: 'snapshot' }),
        )
      ).throwCause,
    ).toThrow('phase');
    const recovery = openRegistryBackupReservation({
      ...fixture.configuration,
      attempt: { id: 'e'.repeat(64), revision: 8, action: 'backup-reconcile' },
    });
    await recovery.bindPhase({ phase: 'inspection' });
    expect(
      (
        await requireRejection(
          recovery.consumeEffect({ ...effect, slot: 'retention-list', kind: 'lock' }),
        )
      ).throwCause,
    ).toThrow('recovery');
  } finally {
    await fixture.close();
  }
});

test('concurrent consumers sharing canonical authority launch only one fixed effect', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    const consumed = await Promise.allSettled([
      fixture.port.consumeEffect(effect),
      fixture.port.consumeEffect(effect),
    ]);
    expect(consumed.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(
      (JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation).effects,
    ).toHaveLength(1);
  } finally {
    await fixture.close();
  }
});

for (const fault of ['bytes', 'inodes', 'malformed'] as const) {
  test(`effect consumption preserves canonical journal headroom under modeled ${fault} pressure`, async () => {
    const fixture = await reservationFixture();
    try {
      await fixture.port.bindPhase({ phase: 'inspection' });
      const measured = { ...capacity };
      if (fault === 'bytes') measured.usedBytes = 890 * 1024 ** 2;
      if (fault === 'inodes') measured.usedInodes = 89996;
      if (fault === 'malformed') measured.allocationUnitBytes = Number.NaN;
      const port = openRegistryBackupReservation({
        ...fixture.configuration,
        measure: () => Promise.resolve(measured),
      });
      expect((await requireRejection(inspectThroughStore(fixture, port))).throwCause).toThrow();
      expect(
        (JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation).effects,
      ).toEqual([]);
    } finally {
      await fixture.close();
    }
  });
}

for (const fault of ['file-sync', 'rename', 'directory-sync'] as const) {
  test(`effect ${fault} failure never acknowledges consumption`, async () => {
    const fixture = await reservationFixture();
    try {
      await fixture.port.bindPhase({ phase: 'inspection' });
      let injected = false;
      const port = openRegistryBackupReservation({
        ...fixture.configuration,
        sync: async (descriptor) => {
          if (
            !injected &&
            (await descriptor.stat()).isDirectory() === (fault === 'directory-sync') &&
            fault !== 'rename'
          ) {
            injected = true;
            throw new Error(`injected ${fault}`);
          }
          await descriptor.sync();
        },
        publish: async (from, to) => {
          if (fault === 'rename') {
            injected = true;
            throw new Error('injected rename');
          }
          await rename(from, to);
        },
      });
      expect((await requireRejection(port.consumeEffect(effect))).throwCause).toThrow(
        `injected ${fault}`,
      );
      expect(injected).toBe(true);
      const stored = JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation;
      expect(stored.effects).toHaveLength(fault === 'directory-sync' ? 1 : 0);
      expect(await readdir(fixture.stateDirectory)).not.toContain('state.pending');
      if (fault === 'directory-sync')
        expect((await requireRejection(fixture.port.consumeEffect(effect))).throwCause).toThrow(
          'replay',
        );
    } finally {
      await fixture.close();
    }
  });
}

async function inspectThroughStore(
  fixture: Awaited<ReturnType<typeof reservationFixture>>,
  effects: Parameters<typeof createRegistryBackupStore>[0]['effects'],
  observe = false,
) {
  const binary = join(fixture.directory, 'restic');
  const executable = `#!/bin/sh\nprintf launched > '${join(fixture.directory, 'launched')}'\n${observe ? `grep -q '"state":"consumed"' '${fixture.path}' || exit 91\n` : ''}printf '{"id":"${'f'.repeat(64)}"}'\n`;
  await writeFile(binary, executable, { mode: 0o700 });
  return createRegistryBackupStore({
    signal: fixture.configuration.signal,
    binary,
    binarySha256: createHash('sha256').update(executable).digest('hex'),
    environment: { RESTIC_REPOSITORY: '/controlled-unused' },
    admit: () => Promise.resolve(),
    effects,
  }).inspectRepository(fixture.source.journalPath, fixture.authority);
}

test('real child sees durable consumption and terminal execution never refunds it', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    expect(await inspectThroughStore(fixture, fixture.port, true)).toBe('f'.repeat(64));
    const stored = JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation;
    expect(stored.effects[0].state).toBe('terminal');
    expect((await requireRejection(inspectThroughStore(fixture, fixture.port))).throwCause).toThrow(
      'replay',
    );
  } finally {
    await fixture.close();
  }
});

test('abort after durable consumption launches no child and cannot replay the slot', async () => {
  const fixture = await reservationFixture();
  const controller = new AbortController();
  const port = openRegistryBackupReservation({
    ...fixture.configuration,
    signal: controller.signal,
  });
  try {
    await port.bindPhase({ phase: 'inspection' });
    const effects = {
      ...port,
      consumeEffect: async (input: Parameters<typeof port.consumeEffect>[0]) => {
        const ticket = await port.consumeEffect(input);
        controller.abort(new Error('cancelled after consumption'));
        return ticket;
      },
    };
    expect(
      (
        await requireRejection(
          inspectThroughStore(
            { ...fixture, configuration: { ...fixture.configuration, signal: controller.signal } },
            effects,
          ),
        )
      ).throwCause,
    ).toThrow('cancelled after consumption');
    expect(
      (JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation).effects[0]
        .state,
    ).toBe('consumed');
    expect((await requireRejection(inspectThroughStore(fixture, fixture.port))).throwCause).toThrow(
      'replay',
    );
  } finally {
    await fixture.close();
  }
});

const restic = process.env['PUNI_TEST_RESTIC_BINARY'];
test.skipIf(restic === undefined)(
  'real pinned restic snapshot consumes sibling state without changing captured journal source',
  async () => {
    if (restic === undefined) throw new Error('Missing requested local restic');
    const fixture = await reservationFixture();
    const environment = {
      RESTIC_REPOSITORY: join(fixture.directory, 'repository'),
      RESTIC_PASSWORD: 'ordinary-disposable',
    };
    try {
      await writeFile(join(fixture.source.registryPath, 'blob'), 'retained source bytes');
      const setup = Bun.spawn([restic, 'init'], {
        env: { PATH: '/usr/bin:/bin', ...environment },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [code, , stderr] = await Promise.all([
        setup.exited,
        new Response(setup.stdout).text(),
        new Response(setup.stderr).text(),
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe('');
      const port = openRegistryBackupReservation({
        ...fixture.configuration,
        attempt: { ...attempt, action: 'backup-snapshot' },
      });
      await port.bindPhase({ phase: 'inspection' });
      const before = await readFile(join(fixture.source.journalPath, 'journal.json'), 'utf8');
      const store = createRegistryBackupStore({
        signal: fixture.configuration.signal,
        binary: restic,
        binarySha256: '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
        environment,
        sourceLimits: fixture.limits,
        admit: () => Promise.resolve(),
        effects: port,
      });
      const receipt = await store.snapshot(fixture.source, fixture.authority);
      expect(receipt.journalRevision).toBe(7);
      expect(await readFile(join(fixture.source.journalPath, 'journal.json'), 'utf8')).toBe(before);
      const stored = JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation;
      expect(stored.effects).toHaveLength(5);
      expect(stored.effects.every((entry: { state: string }) => entry.state === 'terminal')).toBe(
        true,
      );
      expect(stored.snapshot?.sha256).toBe(stored.effects[1].targetSha256);
      const restoreEffects = openRegistryBackupReservation({
        ...fixture.configuration,
        attempt: {
          ...attempt,
          id: '00000000-0000-4000-8000-000000000002',
          revision: 8,
          action: 'backup-restore',
        },
      });
      await restoreEffects.bindPhase({ phase: 'inspection' });
      const target = {
        registryPath: join(fixture.directory, 'restored-registry'),
        journalPath: join(fixture.directory, 'restored-journal'),
      };
      await mkdir(target.registryPath);
      await mkdir(target.journalPath);
      const restoreStore = createRegistryBackupStore({
        signal: fixture.configuration.signal,
        binary: restic,
        binarySha256: '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
        environment,
        admit: () => Promise.resolve(),
        effects: restoreEffects,
      });
      await restoreStore.restore(receipt, target, undefined, fixture.authority);
      expect(await readFile(join(target.registryPath, 'blob'), 'utf8')).toBe(
        'retained source bytes',
      );
      expect(await readFile(join(target.journalPath, 'journal.json'), 'utf8')).toBe(before);
      expect(
        (JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation).effects,
      ).toHaveLength(10);
      expect(
        (
          await requireRejection(
            restoreStore.restore(receipt, target, undefined, fixture.authority),
          )
        ).throwCause,
      ).toThrow('replay');
    } finally {
      await fixture.close();
    }
  },
  30000,
);

for (const stage of ['prepublish', 'postconsume'] as const) {
  test(`process interruption ${stage} preserves refusal without inventing a published ticket`, async () => {
    const fixture = await reservationFixture();
    try {
      await fixture.port.bindPhase({ phase: 'inspection' });
      const child = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, 'registry-backup-reservation.fixture.ts'),
          JSON.stringify(fixture.configuration),
          stage,
        ],
        { stdio: ['ignore', 'pipe', 'pipe', fixture.authority.authorityDescriptor] },
      );
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(code).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toBe('');
      const stored = JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation;
      expect(stored.effects).toHaveLength(stage === 'prepublish' ? 0 : 1);
      expect(await readdir(fixture.stateDirectory)).toContain(
        stage === 'prepublish' ? 'state.pending' : 'state.json',
      );
      expect(
        (await requireRejection(inspectThroughStore(fixture, fixture.port))).throwCause,
      ).toThrow(stage === 'prepublish' ? 'Unresolved' : 'replay');
    } finally {
      await fixture.close();
    }
  });
}

for (const boundary of ['path', 'descriptor'] as const)
  for (const field of ['dev', 'ino', 'uid', 'mode', 'nlink', 'size'] as const) {
    test(`actual store refuses missing ${boundary} ${field} before sidecar metadata coercion`, async () => {
      const fixture = await reservationFixture();
      try {
        await fixture.port.bindPhase({ phase: 'inspection' });
        const filesystem = await import('node:fs/promises');
        let sampled: FileHandle | undefined;
        const port = openRegistryBackupReservation({
          ...fixture.configuration,
          ...(boundary === 'path'
            ? {
                statPath: async (path: string) =>
                  Object.assign(await filesystem.lstat(path, { bigint: true }), {
                    [field]: undefined,
                  }),
              }
            : {
                statFile: async (descriptor: FileHandle) => {
                  sampled = descriptor;
                  return Object.assign(await descriptor.stat({ bigint: true }), {
                    [field]: undefined,
                  });
                },
              }),
        });
        expect((await requireRejection(inspectThroughStore(fixture, port))).throwCause).toThrow(
          'Malformed required backup effect stat',
        );
        if (sampled !== undefined)
          expect((await requireRejection(sampled.stat())).cause).toMatchObject({ code: 'EBADF' });
        expect(
          (JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation).effects,
        ).toEqual([]);
      } finally {
        await fixture.close();
      }
    });
  }

for (const fault of ['changed-source', 'changed-revision', 'changed-census'] as const) {
  test(`snapshot phase refuses ${fault} rather than replacing its one source binding`, async () => {
    const fixture = await reservationFixture();
    try {
      const { observeRegistryBackupSource } = await import('./registry-backup-source');
      const source = await observeRegistryBackupSource(
        fixture.source,
        fixture.limits,
        fixture.authority,
        fixture.configuration.signal,
      );
      const port = openRegistryBackupReservation({
        ...fixture.configuration,
        attempt: { ...attempt, action: 'backup-snapshot' },
      });
      await port.bindPhase({ phase: 'inspection' });
      await port.bindPhase({ phase: 'snapshot', source });
      const changed = { ...source };
      if (fault === 'changed-source') changed.sha256 = '0'.repeat(64);
      if (fault === 'changed-revision') changed.journalRevision++;
      if (fault === 'changed-census') changed.censusSha256 = '0'.repeat(64);
      expect(
        (await requireRejection(port.bindPhase({ phase: 'snapshot', source: changed }))).throwCause,
      ).toThrow(fault === 'changed-revision' ? 'canonical source' : 'source binding');
      expect(
        (JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation).snapshot
          ?.sha256,
      ).toBe(source.sha256);
    } finally {
      await fixture.close();
    }
  });
}

test('effect record cap refuses consumption before a real child', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    await writeFile(
      fixture.path,
      (await readFile(fixture.path, 'utf8')) + ' '.repeat(1024 ** 2 + 1),
    );
    expect((await requireRejection(inspectThroughStore(fixture, fixture.port))).throwCause).toThrow(
      'Untrusted backup effect file',
    );
  } finally {
    await fixture.close();
  }
});

test('bounded effect slots cannot refill after one thousand twenty four executions', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    const stored = JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation;
    stored.effects = Array.from({ length: 1024 }, (_, index) => ({
      id: '00000000-0000-4000-8000-' + index.toString(16).padStart(12, '0'),
      slot: 'lock-inspection' as const,
      kind: 'read' as const,
      targetSha256: index.toString(16).padStart(64, '0'),
      attemptId: attempt.id,
      revision: 7,
      action: 'backup-preflight' as const,
      state: 'terminal' as const,
    }));
    await writeFile(fixture.path, JSON.stringify(stored));
    expect(
      (await requireRejection(inspectThroughStore(fixture, fixture.port))).throwCause,
    ).toThrow();
    expect(
      (JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation).effects,
    ).toHaveLength(1024);
  } finally {
    await fixture.close();
  }
});

test('file sync and real ordinary unlink denial preserve primary and cleanup errors', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    const port = openRegistryBackupReservation({
      ...fixture.configuration,
      sync: async (descriptor) => {
        if ((await descriptor.stat()).isFile()) {
          await chmod(fixture.stateDirectory, 0o500);
          throw new Error('primary file sync fault');
        }
        await descriptor.sync();
      },
    });
    const refused = await requireRejection(inspectThroughStore(fixture, port));
    expect(refused.cause).toBeInstanceOf(AggregateError);
    if (!(refused.cause instanceof AggregateError)) throw new Error('Missing aggregate');
    expect(refused.cause.errors.map(String).join(' ')).toContain('primary file sync fault');
    expect(refused.cause.errors.map(String).join(' ')).toContain('EACCES');
  } finally {
    await chmod(fixture.stateDirectory, 0o700);
    await fixture.close();
  }
});

test('a stale action port cannot consume after a newer canonical attempt binds', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    await openRegistryBackupReservation({
      ...fixture.configuration,
      attempt: {
        ...attempt,
        id: '00000000-0000-4000-8000-000000000002',
        revision: 8,
        action: 'backup-verify',
      },
    }).bindPhase({ phase: 'inspection' });
    expect((await requireRejection(inspectThroughStore(fixture, fixture.port))).throwCause).toThrow(
      'stale',
    );
  } finally {
    await fixture.close();
  }
});

test('actual store refuses a descriptor whose claimed kind differs from its fixed slot', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    const port = {
      ...fixture.port,
      consumeEffect: (input: Parameters<typeof fixture.port.consumeEffect>[0]) =>
        fixture.port.consumeEffect({ ...input, slot: 'snapshot-create', kind: 'read' }),
    };
    expect((await requireRejection(inspectThroughStore(fixture, port))).throwCause).toThrow('kind');
  } finally {
    await fixture.close();
  }
});

test('modeled sidecar pressure refusal still permits the real canonical maintenance failure receipt', async () => {
  const { executeRegistryCommand, runRegistryMaintenance, parseRegistryCommandResponse } =
    await import('./registry-journal');
  const root = await scratchAsync('reservation-canonical-headroom-');
  const journalPath = join(root, 'contents');
  const sidecar = join(root, 'backup-effects');
  await mkdir(journalPath, { mode: 0o700 });
  await mkdir(sidecar, { mode: 0o700 });
  await writeFile(
    join(sidecar, 'state.json'),
    JSON.stringify({
      schemaVersion: 1,
      scope: 'effect-lineage-only',
      generation: 0,
      binding: null,
      snapshot: null,
      inspection: false,
      attempts: [],
      effects: [],
      closedOperationId: null,
    }) + '\n',
    { mode: 0o600 },
  );
  await writeFile(join(sidecar, 'state.lock'), '', { mode: 0o600 });
  let constrained = false;
  const measured = () => ({ ...capacity, usedBytes: constrained ? 890 * 1024 ** 2 : 4096 });
  const ports = {
    describeBackupGuardian: (pid: number) =>
      Promise.resolve({
        guardian: {
          pid,
          startTicks: String(pid),
          pidNamespace: 'pid:[4026531836]',
          machineId: 'a'.repeat(32),
          bootId: '11111111-1111-4111-8111-111111111111',
        },
        configurationSha256: binding.configurationSha256,
      }),
    measureJournal: () => Promise.resolve(measured()),
    measureRegistry: () =>
      Promise.resolve({
        maximumBytes: 50 * 1024 ** 3,
        usableBytes: 50 * 1024 ** 3,
        usedBytes: 1024,
        totalInodes: 100000,
        usedInodes: 10,
        rootFreeBytes: 30 * 1024 ** 3,
      }),
  };
  await executeRegistryCommand(
    journalPath,
    {
      command: 'initialize',
      enrollment: {
        registryId: 'proof',
        storageId: 'owned',
        owners: ['operator'],
        registryPath: '/registry',
        rootPath: '/',
        maximumBytes: 50 * 1024 ** 3,
        journalMaximumBytes: 1073741824,
      },
    },
    ports,
  );
  await executeRegistryCommand(journalPath, { command: 'upgrade-maintenance' }, ports);
  let dispatched = 0;
  const failure = await requireRejection(
    runRegistryMaintenance(
      journalPath,
      { operationId: 'source-proof', owner: 'operator', kind: 'backup', recover: false },
      ports,
      async (session) => {
        const prepared = await session.prepareBackup('backup-preflight', 42);
        const port = openRegistryBackupReservation({
          journalPath,
          authorityDescriptor: session.authorityDescriptor,
          authorityUid: process.getuid?.(),
          uid: process.getuid?.(),
          journalMaximumBytes: 1073741824,
          binding: { ...binding, tokenSha256: prepared.tokenSha256 },
          attempt: { id: prepared.id, revision: prepared.journalRevision, action: prepared.action },
          signal: new AbortController().signal,
          measure: () => Promise.resolve(measured()),
        });
        await port.bindPhase({ phase: 'inspection' });
        constrained = true;
        await port.consumeEffect(effect);
        dispatched++;
        throw new Error('Unexpected effect after canonical headroom exhaustion');
      },
    ),
  );
  expect(failure.throwCause).toThrow('preserving canonical journal headroom');
  expect(dispatched).toBe(0);
  const stored = parseRegistryCommandResponse({
    state: JSON.parse(await readFile(join(journalPath, 'journal.json'), 'utf8')) as unknown,
  }).state;
  expect(stored.maintenance?.phase).toBe('failed');
  expect(stored.fenced).toBe(true);
});

test('sidecar metadata and awaited descriptor cleanup preserve both causal failures', async () => {
  const fixture = await reservationFixture();
  const primary = new Error('modeled metadata failure');
  const secondary = new Error('modeled close failure');
  let closed = false;
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    const port = openRegistryBackupReservation({
      ...fixture.configuration,
      statFile: () => Promise.reject(primary),
      close: async (descriptor) => {
        await descriptor.close();
        closed = true;
        throw secondary;
      },
    });
    const refusal = await requireRejection(inspectThroughStore(fixture, port));
    expect(closed).toBe(true);
    expect(refusal.cause).toBeInstanceOf(AggregateError);
    if (!(refusal.cause instanceof AggregateError)) throw new Error('Missing combined failure');
    expect(refusal.cause.errors).toEqual([primary, secondary]);
    expect(refusal.cause.cause).toBe(primary);
  } finally {
    await fixture.close();
  }
});

test('new canonical recovery token keeps the same operation liability while an old port stays stale', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    const ticket = await fixture.port.consumeEffect(effect);
    await fixture.port.settleEffect(ticket);
    const recovered = openRegistryBackupReservation({
      ...fixture.configuration,
      binding: { ...binding, tokenSha256: '9'.repeat(64) },
      attempt: { id: 'e'.repeat(64), revision: 8, action: 'backup-reconcile' },
    });
    await recovered.bindPhase({ phase: 'inspection' });
    expect(
      (JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation).effects,
    ).toHaveLength(1);
    expect((await requireRejection(inspectThroughStore(fixture, fixture.port))).throwCause).toThrow(
      'stale',
    );
  } finally {
    await fixture.close();
  }
});

test('actual canonical recovery rotates token without refilling spent store slots', async () => {
  const { executeRegistryCommand, runRegistryMaintenance } = await import('./registry-journal');
  const root = await scratchAsync('reservation-real-lineage-');
  const journalPath = join(root, 'contents');
  const sidecar = join(root, 'backup-effects');
  await mkdir(journalPath, { mode: 0o700 });
  await mkdir(sidecar, { mode: 0o700 });
  await writeFile(
    join(sidecar, 'state.json'),
    JSON.stringify({
      schemaVersion: 1,
      scope: 'effect-lineage-only',
      generation: 0,
      binding: null,
      snapshot: null,
      inspection: false,
      attempts: [],
      effects: [],
      closedOperationId: null,
    }) + '\n',
    { mode: 0o600 },
  );
  await writeFile(join(sidecar, 'state.lock'), '', { mode: 0o600 });
  const ports = {
    measureJournal: () => Promise.resolve(capacity),
    measureRegistry: () =>
      Promise.resolve({
        maximumBytes: 50 * 1024 ** 3,
        usableBytes: 50 * 1024 ** 3,
        usedBytes: 1024,
        totalInodes: 100000,
        usedInodes: 10,
        rootFreeBytes: 30 * 1024 ** 3,
      }),
    describeBackupGuardian: (pid: number) =>
      Promise.resolve({
        guardian: {
          pid,
          startTicks: String(pid),
          pidNamespace: 'pid:[4026531836]',
          machineId: 'a'.repeat(32),
          bootId: '11111111-1111-4111-8111-111111111111',
        },
        configurationSha256: binding.configurationSha256,
      }),
  };
  await executeRegistryCommand(
    journalPath,
    {
      command: 'initialize',
      enrollment: {
        registryId: binding.registryId,
        storageId: binding.storageId,
        owners: ['operator'],
        registryPath: '/registry',
        rootPath: '/',
        maximumBytes: 50 * 1024 ** 3,
        journalMaximumBytes: 1073741824,
      },
    },
    ports,
  );
  await executeRegistryCommand(journalPath, { command: 'upgrade-maintenance' }, ports);
  const binary = join(root, 'restic');
  const executable = `#!/bin/sh\nprintf '{"id":"${'f'.repeat(64)}"}'\n`;
  await writeFile(binary, executable, { mode: 0o700 });
  const inspect = async (
    effects: Parameters<typeof createRegistryBackupStore>[0]['effects'],
    authorityDescriptor: number,
  ) =>
    createRegistryBackupStore({
      signal: new AbortController().signal,
      binary,
      binarySha256: createHash('sha256').update(executable).digest('hex'),
      environment: { RESTIC_REPOSITORY: '/controlled-unused' },
      admit: () => Promise.resolve(),
      effects,
    }).inspectRepository(journalPath, { authorityDescriptor });
  const stopped = new Error('controlled interruption after terminal command');
  let prior: Parameters<typeof openRegistryBackupReservation>[0] | undefined;
  const first = await requireRejection(
    runRegistryMaintenance(
      journalPath,
      { operationId: binding.operationId, owner: 'operator', kind: 'backup', recover: false },
      ports,
      async (session) => {
        const prepared = await session.prepareBackup('backup-preflight', 42);
        prior = {
          journalPath,
          authorityDescriptor: session.authorityDescriptor,
          authorityUid: process.getuid?.(),
          uid: process.getuid?.(),
          journalMaximumBytes: 1073741824,
          binding: { ...binding, tokenSha256: prepared.tokenSha256 },
          attempt: { id: prepared.id, revision: prepared.journalRevision, action: prepared.action },
          signal: new AbortController().signal,
          measure: () => Promise.resolve(capacity),
        };
        const claimed = openRegistryBackupReservation({
          ...prior,
          attempt: {
            ...prior.attempt,
            id: '00000000-0000-4000-8000-000000000099',
            revision: prior.attempt.revision + 1,
          },
        });
        expect(
          (
            await requireRejection(
              (async () => {
                await claimed.bindPhase({ phase: 'inspection' });
                return inspect(claimed, session.authorityDescriptor);
              })(),
            )
          ).throwCause,
        ).toThrow('current canonical lineage');
        const effects = openRegistryBackupReservation(prior);
        await effects.bindPhase({ phase: 'inspection' });
        expect(await inspect(effects, session.authorityDescriptor)).toBe('f'.repeat(64));
        throw stopped;
      },
    ),
  );
  expect(first.cause).toBe(stopped);
  const recovered = await requireRejection(
    runRegistryMaintenance(
      journalPath,
      { operationId: binding.operationId, owner: 'operator', kind: 'backup', recover: true },
      ports,
      async (session) => {
        if (prior === undefined) throw new Error('Missing previous canonical context');
        await session.prepareBackupReconciliation();
        const current = session.read();
        const canonical = current.maintenance;
        if (canonical === null) throw new Error('Missing recovered owner');
        const tokenSha256 = createHash('sha256').update(canonical.token).digest('hex');
        expect(tokenSha256).not.toBe(prior.binding.tokenSha256);
        const effects = openRegistryBackupReservation({
          ...prior,
          authorityDescriptor: session.authorityDescriptor,
          binding: { ...binding, tokenSha256 },
          attempt: {
            id: createHash('sha256')
              .update(JSON.stringify(current.maintenanceEvidence?.backupReconciliation))
              .digest('hex'),
            revision: current.revision,
            action: 'backup-reconcile',
          },
        });
        await effects.bindPhase({ phase: 'inspection' });
        expect(await inspect(effects, session.authorityDescriptor)).toBe('f'.repeat(64));
        expect(
          (
            await requireRejection(
              inspect(
                openRegistryBackupReservation({
                  ...prior,
                  authorityDescriptor: session.authorityDescriptor,
                }),
                session.authorityDescriptor,
              ),
            )
          ).throwCause,
        ).toThrow('current canonical lineage');
        const stored = JSON.parse(
          await readFile(join(sidecar, 'state.json'), 'utf8'),
        ) as RegistryBackupReservation;
        expect(stored.effects).toHaveLength(2);
        expect(stored.effects[0].state).toBe('terminal');
        throw stopped;
      },
    ),
  );
  expect(recovered.cause).toBe(stopped);
});

test('a held short sidecar flock refuses a real store command even with shared canonical authority', async () => {
  const fixture = await reservationFixture();
  const { open } = await import('node:fs/promises');
  const { dlopen } = await import('bun:ffi');
  const lock = await open(join(fixture.stateDirectory, 'state.lock'), 'r+');
  const native = dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } });
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    expect(native.symbols.flock(lock.fd, 2 | 4)).toBe(0);
    expect((await requireRejection(inspectThroughStore(fixture, fixture.port))).throwCause).toThrow(
      'busy',
    );
  } finally {
    await lock.close();
    native.close();
    await fixture.close();
  }
});

test('an uncertain consumed effect blocks a different unused normal command slot', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    await fixture.port.consumeEffect(effect);
    expect((await requireRejection(inspectThroughStore(fixture, fixture.port))).throwCause).toThrow(
      'Uncertain prior',
    );
  } finally {
    await fixture.close();
  }
});

test('a newer action cannot settle an older action consumed ticket', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    const ticket = await fixture.port.consumeEffect(effect);
    const next = openRegistryBackupReservation({
      ...fixture.configuration,
      attempt: {
        ...attempt,
        id: '00000000-0000-4000-8000-000000000002',
        revision: 8,
        action: 'backup-verify',
      },
    });
    await next.bindPhase({ phase: 'inspection' });
    expect((await requireRejection(next.settleEffect(ticket))).throwCause).toThrow(
      'exact consumed',
    );
    expect(
      (JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation).effects[0]
        .state,
    ).toBe('consumed');
  } finally {
    await fixture.close();
  }
});

test('actual store refuses malformed historical ticket identity before launching', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    const stored = JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation;
    stored.effects.push({
      ...effect,
      id: '-'.repeat(36),
      attemptId: attempt.id,
      revision: 7,
      action: 'backup-preflight',
      state: 'terminal',
    });
    await writeFile(fixture.path, JSON.stringify(stored));
    expect(
      (await requireRejection(inspectThroughStore(fixture, fixture.port))).throwCause,
    ).toThrow();
  } finally {
    await fixture.close();
  }
});

test('missing recovery phase budget refuses before a real child despite valid vacant state', async () => {
  const fixture = await reservationFixture();
  try {
    const recovery = openRegistryBackupReservation({
      ...fixture.configuration,
      attempt: { id: 'e'.repeat(64), revision: 7, action: 'backup-reconcile' },
    });
    const refusal = await requireRejection(inspectThroughStore(fixture, recovery));
    expect(
      (await requireRejection(readFile(join(fixture.directory, 'launched')))).cause,
    ).toMatchObject({ code: 'ENOENT' });
    expect(refusal.throwCause).toThrow('Missing trusted backup effect budget');
  } finally {
    await fixture.close();
  }
});

test('inconsistent duplicate ticket history refuses before a real child', async () => {
  const fixture = await reservationFixture();
  try {
    await fixture.port.bindPhase({ phase: 'inspection' });
    const stored = JSON.parse(await readFile(fixture.path, 'utf8')) as RegistryBackupReservation;
    const historical = {
      ...effect,
      id: '00000000-0000-4000-8000-000000000099',
      attemptId: attempt.id,
      revision: 7,
      action: 'backup-preflight' as const,
      state: 'terminal' as const,
    };
    stored.effects = [historical, { ...historical }];
    await writeFile(fixture.path, JSON.stringify(stored));
    const refusal = await requireRejection(inspectThroughStore(fixture, fixture.port));
    expect(
      (await requireRejection(readFile(join(fixture.directory, 'launched')))).cause,
    ).toMatchObject({ code: 'ENOENT' });
    expect(refusal.throwCause).toThrow('Inconsistent');
  } finally {
    await fixture.close();
  }
});
