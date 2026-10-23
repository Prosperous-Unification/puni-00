import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { type RunDocker, runDockerBefore, runDockerCli } from '../src/lib/docker-deadline';
import type { EnvLayout } from '../src/lib/env';
import { fenceGateways, inspectGatewayFence } from '../src/lib/gateway-exclusion';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface Probe {
  role: 'parent' | 'child';
  pid: number;
  ppid: number;
  start: string;
  nonce: string;
}

/** A live challenge keeps the socket open so fencing must close this exact session. */
export async function challenge(url: string, nonce: string, role: Probe['role']) {
  const socket = new WebSocket(url);
  let closed = false;
  const closure = new Promise<void>((resolveClosed) => {
    socket.addEventListener('close', () => {
      closed = true;
      resolveClosed();
    });
  });
  try {
    const identity = await new Promise<Probe>((resolveIdentity, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`probe ${role} challenge timed out`));
      }, 3000);
      const fail = () => {
        clearTimeout(timer);
        reject(new Error(`probe ${role} challenge failed`));
      };
      socket.addEventListener('error', fail, { once: true });
      socket.addEventListener('close', fail, { once: true });
      socket.addEventListener(
        'open',
        () => {
          socket.send(nonce);
        },
        { once: true },
      );
      socket.addEventListener(
        'message',
        (event) => {
          clearTimeout(timer);
          try {
            const identity: unknown = JSON.parse(String(event.data));
            assert(identity !== null && typeof identity === 'object', 'invalid probe identity');
            const pid: unknown = Reflect.get(identity, 'pid');
            const ppid: unknown = Reflect.get(identity, 'ppid');
            const start: unknown = Reflect.get(identity, 'start');
            assert(
              Reflect.get(identity, 'role') === role &&
                Reflect.get(identity, 'nonce') === nonce &&
                typeof pid === 'number' &&
                Number.isSafeInteger(pid) &&
                pid > 1 &&
                typeof ppid === 'number' &&
                Number.isSafeInteger(ppid) &&
                ppid > 0 &&
                typeof start === 'string' &&
                /^\d+$/.test(start),
              'probe challenge identity mismatch',
            );
            resolveIdentity({ role, pid, ppid, start, nonce });
          } catch (cause) {
            reject(cause instanceof Error ? cause : new Error('probe response failed', { cause }));
          }
        },
        { once: true },
      );
    });
    return {
      identity,
      socket,
      async assertClosed() {
        if (closed) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            closure,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(new Error('fenced session stayed open'));
              }, 3000);
            }),
          ]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      },
    };
  } catch (cause) {
    socket.close();
    throw cause;
  }
}

async function refuses(operation: Promise<unknown>, message: string): Promise<void> {
  try {
    await operation;
  } catch (cause) {
    assert(
      cause instanceof Error && cause.message.includes(message),
      `wrong refusal: ${String(cause)}`,
    );
    return;
  }
  throw new Error(`expected refusal: ${message}`);
}

