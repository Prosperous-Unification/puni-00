import { chmod, readdir, readFile, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { executeRegistryCommand } from './registry-journal';

const GiB = 1024 ** 3;
const root = `sha256:${'1'.repeat(64)}`;
const enrollment = {
  registryId: 'proof-registry',
  storageId: 'volume-1',
  owners: ['publisher', 'deploy', 'backup'],
  registryPath: '/registry',
  rootPath: '/',
  maximumBytes: 50 * GiB,
  journalMaximumBytes: GiB,
};
const capacity = {
  maximumBytes: 50 * GiB,
  usableBytes: 50 * GiB,
  usedBytes: GiB,
  totalInodes: 100000,
  usedInodes: 1000,
  rootFreeBytes: 30 * GiB,
};
function ports(usedBytes = 1000) {
  return {
    measureJournal: () =>
      Promise.resolve({
        usableBytes: GiB,
        allocationUnitBytes: 4096,
        usedBytes,
        totalInodes: 100000,
        usedInodes: 10,
      }),
    measureRegistry: () => Promise.resolve(capacity),
    now: () => '2026-10-25T00:00:00.000Z',
  };
}
async function fixture() {
  const directory = await scratchAsync('registry-journal-');
  await chmod(directory, 0o700);
  await executeRegistryCommand(directory, { command: 'initialize', enrollment }, ports());
  return directory;
}
const publication = (expectedRevision = 0, operationId = 'publish-1') => ({
  command: 'reserve-publication',
  expectedRevision,
  owner: 'publisher',
  operationId,
  product: 'wbs',
  roots: [root],
  references: [{ repository: 'wbs/be-01', digest: root }],
  envelope: { bytes: GiB, inodes: 100 },
});
const read = (directory: string) => executeRegistryCommand(directory, { command: 'read' }, ports());

it('persists complete publication identity and server receipts before acknowledgement', async () => {
  const directory = await fixture();
  const reserved = await executeRegistryCommand(directory, publication(), ports());
  expect(reserved.state.revision).toBe(1);
  expect(reserved.token).toMatch(/^[0-9a-f-]{36}$/);
  const completed = await executeRegistryCommand(
    directory,
    {
      command: 'finish-publication',
      expectedRevision: 1,
      operationId: 'publish-1',
      owner: 'publisher',
      token: reserved.token,
      outcome: 'completed',
      reconciled: true,
    },
    ports(),
  );
  expect(completed.state.reservations).toEqual([]);
  expect(completed.state.bundles[0]?.owner).toBe('publisher');
  expect(completed.state.bundles[0]?.receipt).toEqual({
    state: 'completed',
    at: '2026-10-25T00:00:00.000Z',
  });
  expect(completed.state.bundles[0]?.references).toEqual([
    { repository: 'wbs/be-01', digest: root },
  ]);
  expect((await read(directory)).state.revision).toBe(2);
});

it('rejects stale revision without changing durable state', async () => {
  const directory = await fixture();
  await executeRegistryCommand(directory, publication(), ports());
  await requireRefusal(
    executeRegistryCommand(directory, publication(0, 'publish-2'), ports()),
    'revision',
  );
  expect((await read(directory)).state.revision).toBe(1);
});

it('serializes two publishers and does not expire an unresolved upload', async () => {
  const directory = await fixture();
  const source = `import { executeRegistryCommand } from './registry-journal'; ${portSource}
    await executeRegistryCommand(process.argv[1], JSON.parse(process.argv[2]), ports);`;
  const requests = await Promise.all([
    child(source, [directory, JSON.stringify(publication())]),
    child(source, [directory, JSON.stringify(publication(0, 'publish-2'))]),
  ]);
  expect(requests.filter((request) => request.exitCode === 0)).toHaveLength(1);
  expect((await read(directory)).state.reservations).toHaveLength(1);
  const futurePorts = { ...ports(), now: () => '2099-01-01T00:00:00.000Z' };
  await requireRefusal(
    executeRegistryCommand(directory, publication(1, 'publish-3'), futurePorts),
    'publisher-busy',
  );
  expect((await read(directory)).state.bundles[0]?.receipt.state).toBe('unfinished');
});

it('refuses a full journal including atomic replacement and retains failure headroom', async () => {
  const directory = await fixture();
  const before = await readFile(join(directory, 'journal.json'), 'utf8');
  await requireRefusal(
    executeRegistryCommand(directory, publication(), ports(Math.ceil(GiB * 0.9) - 100)),
    'journal capacity',
  );
  expect(await readFile(join(directory, 'journal.json'), 'utf8')).toBe(before);
  const reserved = await executeRegistryCommand(directory, publication(), ports());
  const failed = await executeRegistryCommand(
    directory,
    {
      command: 'finish-publication',
      expectedRevision: 1,
      operationId: 'publish-1',
      owner: 'publisher',
      token: reserved.token,
      outcome: 'failed',
      reconciled: false,
      failure: 'registry ENOSPC',
    },
    ports(Math.ceil(GiB * 0.9)),
  );
  expect(failed.state.fenced).toBe(true);
  expect(failed.state.reservations).toHaveLength(1);
  expect(failed.state.publication?.failure).toBe('registry ENOSPC');
});

it('rejects missing unreadable and corrupt trusted state on command paths', async () => {
  const directory = await fixture();
  const path = join(directory, 'journal.json');
  const saved = await readFile(path, 'utf8');
  await chmod(path, 0o644);
  await requireRefusal(executeRegistryCommand(directory, publication(), ports()), 'owner-only');
  await chmod(path, 0o000);
  await requireRefusal(
    executeRegistryCommand(directory, publication(), ports()),
    /owner-only|EACCES/,
  );
  await chmod(path, 0o600);
  await writeFile(path, '{');
  await requireRefusal(executeRegistryCommand(directory, publication(), ports()), /JSON/);
  await writeFile(path, saved);
  await import('node:fs/promises').then(({ unlink }) => unlink(path));
  await requireRefusal(executeRegistryCommand(directory, publication(), ports()), 'ENOENT');
});

it('rejects stale operation tokens and foreign owners before releasing protections', async () => {
  const directory = await fixture();
  const protectedImages = await executeRegistryCommand(
    directory,
    {
      command: 'acquire-protection',
      expectedRevision: 0,
      operationId: 'deploy-1',
      owner: 'deploy',
      reason: 'candidate and rollback',
      roots: [root],
      references: [{ repository: 'wbs/be-01', digest: root }],
    },
    ports(),
  );
  for (const changes of [
    { token: crypto.randomUUID() },
    { owner: 'backup' },
    { reconciled: false },
  ]) {
    await requireRefusal(
      executeRegistryCommand(
        directory,
        {
          command: 'release-protection',
          expectedRevision: 1,
          operationId: 'deploy-1',
          owner: 'deploy',
          token: protectedImages.token,
          reconciled: true,
          ...changes,
        },
        ports(),
      ),
      undefined,
    );
  }
  expect((await read(directory)).state.protections).toHaveLength(1);
  await executeRegistryCommand(
    directory,
    {
      command: 'release-protection',
      expectedRevision: 1,
      operationId: 'deploy-1',
      owner: 'deploy',
      token: protectedImages.token,
      reconciled: true,
    },
    ports(),
  );
  expect((await read(directory)).state.protections).toEqual([]);
});

it('preserves failed maintenance ownership until explicit recovery and verified completion', async () => {
  const directory = await fixture();
  const begun = await executeRegistryCommand(
    directory,
    {
      command: 'begin-maintenance',
      expectedRevision: 0,
      operationId: 'backup-1',
      owner: 'backup',
      kind: 'backup',
    },
    ports(),
  );
  await requireRefusal(executeRegistryCommand(directory, publication(1), ports()), 'maintenance');
  const failed = await executeRegistryCommand(
    directory,
    {
      command: 'advance-maintenance',
      expectedRevision: 1,
      operationId: 'backup-1',
      owner: 'backup',
      token: begun.token,
      phase: 'failed',
      failure: 'snapshot failed',
    },
    ports(),
  );
  expect(failed.state.fenced).toBe(true);
  const recovered = await executeRegistryCommand(
    directory,
    {
      command: 'recover-maintenance',
      expectedRevision: 2,
      operationId: 'backup-1',
      owner: 'backup',
      token: begun.token,
    },
    ports(),
  );
  expect(recovered.token).not.toBe(begun.token);
  await requireRefusal(
    executeRegistryCommand(
      directory,
      {
        command: 'advance-maintenance',
        expectedRevision: 3,
        operationId: 'backup-1',
        owner: 'backup',
        token: begun.token,
        phase: 'verified',
      },
      ports(),
    ),
    'token',
  );
  expect((await read(directory)).state.maintenance?.phase).toBe('acquired');
});

async function child(source: string, arguments_: string[] = [], stdin?: string) {
  const process_ = Bun.spawn([process.execPath, '--eval', source, ...arguments_], {
    cwd: import.meta.dir,
    stdin: stdin === undefined ? 'ignore' : new TextEncoder().encode(stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process_.exited,
    new Response(process_.stdout).text(),
    new Response(process_.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}
const portSource = `const ports = { measureJournal: () => Promise.resolve({ usableBytes: 1073741824, allocationUnitBytes: 4096, usedBytes: 1000, totalInodes: 100000, usedInodes: 10 }),
  measureRegistry: async () => (${JSON.stringify(capacity)}), now: () => '2026-10-25T00:00:00.000Z' };`;

it('survives crash before acknowledgement on an actual process command path', async () => {
  const directory = await fixture();
  const crashed = await child(
    `import { executeRegistryCommand } from './registry-journal';
    ${portSource}
    await executeRegistryCommand(process.argv[1], JSON.parse(process.argv[2]), ports);
    process.kill(process.pid, 'SIGKILL');`,
    [directory, JSON.stringify(publication())],
  );
  expect(crashed.exitCode).not.toBe(0);
  expect(crashed.stdout).toBe('');
  const state = (await read(directory)).state;
  expect(state.revision).toBe(1);
  expect(state.reservations[0]?.operationId).toBe('publish-1');
  await requireRefusal(
    executeRegistryCommand(directory, publication(1, 'publish-2'), ports()),
    'publisher-busy',
  );
});

it('refuses a competing process holding the actual kernel lock without a locked bypass', async () => {
  const directory = await fixture();
  const holder = Bun.spawn(
    [
      process.execPath,
      '--eval',
      `import { open } from 'node:fs/promises';
    import { dlopen } from 'bun:ffi';
    const file = await open(process.argv[1] + '/authority.lock', 'r+');
    const library = dlopen(process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6', {flock:{args:['i32','i32'],returns:'i32'}});
    if (library.symbols.flock(file.fd, 6) !== 0) throw Error('holder failed');
    console.log('locked'); await Bun.stdin.text();`,
      directory,
    ],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  const reader = holder.stdout.getReader();
  try {
    const ready = await reader.read();
    expect(new TextDecoder().decode(ready.value)).toContain('locked');
    await requireRefusal(executeRegistryCommand(directory, publication(), ports()), 'busy');
    const bypass = await child(
      `import { executeRegistryCommand } from './registry-journal'; ${portSource}
      await executeRegistryCommand(process.argv[1], { ...JSON.parse(process.argv[2]), locked: true }, ports);`,
      [directory, JSON.stringify(publication())],
    );
    expect(bypass.exitCode).not.toBe(0);
    expect(await readFile(join(directory, 'journal.json'), 'utf8')).toContain('"revision":0');
  } finally {
    reader.releaseLock();
    await holder.stdin.end();
    await holder.exited;
  }
});

it('propagates failed file and directory fsync without acknowledging mutation', async () => {
  for (const failDirectory of [false, true]) {
    const directory = await fixture();
    await requireRefusal(
      executeRegistryCommand(directory, publication(), {
        ...ports(),
        sync: async (descriptor) => {
          if ((await descriptor.stat()).isDirectory() === failDirectory)
            throw new Error('injected fsync failure');
          await descriptor.sync();
        },
      }),
      'injected fsync failure',
    );
    const state = (await read(directory)).state;
    expect(state.revision).toBe(failDirectory ? 1 : 0);
    if (failDirectory) expect(state.reservations).toHaveLength(1);
  }
});

it('rejects malformed claims and insecure journal paths before mutations', async () => {
  const directory = await fixture();
  for (const changes of [
    { freeBytes: GiB },
    { expectedRevision: NaN },
    { owner: 'stranger' },
    { roots: [`sha256:${'2'.repeat(64)}`] },
    { product: 'x'.repeat(65536) },
  ]) {
    await requireRefusal(
      executeRegistryCommand(directory, { ...publication(), ...changes }, ports()),
      undefined,
    );
  }
  await chmod(directory, 0o755);
  await requireRefusal(
    executeRegistryCommand(directory, publication(), ports()),
    'directory must be owner-only',
  );
  await chmod(directory, 0o700);
  const { rename, symlink } = await import('node:fs/promises');
  await rename(join(directory, 'journal.json'), join(directory, 'saved.json'));
  await symlink(join(directory, 'saved.json'), join(directory, 'journal.json'));
  await requireRefusal(executeRegistryCommand(directory, publication(), ports()), /ELOOP/);
});

it('refuses unenforced storage through the owner-only stdin CLI and bounds input', async () => {
  const directory = await scratchAsync('registry-command-');
  await chmod(directory, 0o700);
  const filesystem = await statfs(directory);
  const localEnrollment = {
    ...enrollment,
    registryPath: directory,
    rootPath: directory,
    journalMaximumBytes: filesystem.blocks * filesystem.bsize,
  };
  const run = (request: string, extra: string[] = []) => {
    const process_ = Bun.spawn(
      [process.execPath, join(import.meta.dir, 'registry-journal-cli.ts'), directory, ...extra],
      {
        stdin: new TextEncoder().encode(request),
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    return Promise.all([
      process_.exited,
      new Response(process_.stdout).text(),
      new Response(process_.stderr).text(),
    ]);
  };
  const initialized = await run(
    JSON.stringify({ command: 'initialize', enrollment: localEnrollment }),
  );
  expect(initialized[0]).not.toBe(0);
  expect(initialized[1]).toBe('');
  expect(initialized[2]).toContain('ENOENT');
  for (const [request, extra] of [
    ['{"command":"read"}' + ' '.repeat(65537), []],
    ['{"command":"read"}', ['--locked']],
    [JSON.stringify({ ...publication(), capacity }), []],
  ] as const) {
    const refused = await run(request, [...extra]);
    expect(refused[0]).not.toBe(0);
    expect(refused[1]).toBe('');
  }
});

async function requireRefusal(
  operation: Promise<unknown>,
  expected: string | RegExp | undefined,
): Promise<void> {
  const refusal: unknown = await operation.then(
    () => {
      throw new Error('Expected command refusal');
    },
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (typeof expected === 'string') expect(String(refusal)).toContain(expected);
  else if (expected !== undefined) expect(String(refusal)).toMatch(expected);
}

it('recovers crashed maintenance at its durable phase and completes only after every verification phase', async () => {
  const directory = await fixture();
  const begun = await executeRegistryCommand(
    directory,
    {
      command: 'begin-maintenance',
      expectedRevision: 0,
      operationId: 'retire-1',
      owner: 'backup',
      kind: 'retirement',
    },
    ports(),
  );
  const recovered = await executeRegistryCommand(
    directory,
    {
      command: 'recover-maintenance',
      expectedRevision: 1,
      operationId: 'retire-1',
      owner: 'backup',
      token: begun.token,
    },
    ports(),
  );
  expect(recovered.token).not.toBe(begun.token);
  await requireRefusal(
    executeRegistryCommand(
      directory,
      {
        command: 'advance-maintenance',
        expectedRevision: 2,
        operationId: 'retire-1',
        owner: 'backup',
        token: recovered.token,
        phase: 'completed',
      },
      ports(),
    ),
    'phase',
  );
  let revision = 2;
  for (const phase of [
    'reconciled',
    'fenced',
    'stopped',
    'backed-up',
    'deleting',
    'collected',
    'verified',
    'restored',
    'completed',
  ]) {
    const advanced = await executeRegistryCommand(
      directory,
      {
        command: 'advance-maintenance',
        expectedRevision: revision,
        operationId: 'retire-1',
        owner: 'backup',
        token: recovered.token,
        phase,
      },
      ports(),
    );
    revision++;
    if (phase !== 'completed') expect(advanced.state.fenced).toBe(true);
  }
  const completed = await read(directory);
  expect(completed.state.maintenance).toBeNull();
  expect(completed.state.fenced).toBe(true);
  expect(completed.state.maintenanceVerified).toBe(true);
  const reopen = {
    command: 'reopen',
    expectedRevision: revision,
    operationId: 'reopen',
    owner: 'backup',
  };
  for (const pressure of [
    { ...capacity, usedBytes: 35 * GiB },
    { ...capacity, usedInodes: 70000 },
    { ...capacity, rootFreeBytes: 19 * GiB },
  ])
    await requireRefusal(
      executeRegistryCommand(directory, reopen, {
        ...ports(),
        measureRegistry: () => Promise.resolve(pressure),
      }),
      'low water',
    );

  await requireRefusal(
    executeRegistryCommand(
      directory,
      {
        command: 'begin-maintenance',
        expectedRevision: revision,
        operationId: 'retire-1',
        owner: 'backup',
        kind: 'backup',
      },
      ports(),
    ),
    'already exists',
  );
});

it('rejects invalid journal measurements and preserves unresolved publication ownership', async () => {
  const directory = await fixture();
  const reserved = await executeRegistryCommand(directory, publication(), ports());
  await requireRefusal(
    executeRegistryCommand(
      directory,
      {
        command: 'begin-maintenance',
        expectedRevision: 1,
        operationId: 'backup-1',
        owner: 'backup',
        kind: 'backup',
      },
      ports(),
    ),
    'Unresolved publication',
  );
  await requireRefusal(
    executeRegistryCommand(
      directory,
      {
        command: 'finish-publication',
        expectedRevision: 1,
        operationId: 'publish-1',
        owner: 'publisher',
        token: reserved.token,
        outcome: 'completed',
        reconciled: false,
      },
      ports(),
    ),
    'reconciled',
  );
  await requireRefusal(
    executeRegistryCommand(
      directory,
      {
        command: 'finish-publication',
        expectedRevision: 1,
        operationId: 'publish-1',
        owner: 'publisher',
        token: reserved.token,
        outcome: 'failed',
        reconciled: false,
      },
      ports(),
    ),
    'Failure receipt',
  );
  await requireRefusal(
    executeRegistryCommand(
      directory,
      {
        command: 'finish-publication',
        expectedRevision: 1,
        operationId: 'publish-1',
        owner: 'publisher',
        token: reserved.token,
        outcome: 'completed',
        reconciled: true,
      },
      {
        ...ports(),
        measureJournal: () =>
          Promise.resolve({
            usableBytes: GiB,
            allocationUnitBytes: 4096,
            usedBytes: NaN,
            totalInodes: 100000,
            usedInodes: 10,
          }),
      },
    ),
    'measurement',
  );
  expect((await read(directory)).state.reservations).toHaveLength(1);
});

it('refuses reinitialization, clock reversal, duplicate roots and malformed trusted ownership', async () => {
  const directory = await fixture();
  await requireRefusal(
    executeRegistryCommand(directory, { command: 'initialize', enrollment }, ports()),
    'EEXIST',
  );
  await requireRefusal(
    executeRegistryCommand(directory, publication(), {
      ...ports(),
      now: () => '2020-01-01T00:00:00.000Z',
    }),
    'clock',
  );
  await requireRefusal(
    executeRegistryCommand(directory, { ...publication(), roots: [root, root] }, ports()),
    'Duplicate',
  );
  const path = join(directory, 'journal.json');
  const state = (await read(directory)).state;
  const corruptions = [
    { ...state, enrollment: { ...state.enrollment, owners: ['publisher', 'publisher'] } },
    { ...state, reservations: [{ operationId: 'orphan', bytes: 1, inodes: 1 }] },
    { ...state, closedOperations: ['duplicate', 'duplicate'] },
    { ...state, schemaVersion: 99 },
  ];
  for (const corrupt of corruptions) {
    await writeFile(path, JSON.stringify(corrupt));
    await requireRefusal(read(directory), undefined);
    await requireRefusal(executeRegistryCommand(directory, publication(), ports()), undefined);
  }
});

it('charges physical replacement allocation before spending recovery headroom', async () => {
  const directory = await fixture();
  const reserved = await executeRegistryCommand(directory, publication(), ports());
  await requireRefusal(
    executeRegistryCommand(
      directory,
      {
        command: 'finish-publication',
        expectedRevision: 1,
        operationId: 'publish-1',
        owner: 'publisher',
        token: reserved.token,
        outcome: 'completed',
        reconciled: true,
      },
      ports(GiB - 3000),
    ),
    'journal capacity',
  );
  expect((await read(directory)).state.reservations).toHaveLength(1);
});

it('reserves failure growth below the bounded journal read limit', async () => {
  const directory = await fixture();
  const state = (await read(directory)).state;
  const baseBytes = Buffer.byteLength(JSON.stringify(state));
  const count = Math.floor((16 * 1024 * 1024 - 1200 - baseBytes) / 259);
  state.closedOperations = Array.from({ length: count }, (_, index) =>
    String(index).padStart(256, 'x'),
  );
  await writeFile(join(directory, 'journal.json'), JSON.stringify(state));
  await requireRefusal(executeRegistryCommand(directory, publication(), ports()), 'write bound');
});

it('bounds valid oversized command and journal inputs and refuses exhausted revisions', async () => {
  const directory = await fixture();
  const roots = Array.from(
    { length: 600 },
    (_, index) => `sha256:${index.toString(16).padStart(64, '0')}`,
  );
  await requireRefusal(
    executeRegistryCommand(
      directory,
      {
        ...publication(),
        roots,
        references: roots.map((digest) => ({ repository: 'wbs/be-01', digest })),
      },
      ports(),
    ),
    'read bound',
  );
  const state = (await read(directory)).state;
  await writeFile(
    join(directory, 'journal.json'),
    JSON.stringify(state) + ' '.repeat(16 * 1024 * 1024),
  );
  await requireRefusal(read(directory), 'read bound');
  state.revision = Number.MAX_SAFE_INTEGER;
  await writeFile(join(directory, 'journal.json'), JSON.stringify(state));
  await requireRefusal(
    executeRegistryCommand(directory, publication(Number.MAX_SAFE_INTEGER), ports()),
    'revision exhausted',
  );
});

it('rejects corrupted active and failed maintenance phase combinations before recovery', async () => {
  const directory = await fixture();
  const begun = await executeRegistryCommand(
    directory,
    {
      command: 'begin-maintenance',
      expectedRevision: 0,
      operationId: 'backup-phases',
      owner: 'backup',
      kind: 'backup',
    },
    ports(),
  );
  const maintenance = begun.state.maintenance;
  if (maintenance === null) throw new Error('Missing maintenance fixture');
  for (const corruption of [
    { phase: 'acquired', resumePhase: 'restored' },
    { phase: 'deleting', resumePhase: 'deleting' },
    { phase: 'completed', resumePhase: 'completed' },
    { phase: 'failed', resumePhase: 'deleting', failure: 'failed' },
    { phase: 'failed', resumePhase: 'completed', failure: 'failed' },
    { phase: 'failed', resumePhase: 'acquired' },
  ]) {
    await writeFile(
      join(directory, 'journal.json'),
      JSON.stringify({ ...begun.state, maintenance: { ...maintenance, ...corruption } }),
    );
    await requireRefusal(
      executeRegistryCommand(
        directory,
        {
          command: 'recover-maintenance',
          expectedRevision: 1,
          operationId: 'backup-phases',
          owner: 'backup',
          token: begun.token,
        },
        ports(),
      ),
      'maintenance phase',
    );
    await requireRefusal(read(directory), 'maintenance phase');
  }
});

it('removes its replacement after repeated fsync failures while preserving canonical state', async () => {
  const directory = await fixture();
  const before = await readFile(join(directory, 'journal.json'), 'utf8');
  const { readdir } = await import('node:fs/promises');
  for (let attempt = 0; attempt < 3; attempt++) {
    await requireRefusal(
      executeRegistryCommand(directory, publication(), {
        ...ports(),
        sync: async (descriptor) => {
          if ((await descriptor.stat()).isFile()) throw new Error('injected replacement fsync');
          await descriptor.sync();
        },
      }),
      'injected replacement fsync',
    );
    expect((await readdir(directory)).sort()).toEqual(['authority.lock', 'journal.json']);
    expect(await readFile(join(directory, 'journal.json'), 'utf8')).toBe(before);
  }
});

it('reclaims a crashed pre-rename replacement only after validating canonical state', async () => {
  const directory = await fixture();
  const before = await readFile(join(directory, 'journal.json'), 'utf8');
  const crashed = await child(
    `import { executeRegistryCommand } from './registry-journal'; ${portSource}
    await executeRegistryCommand(process.argv[1], JSON.parse(process.argv[2]), { ...ports,
      sync: async (descriptor) => { await descriptor.sync(); if ((await descriptor.stat()).isFile()) process.kill(process.pid, 'SIGKILL'); } });`,
    [directory, JSON.stringify(publication())],
  );
  expect(crashed.exitCode).not.toBe(0);
  const { readdir } = await import('node:fs/promises');
  const replacements = (await readdir(directory)).filter((name) =>
    /^journal\..+\.json$/.test(name),
  );
  expect(replacements).toHaveLength(1);
  await writeFile(join(directory, 'journal.json'), '{');
  await requireRefusal(read(directory), 'JSON');
  expect((await readdir(directory)).filter((name) => /^journal\..+\.json$/.test(name))).toEqual(
    replacements,
  );
  await writeFile(join(directory, 'journal.json'), before);
  const recovered = await read(directory);
  expect(recovered.state.revision).toBe(0);
  expect((await readdir(directory)).sort()).toEqual(['authority.lock', 'journal.json']);
  await executeRegistryCommand(directory, publication(), ports());
  expect((await read(directory)).state.reservations).toHaveLength(1);
});

it('refuses initialize when an orphan may be the only recoverable journal', async () => {
  const directory = await scratchAsync('registry-orphan-initialize-');
  await chmod(directory, 0o700);
  const replacement = join(directory, `journal.${crypto.randomUUID()}.json`);
  await writeFile(replacement, '{"recovery":"only copy"}', { mode: 0o600 });
  await requireRefusal(
    executeRegistryCommand(directory, { command: 'initialize', enrollment }, ports()),
    'replacement',
  );
  expect(await readFile(replacement, 'utf8')).toBe('{"recovery":"only copy"}');
  await requireRefusal(read(directory), 'ENOENT');
});

it('refuses unsafe replacement entries without deleting canonical or unrelated files', async () => {
  const { link, mkdir, symlink } = await import('node:fs/promises');
  for (const kind of ['name', 'directory', 'symlink', 'public-file', 'hardlink', 'fifo'] as const) {
    const directory = await fixture();
    const before = await readFile(join(directory, 'journal.json'), 'utf8');
    const name = kind === 'name' ? 'journal.notes.json' : `journal.${crypto.randomUUID()}.json`;
    const path = join(directory, name);
    if (kind === 'fifo') {
      const created = Bun.spawnSync(['mkfifo', '-m', '600', path]);
      expect(created.exitCode).toBe(0);
    } else if (kind === 'hardlink') await link(join(directory, 'journal.json'), path);
    else if (kind === 'directory') await mkdir(path, { mode: 0o700 });
    else if (kind === 'symlink') await symlink(join(directory, 'journal.json'), path);
    else await writeFile(path, 'preserve', { mode: kind === 'public-file' ? 0o644 : 0o600 });
    await writeFile(join(directory, 'operator-notes'), 'unrelated', { mode: 0o600 });
    await requireRefusal(read(directory), 'replacement');
    expect(await readFile(join(directory, 'journal.json'), 'utf8')).toBe(before);
    expect(await readFile(join(directory, 'operator-notes'), 'utf8')).toBe('unrelated');
    expect(
      (await import('node:fs/promises').then(({ lstat }) => lstat(path))).isSymbolicLink(),
    ).toBe(kind === 'symlink');
  }
});

it('cleans replacement files after a real write failure on a broken descriptor', async () => {
  const directory = await fixture();
  const before = await readFile(join(directory, 'journal.json'), 'utf8');
  const failed = await child(
    `import * as filesystem from 'node:fs/promises'; import { constants } from 'node:fs';
    import { mock } from 'bun:test'; const nativeOpen = filesystem.open;
    mock.module('node:fs/promises', () => ({ ...filesystem, open: (path, flags, mode) =>
      nativeOpen(path, typeof path === 'string' && /^journal\\..+\\.json$/.test(path.split('/').at(-1))
        ? constants.O_RDONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW : flags, mode) }));
    const { executeRegistryCommand } = await import('./registry-journal'); ${portSource}
    await executeRegistryCommand(process.argv[1], JSON.parse(process.argv[2]), ports);`,
    [directory, JSON.stringify(publication())],
  );
  expect(failed.exitCode).not.toBe(0);
  expect(failed.stderr).toContain('EBADF');
  expect(
    (await import('node:fs/promises').then(({ readdir }) => readdir(directory))).sort(),
  ).toEqual(['authority.lock', 'journal.json']);
  expect(await readFile(join(directory, 'journal.json'), 'utf8')).toBe(before);
});

it('propagates replacement cleanup failure and reclaims the orphan after permission recovery', async () => {
  const directory = await fixture();
  const before = await readFile(join(directory, 'journal.json'), 'utf8');
  let failure: unknown;
  try {
    failure = await executeRegistryCommand(directory, publication(), {
      ...ports(),
      sync: async (descriptor) => {
        if ((await descriptor.stat()).isFile()) {
          await chmod(directory, 0o500);
          throw new Error('injected primary fsync failure');
        }
        await descriptor.sync();
      },
    }).then(
      () => {
        throw new Error('Expected cleanup failure');
      },
      (cause: unknown) => cause,
    );
  } finally {
    await chmod(directory, 0o700);
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect(String(failure)).toContain('replacement cleanup failed');
  if (failure instanceof AggregateError) {
    expect(failure.errors.map(String).join(' ')).toContain('injected primary fsync failure');
    expect(failure.errors.map(String).join(' ')).toContain('EACCES');
  }
  expect(await readFile(join(directory, 'journal.json'), 'utf8')).toBe(before);
  const { readdir } = await import('node:fs/promises');
  expect(
    (await readdir(directory)).filter((name) => /^journal\..+\.json$/.test(name)),
  ).toHaveLength(1);
  await read(directory);
  expect((await readdir(directory)).sort()).toEqual(['authority.lock', 'journal.json']);
});

it('propagates orphan directory fsync failure without acknowledging the read command', async () => {
  const directory = await fixture();
  const before = await readFile(join(directory, 'journal.json'), 'utf8');
  await writeFile(join(directory, `journal.${crypto.randomUUID()}.json`), 'partial', {
    mode: 0o600,
  });
  await requireRefusal(
    executeRegistryCommand(
      directory,
      { command: 'read' },
      {
        ...ports(),
        sync: () => Promise.reject(new Error('injected orphan cleanup directory fsync')),
      },
    ),
    'orphan cleanup directory fsync',
  );
  expect(await readFile(join(directory, 'journal.json'), 'utf8')).toBe(before);
});

it('refuses a foreign-owner replacement reported by the filesystem boundary', async () => {
  const directory = await fixture();
  const path = join(directory, `journal.${crypto.randomUUID()}.json`);
  await writeFile(path, 'foreign evidence', { mode: 0o600 });
  const failed = await child(
    `import * as filesystem from 'node:fs/promises'; import { mock } from 'bun:test';
    const nativeLstat = filesystem.lstat;
    mock.module('node:fs/promises', () => ({ ...filesystem, lstat: async (path) => {
      const status = await nativeLstat(path); if (path === process.argv[2]) status.uid += 1; return status;
    } }));
    const { executeRegistryCommand } = await import('./registry-journal'); ${portSource}
    await executeRegistryCommand(process.argv[1], {command:'read'}, ports);`,
    [directory, path],
  );
  expect(failed.exitCode).not.toBe(0);
  expect(failed.stderr).toContain('replacement must be');
  expect(await readFile(path, 'utf8')).toBe('foreign evidence');
});

it('persists pressure, requires verified low water to explicitly reopen, and preserves restart fence', async () => {
  const directory = await fixture();
  const high = {
    ...ports(),
    measureRegistry: () => Promise.resolve({ ...capacity, usedInodes: 90000 }),
  };
  const fenced = await executeRegistryCommand(directory, { command: 'check-capacity' }, high);
  expect(fenced.state.fenced).toBe(true);
  expect(fenced.state.fenceReason).toContain('inodes');
  expect((await read(directory)).state.fenced).toBe(true);
  await requireRefusal(
    executeRegistryCommand(
      directory,
      { command: 'reopen', expectedRevision: 1, operationId: 'reopen', owner: 'backup' },
      ports(),
    ),
    'verified maintenance',
  );
  const healthy = await executeRegistryCommand(directory, { command: 'check-capacity' }, ports());
  expect(healthy.state.fenced).toBe(true);
});

it('requires explicit schema upgrade and preserves old recovery obligations', async () => {
  const directory = await fixture();
  const current = (await read(directory)).state;
  const legacy: Record<string, unknown> = { ...current };
  delete legacy['fenceReason'];
  delete legacy['maintenanceVerified'];
  delete legacy['measurement'];
  delete legacy['environments'];
  delete legacy['deployments'];
  delete legacy['consumers'];
  await writeFile(
    join(directory, 'journal.json'),
    JSON.stringify({ ...legacy, schemaVersion: 1, fenced: true }),
  );
  await requireRefusal(read(directory), 'registry journal');
  const upgraded = await executeRegistryCommand(directory, { command: 'upgrade' }, ports());
  expect(upgraded.state.schemaVersion).toBe(3);
  expect(upgraded.state.fenced).toBe(true);
  expect(upgraded.state.maintenanceVerified).toBe(false);
});

it('refuses pressure renewal when journal crosses its independent ninety percent boundary', async () => {
  const directory = await fixture();
  await requireRefusal(
    executeRegistryCommand(directory, { command: 'check-capacity' }, ports(Math.ceil(GiB * 0.9))),
    'journal capacity',
  );
});

it('refuses inconsistent legacy recovery state before schema upgrade', async () => {
  const directory = await fixture();
  const begun = await executeRegistryCommand(
    directory,
    {
      command: 'begin-maintenance',
      expectedRevision: 0,
      operationId: 'legacy-recovery',
      owner: 'backup',
      kind: 'backup',
    },
    ports(),
  );
  const legacy: Record<string, unknown> = { ...begun.state, schemaVersion: 1, fenced: false };
  delete legacy['fenceReason'];
  delete legacy['maintenanceVerified'];
  delete legacy['measurement'];
  delete legacy['environments'];
  delete legacy['deployments'];
  delete legacy['consumers'];
  await writeFile(join(directory, 'journal.json'), JSON.stringify(legacy));
  await requireRefusal(
    executeRegistryCommand(directory, { command: 'upgrade' }, ports()),
    'Unfenced recovery',
  );
});

it('loads deferred host ports once after validation for an actual journal command', async () => {
  const directory = await scratchAsync('registry-deferred-authority-');
  await chmod(directory, 0o700);
  let loaded = 0;
  const initialized = await executeRegistryCommand(
    directory,
    { command: 'initialize', enrollment },
    () => {
      loaded++;
      return Promise.resolve(ports());
    },
  );
  expect(loaded).toBe(1);
  expect(initialized.state.enrollment).toEqual(enrollment);
  expect((await read(directory)).state).toEqual(initialized.state);
});

it('rejects malformed commands before deferred host bootstrap or journal effects', async () => {
  const directory = await scratchAsync('registry-invalid-before-bootstrap-');
  await chmod(directory, 0o700);
  let loaded = 0;
  await requireRefusal(
    executeRegistryCommand(
      directory,
      { command: 'finish-publication', outcome: 'promoted' },
      () => {
        loaded++;
        return Promise.reject(new Error('Host installation must not be consulted'));
      },
    ),
    'Malformed registry command',
  );
  expect(loaded).toBe(0);
  expect(await readdir(directory)).toEqual([]);
});

it('preserves deferred bootstrap failure before acquiring a lock or touching trusted state', async () => {
  const directory = await scratchAsync('registry-bootstrap-failure-');
  await chmod(directory, 0o700);
  const failure = new Error('Unavailable fixed installation');
  let refused = false;
  try {
    await executeRegistryCommand(directory, { command: 'read' }, () => Promise.reject(failure));
  } catch (cause) {
    expect(cause).toBe(failure);
    refused = true;
  }
  expect(refused).toBe(true);
  expect(await readdir(directory)).toEqual([]);
});
