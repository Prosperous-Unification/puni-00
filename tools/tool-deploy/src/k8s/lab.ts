/**
 * Real local k3s rehearsal of the WBS release transaction on a disposable k3d cluster pinned to
 * the locked k3s image. It builds lab images with Docker, pushes them only to a lab registry,
 * bootstraps v1, inserts a row, then proves: admission of the exact solver directory and
 * refusal of alternate host paths and of digests outside F6's `solverImages` list;
 * rollback of an induced health failure; rollback after the coordinator is SIGKILLed mid
 * rollout; a successful additive upgrade; and at most one writer pod throughout.
 *
 * Owns only resources named `puni-f8-*`; `--keep` leaves them for inspection.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  backendTaskJob,
  executeRelease,
  kubectlEffects,
  ReleaseFailedError,
  renderOverlay,
  run,
} from './execute';
import { fileJournal } from './journal';
import { K8S_TIERS, type K8sTier, type ReleaseIdentity, type ReleaseRequest } from './release';

const ROOT = resolve(import.meta.dir, '../../../..');
const CLUSTER = 'puni-f8-lab';
const REGISTRY = 'puni-f8-registry';
const CONTEXT = `k3d-${CLUSTER}`;
const NAMESPACES = { app: 'wbs', backend: 'wbs-solver' };

interface Lock {
  binaries: Record<string, { version: string }>;
  runtimeImages: Record<string, { name: string; digest: string }>;
}
const lock = JSON.parse(readFileSync(join(ROOT, 'infra/versions/toolchain.json'), 'utf8')) as Lock;

const state = resolve(process.env['PUNI_F8_STATE'] ?? join(ROOT, 'tmp/puni-f8-lab'));
const kubectl = process.env['KUBECTL'] ?? 'kubectl';
const k3d = process.env['K3D'] ?? 'k3d';
const keep = process.argv.includes('--keep');

function log(line: string): void {
  console.log(`[lab ${new Date().toISOString().slice(11, 19)}] ${line}`);
}

async function sh(
  cmd: readonly string[],
  stdin: string | null = null,
  ms = 600_000,
): Promise<string> {
  const invocation = await run(cmd, stdin, ms);
  if (invocation.exitCode !== 0) {
    throw new Error(
      `${cmd.join(' ')} exited ${String(invocation.exitCode)}:\n${invocation.stderr.trim()}`,
    );
  }
  return invocation.stdout;
}

const k = (args: readonly string[], stdin: string | null = null): Promise<string> =>
  sh(
    [kubectl, '--kubeconfig', join(state, 'kubeconfig'), '--context', CONTEXT, ...args],
    stdin,
    300_000,
  );

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  log(`assert ok: ${message}`);
}

async function versionOf(cmd: readonly string[]): Promise<string> {
  return sh(cmd, null, 30_000);
}

async function preflight(): Promise<void> {
  const k3dVersion = await versionOf([k3d, 'version']);
  if (!k3dVersion.includes(lock.binaries['k3d'].version))
    throw new Error(`k3d must be ${lock.binaries['k3d'].version}`);
  const kubectlVersion = await versionOf([kubectl, 'version', '--client']);
  if (!kubectlVersion.includes(lock.binaries['kubectl'].version)) {
    throw new Error(`kubectl must be ${lock.binaries['kubectl'].version}`);
  }
  const clusters = await sh([k3d, 'cluster', 'list', '-o', 'json']);
  if ((JSON.parse(clusters) as { name: string }[]).some((c) => c.name === CLUSTER)) {
    throw new Error(`${CLUSTER} already exists; delete it with: ${k3d} cluster delete ${CLUSTER}`);
  }
}

async function up(): Promise<number> {
  const registry = lock.runtimeImages['registry'];
  const node = lock.runtimeImages['k3dNode'];
  await sh([
    k3d,
    'registry',
    'create',
    REGISTRY,
    '--image',
    `${registry.name}@${registry.digest}`,
    '--port',
    '127.0.0.1:0',
  ]);
  const inspected = await sh(['docker', 'port', `k3d-${REGISTRY}`, '5000/tcp']);
  const port = Number(inspected.trim().split(':').at(-1));
  if (!Number.isInteger(port)) throw new Error(`registry port unreadable: ${inspected}`);
  await sh([
    k3d,
    'cluster',
    'create',
    CLUSTER,
    '--image',
    `${node.name}@${node.digest}`,
    '--servers',
    '1',
    '--agents',
    '0',
    '--no-lb',
    '--registry-use',
    `k3d-${REGISTRY}:5000`,
    '--k3s-arg',
    '--disable=traefik@server:0',
    '--k3s-arg',
    '--disable=metrics-server@server:0',
    '--kubeconfig-update-default=false',
    '--kubeconfig-switch-context=false',
    '--wait',
    '--timeout',
    '180s',
  ]);
  writeFileSync(join(state, 'kubeconfig'), await sh([k3d, 'kubeconfig', 'get', CLUSTER]), {
    mode: 0o600,
  });
  return port;
}

async function down(): Promise<void> {
  await run([k3d, 'cluster', 'delete', CLUSTER], null, 300_000);
  await run([k3d, 'registry', 'delete', `k3d-${REGISTRY}`], null, 120_000);
}

async function build(
  tag: string,
  dockerfile: string,
  context: string,
  args: Record<string, string> = {},
): Promise<void> {
  const buildArgs = Object.entries(args).flatMap(([key, value]) => [
    '--build-arg',
    `${key}=${value}`,
  ]);
  await sh(
    ['docker', 'build', '-q', '-f', dockerfile, ...buildArgs, '-t', tag, context],
    null,
    1_800_000,
  );
}

/** Pushes a local image to the lab registry and returns its in-cluster digest reference. */
async function publish(local: string, repository: string, port: number): Promise<string> {
  const pushed = `127.0.0.1:${String(port)}/${repository}:lab`;
  await sh(['docker', 'tag', local, pushed]);
  const output = await sh(['docker', 'push', pushed]);
  const digest = /digest: (sha256:[0-9a-f]{64})/.exec(output)?.[1];
  if (digest === undefined) throw new Error(`push of ${pushed} printed no digest`);
  await sh(['docker', 'rmi', pushed]);
  return `k3d-${REGISTRY}:5000/${repository}@${digest}`;
}

