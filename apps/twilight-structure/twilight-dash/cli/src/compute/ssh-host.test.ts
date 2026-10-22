import { readFileSync } from 'node:fs';

import { afterAll, describe, expect, test } from 'bun:test';

import type { AgentRunHandle, ComputeProvider, NotImplemented, ResourceBinding } from './provider';
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
  'slow.fixture': { dialDelay: '0.5' },
  'timeout.fixture': {
    refuse: 'ssh: connect to host timeout.fixture port 22: Connection timed out\r\n',
  },
  'denied.fixture': { refuse: 'puni1@denied.fixture: Permission denied (publickey).\r\n' },
  'unresolved.fixture': {
    refuse: 'ssh: Could not resolve hostname unresolved.fixture: Name or service not known\r\n',
  },
  'noroute.fixture': {
    refuse: 'ssh: connect to host noroute.fixture port 22: No route to host\r\n',
  },
  'badnproc.fixture': { cpu: 'many\n3.71 2.10 1.05 2/812 4242\n' },
  'noloadavg.fixture': { cpu: '8\n' },
  'headeronly.fixture': {
    df: 'Filesystem     1024-blocks      Used Available Capacity Mounted on\n',
  },
  'overcommitted.fixture': { meminfo: 'MemTotal: 1048576 kB\nMemAvailable: 2097152 kB\n' },
  'oversized.fixture': { meminfo: `${MEMINFO_15_7}${'x'.repeat(1024 * 1024)}\n` },
  [`${'l'.repeat(190)}.fixture`]: { dialDelay: '5' },
  'stalled.fixture': { execDialDelay: '5' },
  'chatty.fixture': {
    refuse: `ssh: connect to host chatty.fixture port 22: Connection refused ${'x'.repeat(300)}\r\n`,
  },
});

afterAll(() => {
  fixture.close();
});

async function provider(host: string, commandDeadlineMs?: number): Promise<ComputeProvider> {
  return sshHostAdapter({
    sshExecutable: fixture.sshExecutable,
    ...(commandDeadlineMs === undefined ? {} : { commandDeadlineMs }),
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

function started(handle: AgentRunHandle | NotImplemented): AgentRunHandle {
  if (handle.kind !== 'started') throw new Error('the ssh_host adapter answered not_implemented');
  return handle;
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

  test('answers unreachable for every typed transport fault', async () => {
    for (const [host, cause] of [
      ['timeout.fixture', 'timeout'],
      ['denied.fixture', 'authentication_failed'],
      ['unresolved.fixture', 'name_unresolved'],
      ['noroute.fixture', 'no_route'],
    ] as const) {
      const measurement = await (await provider(host)).observe(memory, NOW);
      expect(measurement, host).toMatchObject({ kind: 'unreachable', observedAt: NOW });
      expect(measurement.kind === 'unreachable' ? measurement.reason : '', host).toStartWith(
        `ssh ${cause}: `,
      );
    }
  });

  test('bounds an unreachable reason to the 200 characters WBS accepts', async () => {
    const slots: ResourceBinding = { resourceId: 'slots', measure: 'agent_slots', slots: 4 };
    // A 190-character host whose dial outlasts a 200 ms command deadline: the timeout reason.
    const longHost = await provider(`${'l'.repeat(190)}.fixture`, 200);
    const started = performance.now();
    const timedOut = await longHost.observe(slots, NOW);
    // Well under the 5 s dial: the answer does not wait for the descendant holding the pipes.
    expect(performance.now() - started).toBeLessThan(2000);
    // A 255 diagnostic longer than 200 characters.
    const refused = await (await provider('chatty.fixture')).observe(memory, NOW);
    for (const [measurement, cause] of [
      [timedOut, 'ssh timeout: '],
      [refused, 'ssh connection_refused: '],
    ] as const) {
      expect(measurement.kind).toBe('unreachable');
      const reason = measurement.kind === 'unreachable' ? measurement.reason : '';
      expect(reason).toStartWith(cause);
      expect(reason).toHaveLength(200);
    }
  });

  test('answers timeout when a killed ssh has no descendant', async () => {
    const slots: ResourceBinding = { resourceId: 'slots', measure: 'agent_slots', slots: 4 };
    const measurement = await (await provider('stalled.fixture', 200)).observe(slots, NOW);
    expect(measurement).toEqual({
      kind: 'unreachable',
      reason: 'ssh timeout: no answer from stalled.fixture within the command deadline',
      observedAt: NOW,
    });
  });

  test('throws for every malformed answer from a reachable host', async () => {
    const cpu: ResourceBinding = { resourceId: 'cpu', measure: 'cpu_cores' };
    for (const [host, binding, message] of [
      ['badnproc.fixture', cpu, 'answered no core count and load'],
      ['noloadavg.fixture', cpu, 'answered no core count and load'],
      ['headeronly.fixture', disk, 'answered no parseable data line'],
      ['overcommitted.fixture', memory, 'states MemAvailable above MemTotal'],
    ] as const) {
      expect(await rejectionOf((await provider(host)).observe(binding, NOW)), host).toContain(
        message,
      );
    }
  });

  test('refuses an answer over 1 MiB', async () => {
    expect(await rejectionOf((await provider('oversized.fixture')).observe(memory, NOW))).toContain(
      'answered more than 1 MiB',
    );
  });

  test('counts the runs in use at the stamp, not after the dial', async () => {
    // The dial takes 0.5 s; the run ends within it.
    const host = await provider('slow.fixture');
    const handle = started(await host.run({ command: ['true'], environment: {} }, NOW));
    const observing = host.observe({ resourceId: 'slots', measure: 'agent_slots', slots: 4 }, NOW);
    expect(await handle.exited).toEqual({ exitCode: 0, stdout: '' });
    expect(await observing).toMatchObject({ kind: 'measured', capacityUnits: 4, usageUnits: 1 });
    expect(
      await host.observe({ resourceId: 'slots', measure: 'agent_slots', slots: 4 }, NOW),
    ).toMatchObject({ usageUnits: 0 });
  });

  test('run smoke: runs an argv through the same transport with only the allow-listed environment', async () => {
    const host = await provider('measured.fixture');
    const changes: number[] = [];
    host.onRunChange(() => changes.push(changes.length));
    const handle = started(
      await host.run(
        {
          command: ['sh', '-c', `printf '%s|%s|%s' "$LANG" "\${SSH_AUTH_SOCK:-none}" "it's"`],
          environment: { LANG: 'C.UTF-8' },
        },
        NOW,
      ),
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
