import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { parseAllDocuments } from 'yaml';

import { parseSqliteReport, SQLITE_REPORT_SCRIPT } from './cutover';
import { backendTaskJob, kubectlEffects, renderOverlay, run } from './execute';
import type { ReleaseIdentity } from './release';

const ROOT = resolve(import.meta.dir, '../../../..');
const CLUSTER = 'puni-f11-backup';
const REGISTRY = 'puni-f11-backup-registry';
const CONTEXT = `k3d-${CLUSTER}`;
const NAMESPACES = { app: 'wbs', backend: 'wbs-solver' };
const KNOWN = 'f11-backup-known-row';
const LAB_S3 = { user: 'f11-lab-only', password: 'f11-lab-only-password-000000' };
const OLD_BACKUP_IMAGE =
  'docker.io/oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f';

const state = resolve(process.env['PUNI_F11_BACKUP_STATE'] ?? join(ROOT, 'tmp/puni-f11-backup'));
const kubectl = process.env['KUBECTL'] ?? 'kubectl';
const k3d = process.env['K3D'] ?? 'k3d';
const keep = process.argv.includes('--keep');
const lock = JSON.parse(readFileSync(join(ROOT, 'infra/versions/toolchain.json'), 'utf8')) as {
  binaries: Record<string, { version: string }>;
  runtimeImages: Record<string, { name: string; digest: string }>;
};

function log(line: string): void {
  console.log(`[backup-lab ${new Date().toISOString().slice(11, 19)}] ${line}`);
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

const kubeArgs = (): string[] => [
  kubectl,
  '--kubeconfig',
  join(state, 'kubeconfig'),
  '--context',
  CONTEXT,
];
const k = (args: readonly string[], stdin: string | null = null): Promise<string> =>
  sh([...kubeArgs(), ...args], stdin, 600_000);

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  log(`assert ok: ${message}`);
}

function assertMemory(): void {
  const meminfo = readFileSync('/proc/meminfo', 'utf8');
  const available = Number(/^MemAvailable:\s+(\d+) kB$/m.exec(meminfo)?.[1] ?? Number.NaN) * 1024;
  if (!(available >= 3.5 * 1024 ** 3)) {
    throw new Error(
      `only ${String(Math.round(available / 1024 ** 2))} MiB available; need 3.5 GiB`,
    );
  }
  log(`memory available: ${String(Math.round(available / 1024 ** 2))} MiB`);
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
  const port = Number(
    (await sh(['docker', 'port', `k3d-${REGISTRY}`, '5000/tcp'])).trim().split(':').at(-1),
  );
  if (!Number.isInteger(port)) throw new Error('registry port unreadable');
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
  await run(['docker', 'network', 'rm', `k3d-${CLUSTER}`], null, 60_000);
  const images = await sh(['docker', 'images', '--format', '{{.Repository}}:{{.Tag}}']);
  for (const image of images.split('\n').filter((name) => name.includes('puni-f11-backup'))) {
    await run(['docker', 'rmi', image], null, 120_000);
  }
}

async function publish(dockerfile: string, repository: string, port: number): Promise<string> {
  const local = `puni-f11-backup-${repository}:lab`;
  await sh(
    ['docker', 'build', '-q', '-f', join(ROOT, dockerfile), '-t', local, ROOT],
    null,
    1_800_000,
  );
  const pushed = `127.0.0.1:${String(port)}/${repository}:f11-backup`;
  await sh(['docker', 'tag', local, pushed]);
  const digest = /digest: (sha256:[0-9a-f]{64})/.exec(await sh(['docker', 'push', pushed]))?.[1];
  if (digest === undefined) throw new Error(`push of ${pushed} printed no digest`);
  await sh(['docker', 'rmi', pushed, local]);
  return `k3d-${REGISTRY}:5000/${repository}@${digest}`;
}

async function waitJob(name: string): Promise<'succeeded' | 'failed'> {
  const deadline = Date.now() + 300_000;
  for (;;) {
    const status = (
      await k([
        '-n',
        'wbs-solver',
        'get',
        `job/${name}`,
        '-o',
        'jsonpath={.status.succeeded}/{.status.failed}',
      ])
    ).trim();
    if (status.startsWith('1/')) return 'succeeded';
    if (status.endsWith('/1')) return 'failed';
    if (Date.now() > deadline) throw new Error(`Job ${name} did not finish in 300s`);
    await Bun.sleep(2000);
  }
}