interface LabImages {
  v1: ReleaseIdentity;
  v2: ReleaseIdentity;
  broken: ReleaseIdentity;
  /** v2 plus a label only: a new digest with no schema change, for the concurrency run. */
  v3: ReleaseIdentity;
}

async function images(port: number, sourceSha: string): Promise<LabImages> {
  const local = process.env['PUNI_F8_REUSE_IMAGES'] === '1';
  if (!local) {
    await build('wbs-be-01:f8-v1', 'apps/wbs/be-01/Dockerfile', ROOT);
    await build('wbs-gw-01:f8-v1', 'apps/wbs/gw-01/Dockerfile', ROOT);
    await build('wbs-mcp-01:f8-v1', 'deploy/k8s/wbs/lab/mcp-01.Dockerfile', ROOT);
    await build('wbs-fe-01:f8-v1', 'apps/wbs/fe-01/Dockerfile', ROOT);
  }
  const lab = join(ROOT, 'deploy/k8s/wbs/lab');
  await build('wbs-be-01:f8-v2', join(lab, 'backend-upgrade.Dockerfile'), lab, {
    BASE: 'wbs-be-01:f8-v1',
  });
  await build('wbs-be-01:f8-v2-unhealthy', join(lab, 'backend-unhealthy.Dockerfile'), lab, {
    BASE: 'wbs-be-01:f8-v2',
  });
  await sh(
    ['docker', 'build', '-q', '-t', 'wbs-be-01:f8-v3', '-'],
    'FROM wbs-be-01:f8-v2\nLABEL dev.puni.lab=v3\n',
    600_000,
  );
  const shared = {
    gateway: await publish('wbs-gw-01:f8-v1', 'wbs-gw-01', port),
    frontend: await publish('wbs-fe-01:f8-v1', 'wbs-fe-01', port),
    mcp: await publish('wbs-mcp-01:f8-v1', 'wbs-mcp-01', port),
  };
  const identity = (backend: string): ReleaseIdentity => ({
    sourceSha,
    images: { backend, ...shared },
  });
  return {
    v1: identity(await publish('wbs-be-01:f8-v1', 'wbs-be-01', port)),
    v2: identity(await publish('wbs-be-01:f8-v2', 'wbs-be-01', port)),
    broken: identity(await publish('wbs-be-01:f8-v2-unhealthy', 'wbs-be-01', port)),
    v3: identity(await publish('wbs-be-01:f8-v3', 'wbs-be-01', port)),
  };
}

