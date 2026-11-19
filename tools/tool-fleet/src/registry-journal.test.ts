import { chmod, mkdir, readdir, readFile, readlink, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { executeRegistryCommand } from './registry-journal';
import { admitPublication } from './registry-policy';
import { consumeRegistryStream } from './registry-stream';

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

it('runs the owner-only stdin CLI with real measurements and bounds input', async () => {
  const observation = await runJournalFilesystemFixture();
  expect(observation.hasTimedOut, JSON.stringify(observation)).toBe(false);
  expect(observation.stdoutFailure, JSON.stringify(observation)).toBeNull();
  expect(observation.stderrFailure, JSON.stringify(observation)).toBeNull();
  expect(observation.exitCode, JSON.stringify(observation)).toBe(0);
  expect(observation.stderr, JSON.stringify(observation)).toBe('');
  const frames: Record<string, unknown>[] = observation.stdout
    .trimEnd()
    .split('\n')
    .map((line) => {
      const frame: unknown = JSON.parse(line);
      if (typeof frame !== 'object' || frame === null || Array.isArray(frame))
        throw new Error('Malformed journal fixture observation');
      return frame as Record<string, unknown>;
    });
  // Proof: faults07/08/09 in controlled-journal-final-semantic reject omitted completion, corrupted request association and unknown diagnostic event through this actual parser.
  const stages = frames.filter((frame) => {
    if (frame['stage'] !== 'diagnostic') return true;
    expect(frame['fixture']).toBe('registry-journal-cli-v1');
    expect([
      'stream-prefix',
      'stream-overflow',
      'stream-failure',
      'deadline',
      'settlement-failed',
    ]).toContain(String(frame['event']));
    return false;
  });
  expect(stages.map((frame) => frame['stage'])).toEqual([
    'admission',
    'initialize-request',
    'initialize',
    'journal',
    'orphan',
    'read-request',
    'read',
    'files',
    'complete',
  ]);
  expect(stages.at(-1)).toEqual({
    schemaVersion: 1,
    fixture: 'registry-journal-cli-v1',
    stage: 'complete',
    status: 'passed',
    stages: [
      'admission',
      'initialize-request',
      'initialize',
      'journal',
      'orphan',
      'read-request',
      'read',
      'files',
    ],
    childCount: 2,
  });
  const admission = stages.at(0);
  expect(admission?.['filesystemType']).toBe('tmpfs');
  expect(admission?.['capacityBytes']).toBe(4194304);
  expect(admission?.['uid']).toBe(1000);
  expect(admission?.['gid']).toBe(1000);
  for (const stage of ['initialize', 'read']) {
    const child = stages.find((frame) => frame['stage'] === stage);
    expect(child?.['exitCode'], JSON.stringify(child)).toBe(0);
    expect(child?.['stderr'], JSON.stringify(child)).toBe('');
    expect(child?.['settled']).toBe(true);
    expect(child?.['hasTimedOut']).toBe(false);
    const request = stages.find((frame) => frame['stage'] === `${stage}-request`);
    expect(child?.['request']).toBe(request?.['request']);
    expect(child?.['argv']).toEqual(request?.['argv']);
  }
});

it('refuses oversized stdin before creating journal artifacts', async () => {
  const directory = await scratchAsync('registry-command-oversized-');
  await chmod(directory, 0o700);
  const observation = await runJournalCli(
    directory,
    '{"command":"read"}' + ' '.repeat(65537),
    [],
    'oversized-stdin',
  );
  requireJournalCliRefusal(observation, 'Registry request exceeds read bound');
  expect(await readdir(directory)).toEqual([]);
});

it('refuses the locked argument before creating journal artifacts', async () => {
  const directory = await scratchAsync('registry-command-argument-');
  await chmod(directory, 0o700);
  const observation = await runJournalCli(
    directory,
    '{"command":"read"}',
    ['--locked'],
    'locked-argument',
  );
  requireJournalCliRefusal(
    observation,
    'Usage: registry-journal-cli.ts <owner-only-journal-directory>',
  );
  expect(await readdir(directory)).toEqual([]);
});

it('refuses caller capacity before creating journal artifacts', async () => {
  const directory = await scratchAsync('registry-command-grammar-');
  await chmod(directory, 0o700);
  const observation = await runJournalCli(
    directory,
    JSON.stringify({ ...publication(), capacity }),
    [],
    'caller-capacity',
  );
  requireJournalCliRefusal(observation, 'Malformed registry command:');
  expect(await readdir(directory)).toEqual([]);
});

it('refuses a non-owner-only CLI directory before journal access', async () => {
  const directory = await scratchAsync('registry-command-owner-');
  await chmod(directory, 0o755);
  const observation = await runJournalCli(directory, '{"command":"read"}', [], 'owner-mode');
  requireJournalCliRefusal(
    observation,
    'Registry journal directory must be owner-only and owned by the current user',
  );
  expect(await readdir(directory)).toEqual([]);
});

it('refuses a one-byte CLI journal budget without a canonical journal', async () => {
  const directory = await scratchAsync('registry-command-budget-');
  await chmod(directory, 0o700);
  const observation = await runJournalCli(
    directory,
    JSON.stringify({
      command: 'initialize',
      enrollment: {
        ...enrollment,
        registryPath: directory,
        rootPath: directory,
        journalMaximumBytes: 1,
      },
    }),
    [],
    'one-byte-budget',
  );
  requireJournalCliRefusal(
    observation,
    'Insufficient journal capacity for durable replacement and failure receipt',
  );
  expect(await readdir(directory)).toEqual(['authority.lock']);
});

/** Collect the actual fixed CLI or namespace child; kill on overflow/deadline and await exit plus both readers before returning to scratch cleanup. */
async function observeJournalChild(
  argv: string[],
  request: string | null,
  stage: string,
  deadlineMs: number,
  environment?: Record<string, string>,
) {
  const cwd = process.cwd();
  process.stderr.write(
    `${JSON.stringify({ event: 'journal-child-request', stage, argv, request, cwd })}\n`,
  );
  const child = Bun.spawn(argv, {
    cwd,
    env: environment ?? {
      PATH: '/usr/bin:/bin',
      LANG: 'C.UTF-8',
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
    },
    stdin: request === null ? 'ignore' : new TextEncoder().encode(request),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stopChild = () => {
    if (child.exitCode === null) child.kill('SIGKILL');
  };
  let hasTimedOut = false;
  // Proof: parent-stall fault12 retained prefix then deadline before actual stopped-child/reader settlement; this is not a universal settlement-time bound.
  const deadline = setTimeout(() => {
    hasTimedOut = true;
    process.stderr.write(
      `${JSON.stringify({ event: 'journal-child-deadline', stage, pid: child.pid, hasTimedOut, settlement: 'pending' })}\n`,
    );
    stopChild();
  }, deadlineMs);
  const collectStream = async (stream: ReadableStream<Uint8Array>, context: string) => {
    const chunks: Uint8Array[] = [];
    let failure: string | null = null;
    let receivedBytes = 0;
    let retainedBytes = 0;
    const observed = stream.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          receivedBytes += chunk.byteLength;
          if (receivedBytes > 256 * 1024) {
            // Proof: parent-noise fault11 retained prefix then overflow before the actual joined terminal; publication precedes upstream cancellation.
            // Publish and stop before consumeRegistryStream waits for upstream cancellation.
            process.stderr.write(
              `${JSON.stringify({ event: 'journal-child-overflow', stage, context, pid: child.pid, receivedBytes, retainedBytes, complete: false, settlement: 'pending' })}\n`,
            );
            stopChild();
          }
          controller.enqueue(chunk);
        },
      }),
    );
    try {
      await consumeRegistryStream(observed, 256 * 1024, context, (chunk) => {
        chunks.push(chunk);
        retainedBytes += chunk.byteLength;
        process.stderr.write(
          `${JSON.stringify({ event: 'journal-child-prefix', stage, context, pid: child.pid, retainedBytes, prefixBase64: Buffer.from(chunk).toString('base64'), complete: false })}\n`,
        );
      });
    } catch (cause) {
      failure = String(cause);
      process.stderr.write(
        `${JSON.stringify({ event: 'journal-child-stream-failure', stage, context, pid: child.pid, receivedBytes, retainedBytes, failure, complete: false, settlement: 'pending' })}\n`,
      );
      stopChild();
    }
    const bytes = Buffer.concat(chunks);
    return { text: bytes.toString('utf8'), base64: bytes.toString('base64'), failure };
  };
  try {
    const [terminal, stdout, stderr] = await Promise.allSettled([
      child.exited,
      collectStream(child.stdout, 'Journal child stdout'),
      collectStream(child.stderr, 'Journal child stderr'),
    ]);
    if (
      terminal.status !== 'fulfilled' ||
      stdout.status !== 'fulfilled' ||
      stderr.status !== 'fulfilled'
    ) {
      process.stderr.write(
        `${JSON.stringify({ event: 'journal-child-settlement-failed', stage, argv, pid: child.pid, terminal, stdout, stderr })}\n`,
      );
      throw new Error('Journal fixture child process or stream settlement is unconfirmed');
    }
    const observation = {
      stage,
      argv,
      request,
      cwd,
      pid: child.pid,
      exitCode: terminal.value,
      signal: child.signalCode,
      hasTimedOut,
      settled: true,
      stdout: stdout.value.text,
      stderr: stderr.value.text,
      stdoutBase64: stdout.value.base64,
      stderrBase64: stderr.value.base64,
      stdoutFailure: stdout.value.failure,
      stderrFailure: stderr.value.failure,
    };
    process.stderr.write(
      `${JSON.stringify({ event: 'journal-child-observation', ...observation })}\n`,
    );
    return observation;
  } finally {
    clearTimeout(deadline);
  }
}