/** A Job pod that F6 admits in wbs-solver: backend identity, product node, backend image. */
function trustedJob(
  name: string,
  image: string,
  command: string[],
  env: object[],
  mounts: object[],
  volumes: object[],
) {
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name, namespace: 'wbs-solver' },
    spec: {
      backoffLimit: 0,
      template: {
        metadata: {
          labels: { 'puni.dev/controller': 'wbs-backend', 'puni.dev/workload': 'sqlite-backup' },
        },
        spec: {
          restartPolicy: 'Never',
          serviceAccountName: 'wbs-backend',
          automountServiceAccountToken: false,
          nodeSelector: { 'puni.dev/capability-product': 'true' },
          securityContext: {
            runAsUser: 10001,
            runAsGroup: 10001,
            fsGroup: 10001,
            runAsNonRoot: true,
            seccompProfile: { type: 'RuntimeDefault' },
          },
          containers: [
            {
              name: 'task',
              image,
              command,
              env: [
                { name: 'HOME', value: '/tmp' },
                { name: 'BUN_RUNTIME_TRANSPILER_CACHE_PATH', value: '0' },
                ...env,
              ],
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                runAsNonRoot: true,
                seccompProfile: { type: 'RuntimeDefault' },
                capabilities: { drop: ['ALL'] },
              },
              volumeMounts: [{ name: 'tmp', mountPath: '/tmp' }, ...mounts],
            },
          ],
          volumes: [{ name: 'tmp', emptyDir: {} }, ...volumes],
        },
      },
    },
  };
}

const s3Env = ['endpoint', 'bucket', 'region', 'access-key-id', 'secret-access-key'].map((key) => ({
  name: {
    endpoint: 'S3_ENDPOINT',
    bucket: 'S3_BUCKET',
    region: 'S3_REGION',
    'access-key-id': 'AWS_ACCESS_KEY_ID',
    'secret-access-key': 'AWS_SECRET_ACCESS_KEY',
  }[key],
  valueFrom: { secretKeyRef: { name: 'sqlite-backup-s3', key } },
}));

/**
 * Build the initial lab apply with the backend writer stopped and CronJob schedules suspended.
 * Job templates remain intact for manual runs. Throws when a rendered CronJob lacks its spec.
 */
export function prepareBackupLab(rendered: string): string {
  const resources = parseAllDocuments(rendered).map((document) => {
    // renderOverlay emits committed Kubernetes manifests; only these authored resource fields
    // are read here, with missing CronJob state refused before the lab can apply it.
    const object = document.toJS() as {
      kind?: string;
      metadata?: { name?: string };
      spec?: { replicas?: number; suspend?: boolean } | null;
    };
    if (object.kind === 'Deployment' && object.metadata?.name === 'wbs-backend' && object.spec)
      object.spec.replicas = 0;
    if (object.kind === 'CronJob') {
      if (object.spec === undefined || object.spec === null) {
        // Proof: the absent/null-spec regression returned an unsafe apply list without this guard.
        throw new Error('Rendered backup lab CronJob spec is absent');
      }
      // Proof: the production initial-apply regression saw suspend undefined without this line;
      // restored suspension preserves both shipped jobTemplates for manually created Jobs.
      object.spec.suspend = true;
    }
    return JSON.stringify(object);
  });

  return `{"apiVersion":"v1","kind":"List","items":[${resources.join(',')}]}`;
}

/** Require the scheduled verification's expected outcome and, for faults, its specific cause. */
export function requireVerification(
  name: string,
  outcome: 'succeeded' | 'failed',
  logs: string,
  failure?: string,
): void {
  // Proof: with this guard absent, backup-lab.test.ts accepted a failed known backup,
  // an accepted corrupt snapshot and an unrelated connection failure (three failures).
  const expected = failure === undefined ? 'succeeded' : 'failed';
  if (outcome !== expected || (failure !== undefined && !logs.includes(failure))) {
    throw new Error(
      `Verification ${name} expected ${expected}${failure === undefined ? '' : `: ${failure}`}; observed ${outcome}:\n${logs}`,
    );
  }
}

