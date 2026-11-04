import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { type } from 'arktype';

import { readTrustedEnrollment } from './registry-enrollment';
import { RegistryMaintenanceRefusal } from './registry-maintenance-failure';
import { RegistryResourcePin } from './registry-maintenance-observation';

const Path = type('0 < string <= 256').narrow(isAbsolute);
const Hash = type(/^[a-f0-9]{64}$/);
const Artifact = type({ path: Path, sha256: Hash, '+': 'reject' });
/** Explicit client worker installation; absence in legacy manifests grants no client action. */
export const RegistryClientInstallation = type({
  state: "'enrolled'",
  worker: Artifact.merge({
    path: "'/usr/local/libexec/puni-registry-maintenance/client-worker.js'",
  }),
  scope: Artifact.merge({ path: "'/usr/bin/systemd-run'" }),
  control: Artifact.merge({ path: "'/usr/bin/systemctl'" }),
  mount: Artifact.merge({ path: "'/usr/bin/mount'" }),
  ip: Artifact.merge({ path: "'/usr/bin/ip'" }),
  scratch: {
    path: "'/var/lib/puni-registry/pulls/contents'",
    receiptPath: "'/var/lib/puni-registry/journal/identities/pulls.receipt'",
    storageId: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
    maximumBytes: 'number.safe > 0',
    maximumInodes: 'number.safe > 0',
    '+': 'reject',
  },
  '+': 'reject',
}).or({ state: "'unenrolled'", '+': 'reject' });
export type RegistryClientInstallation = typeof RegistryClientInstallation.infer;

const Storage = type({
  path: Path,
  identityReceipt: Path,
  storageId: /^[a-f0-9-]{36}$/,
  maximumBytes: 'number.safe > 0',
  pvc: RegistryResourcePin,
  pv: RegistryResourcePin,
  guard: RegistryResourcePin,
  deployment: RegistryResourcePin,
  '+': 'reject',
});
export const RegistryMaintenanceInstallation = type({
  schemaVersion: '1',
  registryId: '0 < string <= 256',
  maintenanceOwner: '0 < string <= 256',
  'client?': RegistryClientInstallation,
  journalPath: "'/var/lib/puni-registry/journal/contents'",
  journalIdentityReceipt: "'/var/lib/puni-registry/journal/identities/journal.receipt'",
  journalMaximumBytes: 'number.safe > 0',
  journalPvc: RegistryResourcePin,
  journalPv: RegistryResourcePin,
  machineId: /^[a-f0-9]{32}$/,
  node: RegistryResourcePin,
  controller: RegistryResourcePin,
  service: RegistryResourcePin,
  serviceSelector: 'Record<string, string>',
  kubernetes: Artifact,
  managementKubeconfig: Artifact,
  productionKubeconfig: Artifact,
  distribution: Artifact,
  readonlyConfiguration: Artifact,
  deletionConfiguration: Artifact,
  backupConfiguration: Artifact,
  backupWorker: Artifact,
  owners: RegistryResourcePin.array().atLeastLength(4).atMostLength(4),
  sources: type({
    resource: RegistryResourcePin,
    revision: '0 < string <= 1024',
    digest: /^sha256:[a-f0-9]{64}$/,
    '+': 'reject',
  })
    .array()
    .atLeastLength(2)
    .atMostLength(2),
  ordinary: Storage,
  recovery: Storage.merge({
    configuration: Artifact,
    deletionConfiguration: Artifact,
    state: "'enrolled'",
    stagedJournalPath: "'/var/lib/puni-registry/recovery/journal/contents'",
    stagedJournalIdentityReceipt:
      "'/var/lib/puni-registry/journal/identities/recovery-journal.receipt'",
    stagedJournalStorageId: /^[a-f0-9-]{36}$/,
    stagedJournalMaximumBytes: 'number.safe > 0',
  }).or({ state: "'unenrolled'", '+': 'reject' }),
  '+': 'reject',
});
export type RegistryMaintenanceInstallation = typeof RegistryMaintenanceInstallation.infer;
export const registryOwnerPaths = [
  { name: 'puni-cluster', source: 'puni-platform', path: './infra/clusters/platform/production' },
  { name: 'fleet-helsinki', source: 'puni-fleet', path: './clusters/helsinki' },
  { name: 'registry-storage', source: 'puni-fleet', path: './infrastructure/registry-storage' },
  { name: 'platform', source: 'puni-platform', path: './infra/platform/registry/production' },
] as const;