/** Invoke only the existing CLI; grammar cases retain their own complete request and exact refusal. */
function runJournalCli(directory: string, request: string, extra: string[], stage: string) {
  return observeJournalChild(
    [
      process.execPath,
      '--no-env-file',
      join(import.meta.dir, 'registry-journal-cli.ts'),
      directory,
      ...extra,
    ],
    request,
    stage,
    5000,
  );
}

// Proof: fault10 supplied real usage-error stderr with actual exit0; this shared predicate refused the false refusal.
function requireJournalCliRefusal(
  observation: Awaited<ReturnType<typeof runJournalCli>>,
  prefix: string,
): void {
  expect(observation.hasTimedOut, JSON.stringify(observation)).toBe(false);
  expect(observation.stdoutFailure, JSON.stringify(observation)).toBeNull();
  expect(observation.stderrFailure, JSON.stringify(observation)).toBeNull();
  expect(observation.settled).toBe(true);
  expect(observation.exitCode, JSON.stringify(observation)).not.toBe(0);
  expect(observation.signal, JSON.stringify(observation)).toBeNull();
  expect(observation.stdout, JSON.stringify(observation)).toBe('');
  expect(observation.stderr, JSON.stringify(observation)).toContain(`error: ${prefix}`);
}

/** One namespace owns one bounded filesystem through initialization, orphan recovery and readback. */
async function runJournalFilesystemFixture() {
  if (process.platform !== 'linux') throw new Error('Journal filesystem fixture requires Linux');
  const bubblewrap = Bun.which('bwrap');
  if (bubblewrap === null) throw new Error('Journal filesystem fixture requires bubblewrap');
  const directory = await scratchAsync('registry-cli-filesystem-');
  await chmod(directory, 0o700);
  const mountpoint = join(directory, 'mount');
  await mkdir(mountpoint, { mode: 0o700 });
  const canonical = await realpath(mountpoint);
  const parentUserNamespace = await readlink('/proc/self/ns/user');
  const parentMountNamespace = await readlink('/proc/self/ns/mnt');
  const argv = [
    bubblewrap,
    '--die-with-parent',
    '--new-session',
    '--unshare-all',
    '--uid',
    '1000',
    '--gid',
    '1000',
    '--ro-bind',
    '/',
    '/',
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--size',
    '4194304',
    '--tmpfs',
    canonical,
    '--chdir',
    process.cwd(),
    process.execPath,
    '--no-env-file',
    join(import.meta.dir, 'registry-journal-cli.fixture.ts'),
    '--registry-journal-smoke-v1',
    canonical,
  ];
  // Proof: actual full mount omission and 2MiB size faults reached worker domain/size refusals before admission; controlled-journal-finite-sequence records both and the restored positive.
  const observation = await observeJournalChild(argv, null, 'namespace-worker', 20000, {
    PATH: '/usr/bin:/bin',
    LANG: 'C.UTF-8',
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
    REGISTRY_FIXTURE_PARENT_USER_NAMESPACE: parentUserNamespace,
    REGISTRY_FIXTURE_PARENT_MOUNT_NAMESPACE: parentMountNamespace,
  });
  // observeJournalChild returns only after the exact process and both streams settled; scratch's normal preload owns later removal.
  return observation;
}

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
  expect(completed.state.fenced).toBe(false);
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
    { ...state, schemaVersion: 2 },
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
    if (kind === 'public-file') await chmod(path, 0o644);
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