async function approve(images: readonly string[]): Promise<void> {
  await k([
    '-n',
    'wbs-solver',
    'patch',
    'configmap',
    'puni-trusted-workload',
    '--type=merge',
    '-p',
    JSON.stringify({ data: { solverImages: images.join(',') } }),
  ]);
}

async function platform(): Promise<void> {
  const node = (await k(['get', 'nodes', '-o', 'jsonpath={.items[0].metadata.name}'])).trim();
  await k(['label', 'node', node, 'puni.dev/capability-product=true', '--overwrite']);
  await sh(['docker', 'exec', `k3d-${CLUSTER}-server-0`, 'mkdir', '-p', '/run/puni/solver']);
  await k(['apply', '-k', join(ROOT, 'infra/platform/policy')]);
  await k(['apply', '-k', join(ROOT, 'infra/platform/storage/local')]);
}

/** Server-side dry-run of a solver pod that differs from the approved one in exactly one way. */
async function admits(
  image: string,
  hostPath: string,
): Promise<{ admitted: boolean; message: string }> {
  const pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: 'f8-admission-probe',
      namespace: 'wbs-solver',
      labels: { 'puni.dev/controller': 'wbs-backend' },
    },
    spec: {
      serviceAccountName: 'wbs-backend',
      automountServiceAccountToken: false,
      nodeSelector: { 'puni.dev/capability-product': 'true' },
      securityContext: {
        runAsUser: 10001,
        runAsNonRoot: true,
        seccompProfile: { type: 'RuntimeDefault' },
      },
      containers: [
        {
          name: 'backend',
          image,
          securityContext: {
            allowPrivilegeEscalation: false,
            runAsNonRoot: true,
            seccompProfile: { type: 'RuntimeDefault' },
            capabilities: { drop: ['ALL'] },
          },
          volumeMounts: [{ name: 'solver-runtime', mountPath: '/run/wbs-solver' }],
        },
      ],
      volumes: [{ name: 'solver-runtime', hostPath: { path: hostPath, type: 'Directory' } }],
    },
  };
  const probe = await run(
    [
      kubectl,
      '--kubeconfig',
      join(state, 'kubeconfig'),
      '--context',
      CONTEXT,
      'create',
      '--dry-run=server',
      '-f',
      '-',
    ],
    JSON.stringify(pod),
    60_000,
  );
  return { admitted: probe.exitCode === 0, message: (probe.stdout + probe.stderr).trim() };
}

/** Writer pods that are not finished: running, pending, or terminating. */
async function liveWriters(): Promise<string[]> {
  const pods = JSON.parse(
    await k(['-n', 'wbs-solver', 'get', 'pods', '-l', 'puni.dev/writer=true', '-o', 'json']),
  ) as {
    items: { metadata: { name: string }; status: { phase: string } }[];
  };
  return pods.items
    .filter((p) => p.status.phase !== 'Succeeded' && p.status.phase !== 'Failed')
    .map((p) => p.metadata.name);
}

/** Samples writer pods every 300 ms; `stop()` returns the most seen at once. */
function watchWriters(): {
  stop: () => Promise<{ max: number; worst: string[]; samples: number }>;
} {
  const flag = { running: true };
  let max = 0;
  let worst: string[] = [];
  let samples = 0;
  const loop = (async () => {
    while (flag.running) {
      const writers = await liveWriters().catch(() => null);
      if (writers !== null) {
        samples++;
        if (writers.length > max) {
          max = writers.length;
          worst = writers;
        }
      }
      await Bun.sleep(300);
    }
  })();
  return {
    stop: async () => {
      flag.running = false;
      await loop;
      return { max, worst, samples };
    },
  };
}

async function inBackend(script: string): Promise<string> {
  return k(['-n', 'wbs-solver', 'exec', 'deployment/wbs-backend', '--', 'bun', '-e', script]);
}

async function insertProject(name: string): Promise<void> {
  const out = await inBackend(
    `const r = await fetch('http://127.0.0.1:3100/api/projects', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:8080' }, body: JSON.stringify({ name: ${JSON.stringify(name)} }) }); console.log(r.status); if (!r.ok) { console.log(await r.text()); process.exit(1); }`,
  );
  log(`inserted project ${name}: HTTP ${out.trim()}`);
}

async function projectNames(): Promise<string[]> {
  const out = await inBackend(
    "const r = await fetch('http://127.0.0.1:3100/api/projects'); if (!r.ok) process.exit(1); console.log(JSON.stringify((await r.json()).projects.map((p) => p.name)));",
  );
  return JSON.parse(out) as string[];
}

