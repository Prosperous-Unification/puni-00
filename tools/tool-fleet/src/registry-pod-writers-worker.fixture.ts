import * as filesystem from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { mock } from 'bun:test';

import * as capacity from './registry-capacity';
import * as cluster from './registry-maintenance-cluster';
import { registryClusterFixture } from './registry-maintenance-cluster.fixture';
import * as installation from './registry-maintenance-installation';
import type { RegistryMaintenanceJournal } from './registry-managed-journal';

const mode = type
  .enumerated(
    'alias',
    'unscheduled-alias',
    'ancestor-alias',
    'unrelated',
    'other-node',
    'missing',
    'unreadable',
    'relative',
    'malformed-node',
    'unresolved-claim',
    'ephemeral-claim',
    'other-node-ephemeral',
    'unscheduled-claim',
    'other-node-claim',
    'recovery-alias',
    'recovery-claim',
    'unreadable-store',
    'unreadable-ancestor',
  )
  .assert(process.argv.at(2));
const original = { ...filesystem };
const directory = await original.mkdtemp('/tmp/task8-pod-writer-');
const recovery = join(directory, 'recovery');
await original.mkdir(recovery, { mode: 0o700 });
const isRecovery = mode === 'recovery-alias' || mode === 'recovery-claim';
const storage = isRecovery ? await original.realpath('/proc/self') : join(directory, 'storage');
const alias = join(directory, 'alias');
if (!isRecovery) await original.mkdir(storage, { mode: 0o700 });
await original.symlink(
  isRecovery ? recovery : mode === 'ancestor-alias' ? directory : storage,
  alias,
);
const hostPath =
  mode === 'unrelated' || mode === 'unreadable-store' || mode === 'unreadable-ancestor'
    ? '/proc/version'
    : mode === 'other-node' || mode === 'other-node-claim' || mode === 'other-node-ephemeral'
      ? storage
      : mode === 'missing'
        ? join(directory, 'missing')
        : mode === 'relative'
          ? 'proc/version'
          : alias;
const pod = {
  metadata: { namespace: mode === 'recovery-claim' ? 'puni-registry' : 'other' },
  spec: {
    ...(mode === 'unscheduled-alias' || mode === 'unscheduled-claim'
      ? {}
      : {
          nodeName:
            mode === 'other-node' || mode === 'other-node-claim' || mode === 'other-node-ephemeral'
              ? 'different-node'
              : mode === 'malformed-node'
                ? null
                : 'h4claw',
        }),
    volumes: [
      mode === 'ephemeral-claim' || mode === 'other-node-ephemeral'
        ? {
            name: 'writer',
            ephemeral: {
              volumeClaimTemplate: {
                spec: {
                  accessModes: ['ReadWriteOnce'],
                  resources: { requests: { storage: '1Gi' } },
                },
              },
            },
          }
        : mode === 'recovery-claim' ||
            mode === 'unresolved-claim' ||
            mode === 'unscheduled-claim' ||
            mode === 'other-node-claim'
          ? {
              name: 'writer',
              persistentVolumeClaim: {
                claimName:
                  mode === 'recovery-claim' ? 'registry-recovery' : 'alternate-backing-unknown',
              },
            }
          : { name: 'writer', hostPath: { path: hostPath } },
    ],
  },
  status: { phase: 'Pending' },
};
const fixture = registryClusterFixture();
// Boundary: only the fixed installation fields consumed by the real stopped action are supplied; root-installed parsing and the actual mount/cluster adapters are modeled, not asserted operational here.
const installed: installation.RegistryMaintenanceInstallation = {
  ...fixture.installed,
  schemaVersion: 1,
  registryId: 'fixture',
  maintenanceOwner: 'operator',
  journalMaximumBytes: 32 * 1024 ** 2,
  distribution: { path: '/pinned/registry', sha256: 'b'.repeat(64) },
  ordinary: {
    ...fixture.installed.ordinary,
    path: storage,
    storageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    maximumBytes: 128 * 1024 ** 2,
    identityReceipt: '/receipts/registry',
  },
  recovery: isRecovery
    ? {
        ...fixture.installed.ordinary,
        path: recovery,
        state: 'enrolled',
        storageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        maximumBytes: 128 * 1024 ** 2,
        identityReceipt: '/receipts/recovery',
        pvc: { ...fixture.installed.ordinary.pvc, name: 'registry-recovery' },
        configuration: { path: '/pinned/recovery.yaml', sha256: 'c'.repeat(64) },
        deletionConfiguration: { path: '/pinned/recovery-delete.yaml', sha256: 'd'.repeat(64) },
        stagedJournalPath: '/var/lib/puni-registry/recovery/journal/contents',
        stagedJournalIdentityReceipt:
          '/var/lib/puni-registry/journal/identities/recovery-journal.receipt',
        stagedJournalStorageId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        stagedJournalMaximumBytes: 32 * 1024 ** 2,
      }
    : { state: 'unenrolled' },
};
const owners = installed.owners.map((owner) => ({
  name: owner.name,
  uid: owner.uid,
  cluster: 'management',
  source: 'fixture',
  path: '/fixture',
  specificationSha256: owner.specificationSha256,
  sourceRevision: 'revision',
  suspended: true,
  requestedAt: 'ack-' + owner.name,
}));
const acknowledgements = owners.map((owner) => ({
  name: owner.name,
  requestedAt: owner.requestedAt,
}));
const runtime = {
  operationId: 'owned',
  registryId: installed.registryId,
  prior: { owners, replicas: 1, withdrawn: false },
  sources: installed.sources.map((source) => ({
    name: source.resource.name,
    revision: source.revision,
    digest: source.digest,
  })),
  acknowledgements,
};
// Boundary: the real action reads only enrollment and its previously validated runtime receipt; the canonical supervisor/journal parser is outside this isolated filesystem/Pod-list case.
const journal = {
  enrollment: {
    registryId: installed.registryId,
    storageId: installed.ordinary.storageId,
    registryPath: storage,
    maximumBytes: installed.ordinary.maximumBytes,
    journalMaximumBytes: installed.journalMaximumBytes,
    rootPath: '/',
  },
  maintenanceEvidence: { runtime: JSON.stringify(runtime) },
} as unknown as RegistryMaintenanceJournal;
const permission = Object.assign(new Error('modeled host path stat denied'), { code: 'EACCES' });
let processAudits = 0,
  pathObservations = 0;