/** Explicit image/SHA inputs and an external report are required; no pull/build or prod paths. */
async function runAcceptance() {
  const image = process.env['GATEWAY_EXCLUSION_IMAGE'];
  const sha = process.env['GATEWAY_EXCLUSION_SHA'];
  const reportPath = process.env['GATEWAY_EXCLUSION_REPORT'];
  assert(
    typeof image === 'string' && /\/wbs-gw-01@sha256:[a-f0-9]{64}$/.test(image),
    'GATEWAY_EXCLUSION_IMAGE must pin an installed wbs-gw-01 digest',
  );
  assert(
    typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha),
    'GATEWAY_EXCLUSION_SHA must be the exact tested source SHA',
  );
  assert(
    typeof reportPath === 'string' && reportPath.startsWith('/'),
    'GATEWAY_EXCLUSION_REPORT must be an absolute external report path',
  );
  const reportFile = reportPath;
  const imageRef = image;
  const source = Bun.spawn(['git', 'rev-parse', 'HEAD'], { stdout: 'pipe', stderr: 'inherit' });
  const actualSha = (await new Response(source.stdout).text()).trim();
  assert(
    (await source.exited) === 0 && actualSha === sha,
    'source HEAD does not match GATEWAY_EXCLUSION_SHA',
  );
  const project = `gateway-proof-${randomUUID()}`;
  const root = await mkdtemp(join(tmpdir(), `${project}-`));
  assert(!resolve(reportPath).startsWith(`${root}/`), 'report must survive scratch cleanup');
  const network = `${project}-net`;
  const layout: EnvLayout = {
    env: 'prod',
    root,
    stateDir: join(root, 'state'),
    network,
    containerPrefix: `${project}-`,
    sharedEnvPath: join(root, 'unused.env'),
    oidcEnvPath: null,
    siteCaddyPath: join(root, 'unused.caddy'),
    siteAddress: '127.0.0.1',
  };
  const docker: RunDocker = (args) =>
    runDockerBefore(args, runDockerCli, performance.now() + 20000);
  const ids: string[] = [];
  const sessions: Awaited<ReturnType<typeof challenge>>[] = [];
  const observations: unknown[] = [];
  const processes: { pid: string; start: string }[] = [];
  let networkId: string | undefined;
  let failure: unknown;
  const cleanupFailures: string[] = [];
  async function record(label: string, proof: unknown) {
    observations.push({ label, proof });
    await writeFile(
      reportFile,
      `${JSON.stringify({ project, root, network, image, sha, observations, cleanupFailures }, null, 2)}\n`,
      { mode: 0o600 },
    );
  }
  async function create(name: string, init: boolean, isProbe = true, networkName = network) {
    const nonce = randomUUID();
    const id = (
      await docker([
        'create',
        '--pull=never',
        '--name',
        name,
        '--label',
        `com.docker.compose.project=${project}`,
        '--label',
        `com.docker.compose.service=${name}`,
        '--network',
        networkName,
        '--restart=always',
        '--user',
        '65534:65534',
        '--cap-drop=ALL',
        '--security-opt=no-new-privileges',
        '--read-only',
        ...(init ? ['--init'] : []),
        ...(isProbe
          ? [
              '--publish',
              '127.0.0.1::3200',
              '--publish',
              '127.0.0.1::3201',
              '--mount',
              `type=bind,src=${join(root, 'gateway-probe.ts')},dst=/probe.ts,readonly`,
              '--env',
              `GATEWAY_PROBE_NONCE=${nonce}`,
            ]
          : []),
        '--entrypoint',
        'bun',
        imageRef,
        ...(isProbe ? ['/probe.ts', 'parent'] : ['-e', 'setInterval(() => {}, 1000)']),
      ])
    ).trim();
    assert(/^[a-f0-9]{64}$/.test(id), 'create did not return full identity');
    ids.push(id);
    await docker(['start', id]);
    return { id, nonce };
  }
  async function connect(id: string, nonce: string, role: Probe['role']) {
    const port = (
      await docker([
        'inspect',
        '--format',
        `{{(index (index .NetworkSettings.Ports "${role === 'parent' ? '3200' : '3201'}/tcp") 0).HostPort}}`,
        id,
      ])
    ).trim();
    assert(/^\d+$/.test(port), 'missing loopback probe port');
    const url = `ws://127.0.0.1:${port}`;
    let lastFailure: unknown;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const session = await challenge(url, nonce, role);
        sessions.push(session);
        return { session, url };
      } catch (cause) {
        lastFailure = cause;
        await Bun.sleep(100);
      }
    }
    throw new Error(`probe ${role} never became ready`, { cause: lastFailure });
  }
  try {
    await mkdir(layout.stateDir);
    await copyFile(
      new URL('./fixtures/gateway-probe.ts', import.meta.url),
      join(root, 'gateway-probe.ts'),
    );
    await docker(['image', 'inspect', image]);
    networkId = (
      await docker([
        'network',
        'create',
        '--driver',
        'bridge',
        '--label',
        `gateway-proof=${project}`,
        network,
      ])
    ).trim();
    assert(/^[a-f0-9]{64}$/.test(networkId), 'network create did not return full identity');
    const bystander = await create(`${project}-bystander`, true, false, 'none');
    const bystanderBefore = await docker([
      'inspect',
      '--format',
      '{{json .State}} {{json .HostConfig.RestartPolicy}}',
      bystander.id,
    ]);
    const blueName = `${layout.containerPrefix}gw-01-blue`;
    const unprepared = await create(blueName, false, false);
    await refuses(fenceGateways(layout, sha, runDockerCli), 'requires init');
    assert(
      (await readdir(layout.stateDir)).every((name) => name === 'deploy.lock'),
      'no-init refusal published evidence',
    );
    await record('no-init-prepublication-refusal', {
      id: unprepared.id,
      files: await readdir(layout.stateDir),
    });
    await docker(['rm', '--force', unprepared.id]);
    ids.splice(ids.indexOf(unprepared.id), 1);
    const blue = await create(blueName, true);
    const green = await create(`${layout.containerPrefix}gw-01-green`, true);
    const probes: { url: string; nonce: string; role: Probe['role'] }[] = [];
    for (const gateway of [blue, green]) {
      const parent = await connect(gateway.id, gateway.nonce, 'parent');
      const child = await connect(gateway.id, gateway.nonce, 'child');
      assert(
        child.session.identity.ppid === parent.session.identity.pid,
        'child is not owned by challenged parent',
      );
      assert(
        child.session.identity.pid !== parent.session.identity.pid,
        'parent and child share PID',
      );
      await docker(['exec', gateway.id, 'kill', '-TERM', String(child.session.identity.pid)]);
      const stubborn = await challenge(child.url, gateway.nonce, 'child');
      sessions.push(stubborn);
      assert(
        JSON.stringify(stubborn.identity) === JSON.stringify(child.session.identity),
        'child did not survive SIGTERM',
      );
      probes.push(
        { url: parent.url, nonce: gateway.nonce, role: 'parent' },
        { url: child.url, nonce: gateway.nonce, role: 'child' },
      );
      const topology = await docker(['top', gateway.id, '-eo', 'pid,ppid,args']);
      for (const row of topology.trim().split('\n').slice(1)) {
        const pid = row.trim().split(/\s+/)[0];
        assert(/^\d+$/.test(pid), 'invalid host process ID');
        const start = (await readFile(`/proc/${pid}/stat`, 'utf8')).split(' ').at(21);
        assert(start !== undefined, 'missing host process start');
        processes.push({ pid, start });
      }
      await record('live-processes-and-stubborn-child', {
        topology,
        id: gateway.id,
        parent: parent.session.identity,
        child: child.session.identity,
      });
    }
    const completion = await fenceGateways(layout, sha, runDockerCli);
    assert(
      completion.cohort.blue?.id === blue.id && completion.cohort.green?.id === green.id,
      'receipt changed exact cohort IDs',
    );
    const intent = await readFile(join(layout.stateDir, 'dependency-gateway-intent.json'), 'utf8');
    assert(
      completion.intentSha256 === createHash('sha256').update(intent).digest('hex'),
      'receipt lost intent byte hash',
    );
    for (const gateway of [completion.cohort.blue, completion.cohort.green]) {
      assert(
        !gateway.state.running && gateway.state.pid === 0 && gateway.restartPolicy.name === 'no',
        'receipt did not prove stopped PID0/restart=no',
      );
    }
    for (const processIdentity of processes) {
      try {
        const observed = (await readFile(`/proc/${processIdentity.pid}/stat`, 'utf8'))
          .split(' ')
          .at(21);
        assert(observed !== processIdentity.start, 'fenced process identity still exists');
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
      }
    }
    await record('host-process-identities-gone', processes);
    await Promise.all(sessions.map((session) => session.assertClosed()));
    for (const probe of probes)
      await refuses(challenge(probe.url, probe.nonce, probe.role), 'challenge');
    assert(
      JSON.stringify(await inspectGatewayFence(layout, runDockerCli)) ===
        JSON.stringify(completion),
      'fresh inspection changed completion',
    );
    assert(
      (await docker([
        'inspect',
        '--format',
        '{{json .State}} {{json .HostConfig.RestartPolicy}}',
        bystander.id,
      ])) === bystanderBefore,
      'fence changed unrelated bystander',
    );
    await record('physical-exclusion', {
      completion,
      intent,
      closedSessions: sessions.length,
      refusedFreshChallenges: probes.length,
      bystander: bystander.id,
    });
    await docker(['start', blue.id]);
    await refuses(inspectGatewayFence(layout, runDockerCli), 'excluded');
    await record('external-restart-refused', { id: blue.id });
    const emptyRoot = join(root, 'empty');
    await mkdir(emptyRoot);
    const emptyLayout = {
      ...layout,
      root: emptyRoot,
      stateDir: emptyRoot,
      containerPrefix: `${project}-empty-`,
      network: `${project}-empty-net`,
    };
    const empty = await fenceGateways(emptyLayout, sha, runDockerCli);
    assert(empty.cohort.blue === null && empty.cohort.green === null, 'empty cohort was not empty');
    await inspectGatewayFence(emptyLayout, runDockerCli);
    await record('empty-cohort', empty);
  } catch (cause) {
    failure = cause;
    await record('failure', String(cause));
    for (const id of ids) {
      try {
        await record('failure-container', {
          id,
          inspect: await docker(['inspect', id]),
          logs: await docker(['logs', id]),
        });
      } catch (diagnosticCause) {
        await record('diagnostic-failure', String(diagnosticCause));
      }
    }
  } finally {
    for (const session of sessions) session.socket.close();
    for (const id of ids) {
      try {
        await docker(['rm', '--force', id]);
      } catch (cause) {
        cleanupFailures.push(`container ${id}: ${String(cause)}`);
      }
    }
    if (networkId !== undefined) {
      try {
        await docker(['network', 'rm', networkId]);
      } catch (cause) {
        cleanupFailures.push(`network ${networkId}: ${String(cause)}`);
      }
    }
    await record('cleanup', { ids, networkId, complete: cleanupFailures.length === 0 });
    if (failure === undefined && cleanupFailures.length === 0) await rm(root, { recursive: true });
  }
  if (failure !== undefined || cleanupFailures.length > 0)
    throw new AggregateError(
      [...(failure === undefined ? [] : [failure]), ...cleanupFailures],
      `gateway acceptance failed; evidence: ${reportPath}; scratch: ${root}`,
    );
  console.log(`PASS gateway physical exclusion; evidence: ${reportPath}`);
}

if (import.meta.main) await runAcceptance();
