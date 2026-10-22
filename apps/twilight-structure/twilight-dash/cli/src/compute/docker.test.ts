import { readFileSync } from 'node:fs';

import { afterAll, describe, expect, test } from 'bun:test';

import { ConfigurationRefusal } from './configuration';
import { dockerAdapter } from './docker';
import type { AgentRunHandle, ComputeProvider, NotImplemented, ResourceBinding } from './provider';
import { createDockerFixture, INFO_30_24, statsRow, SYSTEM_DF_50 } from './testing/docker-fixture';

const NOW = 1_760_000_000_000;

/** Every running container: `a` is instance-a's, `b` and `c` instance-b's, `d` nobody's. */
const STATS_ABCD = `${[
  statsRow('aaaaaaaaaaaa', '1.5GiB', '150.00%'),
  statsRow('bbbbbbbbbbbb', '2GiB', '100.00%'),
  statsRow('cccccccccccc', '1GiB', '50.00%'),
  statsRow('dddddddddddd', '768MiB', '20.00%'),
].join('\n')}\n`;

const fixture = createDockerFixture({
  shared: {
    info: INFO_30_24,
    ps: { 'instance-a': 'aaaaaaaaaaaa\n', 'instance-b': 'bbbbbbbbbbbb\ncccccccccccc\n' },
    stats: STATS_ABCD,
    df: SYSTEM_DF_50,
  },
  refused: {
    refuse:
      'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n',
  },
  forbidden: {
    refuse:
      'permission denied while trying to connect to the docker API at unix:///var/run/docker.sock\n',
  },
  sshrefused: {
    refuse:
      'error during connect: Get "http://docker.example.com/v1.55/info": command [ssh -l puni1 -- h4claw docker system dial-stdio] has exited with exit status 255, make sure the URL is valid, and Docker 18.09 or later is installed on the remote host: stderr=ssh: connect to host h4claw port 22: Connection refused\n',
  },
  rekeyed: {
    refuse:
      'error during connect: command [ssh -- h4claw docker system dial-stdio] has exited with exit status 255: stderr=Host key verification failed.\n',
  },
  denied: {
    refuse:
      'error during connect: command [ssh -- h4claw docker system dial-stdio] has exited with exit status 255: stderr=puni1@h4claw: Permission denied (publickey).\n',
  },
  tcptimeout: {
    refuse:
      'error during connect: Get "http://10.0.0.9:2376/v1.55/info": dial tcp 10.0.0.9:2376: i/o timeout\n',
  },
  unresolved: {
    refuse:
      'error during connect: Get "http://nohost.example:2376/v1.55/info": dial tcp: lookup nohost.example: no such host\n',
  },
  noroute: {
    refuse:
      'error during connect: Get "http://10.0.0.9:2376/v1.55/info": dial tcp 10.0.0.9:2376: connect: no route to host\n',
  },
  chatty: {
    refuse: `Cannot connect to the Docker daemon at unix:///${'x'.repeat(300)}.sock. Is the docker daemon running?\n`,
  },
  broken: { refuse: 'Error response from daemon: something no transport fault names\n' },
  nomemtotal: { info: `${JSON.stringify({ NCPU: 24, ServerVersion: '29.7.2' })}\n` },
  nojson: { info: 'Server Version: 29.7.2\n' },
  badstats: {
    info: INFO_30_24,
    ps: { 'instance-a': 'aaaaaaaaaaaa\n' },
    stats: `${statsRow('aaaaaaaaaaaa', 'lots', '1.00%')}\n`,
  },
  badps: { info: INFO_30_24, ps: { 'instance-a': 'not-an-id\n' }, stats: STATS_ABCD },
  nodf: { df: '' },
  stalled: { stall: '5' },
});

afterAll(() => {
  fixture.close();
});

async function provider(
  context: string,
  options: { instanceId?: string; runImage?: string; commandDeadlineMs?: number } = {},
): Promise<ComputeProvider> {
  return dockerAdapter({
    dockerExecutable: fixture.dockerExecutable,
    environment: { PATH: process.env['PATH'], SSH_AUTH_SOCK: '/run/agent.sock' },
    ...(options.commandDeadlineMs === undefined
      ? {}
      : { commandDeadlineMs: options.commandDeadlineMs }),
  }).open({
    instanceId: options.instanceId ?? 'instance-a',
    kind: 'docker',
    dockerContext: context,
    ...(options.runImage === undefined ? {} : { runImage: options.runImage }),
    bindings: [],
  });
}