await mock.module('node:fs/promises', () => ({
  ...original,
  readFile(path: string) {
    if (path !== '/etc/machine-id') throw new Error('Unexpected modeled root file read');
    return Promise.resolve('a'.repeat(32) + '\n');
  },
  lstat(path: string) {
    if (![storage, installed.journalPath, '/'].includes(path))
      throw new Error('Unexpected modeled mount metadata');
    return Promise.resolve({
      uid: path === '/' ? 0 : 59001,
      dev: path === '/' ? 1 : path === storage ? 2 : 3,
    });
  },
  stat(path: string, options: { bigint: true }) {
    pathObservations++;
    if (
      (path === storage && mode === 'unreadable-store') ||
      (path === directory && mode === 'unreadable-ancestor')
    )
      return Promise.reject(permission);
    if (path === hostPath && mode === 'unreadable') return Promise.reject(permission);
    if (path === hostPath && mode === 'other-node')
      throw new Error('Other node path was sampled locally');
    return original.stat(path, options);
  },
}));
await mock.module('./registry-capacity', () => ({
  ...capacity,
  measureVerifiedFilesystem: (path: string) => {
    if (![storage, installed.journalPath].includes(path))
      throw new Error('Unexpected modeled mount');
    return Promise.resolve({
      identity: installed.ordinary.storageId,
      maximumBytes:
        path === storage ? installed.ordinary.maximumBytes : installed.journalMaximumBytes,
    });
  },
}));
await mock.module('./registry-maintenance-installation', () => ({
  ...installation,
  verifyRegistryHostArtifact: () => Promise.resolve(Buffer.from('modeled-pinned-binary')),
}));
await mock.module('./registry-maintenance-cluster', () => ({
  ...cluster,
  observeRegistryCluster: () =>
    Promise.resolve({
      replicas: 0,
      serviceSelector: cluster.withdrawnRegistrySelector,
      owners,
      acknowledgements,
    }),
}));
await mock.module('./registry-maintenance-kubernetes', () => ({
  createRegistryKubernetes: () =>
    Promise.resolve({
      read: () => Promise.reject(new Error('Unexpected modeled cluster read')),
      pods: () => Promise.resolve([pod]),
      endpoints: () => Promise.resolve([]),
    }),
}));
await mock.module('./registry-maintenance-writers', () => ({
  readRegistryWriters: () => {
    processAudits++;
    return Promise.resolve([]);
  },
}));
if (mode === 'relative') process.chdir('/');
let observation: unknown;
try {
  const { executeRegistryHostAction } = await import('./registry-maintenance-actions');
  const completion = await executeRegistryHostAction({
    installed,
    journal,
    request: {
      action: 'assert-stopped',
      operationId: 'owned',
      owner: 'operator',
      token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    },
    signal: new AbortController().signal,
    descriptor: 3,
    ready: () => Promise.reject(new Error('Unexpected readiness effect')),
  }).then(
    (value) => ({ state: 'returned' as const, value }),
    (cause: unknown) => ({ state: 'rejected' as const, cause }),
  );
  const cause = completion.state === 'rejected' ? completion.cause : undefined;
  observation = {
    state: completion.state,
    value: completion.state === 'returned' ? completion.value : null,
    message: cause instanceof Error ? cause.message : null,
    code:
      cause instanceof Error && 'code' in cause && typeof cause.code === 'string'
        ? cause.code
        : null,
    processAudits,
    pathObservations,
    scope:
      'actual stopped action/classifier with real host-path filesystem metadata; mount/cluster/API/process-census adapters modeled',
  };
} finally {
  await mock.module('node:fs/promises', () => original);
  await original.rm(directory, { recursive: true });
}
console.log(JSON.stringify(observation));
