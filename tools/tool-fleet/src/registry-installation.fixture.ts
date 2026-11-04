export function createRegistryInstallation() {
  const pinResource = (kind: string, name: string, namespace: string | null) => ({
    apiVersion:
      kind === 'Kustomization'
        ? 'kustomize.toolkit.fluxcd.io/v1'
        : kind === 'GitRepository'
          ? 'source.toolkit.fluxcd.io/v1'
          : kind === 'Deployment'
            ? 'apps/v1'
            : 'v1',
    kind,
    name,
    namespace,
    uid: 'fixture-' + name,
    owner: null,
    specificationSha256: 'a'.repeat(64),
  });
  const pinArtifact = (path: string) => ({ path, sha256: 'a'.repeat(64) });
  return {
    schemaVersion: 1,
    registryId: 'fixture',
    maintenanceOwner: 'registry-maintenance',
    journalPath: '/var/lib/puni-registry/journal/contents',
    journalIdentityReceipt: '/var/lib/puni-registry/journal/identities/journal.receipt',
    journalMaximumBytes: 1024 ** 3,
    journalPvc: pinResource('PersistentVolumeClaim', 'registry-journal', 'puni-registry'),
    journalPv: pinResource('PersistentVolume', 'registry-journal', null),
    machineId: 'a'.repeat(32),
    node: pinResource('Node', 'fixture', null),
    controller: pinResource('Deployment', 'kustomize-controller', 'flux-system'),
    service: pinResource('Service', 'registry', 'puni-registry'),
    serviceSelector: { 'app.kubernetes.io/name': 'registry' },
    kubernetes: pinArtifact('/usr/local/bin/k3s'),
    managementKubeconfig: pinArtifact('/etc/puni/registry-maintenance-management.kubeconfig'),
    productionKubeconfig: pinArtifact('/etc/puni/registry-maintenance-production.kubeconfig'),
    distribution: {
      ...pinArtifact('/usr/local/libexec/puni-registry-maintenance/registry'),
      sha256: '8be11cd37a7d43b87e2a2ad11eb5d14dc64d15a040a37485e7e1cbb4c6c9dd37',
    },
    backupConfiguration: pinArtifact('/root/.puni/registry/backup.json'),
    backupWorker: pinArtifact('/usr/local/libexec/puni-registry-maintenance/backup-worker.js'),
    readonlyConfiguration: pinArtifact('/etc/puni/registry-maintenance-readonly.yaml'),
    deletionConfiguration: pinArtifact('/etc/puni/registry-maintenance-deletion.yaml'),
    owners: ['puni-cluster', 'fleet-helsinki', 'registry-storage', 'platform'].map((name) =>
      pinResource('Kustomization', name, 'flux-system'),
    ),
    sources: ['puni-platform', 'puni-fleet'].map((name) => ({
      resource: pinResource('GitRepository', name, 'flux-system'),
      revision: 'fixture-revision',
      digest: 'sha256:' + 'a'.repeat(64),
    })),
    ordinary: {
      path: '/var/lib/puni-registry/registry/contents',
      identityReceipt: '/var/lib/puni-registry/journal/identities/registry.receipt',
      storageId: '00000000-0000-4000-8000-000000000001',
      maximumBytes: 50 * 1024 ** 3,
      pvc: pinResource('PersistentVolumeClaim', 'registry-bounded', 'puni-registry'),
      pv: pinResource('PersistentVolume', 'registry', null),
      guard: pinResource('ConfigMap', 'registry-storage-guard', 'puni-registry'),
      deployment: pinResource('Deployment', 'registry', 'puni-registry'),
    },
    recovery: { state: 'unenrolled' } as const,
  };
}
