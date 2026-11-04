import { createHash, randomUUID } from 'node:crypto';
import { chmod, chown, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { type } from 'arktype';

import { measureVerifiedFilesystem } from './registry-capacity';
import type { RegistryConsumer } from './registry-journal';
import { registryClusterFixture } from './registry-maintenance-cluster.fixture';
import { parseRegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { registrySpecificationSha256 } from './registry-maintenance-observation';
import { parseReaderConfiguration, verifyDockerSourceCoverage } from './registry-reader';

const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const home = '/root/task8-fixture';
const registryPath = '/var/lib/puni-registry/registry/contents';
const journalPath = '/var/lib/puni-registry/journal/contents';
const recoveryPath = '/var/lib/puni-registry/recovery/registry/contents';
const receipt = (name: string) => `/var/lib/puni-registry/journal/identities/${name}.receipt`;

/**
 * Root-only setup inside the reviewed disposable namespace. Kubernetes/consumer observations
 * and local provider admission are synthetic; physical mounts, installed path/hash selection,
 * privilege transport and native Distribution/restic effects remain production implementations.
 */
export async function prepareRegistryHostFixture() {
  if (
    process.getuid?.() !== 0 ||
    process.pid !== 1 ||
    (await readFile('/etc/task8-namespace', 'utf8')) !== 'owned-private-proof\n'
  )
    throw new Error('Host fixture requires its owned chroot PID1');
  const put = async (path: string, bytes: string, mode = 0o644) => {
    await mkdir(dirname(path), { recursive: true, mode: 0o755 });
    await writeFile(path, bytes, { flag: 'wx', mode });
    await chmod(path, mode);
    return { path, sha256: hash(bytes) };
  };
  const artifact = async (path: string) => ({ path, sha256: hash(await readFile(path)) });
  const cluster = registryClusterFixture();
  // Boundary: each observed native volume remains required even when unchecked tuple-index typing assumes all four exist.
  const measured: (Awaited<ReturnType<typeof measureVerifiedFilesystem>> | undefined)[] =
    await Promise.all([
      measureVerifiedFilesystem(registryPath, receipt('registry')),
      measureVerifiedFilesystem(journalPath, receipt('journal')),
      measureVerifiedFilesystem(recoveryPath, receipt('recovery-registry')),
      measureVerifiedFilesystem(
        '/var/lib/puni-registry/recovery/journal/contents',
        receipt('recovery-journal'),
      ),
    ]);
  const [ordinary, canonical, recovery, staged] = measured;
  if (
    ordinary === undefined ||
    canonical === undefined ||
    recovery === undefined ||
    staged === undefined
  )
    throw new Error('Missing actual fixture volume');
  const configuration = (path: string, deletion: boolean) =>
    JSON.stringify({
      version: 0.1,
      log: { level: 'error' },
      storage: {
        filesystem: { rootdirectory: path },
        delete: { enabled: deletion },
        maintenance: { readonly: { enabled: !deletion }, uploadpurging: { enabled: false } },
      },
      http: { addr: '127.0.0.1:5051' },
      auth: {
        htpasswd: {
          realm: 'puni-registry-maintenance',
          path: '/run/puni-registry-maintenance/auth.htpasswd',
        },
      },
    });
  const readonlyConfiguration = await put(
    '/etc/puni/registry-maintenance-readonly.yaml',
    configuration(registryPath, false),
  );
  const deletionConfiguration = await put(
    '/etc/puni/registry-maintenance-deletion.yaml',
    configuration(registryPath, true),
  );
  const recoveryConfiguration = await put(
    '/etc/puni/registry-maintenance-recovery.yaml',
    configuration(recoveryPath, false),
  );
  const recoveryDeletion = await put(
    '/etc/puni/registry-maintenance-recovery-deletion.yaml',
    configuration(recoveryPath, true),
  );
  const managementKubeconfig = await put(
    '/etc/puni/registry-maintenance-management.kubeconfig',
    'synthetic-management',
    0o600,
  );
  const productionKubeconfig = await put(
    '/etc/puni/registry-maintenance-production.kubeconfig',
    'synthetic-production',
    0o600,
  );
  const kubernetes = await put(
    '/usr/local/bin/k3s',
    '#!/bin/sh\nexec /usr/local/libexec/puni-registry-authority/bun /usr/local/libexec/puni-registry-maintenance/api.js "$@"\n',
    0o755,
  );
  await mkdir('/root/.puni/registry', { recursive: true, mode: 0o700 });
  const password = await put('/root/.puni/registry/restic.password', randomUUID(), 0o600);
  const initialized = Bun.spawnSync(
    ['/root/.puni/tools/restic-0.19.1', 'init', '--repo', home + '/repository'],
    {
      env: { PATH: '/usr/bin:/bin', LANG: 'C', RESTIC_PASSWORD_FILE: password.path },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  if (initialized.exitCode !== 0)
    throw new Error('Owned local fixture provider initialization failed');
  const inspectedRepository = Bun.spawnSync(
    ['/root/.puni/tools/restic-0.19.1', '--no-cache', '--no-lock', 'cat', 'config'],
    {
      env: {
        PATH: '/usr/bin:/bin',
        RESTIC_PASSWORD_FILE: password.path,
        RESTIC_REPOSITORY: home + '/repository',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  if (inspectedRepository.exitCode !== 0)
    throw new Error('Owned fixture repository identity unavailable');
  const repositoryId = type({ id: /^[a-f0-9]{64}$/ }).assert(
    JSON.parse(inspectedRepository.stdout.toString()),
  ).id;
  const backupConfiguration = await put(
    '/root/.puni/registry/backup.json',
    JSON.stringify({
      repositoryId,
      recoveryPins: [],
      sourceLimits: {
        registry: {
          maximumLogicalBytes: 1125899906842624,
          maximumEntries: 1000000,
          maximumDepth: 128,
          maximumMetadataBytes: 268435456,
          maximumFanout: 1000000,
        },
        journal: {
          maximumLogicalBytes: 1125899906842624,
          maximumEntries: 1000000,
          maximumDepth: 128,
          maximumMetadataBytes: 268435456,
          maximumFanout: 1000000,
        },
      },
      binary: await artifact('/root/.puni/tools/restic-0.19.1'),
      password,
      environment: { RESTIC_REPOSITORY: home + '/repository' },
    }),
    0o600,
  );
  const volume = (kind: 'PersistentVolume' | 'PersistentVolumeClaim') => {
    const source = cluster.resources.get(kind + '/registry-bounded');
    if (source?.spec === undefined) throw new Error('Missing fixture volume template');
    const cloned = structuredClone(source);
    cloned.metadata.name = 'registry-recovery';
    cloned.metadata.uid = 'registry-recovery';
    if (kind === 'PersistentVolumeClaim') cloned.spec = { volumeName: 'registry-recovery' };
    else
      cloned.spec = {
        ...source.spec,
        local: { path: recoveryPath },
        claimRef: {
          name: 'registry-recovery',
          namespace: 'puni-registry',
          uid: 'registry-recovery',
        },
      };
    cluster.resources.set(kind + '/registry-recovery', cloned);
    return {
      apiVersion: cloned.apiVersion,
      kind,
      name: cloned.metadata.name,
      namespace: cloned.metadata.namespace ?? null,
      uid: cloned.metadata.uid,
      owner: null,
      specificationSha256: registrySpecificationSha256(kind, cloned.spec),
    };
  };
  const recoveryPvc = volume('PersistentVolumeClaim');
  const recoveryPv = volume('PersistentVolume');
  const deployment = cluster.resources.get('Deployment/registry');
  const guard = cluster.resources.get('ConfigMap/registry-storage-guard');
  if (deployment === undefined || guard === undefined)
    throw new Error('Missing fixture deployment/guard');
  const nextDeployment = structuredClone(deployment);
  const nextSpecification = type({
    template: {
      spec: {
        volumes: type({
          name: 'string',
          'persistentVolumeClaim?': { claimName: 'string', 'readOnly?': 'boolean' },
        }).array(),
      },
    },
  }).assert(nextDeployment.spec);
  const storageVolume = nextSpecification.template.spec.volumes.find(
    (volume) => volume.name === 'storage',
  );
  if (storageVolume?.persistentVolumeClaim?.claimName !== 'registry-bounded')
    throw new Error('Missing fixture storage claim');
  storageVolume.persistentVolumeClaim.claimName = 'registry-recovery';
  nextDeployment.spec = nextSpecification;
  const nextGuard = { ...structuredClone(guard), data: { 'startup.sh': 'pinned recovery guard' } };
  const installed = parseRegistryMaintenanceInstallation({
    ...cluster.installed,
    schemaVersion: 1,
    registryId: 'native-host',
    maintenanceOwner: 'operator',
    journalIdentityReceipt: receipt('journal'),
    journalMaximumBytes: canonical.maximumBytes,
    kubernetes,
    managementKubeconfig,
    productionKubeconfig,
    distribution: await artifact('/usr/local/libexec/puni-registry-maintenance/registry'),
    readonlyConfiguration,
    deletionConfiguration,
    backupConfiguration,
    backupWorker: await artifact('/usr/local/libexec/puni-registry-maintenance/backup-worker.js'),
    ordinary: {
      ...cluster.installed.ordinary,
      identityReceipt: receipt('registry'),
      storageId: ordinary.identity,
      maximumBytes: ordinary.maximumBytes,
    },
    recovery: {
      ...cluster.installed.ordinary,
      state: 'enrolled',
      path: recoveryPath,
      identityReceipt: receipt('recovery-registry'),
      storageId: recovery.identity,
      maximumBytes: recovery.maximumBytes,
      pvc: recoveryPvc,
      pv: recoveryPv,
      deployment: {
        ...cluster.installed.ordinary.deployment,
        specificationSha256: registrySpecificationSha256('Deployment', nextDeployment.spec),
      },
      guard: {
        ...cluster.installed.ordinary.guard,
        specificationSha256: registrySpecificationSha256('ConfigMap', nextGuard.data),
      },
      configuration: recoveryConfiguration,
      deletionConfiguration: recoveryDeletion,
      stagedJournalPath: '/var/lib/puni-registry/recovery/journal/contents',
      stagedJournalIdentityReceipt: receipt('recovery-journal'),
      stagedJournalStorageId: staged.identity,
      stagedJournalMaximumBytes: staged.maximumBytes,
    },
  });
  await put('/etc/puni/registry-maintenance.json', JSON.stringify(installed));
  await put(
    home + '/kubernetes.json',
    JSON.stringify({
      resources: [...cluster.resources.values()].map((resource) => ({
        ...resource,
        metadata: { ...resource.metadata, resourceVersion: '1' },
      })),
    }),
    0o600,
  );
  await put(
    home + '/activation.json',
    JSON.stringify({ deployment: nextDeployment, guard: nextGuard }),
    0o600,
  );
  const reader = await put(
    '/usr/local/libexec/puni-registry-maintenance/consumer.js',
    `const request = JSON.parse(await Bun.stdin.text()); console.log(JSON.stringify({ protocol: request.protocol, registryId: request.registryId, id: request.id, source: request.source, revision: request.revision, role: request.role, sourceRevision: 'synthetic-native-host', references: [] }));\n`,
  );
  const readerPath = '/etc/puni/registry-fixture-reader.json';
  const syntheticDocker = await put(
    '/usr/local/libexec/puni-registry-maintenance/synthetic-docker',
    '#!/bin/sh\nexit 65\n',
    0o755,
  );
  const syntheticCatalog = await put(
    '/etc/puni/registry-fixture-catalog.json',
    JSON.stringify({ fixture: 'synthetic-consumer-observation; not installed Docker evidence' }),
  );
  const readerConfiguration = {
    schemaVersion: 1,
    protocol: 'registry-consumer/2',
    registryId: installed.registryId,
    id: 'fixture-host',
    kind: 'docker-host',
    source: readerPath,
    role: 'consumer',
    artifact: reader,
    input: {
      registryId: installed.registryId,
      registryUrl: 'http://127.0.0.1:5051',
      docker: syntheticDocker,
      host: { machineId: installed.machineId, catalog: syntheticCatalog },
    },
  };
  const readerArtifact = await put(readerPath, JSON.stringify(readerConfiguration));
  const consumer: RegistryConsumer = {
    id: 'fixture-host',
    owner: 'operator',
    environment: null,
    kind: 'docker-host',
    source: readerPath,
    role: 'consumer',
    configurationSha256: readerArtifact.sha256,
  };
  verifyDockerSourceCoverage(
    [consumer],
    new Map([[consumer.id, parseReaderConfiguration(readerConfiguration)]]),
    installed.registryId,
  );
  await put(
    '/etc/puni/registry-consumers.json',
    JSON.stringify({ schemaVersion: 1, registryId: installed.registryId, sources: [consumer] }),
  );
  await mkdir('/run/puni-registry-maintenance', { mode: 0o750 });
  await chown('/run/puni-registry-maintenance', 0, 59001);
  await chmod('/run/puni-registry-maintenance', 0o750);
  return { installed, consumer };
}
