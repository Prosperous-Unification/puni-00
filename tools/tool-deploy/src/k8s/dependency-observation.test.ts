import { chmodSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { buildDependencyObservationJob, observeDependencyJob } from './dependency-observation';
const image = `registry/wbs-be-01@sha256:${'a'.repeat(64)}`;
const options = {
  namespace: 'wbs-solver',
  attempt: 'transaction',
  purpose: 'candidate' as const,
  image,
  timeoutSeconds: 1,
};
const wire = JSON.stringify({
  protocol: 'wbs-dependency-runtime',
  version: 1,
  role: 'backend',
  semantics: [],
});
function setField(subject: unknown, path: string, value: unknown) {
  const keys = path.split('.');
  const leaf = keys.pop()!;
  let cursor = subject as Record<string, unknown>;
  for (const key of keys) cursor = cursor[key] as Record<string, unknown>;
  if (value === undefined) Reflect.deleteProperty(cursor, leaf);
  else cursor[leaf] = value;
}
function fixture(fault = '', purpose: 'candidate' | 'store' = 'candidate') {
  const request = buildDependencyObservationJob({ ...options, purpose });
  const job = {
    ...structuredClone(request.manifest),
    metadata: { ...request.manifest.metadata, uid: 'job-uid' },
    status: { succeeded: 1, failed: 0, conditions: [{ type: 'Complete', status: 'True' }] },
  };
  const pod = {
    metadata: {
      labels: structuredClone(job.spec.template.metadata.labels),
      name: 'observed-pod',
      namespace: options.namespace,
      uid: 'pod-uid',
      ownerReferences: [
        {
          apiVersion: 'batch/v1',
          kind: 'Job',
          name: job.metadata.name,
          uid: 'job-uid',
          controller: true,
        },
      ],
    },
    spec: structuredClone(job.spec.template.spec),
    status: {
      phase: 'Succeeded',
      containerStatuses: [
        {
          name: 'task',
          image,
          imageID: `containerd://${image}`,
          restartCount: 0,
          volumeMounts: [
            { name: 'source', mountPath: '/data', readOnly: true, recursiveReadOnly: 'Enabled' },
          ],
          state: { terminated: { exitCode: 0, reason: 'Completed' } },
        },
      ],
    },
  };
  if (['alias-create', 'alias-both', 'alias-create-foreign'].includes(fault))
    setField(
      job,
      'spec.template.spec.serviceAccount',
      fault === 'alias-create-foreign' ? 'foreign' : job.spec.template.spec.serviceAccountName,
    );
  if (['alias-pod', 'alias-both', 'alias-pod-foreign'].includes(fault))
    setField(
      pod,
      'spec.serviceAccount',
      fault === 'alias-pod-foreign' ? 'foreign' : pod.spec.serviceAccountName,
    );
  let created = false;
  let logged = false;
  const calls: string[][] = [];
  return {
    request,
    calls,
    call: async (args: readonly string[], stdin: string | null) => {
      await Promise.resolve();
      calls.push([...args]);
      if (args.includes('create')) {
        created = true;
        expect(JSON.parse(stdin!)).toEqual(request.manifest);
        return JSON.stringify(job);
      }
      if (!created) return fault === 'stale' ? JSON.stringify(job) : '';
      if (args.includes('logs')) {
        logged = true;
        return fault === 'oversize' ? 'x'.repeat(65537) : wire;
      }
      const observedJob = structuredClone(job);
      const observedPod = structuredClone(pod);
      const jobFields: Record<string, readonly [string, unknown] | undefined> = {
        'job-protocol': ['apiVersion', 'foreign'],
        'job-kind': ['kind', 'Pod'],
        'job-uid-missing': ['metadata.uid', undefined],
        'job-name': ['metadata.name', 'foreign'],
        'job-namespace': ['metadata.namespace', 'foreign'],
        'job-deleting': ['metadata.deletionTimestamp', 'now'],
        'job-label': ['metadata.labels', {}],
        'template-label': ['spec.template.metadata.labels', {}],
        'job-selector': [
          'spec.selector',
          { matchLabels: { 'batch.kubernetes.io/controller-uid': 'foreign' } },
        ],
        'job-extra': ['spec.podFailurePolicy', {}],
        'job-deadline': ['spec.activeDeadlineSeconds', 9999],
        'job-status': ['status', undefined],
        'job-count': ['status.failed', '0'],
        'job-failed': ['status.failed', 1],
        'job-conditions': ['status.conditions', {}],
        'job-failed-condition': [
          'status.conditions',
          [
            { type: 'Complete', status: 'True' },
            { type: 'FailureTarget', status: 'True' },
          ],
        ],
        'job-incomplete': ['status.conditions', []],
      };
      const jobField = jobFields[fault];
      if (jobField !== undefined) setField(observedJob, jobField[0], jobField[1]);

      if (fault === 'job-uid' || (fault === 'after-logs' && logged))
        setField(observedJob, 'metadata.uid', 'replacement');
      if (fault === 'job-command')
        setField(observedJob, 'spec.template.spec.containers.0.command', [
          'bun',
          'run',
          'src/index.ts',
        ]);
      if (fault === 'pod-uid' && logged) setField(observedPod, 'metadata.uid', 'replacement');
      const fields: Record<string, readonly [string, unknown] | undefined> = {
        owner: ['metadata.ownerReferences.0.uid', 'foreign'],
        'pod-label': ['metadata.labels', {}],
        'pod-namespace': ['metadata.namespace', 'foreign'],
        'pod-uid-missing': ['metadata.uid', undefined],
        'pod-name-missing': ['metadata.name', undefined],
        'pod-deleting': ['metadata.deletionTimestamp', 'now'],
        'pod-annotation': [
          'metadata.annotations',
          { 'container.apparmor.security.beta.kubernetes.io/task': 'unconfined' },
        ],
        owners: ['metadata.ownerReferences', []],
        'status-phase': ['status.phase', 'Unknown'],
        'status-missing-phase': ['status.phase', undefined],
        'status-image': ['status.containerStatuses.0.image', 'foreign'],
        'status-image-long': ['status.containerStatuses.0.image', 'x'.repeat(4096)],
        'status-image-missing': ['status.containerStatuses.0.image', undefined],
        'status-image-malformed': ['status.containerStatuses.0.image', { name: 'foreign' }],
        'status-name': ['status.containerStatuses.0.name', 'foreign'],
        'status-count': ['status.containerStatuses', []],
        restarts: ['status.containerStatuses.0.restartCount', 1],
        'termination-reason': ['status.containerStatuses.0.state.terminated.reason', 'Error'],

        'pod-image': ['spec.containers.0.image', 'foreign'],
        'image-id': ['status.containerStatuses.0.imageID', 'containerd://sha256:foreign'],
        'pod-command': ['spec.containers.0.command', ['bun', 'run', 'src/index.ts']],
        volume: ['spec.volumes', [{ name: 'foreign', hostPath: { path: '/data' } }]],
        env: ['spec.containers.0.env', [{ name: 'DB_PATH', value: '/data/wbs.sqlite' }]],
        security: ['spec.containers.0.securityContext.privileged', true],
        token: ['spec.automountServiceAccountToken', true],
        'service-account': ['spec.serviceAccountName', 'foreign'],
        'node-selector': ['spec.nodeSelector', {}],
        'env-from': ['spec.containers.0.envFrom', [{ secretRef: { name: 'foreign' } }]],
        'fs-group': ['spec.securityContext.fsGroup', 10001],
        sidecar: ['spec.containers', [...pod.spec.containers, { name: 'foreign', image }]],
        init: ['spec.initContainers', [{ name: 'foreign', image }]],
        ephemeral: ['spec.ephemeralContainers', [{ name: 'foreign', image }]],
        device: [
          'spec.containers.0.volumeDevices',
          [{ name: 'source', devicePath: '/dev/source' }],
        ],
        'recursive-status': [
          'status.containerStatuses.0.volumeMounts.0.recursiveReadOnly',
          'Disabled',
        ],
        'readonly-status': ['status.containerStatuses.0.volumeMounts.0.readOnly', false],
        'missing-mount-status': ['status.containerStatuses.0.volumeMounts', undefined],
        'recursive-spec': ['spec.containers.0.volumeMounts.0.recursiveReadOnly', 'IfPossible'],
        'source-writable': ['spec.volumes.0.persistentVolumeClaim.readOnly', false],
        status: ['status', undefined],
        termination: ['status.containerStatuses.0.state.terminated', undefined],
        failed: ['status.containerStatuses.0.state.terminated.exitCode', 7],
      };
      const field = fields[fault];
      if (field !== undefined) setField(observedPod, field[0], field[1]);
      return JSON.stringify(
        args.includes('pods')
          ? {
              items:
                fault === 'extra-pod'
                  ? [observedPod, observedPod]
                  : fault === 'missing-pod'
                    ? []
                    : [observedPod],
            }
          : observedJob,
      );
    },
  };
}
test('fresh capability Job has no storage and returns Pod-attributed evidence', async () => {
  const cluster = fixture();
  const observation = await observeDependencyJob(cluster.request, cluster.call);
  expect(observation.evidence).toMatchObject({
    jobUid: 'job-uid',
    podUid: 'pod-uid',
    image,
    namespace: options.namespace,
  });
  expect(observation.stdout).toBe(wire);
  expect(cluster.calls.find((call) => call.includes('logs'))).toEqual([
    '-n',
    options.namespace,
    'logs',
    'observed-pod',
    '-c',
    'task',
  ]);
  const pod = cluster.request.manifest.spec.template.spec;
  expect(pod).not.toHaveProperty('volumes');
  expect(pod.containers[0]).not.toHaveProperty('env');
});

test('status image mismatch retains bounded observation identity for the lab diagnostic', async () => {
  const cluster = fixture('status-image');
  try {
    await observeDependencyJob(cluster.request, cluster.call);
    throw new Error('status image mismatch was accepted');
  } catch (failure) {
    expect(failure).toMatchObject({
      message: 'dependency observation status image differs from pinned manifest',
      observation: {
        observationId: cluster.request.observationId,
        purpose: 'candidate',
        jobName: cluster.request.manifest.metadata.name,
        jobUid: 'job-uid',
        podName: 'observed-pod',
        podUid: 'pod-uid',
        expectedImage: image,
        observedName: 'task',
        observedImage: 'foreign',
        observedImageId: `containerd://${image}`,
        restartCount: 0,
      },
    });
  }
});

test.each([
  ['status-image-long', '<oversized:string>'],
  ['status-image-missing', '<missing>'],
  ['status-image-malformed', '<non-string:object>'],
])('status image diagnostic bounds %s without accepting it', async (fault, suffix) => {
  const cluster = fixture(fault);
  try {
    await observeDependencyJob(cluster.request, cluster.call);
    throw new Error('status image mismatch was accepted');
  } catch (failure) {
    expect(failure).toMatchObject({
      message: 'dependency observation status image differs from pinned manifest',
    });
    const observation = (failure as { observation?: { observedImage?: string } }).observation;
    expect(observation?.observedImage).toEndWith(suffix);
    expect(observation?.observedImage?.length).toBeLessThanOrEqual(1024);
  }
});
test('each invocation and role has a fresh bounded name', () => {
  const names = [
    buildDependencyObservationJob(options),
    buildDependencyObservationJob(options),
    buildDependencyObservationJob({ ...options, purpose: 'previous' }),
  ].map((request) => request.manifest.metadata.name);
  expect(new Set(names).size).toBe(3);
  for (const name of names) expect(name.length).toBeLessThanOrEqual(63);
});
test('store pins recursive source readonly and omits mount ownership mutation', () => {
  const pod = buildDependencyObservationJob({ ...options, purpose: 'store' }).manifest.spec.template
    .spec;
  expect(pod.securityContext).not.toHaveProperty('fsGroup');
  expect(pod.containers[0].volumeMounts).toEqual([
    {
      name: 'source',
      mountPath: '/data',
      readOnly: true,
      recursiveReadOnly: 'Enabled',
      mountPropagation: 'None',
    },
    { name: 'scratch', mountPath: '/tmp' },
  ]);
  expect(pod.volumes).toEqual([
    { name: 'source', persistentVolumeClaim: { claimName: 'wbs-data', readOnly: true } },
    { name: 'scratch', emptyDir: { sizeLimit: '256Mi' } },
  ]);
});
for (const fault of [
  'stale',
  'oversize',
  'token',
  'service-account',
  'node-selector',
  'env-from',
  'job-protocol',
  'job-kind',
  'job-uid-missing',
  'job-name',
  'job-namespace',
  'job-deleting',
  'job-label',
  'template-label',
  'job-selector',
  'job-extra',
  'job-deadline',
  'job-status',
  'job-count',
  'job-failed',
  'job-conditions',
  'job-failed-condition',
  'job-incomplete',
  'pod-label',
  'pod-namespace',
  'pod-uid-missing',
  'pod-name-missing',
  'pod-deleting',
  'pod-annotation',
  'owners',
  'status-phase',
  'status-missing-phase',
  'status-image',
  'status-name',
  'status-count',
  'restarts',
  'termination-reason',

  'job-uid',
  'job-command',
  'pod-uid',
  'after-logs',
  'owner',
  'pod-image',
  'image-id',
  'pod-command',
  'volume',
  'env',
  'security',
  'fs-group',
  'sidecar',
  'init',
  'ephemeral',
  'device',
  'status',
  'termination',
  'failed',
  'extra-pod',
  'missing-pod',
])
  test(`observation refuses ${fault}`, async () => {
    const cluster = fixture(fault);
    const refusal = await observeDependencyJob(cluster.request, cluster.call).then(
      () => 'resolved',
      (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)),
    );
    expect(refusal).not.toBe('resolved');
    const diagnostics: Record<string, string | undefined> = {
      status: 'missing or malformed Pod status',
      termination: 'missing or malformed task termination',
      'job-uid-missing': 'missing or malformed Job UID',
      'pod-uid-missing': 'missing or malformed Pod UID',
      'pod-name-missing': 'missing or malformed Pod name',
      'job-status': 'missing or malformed Job status',
    };
    const expected = diagnostics[fault];
    if (expected !== undefined) expect(refusal).toContain(expected);
  });