async function completeBackup(directory: string, registry: typeof capacity, expectedRevision = 0) {
  const measured = { ...ports(), measureRegistry: () => Promise.resolve(registry) };
  const operationId = `backup-${String(expectedRevision)}`;
  const begun = await executeRegistryCommand(
    directory,
    {
      command: 'begin-maintenance',
      expectedRevision,
      operationId,
      owner: 'backup',
      kind: 'backup',
    },
    measured,
  );
  let state = begun.state;
  for (const phase of [
    'reconciled',
    'fenced',
    'stopped',
    'backed-up',
    'verified',
    'restored',
    'completed',
  ]) {
    state = (
      await executeRegistryCommand(
        directory,
        {
          command: 'advance-maintenance',
          expectedRevision: state.revision,
          operationId,
          owner: 'backup',
          token: begun.token,
          phase,
        },
        measured,
      )
    ).state;
  }
  return state;
}

it('maintenance completion stays fenced at exact seventy percent use or low host reserve', async () => {
  for (const [changes, admission] of [
    [{ usedBytes: 35 * GiB }, 'admitted'],
    [{ usedInodes: 70000 }, 'admitted'],
    [{ rootFreeBytes: 20 * GiB - 1 }, 'refused'],
  ] as const) {
    const directory = await fixture();
    const registry = { ...capacity, ...changes };
    const completed = await completeBackup(directory, registry);
    expect(completed.maintenance).toBeNull();
    expect(completed.closedOperations).toEqual(['backup-0']);
    expect(completed.fenced).toBe(true);
    // Pure admission still admits both exact-70% cases; it grants no reopening authority.
    expect(
      admitPublication({ capacity: registry, reservations: [], envelope: publication().envelope }),
    ).toMatchObject({ status: admission });
    await requireRefusal(
      executeRegistryCommand(directory, publication(completed.revision), {
        ...ports(),
        measureRegistry: () => Promise.resolve(registry),
      }),
      'Registry writes are fenced',
    );
    expect((await read(directory)).state).toEqual(completed);
  }
});