/** Create a Job from the shipped verification CronJob, preserving its runner and identity. */
async function runVerification(name: string, prefix?: string, failure?: string): Promise<string> {
  let job = await k([
    '-n',
    'wbs-solver',
    'create',
    'job',
    name,
    '--from=cronjob/sqlite-backup-verify',
    '--dry-run=client',
    '-o',
    'json',
  ]);
  if (prefix !== undefined) {
    job = await k(
      ['set', 'env', '--local', '-f', '-', `BACKUP_PREFIX=${prefix}`, '-o', 'json'],
      job,
    );
  }
  await k(['create', '-f', '-'], job);
  const outcome = await waitJob(name);
  const logs = await k(['-n', 'wbs-solver', 'logs', `job/${name}`]);
  log(`${name}: ${outcome}\n${logs.trim().slice(-1000)}`);
  requireVerification(name, outcome, logs, failure);
  return logs;
}

/** Fault injector used only against the disposable lab's versioned object store. */
export const VERIFICATION_FAULT_SCRIPT = String.raw`
    const { S3Client } = require('bun');
    const { createS3Store } = require('/runner/backup-sqlite.ts');
    function requireEnv(name) {
      const value = process.env[name];
      if (value === undefined || value === '') throw new Error(name + ' must be set');
      return value;
    }
    const store = createS3Store(new S3Client({
      endpoint: requireEnv('S3_ENDPOINT'), bucket: requireEnv('S3_BUCKET'),
      region: requireEnv('S3_REGION'), accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'), virtualHostedStyle: false,
    }));
    const report = JSON.parse(requireEnv('PUNI_REPORT'));
    let snapshot = await store.get(report.objectKey);
    const originalKey = report.objectKey;
    report.objectKey = requireEnv('PUNI_PREFIX') + '/wbs/' + originalKey.split('/').at(-1);
    if (requireEnv('PUNI_FAULT') === 'snapshot') {
      const changed = new Uint8Array(snapshot.length + 1);
      changed.set(snapshot);
      changed[snapshot.length] = 1;
      snapshot = changed;
    } else {
      report.migrations = report.migrations.map((migration, index) =>
        index === 0 ? { ...migration, hash: 'f10-corrupt-migration-hash' } : migration);
    }
    report.objectVersion = await store.put(report.objectKey, snapshot, 'application/vnd.sqlite3');
    await store.put(report.objectKey + '.report.json',
      new TextEncoder().encode(JSON.stringify(report) + '\n'), 'application/json');
    console.log('injected ' + requireEnv('PUNI_FAULT') + ' at ' + report.objectKey);
  `;

/** Copy a real snapshot under an isolated lab prefix, then damage only the selected boundary. */
async function writeVerificationFault(
  image: string,
  reportLine: string,
  fault: 'snapshot' | 'report',
): Promise<string> {
  const prefix = `f10-${fault}`;
  const name = `f10-inject-${fault}`;

  await k(
    ['create', '-f', '-'],
    JSON.stringify(
      trustedJob(
        name,
        image,
        ['bun', '-e', VERIFICATION_FAULT_SCRIPT],
        [
          { name: 'PUNI_REPORT', value: reportLine },
          { name: 'PUNI_PREFIX', value: prefix },
          { name: 'PUNI_FAULT', value: fault },
          ...s3Env,
        ],
        [{ name: 'runner', mountPath: '/runner', readOnly: true }],
        [{ name: 'runner', configMap: { name: 'sqlite-backup-runner' } }],
      ),
    ),
  );
  assert((await waitJob(name)) === 'succeeded', `${name} uploaded the isolated fault fixture`);
  return prefix;
}

/**
 * Prove the shipped backup, restore and scheduled verification on disposable k3d with F6
 * admission and a real backend image. Owns only puni-f11-backup objects; deletes them unless
 * --keep. K3D and KUBECTL name locked binaries. See docs/infra/recovery.md for proof limits.
 */