async function schemaFacts(): Promise<{ columns: string[]; migrations: string[] }> {
  const out = await inBackend(
    "const { Database } = require('bun:sqlite'); const db = new Database('/data/wbs.sqlite', { readonly: true }); console.log(JSON.stringify({ columns: db.query('PRAGMA table_info(work_item)').all().map((c) => c.name), migrations: db.query('SELECT name FROM __drizzle_migrations ORDER BY created_at').all().map((m) => m.name) }));",
  );
  return JSON.parse(out) as { columns: string[]; migrations: string[] };
}

async function runningImages(): Promise<Record<K8sTier, string>> {
  const entries = await Promise.all(
    K8S_TIERS.map(async (tier) => {
      const namespace = tier === 'backend' ? 'wbs-solver' : 'wbs';
      const image = await k([
        '-n',
        namespace,
        'get',
        'deployment',
        `wbs-${tier}`,
        '-o',
        `jsonpath={.spec.template.spec.containers[0].image}`,
      ]);
      return [tier, image.trim()] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<K8sTier, string>;
}

async function writesOpen(): Promise<boolean> {
  const selector = await k([
    '-n',
    'wbs-solver',
    'get',
    'networkpolicy',
    'wbs-backend-writers',
    '-o',
    'jsonpath={.spec.podSelector.matchLabels}',
  ]);
  return selector === JSON.stringify({ 'app.kubernetes.io/name': 'wbs-backend' });
}

async function bootstrap(
  v1: ReleaseIdentity,
  settings: Parameters<typeof kubectlEffects>[0],
): Promise<void> {
  const rendered = await renderOverlay(settings, v1);
  // First install is the F11 cutover: create everything with the backend stopped, seed and
  // migrate the database with the release's own image, then start the single writer.
  await k(['apply', '-f', '-'], rendered);
  await k(['-n', 'wbs-solver', 'scale', 'deployment', 'wbs-backend', '--replicas=0']);
  const seed = backendTaskJob(settings, 'wbs-seed-lab', v1.images.backend, {});
  const seedSpec = seed['spec'] as { template: { spec: { containers: { command: string[] }[] } } };
  seedSpec.template.spec.containers[0].command = [
    'bun',
    '-e',
    "new (require('bun:sqlite').Database)('/data/wbs.sqlite').close()",
  ];
  await k(['create', '-f', '-'], JSON.stringify(seed));
  await k([
    '-n',
    'wbs-solver',
    'wait',
    '--for=condition=complete',
    'job/wbs-seed-lab',
    '--timeout=300s',
  ]);
  const migrate = backendTaskJob(settings, 'wbs-migrate-bootstrap', v1.images.backend, {
    PUNI_TASK: 'migrate',
  });
  await k(['create', '-f', '-'], JSON.stringify(migrate));
  await k([
    '-n',
    'wbs-solver',
    'wait',
    '--for=condition=complete',
    'job/wbs-migrate-bootstrap',
    '--timeout=300s',
  ]);
  await k(['-n', 'wbs-solver', 'scale', 'deployment', 'wbs-backend', '--replicas=1']);
  for (const tier of K8S_TIERS) {
    const namespace = tier === 'backend' ? 'wbs-solver' : 'wbs';
    await k(['-n', namespace, 'rollout', 'status', `deployment/wbs-${tier}`, '--timeout=300s']);
  }
  await kubectlEffects(settings).persistRelease(v1);
}

function requestFor(
  release: ReleaseIdentity,
  current: ReleaseIdentity,
  uid: string,
): ReleaseRequest {
  return {
    environment: 'local',
    cluster: { context: CONTEXT, uid },
    namespaces: NAMESPACES,
    release,
    expectedCurrent: current,
    admission: { package: 'lab-package', activation: 'lab-activation' },
    flux: null,
    recovers: null,
  };
}

async function expectRestored(v1: ReleaseIdentity, rows: readonly string[]): Promise<void> {
  const images = await runningImages();
  assert(JSON.stringify(images) === JSON.stringify(v1.images), 'every tier runs the old digest');
  const schema = await schemaFacts();
  assert(!schema.columns.includes('lab_marker'), 'work_item has no lab_marker column (old schema)');
  assert(
    !schema.migrations.includes('20260918000000_lab_additive'),
    'the lab migration is not recorded as applied',
  );
  const names = await projectNames();
  for (const row of rows) assert(names.includes(row), `row ${row} survived`);
  assert(await writesOpen(), 'the write fence is open again');
  const lease = await run(
    [
      kubectl,
      '--kubeconfig',
      join(state, 'kubeconfig'),
      '--context',
      CONTEXT,
      '-n',
      'wbs-solver',
      'get',
      'lease',
      'wbs-release',
    ],
    null,
    30_000,
  );
  assert(
    lease.exitCode !== 0 && lease.stderr.includes('NotFound'),
    'the release Lease was released',
  );
}

async function main(): Promise<void> {
  mkdirSync(state, { recursive: true, mode: 0o700 });
  await preflight();
  const sourceSha = (await sh(['git', '-C', ROOT, 'rev-parse', 'HEAD'])).trim();
  log(`source ${sourceSha}; state ${state}`);
  const port = await up();
  try {
    const labImages = await images(port, sourceSha);
    writeFileSync(join(state, 'images.json'), JSON.stringify(labImages, null, 2));
    log(`images ${JSON.stringify(labImages)}`);
    const { v1, v2, broken, v3 } = labImages;
    await platform();
    const uid = (
      await k(['get', 'namespace', 'kube-system', '-o', 'jsonpath={.metadata.uid}'])
    ).trim();
    const settings = {
      kubectl,
      kubeconfig: join(state, 'kubeconfig'),
      context: CONTEXT,
      namespaces: NAMESPACES,
      stateDir: state,
      overlay: join(ROOT, 'deploy/k8s/wbs/overlays/local'),
      anonymousProjectsStatus: 200 as const,
      rolloutTimeoutSeconds: 90,
      jobTimeoutSeconds: 180,
      drainTimeoutMs: 5000,
      leaseDurationSeconds: 20,
      log,
    };

    // Bootstrap is not a release: seed F6's list with the one v1 digest it runs.
    await approve([v1.images.backend]);
    await bootstrap(v1, settings);
    await insertProject('f8-row-before');
    assert((await projectNames()).includes('f8-row-before'), 'row inserted through the v1 API');

    log(
      'proof: exact runtime directory admitted, alternate host paths and unapproved images refused',
    );
    const exact = await admits(v1.images.backend, '/run/puni/solver');
    assert(exact.admitted, `exact /run/puni/solver admitted: ${exact.message}`);
    for (const path of [
      '/run/puni',
      '/run/puni/solver/supervisor.sock',
      '/run/puni/solver/sub',
      '/var/run/docker.sock',
      '/',
    ]) {
      const alternate = await admits(v1.images.backend, path);
      assert(
        !alternate.admitted && alternate.message.includes('exact directory root'),
        `hostPath ${path} refused`,
      );
    }
    const unapproved = await admits(v2.images.backend, '/run/puni/solver');
    assert(
      !unapproved.admitted && unapproved.message.includes('approved backend image digest'),
      'a backend digest outside solverImages refused by the committed F6 policy',
    );

    log('scenario 1: induced health failure rolls back before writes reopen');
    let writers = watchWriters();
    const failed = await executeRelease(
      requestFor(broken, v1, uid),
      fileJournal(join(state, 'health-failure.json')),
      kubectlEffects(settings),
      log,
    ).then(
      () => null,
      (e: unknown) => e,
    );
    let seen = await writers.stop();
    assert(
      failed instanceof ReleaseFailedError && failed.state.phase === 'rolled-back',
      `release ended rolled-back`,
    );
    if (failed instanceof ReleaseFailedError) log(failed.message);
    const admitted = (
      await k([
        '-n',
        'wbs-solver',
        'get',
        'configmap',
        'puni-trusted-workload',
        '-o',
        'jsonpath={.data.solverImages}',
      ])
    ).trim();
    assert(
      admitted === `${v1.images.backend},${broken.images.backend}`,
      'the coordinator wrote solverImages as the rollback and candidate digests',
    );
    await expectRestored(v1, ['f8-row-before']);
    assert(
      seen.max <= 1,
      `at most one writer pod during the failed rollout (max ${String(seen.max)} over ${String(seen.samples)} samples)`,
    );

    log('scenario 2: coordinator SIGKILLed during the backend rollout, then resumed');
    const requestPath = join(state, 'interrupted-request.json');
    const journalPath = join(state, 'interrupted.json');
    writeFileSync(requestPath, JSON.stringify(requestFor(v2, v1, uid)));
    const cli = [
      'bun',
      join(ROOT, 'tools/tool-deploy/src/k8s/deploy-k3s.ts'),
      '--request',
      requestPath,
      '--journal',
      journalPath,
      '--kubectl',
      kubectl,
      '--kubeconfig',
      join(state, 'kubeconfig'),
      '--apply',
    ];
    writers = watchWriters();
    const coordinator = Bun.spawn({
      cmd: cli,
      stdout: 'inherit',
      stderr: 'inherit',
      env: process.env,
    });
    for (;;) {
      const journal = fileJournal(journalPath).read();
      if (journal?.state.phase === 'migrated') break;
      if (coordinator.exitCode !== null) throw new Error('coordinator exited before the rollout');
      await Bun.sleep(200);
    }
    await Bun.sleep(1500);
    coordinator.kill('SIGKILL');
    await coordinator.exited;
    const killedAt = fileJournal(journalPath).read()?.state.phase;
    log(`coordinator killed with the journal at ${String(killedAt)}`);
    assert(!(await writesOpen()), 'writes stayed fenced while the coordinator was dead');
    const resumed = await run(cli, null, 900_000);
    log(resumed.stdout + resumed.stderr);
    seen = await writers.stop();
    assert(
      resumed.exitCode !== 0 && (resumed.stdout + resumed.stderr).includes('ended at rolled-back'),
      'the resumed coordinator rolled back',
    );
    await expectRestored(v1, ['f8-row-before']);
    assert(
      seen.max <= 1,
      `at most one writer pod across the kill and resume (max ${String(seen.max)} over ${String(seen.samples)} samples)`,
    );

    log('scenario 3: additive upgrade promotes and keeps the row');
    writers = watchWriters();
    await executeRelease(
      requestFor(v2, v1, uid),
      fileJournal(join(state, 'upgrade.json')),
      kubectlEffects(settings),
      log,
    );
    seen = await writers.stop();
    const upgraded = await schemaFacts();
    assert(upgraded.columns.includes('lab_marker'), 'the additive column exists after promotion');
    assert((await projectNames()).includes('f8-row-before'), 'row survived the upgrade');
    assert(
      JSON.stringify(await runningImages()) === JSON.stringify(v2.images),
      'every tier runs the candidate digest',
    );
    await insertProject('f8-row-after-promotion');
    assert(
      seen.max <= 1,
      `at most one writer pod during the upgrade (max ${String(seen.max)} over ${String(seen.samples)} samples)`,
    );
    log('scenario 4: two coordinators with the same request and journal start together');
    const concurrentRequest = join(state, 'concurrent-request.json');
    const concurrentJournal = join(state, 'concurrent.json');
    writeFileSync(concurrentRequest, JSON.stringify(requestFor(v3, v2, uid)));
    const concurrentCli = [
      'bun',
      join(ROOT, 'tools/tool-deploy/src/k8s/deploy-k3s.ts'),
      '--request',
      concurrentRequest,
      '--journal',
      concurrentJournal,
      '--kubectl',
      kubectl,
      '--kubeconfig',
      join(state, 'kubeconfig'),
      '--apply',
    ];
    writers = watchWriters();
    const [first, second] = await Promise.all([
      run(concurrentCli, null, 900_000),
      run(concurrentCli, null, 900_000),
    ]);
    seen = await writers.stop();
    for (const [name, result] of [
      ['first', first],
      ['second', second],
    ] as const) {
      log(
        `${name} coordinator exit ${String(result.exitCode)}:\n${(result.stdout + result.stderr).trim()}`,
      );
    }
    const outputs = [first, second].map((r) => r.stdout + r.stderr);
    assert(
      outputs.filter((o) => o.includes('promoted')).length === 1,
      'exactly one of the two same-request coordinators promoted',
    );
    assert(
      outputs.filter((o) => /held by live coordinator|still renewed by/.test(o)).length === 1,
      'the other was refused by the live Lease before any mutation',
    );
    assert(
      JSON.stringify(await runningImages()) === JSON.stringify(v3.images),
      'the cluster runs the one promoted release',
    );
    assert((await projectNames()).includes('f8-row-after-promotion'), 'rows survived');
    assert(
      seen.max <= 1,
      `at most one writer pod with two coordinators (max ${String(seen.max)} over ${String(seen.samples)} samples)`,
    );
    log('all lab assertions passed');
  } finally {
    if (keep)
      log(
        `kept ${CLUSTER}; delete with: ${k3d} cluster delete ${CLUSTER} && ${k3d} registry delete k3d-${REGISTRY}`,
      );
    else {
      await down();
      rmSync(join(state, 'kubeconfig'), { force: true });
    }
  }
}

if (import.meta.main) await main();