it('maintenance completion reopens strictly below seventy percent with adequate host reserve', async () => {
  const directory = await fixture();
  const registry = {
    ...capacity,
    usedBytes: 35 * GiB - 1,
    usedInodes: 69999,
    rootFreeBytes: 20 * GiB,
  };
  const completed = await completeBackup(directory, registry);
  expect(completed.maintenance).toBeNull();
  expect(completed.fenced).toBe(false);
  const reopened = await executeRegistryCommand(directory, publication(completed.revision), {
    ...ports(),
    measureRegistry: () => Promise.resolve(registry),
  });
  expect(reopened.token).toMatch(/^[0-9a-f-]{36}$/);
  expect(reopened.state.reservations).toEqual([
    { operationId: 'publish-1', bytes: GiB, inodes: 100 },
  ]);
});

it('failed publication fence survives abandonment until maintenance completes', async () => {
  const directory = await fixture();
  const reserved = await executeRegistryCommand(directory, publication(), ports());
  const finish = {
    command: 'finish-publication',
    operationId: 'publish-1',
    owner: 'publisher',
    token: reserved.token,
  };
  await executeRegistryCommand(
    directory,
    {
      ...finish,
      expectedRevision: 1,
      outcome: 'failed',
      reconciled: false,
      failure: 'upload interrupted',
    },
    ports(),
  );
  const abandoned = await executeRegistryCommand(
    directory,
    { ...finish, expectedRevision: 2, outcome: 'abandoned', reconciled: true },
    ports(),
  );
  expect(abandoned.state.publication).toBeNull();
  expect(abandoned.state.reservations).toEqual([]);
  expect(abandoned.state.bundles[0]?.receipt.state).toBe('abandoned');
  expect(abandoned.state.fenced).toBe(true);
  await requireRefusal(
    executeRegistryCommand(directory, publication(3, 'publish-2'), ports()),
    'Registry writes are fenced',
  );
  const completed = await completeBackup(directory, capacity, 3);
  expect(completed.fenced).toBe(false);
  const reopened = await executeRegistryCommand(
    directory,
    publication(completed.revision, 'publish-2'),
    ports(),
  );
  expect(reopened.state.reservations).toEqual([
    { operationId: 'publish-2', bytes: GiB, inodes: 100 },
  ]);
});