/** Server-owned fixed installation. Cold recovery targets are explicitly unenrolled until real resources exist; ordinary work never requires a second allocated store. */
export function parseRegistryMaintenanceInstallation(
  input: unknown,
): RegistryMaintenanceInstallation {
  const installed = RegistryMaintenanceInstallation.assert(input);
  if (
    JSON.stringify(installed.owners.map((owner) => owner.name)) !==
      JSON.stringify(registryOwnerPaths.map((owner) => owner.name)) ||
    installed.owners.some(
      (owner) =>
        owner.kind !== 'Kustomization' ||
        owner.apiVersion !== 'kustomize.toolkit.fluxcd.io/v1' ||
        owner.namespace !== 'flux-system',
    ) ||
    JSON.stringify(installed.sources.map((source) => source.resource.name).sort()) !==
      JSON.stringify(['puni-fleet', 'puni-platform']) ||
    installed.sources.some(
      (source) =>
        source.resource.kind !== 'GitRepository' || source.resource.namespace !== 'flux-system',
    ) ||
    installed.service.name !== 'registry' ||
    installed.service.namespace !== 'puni-registry' ||
    installed.controller.name !== 'kustomize-controller' ||
    installed.controller.namespace !== 'flux-system'
  )
    throw new Error('Incomplete fixed registry ownership installation');
  if (
    installed.ordinary.path !== '/var/lib/puni-registry/registry/contents' ||
    (installed.recovery.state === 'enrolled' &&
      installed.recovery.path !== '/var/lib/puni-registry/recovery/registry/contents') ||
    installed.ordinary.pvc.name !== 'registry-bounded' ||
    installed.journalPvc.name !== 'registry-journal' ||
    installed.journalPvc.kind !== 'PersistentVolumeClaim' ||
    installed.journalPvc.namespace !== 'puni-registry' ||
    installed.journalPv.name !== 'registry-journal' ||
    installed.journalPv.kind !== 'PersistentVolume' ||
    installed.journalPv.namespace !== null ||
    (installed.recovery.state === 'enrolled' &&
      installed.recovery.pvc.name !== 'registry-recovery') ||
    [
      installed.ordinary,
      ...(installed.recovery.state === 'enrolled' ? [installed.recovery] : []),
    ].some(
      (storage) =>
        storage.deployment.name !== 'registry' ||
        storage.deployment.namespace !== 'puni-registry' ||
        storage.pvc.kind !== 'PersistentVolumeClaim' ||
        storage.pvc.namespace !== 'puni-registry' ||
        storage.pv.kind !== 'PersistentVolume' ||
        storage.guard.name !== 'registry-storage-guard' ||
        storage.guard.namespace !== 'puni-registry',
    ) ||
    installed.distribution.sha256 !==
      '8be11cd37a7d43b87e2a2ad11eb5d14dc64d15a040a37485e7e1cbb4c6c9dd37'
  )
    throw new Error('Registry installation differs from fixed storage/runtime contract');
  const fixedArtifacts = {
    backupConfiguration: '/root/.puni/registry/backup.json',
    backupWorker: '/usr/local/libexec/puni-registry-maintenance/backup-worker.js',
    kubernetes: '/usr/local/bin/k3s',
    distribution: '/usr/local/libexec/puni-registry-maintenance/registry',
    managementKubeconfig: '/etc/puni/registry-maintenance-management.kubeconfig',
    productionKubeconfig: '/etc/puni/registry-maintenance-production.kubeconfig',
    readonlyConfiguration: '/etc/puni/registry-maintenance-readonly.yaml',
    deletionConfiguration: '/etc/puni/registry-maintenance-deletion.yaml',
  } as const;
  for (const name of Object.keys(fixedArtifacts)) {
    // The fixed keys above are the complete installed artifact union; no JSON key becomes an executable selector.
    const key = name as keyof typeof fixedArtifacts;
    if (installed[key].path !== fixedArtifacts[key])
      throw new Error('Registry host artifact path differs from fixed installation');
  }
  if (
    installed.recovery.state === 'enrolled' &&
    (installed.recovery.configuration.path !== '/etc/puni/registry-maintenance-recovery.yaml' ||
      installed.recovery.deletionConfiguration.path !==
        '/etc/puni/registry-maintenance-recovery-deletion.yaml')
  )
    throw new Error('Recovery artifact path differs from fixed installation');
  return installed;
}

/** Load only the root-owned fixed server enrollment; callers cannot choose its path. */
export async function readRegistryMaintenanceInstallation(): Promise<RegistryMaintenanceInstallation> {
  return parseRegistryMaintenanceInstallation(
    await readTrustedEnrollment('/etc/puni/registry-maintenance.json'),
  );
}

/** Hash from the same root-owned no-follow descriptor whose metadata was checked; verified bytes stay inside the trusted caller; helpers never serialize credentials or diagnostics. Client installation may additionally require exact mode and root group on that same descriptor. */
export async function verifyRegistryHostArtifact(
  artifact: typeof Artifact.infer,
  secret = false,
  expectedMode?: number,
): Promise<Buffer> {
  if ((await realpath(artifact.path)) !== artifact.path)
    throw new Error('Host artifact path is not canonical');
  const descriptor = await open(
    artifact.path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const status = await descriptor.stat();
    // Proof: removing the UID check admitted the invoking-user artifact despite its matching pinned hash.
    // Proof: removing expectedMode admits the real-file wrong-mode negative; native worker group drift also refuses.
    if (
      !status.isFile() ||
      status.uid !== 0 ||
      status.nlink !== 1 ||
      (status.mode & 0o022) !== 0 ||
      (secret && (status.mode & 0o077) !== 0) ||
      (expectedMode !== undefined &&
        ((status.mode & 0o7777) !== expectedMode || status.gid !== 0)) ||
      status.size > 256 * 1024 ** 2
    )
      throw new Error('Untrusted fixed registry host artifact');
    const bytes = await descriptor.readFile();
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== artifact.sha256)
      throw new Error('Fixed registry host artifact differs from pin');
    return bytes;
  } finally {
    await descriptor.close();
  }
}

/** Unenrolled is a visible operator state, never an invented future identity or permission to extract. */
export function requireRegistryRecoveryInstallation(installed: RegistryMaintenanceInstallation) {
  if (installed.recovery.state === 'unenrolled')
    throw new RegistryMaintenanceRefusal('recovery-target-unenrolled');
  return installed.recovery;
}

/** New client effects require explicit enrollment even when an old installation remains readable. */
export function requireRegistryClientInstallation(
  installed: RegistryMaintenanceInstallation,
): Extract<RegistryClientInstallation, { state: 'enrolled' }> {
  const client = installed.client;
  if (client?.state !== 'enrolled') throw new Error('Registry client worker is not enrolled');
  return client;
}
