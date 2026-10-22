import { readFileSync } from 'node:fs';

import { afterAll, describe, expect, test } from 'bun:test';

import type { ComputeProvider, ResourceBinding } from './provider';
import { sshHostAdapter } from './ssh-host';
import { createSshFixture, DF_100_40, MEMINFO_15_7 } from './testing/ssh-fixture';

const NOW = 1_760_000_000_000;

const fixture = createSshFixture({
  'measured.fixture': {
    meminfo: MEMINFO_15_7,
    df: DF_100_40,
    cpu: '8\n3.71 2.10 1.05 2/812 4242\n',
  },
  'closed.fixture': {
    refuse: 'ssh: connect to host closed.fixture port 22: Connection refused\r\n',
  },
  'rekeyed.fixture': { refuse: 'Host key verification failed.\r\n' },
  'nomemtotal.fixture': { meminfo: 'MemFree: 1048576 kB\nMemAvailable: 7340032 kB\n' },
  'nonsense.fixture': { df: 'df: no such thing\n' },
  'broken.fixture': { refuse: 'ssh: something no transport fault names\n' },
});

afterAll(() => {
  fixture.close();
});

async function provider(host: string): Promise<ComputeProvider> {
  return sshHostAdapter({
    sshExecutable: fixture.sshExecutable,
    environment: { PATH: process.env['PATH'], SSH_AUTH_SOCK: fixture.agentSocket },
  }).open({
    instanceId: `instance-${host}`,
    kind: 'ssh_host',
    host,
    sshTransportFile: fixture.transportFile,
    bindings: [],
  });
}

async function rejectionOf(attempt: Promise<unknown>): Promise<string> {
  try {
    await attempt;
  } catch (cause) {
    if (cause instanceof Error) return cause.message;
    throw new Error('rejected with a non-Error', { cause });
  }
  throw new Error('resolved instead of rejecting');
}

const memory: ResourceBinding = { resourceId: 'ram', measure: 'memory_gib' };
const disk: ResourceBinding = { resourceId: 'tmp', measure: 'disk_gib', path: '/tmp' };

describe('the ssh_host adapter against the fixture client', () => {
  test('measures memory as the spec states: 15 GiB with 8 in use, naming the transport and lines', async () => {
    expect(await (await provider('measured.fixture')).observe(memory, NOW)).toEqual({
      kind: 'measured',
      capacityUnits: 15,
      usageUnits: 8,
      observedAt: NOW,
      evidence:
        'ssh puni1@measured.fixture: MemTotal:       15976448 kB; MemAvailable:    7340032 kB',
    });
    const invocation = readFileSync(fixture.invocationsFile, 'utf8').trim().split('\n').at(-1);
    expect(invocation).toContain(`UserKnownHostsFile=${fixture.directory}/known_hosts`);
    expect(invocation).toEndWith('-l puni1 -- measured.fixture cat /proc/meminfo');
  });

  test('measures disk, cores and slots in whole units', async () => {
    const host = await provider('measured.fixture');
    expect(await host.observe(disk, NOW)).toMatchObject({
      kind: 'measured',
      capacityUnits: 100,
      usageUnits: 40,
    });
    expect(await host.observe({ resourceId: 'cpu', measure: 'cpu_cores' }, NOW)).toMatchObject({
      kind: 'measured',
      capacityUnits: 8,
      usageUnits: 3,
    });
    expect(
      await host.observe({ resourceId: 'slots', measure: 'agent_slots', slots: 4 }, NOW),
    ).toMatchObject({ kind: 'measured', capacityUnits: 4, usageUnits: 0 });
  });

  test('answers unreachable with the ssh cause when the port is closed, without throwing', async () => {
    expect(await (await provider('closed.fixture')).observe(memory, NOW)).toEqual({
      kind: 'unreachable',
      reason:
        'ssh connection_refused: ssh: connect to host closed.fixture port 22: Connection refused',
      observedAt: NOW,
    });
    expect(await (await provider('rekeyed.fixture')).observe(memory, NOW)).toEqual({
      kind: 'unreachable',
      reason: 'ssh host_key_mismatch: Host key verification failed.',
      observedAt: NOW,
    });
  });

  test('throws for /proc/meminfo without MemTotal', async () => {
    const host = await provider('nomemtotal.fixture');
    expect(await rejectionOf(host.observe(memory, NOW))).toContain(
      '/proc/meminfo on nomemtotal.fixture has no MemTotal line',
    );
  });

  test('throws for an unparseable df answer', async () => {
    const host = await provider('nonsense.fixture');
    expect(await rejectionOf(host.observe(disk, NOW))).toContain(
      'df -kP /tmp on nonsense.fixture answered no parseable data line',
    );
  });

  test('throws for an ssh failure that names no transport fault', async () => {
    const host = await provider('broken.fixture');
    expect(await rejectionOf(host.observe(memory, NOW))).toContain(
      'exited 255 without a transport fault',
    );
  });

  test('throws when the remote command fails on a reachable host', async () => {
    // nonsense.fixture has no meminfo file, so the remote `cat` exits 1.
    const host = await provider('nonsense.fixture');
    expect(await rejectionOf(host.observe(memory, NOW))).toContain(
      'cat /proc/meminfo on nonsense.fixture exited 1',
    );
  });

  test('run smoke: runs an argv through the same transport with only the allow-listed environment', async () => {
    const host = await provider('measured.fixture');
    const changes: number[] = [];
    host.onRunChange(() => changes.push(changes.length));
    const handle = await host.run(
      {
        command: ['sh', '-c', `printf '%s|%s|%s' "$LANG" "\${SSH_AUTH_SOCK:-none}" "it's"`],
        environment: { LANG: 'C.UTF-8' },
      },
      NOW,
    );
    expect(handle.startedAt).toBe(NOW);
    expect(
      await host.observe({ resourceId: 'slots', measure: 'agent_slots', slots: 4 }, NOW),
    ).toMatchObject({
      usageUnits: 1,
    });
    expect(await handle.exited).toEqual({ exitCode: 0, stdout: "C.UTF-8|none|it's" });
    expect(changes).toEqual([0, 1]);
    expect(
      await host.observe({ resourceId: 'slots', measure: 'agent_slots', slots: 4 }, NOW),
    ).toMatchObject({
      usageUnits: 0,
    });
  });

  test('refuses a run environment key outside the allow-list before ssh starts', async () => {
    const host = await provider('measured.fixture');
    const before = readFileSync(fixture.invocationsFile, 'utf8');
    expect(
      await rejectionOf(host.run({ command: ['true'], environment: { WBS_CREDENTIAL: 'x' } }, NOW)),
    ).toContain('run environment key WBS_CREDENTIAL is not allow-listed');
    expect(readFileSync(fixture.invocationsFile, 'utf8')).toBe(before);
  });

  test('refuses a host the transport does not pin before any connection', async () => {
    const before = readFileSync(fixture.invocationsFile, 'utf8');
    expect(await rejectionOf(provider('unpinned.fixture'))).toContain(
      'pins no key for unpinned.fixture',
    );
    expect(readFileSync(fixture.invocationsFile, 'utf8')).toBe(before);
  });
});