for (const fault of [
  'recursive-status',
  'readonly-status',
  'missing-mount-status',
  'recursive-spec',
  'source-writable',
])
  test(`store refuses ${fault}`, async () => {
    const cluster = fixture(fault, 'store');
    expect(
      await observeDependencyJob(cluster.request, cluster.call).then(
        () => 'resolved',
        () => 'refused',
      ),
    ).toBe('refused');
  });
test('store requires positive runtime recursive readonly evidence', async () => {
  const cluster = fixture('', 'store');
  expect((await observeDependencyJob(cluster.request, cluster.call)).evidence.podUid).toBe(
    'pod-uid',
  );
});
const backend = resolve(import.meta.dir, '../../../../apps/wbs/be-01');
function executeCommand(command: readonly string[], path: string) {
  const child = Bun.spawnSync([...command], {
    cwd: backend,
    env: { ...process.env, DB_PATH: path },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString();
}
function migrateStore(root: string) {
  const path = join(root, 'wbs.sqlite');
  executeCommand(['bun', 'run', 'src/migrate-cli.ts'], path);
  return path;
}
function readFamily(root: string) {
  return Object.fromEntries(
    readdirSync(root)
      .sort()
      .map((name) => [name, readFileSync(join(root, name)).toString('hex')]),
  );
}
test('exact emitted scanner preserves migrated source bytes including WAL and SHM', () => {
  const root = scratchSync('dependency-k8s-wal-');
  const path = migrateStore(root);
  const sqlite = new Database(path);
  try {
    sqlite.run('PRAGMA journal_mode=WAL');
    sqlite.run('PRAGMA wal_autocheckpoint=0');
    sqlite.run("UPDATE cross_project_dependency_activation SET state='ENABLED'");
    sqlite.run('PRAGMA wal_checkpoint(TRUNCATE)');
    sqlite.run("UPDATE cross_project_dependency_activation SET state='DISABLED'");
    const before = readFamily(root);
    expect(Object.keys(before)).toContain('wbs.sqlite-wal');
    expect(Object.keys(before)).toContain('wbs.sqlite-shm');
    const request = buildDependencyObservationJob({ ...options, purpose: 'store' });
    expect(
      JSON.parse(executeCommand(request.manifest.spec.template.spec.containers[0].command, path)),
    ).toMatchObject({ state: 'DISABLED', externalRelationships: 0 });
    expect(readFamily(root)).toEqual(before);
  } finally {
    sqlite.close();
  }
});
for (const fault of ['enabled-empty', 'historical', 'absent', 'unreadable', 'malformed'] as const)
  test(`exact emitted scanner refuses ${fault} without changing source`, () => {
    const root = scratchSync('dependency-k8s-authority-');
    const path = migrateStore(root);
    if (fault === 'enabled-empty' || fault === 'historical') {
      const sqlite = new Database(path);
      sqlite.run(
        fault === 'enabled-empty'
          ? "UPDATE cross_project_dependency_activation SET state='ENABLED'"
          : 'DROP TABLE cross_project_dependency_activation_receipt',
      );
      sqlite.close();
    }
    if (fault === 'absent') rmSync(path);
    if (fault === 'unreadable') {
      expect(process.geteuid?.()).toBeGreaterThan(0);
      chmodSync(path, 0);
    }
    if (fault === 'malformed') writeFileSync(path, 'not SQLite');
    const before = fault === 'unreadable' ? readdirSync(root) : readFamily(root);
    const request = buildDependencyObservationJob({ ...options, purpose: 'store' });
    expect(() =>
      executeCommand(request.manifest.spec.template.spec.containers[0].command, path),
    ).toThrow();
    expect(fault === 'unreadable' ? readdirSync(root) : readFamily(root)).toEqual(before);
    if (fault === 'unreadable') chmodSync(path, 0o600);
  });
test('exact capability command ignores inherited DB_PATH and never creates storage', () => {
  const root = scratchSync('dependency-k8s-dbfree-');
  const path = join(root, 'absent.sqlite');
  const request = buildDependencyObservationJob(options);
  expect(
    JSON.parse(executeCommand(request.manifest.spec.template.spec.containers[0].command, path)),
  ).toMatchObject({ semantics: [] });
  expect(readdirSync(root)).toEqual([]);
});

for (const timeoutSeconds of [0, 0.5, 3601, NaN])
  test(`builder refuses timeout ${String(timeoutSeconds)}`, () => {
    expect(() => buildDependencyObservationJob({ ...options, timeoutSeconds })).toThrow();
  });
test('builder refuses mutable backend image', () => {
  expect(() =>
    buildDependencyObservationJob({ ...options, image: 'registry/wbs-be-01:latest' }),
  ).toThrow();
});

for (const location of ['create', 'pod', 'both'])
  test(`accepts matching serviceAccount alias in ${location} responses`, async () => {
    const cluster = fixture(`alias-${location}`);
    const observation = await observeDependencyJob(cluster.request, cluster.call);
    expect(observation.evidence.podUid).toBe('pod-uid');
    expect(cluster.calls.some((call) => call.includes('pods'))).toBe(true);
  });
for (const location of ['create', 'pod'])
  test(`refuses mismatched serviceAccount alias in ${location} response`, async () => {
    const cluster = fixture(`alias-${location}-foreign`);
    const refusal = await observeDependencyJob(cluster.request, cluster.call).then(
      () => 'resolved',
      (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)),
    );
    expect(refusal).toContain('serviceAccount alias');
    expect(cluster.calls.some((call) => call.includes('pods'))).toBe(location === 'pod');
  });
