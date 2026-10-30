import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';

import { auditUnmanagedMounts } from '../src/lib/backend-cohort';
import { fenceBackends, inspectBackendFence } from '../src/lib/backend-exclusion';
import { type RunDocker, runDockerBefore, runDockerCli } from '../src/lib/docker-deadline';
import { envLayout } from '../src/lib/env';
import { fenceGateways } from '../src/lib/gateway-exclusion';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function git(args: string[]): Promise<string> {
  const child = Bun.spawn(['git', ...args], { stdout: 'pipe', stderr: 'inherit' });
  const output = await new Response(child.stdout).text();
  assert((await child.exited) === 0, 'source provenance command failed');
  return output.trim();
}

/** Installed application images only; disposable DB/loopback ports, no build/pull/deploy or semantic activation. */
async function runAcceptance(): Promise<void> {
  const backendImage = process.env['BACKEND_EXCLUSION_IMAGE'];
  const gatewayImage = process.env['BACKEND_EXCLUSION_GATEWAY_IMAGE'];
  const sha = process.env['BACKEND_EXCLUSION_SHA'];
  const report = process.env['BACKEND_EXCLUSION_REPORT'];
  assert(
    typeof backendImage === 'string' && /(?:^|\/)wbs-be-01@sha256:[a-f0-9]{64}$/.test(backendImage),
    'pin installed backend application digest',
  );
  assert(
    typeof gatewayImage === 'string' && /(?:^|\/)wbs-gw-01@sha256:[a-f0-9]{64}$/.test(gatewayImage),
    'pin installed gateway runtime digest',
  );
  assert(
    typeof sha === 'string' &&
      /^[a-f0-9]{40}$/.test(sha) &&
      (await git(['rev-parse', 'HEAD'])) === sha,
    'source SHA must match HEAD',
  );
  assert(
    typeof report === 'string' && report.startsWith('/'),
    'absolute external report path required',
  );
  const applicationImage = backendImage;
  const runtimeImage = gatewayImage;
  const reportPath = report;
  const sourceChanges = await git([
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    'tools/tool-remote-scripts',
    'tools/test',
    'package.json',
    'bun.lock',
    'tsconfig.base.json',
  ]);
  assert(sourceChanges === '', 'relevant source must be committed and clean');
  const project = `backend-proof-${randomUUID()}`;
  const root = await mkdtemp(join(tmpdir(), `${project}-`));
  assert(!reportPath.startsWith(`${root}/`), 'reportPath must survive owned scratch cleanup');
  const layout = {
    ...envLayout('prod'),
    root,
    stateDir: join(root, 'state'),
    network: `${project}-net`,
    containerPrefix: `${project}-`,
  };
  const docker: RunDocker = (args, signal) =>
    runDockerBefore(
      args,
      (command, ownSignal) =>
        runDockerCli(
          command,
          signal === undefined
            ? ownSignal
            : AbortSignal.any(ownSignal === undefined ? [signal] : [signal, ownSignal]),
        ),
      performance.now() + 20000,
    );
  const volumeName = `${project}-opaque`;
  const identities: string[] = [];
  const names: string[] = [];
  const observations: unknown[] = [];
  const cleanupFailures: string[] = [];
  let failure: unknown;
  async function record(label: string, proof: unknown): Promise<void> {
    observations.push({ label, proof });
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          sha,
          sourceChanges,
          applicationImage,
          runtimeImage,
          project,
          root,
          network: layout.network,
          identities,
          volumeName,
          names,
          observations,
          cleanupFailures,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
  }
  async function create(tier: 'be' | 'gw', color: 'blue' | 'green'): Promise<string> {
    const name = `${layout.containerPrefix}${tier}-01-${color}`;
    names.push(name);
    await record('container-creation-pending', { name });
    const environment = [
      'NODE_ENV=test',
      // Disposable application preparation only; fenceBackends never invokes a migration.
      'MIGRATE_ON_STARTUP=true',
      'AUTH_MODE=local',
      'APP_ORIGIN=http://127.0.0.1',
      'PORT=3100',
      'DB_PATH=/data/wbs.db',
      'LOG_LEVEL=error',
      'GW_URL=http://127.0.0.1:9',
      'INTERNAL_AUTH_SECRET=acceptance-only-disposable-secret-000000',
      'JWT_SIGNING_KEY_CURRENT=acceptance-only-disposable-secret-111111',
      'BROWSER_SESSION_AUTHORITY=disabled',
      'ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS=100',
      'ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS=100',
      'ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE=100',
    ];
    const identity = (
      await docker([
        'create',
        '--pull=never',
        '--name',
        name,
        '--label',
        `backend-proof=${project}`,
        '--label',
        `com.docker.compose.project=${project}`,
        '--label',
        `com.docker.compose.service=${name}`,
        '--network',
        layout.network,
        '--init',
        '--restart=always',
        ...(tier === 'be'
          ? [
              '--publish',
              '127.0.0.1::3100',
              '--mount',
              `type=bind,src=${root}/db,dst=/data`,
              ...environment.flatMap((entry) => ['--env', entry]),
              applicationImage,
            ]
          : ['--entrypoint', 'bun', runtimeImage, '-e', 'setInterval(() => {}, 1000)']),
      ])
    ).trim();
    assert(/^[a-f0-9]{64}$/.test(identity), 'creation must return full ID');
    identities.push(identity);
    await record('owned-container-created', {
      identity,
      name,
      role:
        tier === 'be'
          ? 'actual-installed-application-default-command'
          : 'gateway-runtime-probe-only',
    });
    await docker(['start', identity]);
    return identity;
  }
  async function proveApplication(identity: string, username: string): Promise<void> {
    const address = (await docker(['port', identity, '3100/tcp'])).trim();
    assert(/^127\.0\.0\.1:\d+$/.test(address), 'backend port must bind loopback');
    const deadline = performance.now() + 15000;
    let healthy = false;
    while (performance.now() < deadline) {
      const response = await fetch(`http://${address}/health`, {
        signal: AbortSignal.timeout(500),
      }).catch((cause: unknown) => {
        if (cause instanceof TypeError || cause instanceof DOMException) return null;
        throw cause;
      });
      if (response?.ok) {
        healthy = true;
        await record('actual-backend-health', {
          identity,
          status: response.status,
          body: await response.text(),
        });
        break;
      }
      const running = await docker(['inspect', '--format', '{{.State.Running}}', identity]);
      if (running.trim() !== 'true')
        throw new Error(
          `backend application exited: ${await docker(['logs', '--tail', '30', identity])}`,
        );
      await Bun.sleep(100);
    }
    if (!healthy)
      await record('actual-backend-health-timeout', {
        identity,
        logs: await docker(['logs', '--tail', '50', identity]),
        state: await docker(['inspect', '--format', '{{json .State}}', identity]),
      });
    assert(healthy, 'actual backend application health deadline exceeded');
    const response = await fetch(`http://${address}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1' },
      body: JSON.stringify({ username, password: 'disposable-acceptance-12345' }),
      signal: AbortSignal.timeout(5000),
    });
    assert(
      response.ok,
      `actual backend registration write failed: ${String(response.status)} ${await response.text()}`,
    );
    await record('actual-backend-registration-write', {
      identity,
      username,
      status: response.status,
    });
  }
  try {
    await mkdir(layout.stateDir);
    await mkdir(`${root}/db`);
    const database = new Database(`${root}/db/wbs.db`);
    try {
      database.run('CREATE TABLE fence_acceptance (nonce TEXT NOT NULL)');
      database.query('INSERT INTO fence_acceptance VALUES (?)').run(project);
    } finally {
      database.close();
    }
    await record('owned-fixture-prepared', { volumeName });
    await docker(['image', 'inspect', applicationImage]);
    await docker(['image', 'inspect', runtimeImage]);
    await docker(['network', 'create', '--label', `backend-proof=${project}`, layout.network]);
    const blue = await create('be', 'blue');
    await proveApplication(blue, 'fence-blue');
    const green = await create('be', 'green');
    await proveApplication(green, 'fence-green');
    await docker(['volume', 'create', '--label', `backend-proof=${project}`, volumeName]);
    const coordinatorName = `${layout.containerPrefix}coordinator`;
    names.push(coordinatorName);
    await record('coordinator-creation-pending', { name: coordinatorName, volumeName });
    const coordinator = (
      await docker([
        'create',
        '--pull=never',
        '--name',
        coordinatorName,
        '--label',
        `backend-proof=${project}`,
        '--network=none',
        '--init',
        '--mount',
        `type=volume,src=${volumeName},dst=/opaque`,
        '--entrypoint',
        'bun',
        runtimeImage,
        '-e',
        'setInterval(()=>{},1000)',
      ])
    ).trim();
    assert(/^[a-f0-9]{64}$/.test(coordinator), 'coordinator creation identity malformed');
    identities.push(coordinator);
    await docker(['start', coordinator]);
    await docker([
      'exec',
      coordinator,
      '/bin/busybox',
      'sh',
      '-c',
      'printf %s "$1" > /opaque/sentinel',
      '--',
      project,
    ]);
    const opaque: unknown = JSON.parse(
      await docker(['inspect', '--format', '{{json .}}', coordinator]),
    );
    assert(opaque !== null && typeof opaque === 'object', 'coordinator inspect is malformed');
    const mounts: unknown = Reflect.get(opaque, 'Mounts');
    assert(Array.isArray(mounts), 'coordinator mounts absent');
    const mounted: unknown = mounts.find(
      (entry: unknown) =>
        entry !== null &&
        typeof entry === 'object' &&
        Reflect.get(entry, 'Destination') === '/opaque',
    );
    assert(mounted !== null && typeof mounted === 'object', 'coordinator volume inspection absent');
    const source: unknown = Reflect.get(mounted, 'Source');
    assert(typeof source === 'string', 'coordinator Source absent');
    let hostFailure: string | null = null;
    try {
      await realpath(source);
    } catch (cause) {
      assert(
        cause instanceof Error && 'code' in cause && cause.code === 'EACCES',
        'opaque source must be actual host EACCES',
      );
      hostFailure = cause.code;
    }
    assert(
      hostFailure === 'EACCES',
      'this acceptance requires an actually inaccessible daemon-owned volume',
    );
    const beforeProcesses = await docker(['top', coordinator, '-eo', 'pid,ppid,args']);
    const beforeVolume = await docker([
      'exec',
      coordinator,
      '/bin/busybox',
      'cat',
      '/opaque/sentinel',
    ]);
    const main = await lstat(`${root}/db/wbs.db`, { bigint: true });
    const directory = await lstat(`${root}/db`, { bigint: true });
    await auditUnmanagedMounts(
      [opaque],
      { blue: null, green: null },
      {
        path: '/data/wbs.db',
        host: `${root}/db/wbs.db`,
        fileIdentity: `${String(main.dev)}:${String(main.ino)}`,
        directoryIdentity: `${String(directory.dev)}:${String(directory.ino)}`,
      },
      applicationImage,
      docker,
      performance.now() + 45000,
    );
    const afterProcesses = await docker(['top', coordinator, '-eo', 'pid,ppid,args']);
    const afterVolume = await docker([
      'exec',
      coordinator,
      '/bin/busybox',
      'cat',
      '/opaque/sentinel',
    ]);
    assert(beforeProcesses === afterProcesses, 'namespace scanner left processes behind');
    assert(
      beforeVolume === project && afterVolume === beforeVolume,
      'namespace audit changed coordinator volume',
    );
    await record('actual-opaque-unmanaged-namespace-admitted', {
      coordinator,
      source,
      hostFailure,
      beforeProcesses,
      afterProcesses,
      sentinel: afterVolume,
    });
    await create('gw', 'blue');
    const gateway = await fenceGateways(layout, sha, docker);
    await record('gateway-runtime-exclusion', gateway);
    const completion = await fenceBackends(layout, sha, docker);
    assert(
      completion.cohort.blue?.id === blue && completion.cohort.green?.id === green,
      'backend completion identity mismatch',
    );
    assert(
      JSON.stringify(await inspectBackendFence(layout, docker)) === JSON.stringify(completion),
      'fresh inspection differs',
    );
    await record('actual-backend-joint-exclusion', completion);
    const stored = new Database(`${root}/db/wbs.db`, { readonly: true });
    try {
      const users = stored
        .query('SELECT username FROM user WHERE username IN (?,?) ORDER BY username')
        .all('fence-blue', 'fence-green');
      assert(users.length === 2, 'both actual application writes must survive backend fence');
      const seed = stored.query('SELECT nonce FROM fence_acceptance').get();
      await record('sqlite-persistence-after-fence', { users, seed });
    } finally {
      stored.close();
    }
    await docker(['update', '--restart=always', blue]);
    let refused = false;
    try {
      await inspectBackendFence(layout, docker);
    } catch (cause) {
      refused = true;
      await record('actual-policy-drift-refused', String(cause));
    }
    assert(refused, 'fresh inspection accepted intentionally changed actual backend policy');
    await record(
      'retained-evidence',
      await readFile(`${layout.stateDir}/dependency-backend-intent.json`, 'utf8'),
    );
  } catch (cause) {
    failure = cause;
    await record('acceptance-failure', String(cause));
  }
  for (const name of names) {
    try {
      const owned = (
        await docker([
          'ps',
          '-a',
          '--no-trunc',
          '--filter',
          `label=backend-proof=${project}`,
          '--filter',
          `name=^/${name}$`,
          '--format',
          '{{.ID}}',
        ])
      ).trim();
      if (owned !== '') {
        assert(/^[a-f0-9]{64}$/.test(owned), 'ambiguous cleanup identity');
        await docker(['rm', '--force', owned]);
      }
    } catch (cause) {
      cleanupFailures.push(String(cause));
    }
  }
  try {
    const ownedVolumes = (
      await docker([
        'volume',
        'ls',
        '--filter',
        `label=backend-proof=${project}`,
        '--format',
        '{{.Name}}',
      ])
    ).trim();
    if (ownedVolumes !== '') {
      assert(ownedVolumes === volumeName, 'ambiguous owned volume cleanup');
      await docker(['volume', 'rm', volumeName]);
    }
  } catch (cause) {
    cleanupFailures.push(String(cause));
  }
  try {
    const ownedNetwork = (
      await docker([
        'network',
        'ls',
        '--no-trunc',
        '--filter',
        `label=backend-proof=${project}`,
        '--format',
        '{{.ID}}',
      ])
    ).trim();
    if (ownedNetwork !== '') {
      assert(/^[a-f0-9]{64}$/.test(ownedNetwork), 'ambiguous owned network cleanup identity');
      await docker(['network', 'rm', ownedNetwork]);
    }
  } catch (cause) {
    cleanupFailures.push(String(cause));
  }

  try {
    assert(
      (await docker(['ps', '-aq', '--filter', `label=backend-proof=${project}`])).trim() === '',
      'owned containers survived cleanup',
    );
    assert(
      (
        await docker(['network', 'ls', '-q', '--filter', `label=backend-proof=${project}`])
      ).trim() === '',
      'owned networks survived cleanup',
    );
    assert(
      (
        await docker([
          'volume',
          'ls',
          '--filter',
          `label=backend-proof=${project}`,
          '--format',
          '{{.Name}}',
        ])
      ).trim() === '',
      'owned volumes survived cleanup',
    );
    await rm(root, { recursive: true });
  } catch (cause) {
    cleanupFailures.push(String(cause));
  }
  await record('cleanup', { verified: cleanupFailures.length === 0 });
  assert(cleanupFailures.length === 0, `cleanup failed; review reportPath ${reportPath}`);
  if (failure !== undefined)
    throw failure instanceof Error
      ? failure
      : new Error('backend acceptance failed', { cause: failure });
  console.log(
    `PASS actual backend app + SQLite exclusion; clean source=${sha}; gateway runtime probe only; reportPath=${reportPath}`,
  );
}

await runAcceptance();