async function rejectionOf(attempt: Promise<unknown>): Promise<unknown> {
  try {
    await attempt;
  } catch (cause) {
    return cause;
  }
  throw new Error('resolved instead of rejecting');
}

async function messageOf(attempt: Promise<unknown>): Promise<string> {
  const cause = await rejectionOf(attempt);
  if (cause instanceof Error) return cause.message;
  throw new Error('rejected with a non-Error', { cause });
}

function started(handle: AgentRunHandle | NotImplemented): AgentRunHandle {
  if (handle.kind !== 'started') throw new Error('the docker adapter answered not_implemented');
  return handle;
}

const memory: ResourceBinding = { resourceId: 'ram', measure: 'memory_gib' };
const cores: ResourceBinding = { resourceId: 'cpu', measure: 'cpu_cores' };
const disk: ResourceBinding = { resourceId: 'disk', measure: 'disk_gib', ceilingGib: 200 };

describe('the docker adapter against the fixture CLI', () => {
  test('measures memory from docker info and the labelled containers, naming the context', async () => {
    expect(await (await provider('shared')).observe(memory, NOW)).toEqual({
      kind: 'measured',
      capacityUnits: 30,
      usageUnits: 1,
      observedAt: NOW,
      evidence:
        'docker context shared: 1 labelled containers; MemTotal 33227800576 B; in use 1610612736 B',
    });
    const invocations = readFileSync(fixture.invocationsFile, 'utf8').trim().split('\n').slice(-3);
    expect(invocations).toEqual([
      '--context shared info --format {{json .}}',
      '--context shared ps --filter label=puni.compute-provider=instance-a --format {{.ID}}',
      '--context shared stats --no-stream --format {{json .}}',
    ]);
  });

  test('sums only the containers labelled with this instance', async () => {
    // Two instances share one daemon; each must report its own containers, not the daemon's four.
    const a = await provider('shared', { instanceId: 'instance-a' });
    const b = await provider('shared', { instanceId: 'instance-b' });
    expect(await a.observe(memory, NOW)).toMatchObject({ capacityUnits: 30, usageUnits: 1 });
    expect(await a.observe(cores, NOW)).toMatchObject({ capacityUnits: 24, usageUnits: 1 });
    expect(await b.observe(memory, NOW)).toMatchObject({ capacityUnits: 30, usageUnits: 3 });
    expect(await b.observe(cores, NOW)).toMatchObject({ capacityUnits: 24, usageUnits: 1 });
    // An instance with no labelled container uses nothing.
    const idle = await provider('shared', { instanceId: 'instance-idle' });
    expect(await idle.observe(memory, NOW)).toMatchObject({ usageUnits: 0 });
    expect(await idle.observe(cores, NOW)).toMatchObject({ usageUnits: 0 });
  });

  test('measures disk as docker system df against the binding ceiling', async () => {
    expect(await (await provider('shared')).observe(disk, NOW)).toEqual({
      kind: 'measured',
      capacityUnits: 200,
      usageUnits: 50,
      observedAt: NOW,
      evidence:
        'docker context shared: Images 14.83GB, Containers 2.924GB, Local Volumes 20.42GB, Build Cache 15.62GB; ceiling 200 GiB',
    });
  });

  test('answers unreachable when the daemon refuses the socket, without throwing', async () => {
    expect(await (await provider('refused')).observe(memory, NOW)).toEqual({
      kind: 'unreachable',
      reason:
        'docker daemon_unreachable: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
      observedAt: NOW,
    });
    expect(await (await provider('refused')).observe(disk, NOW)).toMatchObject({
      kind: 'unreachable',
    });
  });

  test('answers unreachable for every typed docker transport fault', async () => {
    for (const [context, cause] of [
      ['forbidden', 'socket_permission_denied'],
      ['sshrefused', 'connection_refused'],
      ['rekeyed', 'host_key_mismatch'],
      ['denied', 'authentication_failed'],
      ['tcptimeout', 'timeout'],
      ['unresolved', 'name_unresolved'],
      ['noroute', 'no_route'],
    ] as const) {
      const measurement = await (await provider(context)).observe(memory, NOW);
      expect(measurement, context).toMatchObject({ kind: 'unreachable', observedAt: NOW });
      expect(measurement.kind === 'unreachable' ? measurement.reason : '', context).toStartWith(
        `docker ${cause}: `,
      );
    }
  });

  test('bounds an unreachable reason to 200 characters and answers a stalled CLI as a timeout', async () => {
    const chatty = await (await provider('chatty')).observe(memory, NOW);
    expect(chatty.kind === 'unreachable' ? chatty.reason : '').toHaveLength(200);
    const started = performance.now();
    const stalled = await (
      await provider('stalled', { commandDeadlineMs: 200 })
    ).observe(memory, NOW);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(stalled).toEqual({
      kind: 'unreachable',
      reason: 'docker timeout: no answer from context stalled within the command deadline',
      observedAt: NOW,
    });
  });

  test('throws for docker info without MemTotal and for an answer that is not JSON', async () => {
    expect(await messageOf((await provider('nomemtotal')).observe(memory, NOW))).toBe(
      'docker info on context nomemtotal answered no MemTotal',
    );
    expect(await messageOf((await provider('nojson')).observe(cores, NOW))).toBe(
      'docker info on context nojson answered a line that is not JSON',
    );
  });

  test('throws for every malformed answer from a reachable daemon', async () => {
    for (const [context, binding, message] of [
      ['badstats', memory, 'answered a size it cannot read: lots'],
      ['badps', memory, 'answered a line that is not a container id'],
      ['nodf', { ...disk }, 'docker system df on context nodf answered no row'],
    ] as const) {
      expect(await messageOf((await provider(context)).observe(binding, NOW)), context).toContain(
        message,
      );
    }
  });

  test('throws for a docker failure that names no transport fault, and for an unknown context', async () => {
    expect(await messageOf((await provider('broken')).observe(memory, NOW))).toBe(
      'docker info --format {{json .}} on context broken exited 1 without a transport fault: Error response from daemon: something no transport fault names',
    );
    expect(await messageOf((await provider('absent')).observe(memory, NOW))).toContain(
      'context "absent": context not found',
    );
  });

  test('run smoke: docker run --rm with the instance label and only the allow-listed environment', async () => {
    const host = await provider('shared', { runImage: 'alpine:3.20' });
    expect(host.capabilities.runs).toBe(true);
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
    expect(await handle.exited).toEqual({ exitCode: 0, stdout: "C.UTF-8|none|it's" });
    expect(changes).toEqual([0, 1]);
    expect(fixture.readLabels().at(-1)).toBe('puni.compute-provider=instance-a');
    expect(fixture.readImages().at(-1)).toBe('alpine:3.20');
  });

  test('refuses a run before docker starts: a key outside the allow-list, or no runImage', async () => {
    const before = readFileSync(fixture.invocationsFile, 'utf8');
    const host = await provider('shared', { runImage: 'alpine:3.20' });
    expect(
      await messageOf(host.run({ command: ['true'], environment: { WBS_CREDENTIAL: 'x' } }, NOW)),
    ).toBe('run environment key WBS_CREDENTIAL is not allow-listed');
    const imageless = await provider('shared');
    expect(imageless.capabilities.runs).toBe(false);
    expect(await messageOf(imageless.run({ command: ['true'], environment: {} }, NOW))).toBe(
      'docker instance instance-a names no runImage',
    );
    expect(readFileSync(fixture.invocationsFile, 'utf8')).toBe(before);
  });

  test('opening refuses an instance without dockerContext, or with no docker on PATH', async () => {
    const refusal = await rejectionOf(
      dockerAdapter({ dockerExecutable: fixture.dockerExecutable, environment: {} }).open({
        instanceId: 'instance-a',
        kind: 'docker',
        bindings: [],
      }),
    );
    expect(refusal).toBeInstanceOf(ConfigurationRefusal);
    expect(refusal).toMatchObject({ reason: 'config_malformed' });
    expect(
      await messageOf(
        dockerAdapter({ dockerExecutable: null, environment: {} }).open({
          instanceId: 'instance-a',
          kind: 'docker',
          dockerContext: 'shared',
          bindings: [],
        }),
      ),
    ).toBe('report-capacity needs docker on PATH for instance instance-a');
  });
});