async function main(): Promise<void> {
  mkdirSync(state, { recursive: true, mode: 0o700 });
  assertMemory();
  if (!(await sh([k3d, 'version'])).includes(lock.binaries['k3d'].version))
    throw new Error('k3d version');
  if (!(await sh([kubectl, 'version', '--client'])).includes(lock.binaries['kubectl'].version))
    throw new Error('kubectl version');
  const sourceSha = (await sh(['git', '-C', ROOT, 'rev-parse', 'HEAD'])).trim();
  const port = await up();
  try {
    const identity: ReleaseIdentity = {
      sourceSha,
      images: {
        backend: await publish('apps/wbs/be-01/Dockerfile', 'wbs-be-01', port),
        gateway: await publish('apps/wbs/gw-01/Dockerfile', 'wbs-gw-01', port),
        frontend: await publish('apps/wbs/fe-01/Dockerfile', 'wbs-fe-01', port),
        mcp: await publish('deploy/k8s/wbs/lab/mcp-01.Dockerfile', 'wbs-mcp-01', port),
      },
    };
    log(`release ${JSON.stringify(identity)}`);

    const node = (await k(['get', 'nodes', '-o', 'jsonpath={.items[0].metadata.name}'])).trim();
    await k(['label', 'node', node, 'puni.dev/capability-product=true', '--overwrite']);
    await sh(['docker', 'exec', `k3d-${CLUSTER}-server-0`, 'mkdir', '-p', '/run/puni/solver']);
    await k(['apply', '-k', join(ROOT, 'infra/platform/policy')]);
    await k(['apply', '-k', join(ROOT, 'infra/platform/storage/local')]);
    await k([
      '-n',
      'wbs-solver',
      'patch',
      'configmap',
      'puni-trusted-workload',
      '--type=merge',
      '-p',
      JSON.stringify({ data: { solverImages: identity.images.backend } }),
    ]);

    log(
      'local object store (infra/platform/backup/local/object-store.yaml) with lab-only credentials',
    );
    await k([
      '-n',
      'puni-backup',
      'create',
      'secret',
      'generic',
      'object-store-root',
      `--from-literal=MINIO_ROOT_USER=${LAB_S3.user}`,
      `--from-literal=MINIO_ROOT_PASSWORD=${LAB_S3.password}`,
    ]);
    await k(['apply', '-f', join(ROOT, 'infra/platform/backup/local/object-store.yaml')]);
    await k([
      '-n',
      'puni-backup',
      'wait',
      '--for=condition=complete',
      'job/object-store-buckets',
      '--timeout=600s',
    ]);
    await k([
      '-n',
      'wbs-solver',
      'create',
      'secret',
      'generic',
      'sqlite-backup-s3',
      '--from-literal=endpoint=http://object-store.puni-backup.svc:9000',
      '--from-literal=bucket=puni-sqlite',
      '--from-literal=region=us-east-1',
      `--from-literal=access-key-id=${LAB_S3.user}`,
      `--from-literal=secret-access-key=${LAB_S3.password}`,
    ]);

    log('WBS local overlay with the writer at zero, then a migrated empty database');
    const settings = {
      kubectl,
      kubeconfig: join(state, 'kubeconfig'),
      context: CONTEXT,
      namespaces: NAMESPACES,
      stateDir: state,
      overlay: join(ROOT, 'deploy/k8s/wbs/overlays/local'),
      anonymousProjectsStatus: 200 as const,
      rolloutTimeoutSeconds: 180,
      jobTimeoutSeconds: 300,
      drainTimeoutMs: 5000,
      leaseDurationSeconds: 20,
      log,
    };
    const rendered = await renderOverlay(settings, identity);
    await k(['apply', '-f', '-'], prepareBackupLab(rendered));
    const cronImage = (
      await k([
        '-n',
        'wbs-solver',
        'get',
        'cronjob',
        'sqlite-backup',
        '-o',
        'jsonpath={.spec.jobTemplate.spec.template.spec.containers[0].image}',
      ])
    ).trim();
    assert(
      cronImage === identity.images.backend,
      'the rendered backup CronJob runs the release backend digest',
    );
    for (const [name, env] of [
      ['wbs-seed', { PUNI_TASK: 'none' }],
      ['wbs-migrate', { PUNI_TASK: 'migrate' }],
    ] as const) {
      const job = backendTaskJob(settings, name, identity.images.backend, env);
      if (name === 'wbs-seed') {
        const spec = job['spec'] as { template: { spec: { containers: { command: string[] }[] } } };
        spec.template.spec.containers[0].command = [
          'bun',
          '-e',
          "new (require('bun:sqlite').Database)('/data/wbs.sqlite').close()",
        ];
      }
      await k(['create', '-f', '-'], JSON.stringify(job));
      await k([
        '-n',
        'wbs-solver',
        'wait',
        '--for=condition=complete',
        `job/${name}`,
        '--timeout=300s',
      ]);
    }
    await k(['-n', 'wbs-solver', 'scale', 'deployment', 'wbs-backend', '--replicas=1']);
    await k(['-n', 'wbs-solver', 'rollout', 'status', 'deployment/wbs-backend', '--timeout=300s']);
    await kubectlEffects(settings).persistRelease(identity);
    const inserted = await k([
      '-n',
      'wbs-solver',
      'exec',
      'deployment/wbs-backend',
      '--',
      'bun',
      '-e',
      `const r = await fetch('http://127.0.0.1:3100/api/projects', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:8080' }, body: JSON.stringify({ name: '${KNOWN}' }) }); console.log(r.status)`,
    ]);
    assert(inserted.trim() === '200', `known row ${KNOWN} written through the backend API`);

    log(
      'F6 admission of the backup job pod: the old bun image is denied, the backend image is not',
    );
    for (const cronName of ['sqlite-backup', 'sqlite-backup-verify']) {
      const cron = JSON.parse(
        await k(['-n', 'wbs-solver', 'get', 'cronjob', cronName, '-o', 'json']),
      ) as {
        spec: {
          jobTemplate: {
            spec: { template: { metadata: object; spec: { containers: { image: string }[] } } };
          };
        };
      };
      const probe = (image: string) => {
        const template = structuredClone(cron.spec.jobTemplate.spec.template);
        template.spec.containers[0].image = image;
        return run(
          [...kubeArgs(), 'create', '--dry-run=server', '-f', '-'],
          JSON.stringify({
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: { ...template.metadata, name: 'f11-backup-probe', namespace: 'wbs-solver' },
            spec: template.spec,
          }),
          60_000,
        );
      };
      const denied = await probe(OLD_BACKUP_IMAGE);
      // Proof: the shipped verification template's old Bun image was denied by the disposable
      // API with "approved backend image digest"; the actual backend digest was admitted.
      assert(
        denied.exitCode !== 0 && denied.stderr.includes('approved backend image digest'),
        `${cronName}: the old bun-alpine image is denied by F6 admission`,
      );
      assert(
        (await probe(identity.images.backend)).exitCode === 0,
        `${cronName}: the backend-image pod is admitted`,
      );
    }

    log('run the CronJob once');
    await k([
      '-n',
      'wbs-solver',
      'create',
      'job',
      'f11-backup-once',
      '--from=cronjob/sqlite-backup',
    ]);
    const outcome = await waitJob('f11-backup-once');
    const logs = await k(['-n', 'wbs-solver', 'logs', 'job/f11-backup-once']);
    log(logs.trim().slice(-600));
    assert(outcome === 'succeeded', 'the backup Job succeeded with the backend image');
    const reportLine = logs.trim().split('\n').at(-1) ?? '{}';
    // backupSqlite uploads exactly this object pretty-printed, so its digest is the report's.
    const reportSha256 = createHash('sha256')
      .update(`${JSON.stringify(JSON.parse(reportLine), null, 2)}\n`)
      .digest('hex');
    const report = JSON.parse(reportLine) as {
      objectKey: string;
      objectVersion: string;
      sourceRevision: string;
      sha256: string;
      migrations: { name: string; hash: string }[];
    };
    assert(
      report.sourceRevision === sourceSha,
      'the report names the release source from wbs-release/sourceSha',
    );
    assert(
      report.objectVersion !== '' && report.migrations.length > 0,
      `versioned object ${report.objectKey} with ${String(report.migrations.length)} migrations`,
    );

    log('restore into a fresh volume and read the known row back');
    await k(
      ['apply', '-f', '-'],
      JSON.stringify({
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: { name: 'wbs-data-restore', namespace: 'wbs-solver' },
        spec: {
          accessModes: ['ReadWriteOnce'],
          storageClassName: 'puni-local',
          resources: { requests: { storage: '1Gi' } },
        },
      }),
    );
    const restoreVolumes = [
      { name: 'restore', persistentVolumeClaim: { claimName: 'wbs-data-restore' } },
      { name: 'runner', configMap: { name: 'sqlite-backup-runner' } },
    ];
    const restoreMounts = [
      { name: 'restore', mountPath: '/restore' },
      { name: 'runner', mountPath: '/runner', readOnly: true },
    ];
    await k(
      ['create', '-f', '-'],
      JSON.stringify(
        trustedJob(
          'f11-restore',
          identity.images.backend,
          ['bun', '/runner/backup-sqlite.ts', 'restore'],
          [
            { name: 'RESTORE_REPORT_KEY', value: `${report.objectKey}.report.json` },
            { name: 'RESTORE_REPORT_SHA256', value: reportSha256 },
            { name: 'RESTORE_TARGET_PATH', value: '/restore/wbs.sqlite' },
            ...s3Env,
          ],
          restoreMounts,
          restoreVolumes,
        ),
      ),
    );
    assert(
      (await waitJob('f11-restore')) === 'succeeded',
      'restore mode verified SHA-256, integrity and migrations and wrote /restore/wbs.sqlite',
    );
    await k(
      ['create', '-f', '-'],
      JSON.stringify(
        trustedJob(
          'f11-restore-read',
          identity.images.backend,
          ['bun', '-e', SQLITE_REPORT_SCRIPT],
          [
            { name: 'PUNI_DB', value: '/restore/wbs.sqlite' },
            { name: 'PUNI_KNOWN', value: JSON.stringify([KNOWN]) },
          ],
          restoreMounts,
          restoreVolumes,
        ),
      ),
    );
    assert((await waitJob('f11-restore-read')) === 'succeeded', 'the restored database opens');
    const restored = parseSqliteReport(
      await k(['-n', 'wbs-solver', 'logs', 'job/f11-restore-read']),
    );
    assert(restored.known[KNOWN], `known row ${KNOWN} is in the restored database`);
    assert(restored.sha256 === report.sha256, 'restored bytes equal the reported snapshot');
    assert(
      restored.integrity.join() === 'ok' && restored.foreignKeyViolations === 0,
      'restored database passes integrity and foreign-key checks',
    );
    assert(
      JSON.stringify(restored.migrations) === JSON.stringify(report.migrations.map((m) => m.name)),
      'restored migration set equals the report',
    );
    log('run the shipped verification CronJob against the known migrated snapshot');
    // The admitted backend runs the unchanged production runner; verify prints its validated
    // BackupReport, the same boundary as the backup Job's report parsed above.
    const verified = JSON.parse(await runVerification('f10-verify-known')) as typeof report;
    assert(
      verified.objectKey === report.objectKey &&
        verified.sha256 === report.sha256 &&
        JSON.stringify(verified.migrations) === JSON.stringify(report.migrations),
      'scheduled verification returns the known snapshot digest and complete migration set',
    );
    // Proof: backup-lab.test.ts ran the production CLI against an empty prefix and observed
    // "No SQLite backup report under f10-absent/wbs/" with a nonzero exit.
    await runVerification('f10-verify-absent', 'f10-absent', 'No SQLite backup report under');
    const snapshotPrefix = await writeVerificationFault(
      identity.images.backend,
      reportLine,
      'snapshot',
    );
    // Proof: removing the production runner's SHA comparison made the injected-snapshot CLI
    // test fail with exit 0; restoring it refused the appended byte with the expected cause.
    await runVerification('f10-verify-snapshot', snapshotPrefix, 'bytes differ from its report');
    const reportPrefix = await writeVerificationFault(
      identity.images.backend,
      reportLine,
      'report',
    );
    await runVerification(
      'f10-verify-report',
      reportPrefix,
      'migration set differs from its report',
    );
    log('all backup lab assertions passed');
  } finally {
    if (keep)
      log(
        `kept ${CLUSTER}; delete with: ${k3d} cluster delete ${CLUSTER} && ${k3d} registry delete k3d-${REGISTRY}`,
      );
    else await down();
  }
}

if (import.meta.main) await main();