for (const [name, initial, earlier, later] of [
  ['standard', '2026-11-08T00:00:00.001Z', '2026-11-08T00:00:00.000Z', '2026-11-08T00:00:00.002Z'],
  [
    'expanded-boundary',
    '+010000-01-01T00:00:00.000Z',
    '9999-12-31T23:59:59.999Z',
    '+010000-01-01T00:00:00.001Z',
  ],
  [
    'negative-expanded',
    '-000001-01-01T00:00:00.000Z',
    '-000002-01-01T00:00:00.000Z',
    '0000-01-01T00:00:00.000Z',
  ],
] as const) {
  it(`chronology rejects ${name} reversal before durable mutation`, async () => {
    const directory = await scratchAsync('registry-receipt-clock-');
    await chmod(directory, 0o700);
    await executeRegistryCommand(
      directory,
      { command: 'initialize', enrollment },
      {
        ...ports(),
        now: () => initial,
      },
    );
    const before = await readFile(join(directory, 'journal.json'), 'utf8');
    await requireRefusal(
      executeRegistryCommand(directory, publication(), { ...ports(), now: () => earlier }),
      'clock moved backwards',
    );
    expect(await readFile(join(directory, 'journal.json'), 'utf8')).toBe(before);
    const retained = await read(directory);
    expect(retained.state.revision).toBe(0);
    expect(retained.state.reservations).toEqual([]);
  });

  it(`chronology accepts ${name} advancement from an earlier spelling`, async () => {
    const directory = await scratchAsync('registry-receipt-clock-');
    await chmod(directory, 0o700);
    await executeRegistryCommand(
      directory,
      { command: 'initialize', enrollment },
      {
        ...ports(),
        now: () => earlier,
      },
    );
    const reserved = await executeRegistryCommand(directory, publication(), {
      ...ports(),
      now: () => initial,
    });
    expect(reserved.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(reserved.state.updatedAt).toBe(initial);
    expect(reserved.state.revision).toBe(1);
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
      { ...ports(), now: () => later },
    );
    expect(completed.state.updatedAt).toBe(later);
    expect(completed.state.revision).toBe(2);
    expect((await read(directory)).state.bundles[0]?.receipt.at).toBe(later);
  });

  it(`chronology accepts ${name} equal receipt instants`, async () => {
    const directory = await scratchAsync('registry-receipt-clock-');
    await chmod(directory, 0o700);
    await executeRegistryCommand(
      directory,
      { command: 'initialize', enrollment },
      {
        ...ports(),
        now: () => initial,
      },
    );
    const reserved = await executeRegistryCommand(directory, publication(), {
      ...ports(),
      now: () => initial,
    });
    expect(reserved.state.revision).toBe(1);
    expect((await read(directory)).state.updatedAt).toBe(initial);
  });
}
