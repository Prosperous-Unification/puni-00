import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { openSshApiForward } from './api-forward';
import type { SshTransport } from './ssh-transport';

/** The message a promise rejected with; a resolution fails the calling test. */
async function rejection(attempt: Promise<unknown>): Promise<string> {
  try {
    await attempt;
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  throw new Error('expected a rejection');
}

const transport: SshTransport = {
  user: 'puni-fleet',
  knownHostsFile: '/ops/known_hosts',
  agentSocket: '/run/agent.sock',
};

// The fake `docker` plays the controller: `run` either fails like ssh on a changed host key,
// stays silent, or listens on the forward's local port; `rm` records the teardown.
const fakeDocker = `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const argv = process.argv.slice(2);
appendFileSync(process.env.PUNI_DOCKER_LOG, argv.join(' ') + '\\n');
const fault = process.env.PUNI_FORWARD_FAULT;
if (argv[0] === 'rm') {
  if (fault === 'rmfail') { process.stderr.write('permission denied\\n'); process.exit(1); }
  process.exit(0);
}
if (fault === 'hostkey') { process.stderr.write('Host key verification failed.\\n'); process.exit(255); }
if (fault !== 'silent') {
  const forward = argv[argv.indexOf('-L') + 1].split(':');
  Bun.listen({ hostname: forward[0], port: Number(forward[1]), socket: { data: () => undefined } });
}
setInterval(() => undefined, 1000);
`;

let directory: string;
let dockerLog: string;
const savedPath = process.env['PATH'];

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fleet-api-forward-'));
  dockerLog = join(directory, 'docker.log');
  await writeFile(join(directory, 'docker'), fakeDocker);
  await chmod(join(directory, 'docker'), 0o700);
  process.env['PATH'] = `${directory}:${savedPath ?? ''}`;
  process.env['PUNI_DOCKER_LOG'] = dockerLog;
});

afterAll(() => {
  process.env['PATH'] = savedPath;
  delete process.env['PUNI_FORWARD_FAULT'];
});

function request(timeoutMs = 5_000) {
  return {
    image: 'ghcr.io/prosperous-unification/fleet-controller:0.1.0',
    digest: 'sha256:abc',
    transport,
    host: '10.1.0.4',
    remotePort: 6443,
    timeoutMs,
    lifetimeMs: 90_000,
  };
}

async function accepts(port: number): Promise<boolean> {
  try {
    const socket = await Bun.connect({
      hostname: '127.0.0.1',
      port,
      socket: { data: () => undefined },
    });
    socket.end();
    return true;
  } catch {
    return false;
  }
}

describe('openSshApiForward', () => {
  it('opens a pinned loopback forward in the controller and tears it down', async () => {
    delete process.env['PUNI_FORWARD_FAULT'];
    const forward = await openSshApiForward(request());
    expect(await accepts(forward.localPort)).toBe(true);
    await forward.close();
    expect(await accepts(forward.localPort)).toBe(false);
    const [run, remove] = (await readFile(dockerLog, 'utf8')).trimEnd().split('\n').slice(-2);
    const name = /--name (puni-fleet-forward-[0-9a-f-]+)/.exec(run)?.[1];
    expect(name).toBeDefined();
    expect(run).toContain('--network host');
    expect(run).toContain('--volume /ops/known_hosts:/ops/known_hosts:ro');
    expect(run).toContain(
      'ghcr.io/prosperous-unification/fleet-controller:0.1.0@sha256:abc timeout --signal=TERM --kill-after=0.1s 90s ssh -N',
    );
    expect(run).toContain('-o StrictHostKeyChecking=yes');
    expect(run).toContain(`-L 127.0.0.1:${String(forward.localPort)}:127.0.0.1:6443 10.1.0.4`);
    expect(remove).toBe(`rm --force ${String(name)}`);
  });

  it('refuses a forward that ssh ended, naming the changed host key', async () => {
    process.env['PUNI_FORWARD_FAULT'] = 'hostkey';
    expect(await rejection(openSshApiForward(request()))).toMatch(
      /SSH API forward to 10\.1\.0\.4 exited 255: Host key verification failed/,
    );
  });

  it('refuses and tears down a forward that never listens', async () => {
    process.env['PUNI_FORWARD_FAULT'] = 'silent';
    const started = Date.now();
    expect(await rejection(openSshApiForward(request(300)))).toMatch(
      /did not open 127\.0\.0\.1:\d+ within 300ms/,
    );
    expect(Date.now() - started).toBeLessThan(3_000);
    expect((await readFile(dockerLog, 'utf8')).trimEnd().split('\n').at(-1)).toMatch(
      /^rm --force puni-fleet-forward-/,
    );
  });

  it('refuses when the forward container cannot be removed', async () => {
    delete process.env['PUNI_FORWARD_FAULT'];
    const forward = await openSshApiForward(request());
    process.env['PUNI_FORWARD_FAULT'] = 'rmfail';
    expect(await rejection(forward.close())).toMatch(
      /Cannot tear down SSH API forward.*permission denied/,
    );
  });
});
