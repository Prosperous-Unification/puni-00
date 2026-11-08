import { invokeRegistryCallback } from './registry-callback';
import {
  type RegistryMaintenanceInstallation,
  registryOwnerPaths,
} from './registry-maintenance-installation';
import {
  type RegistryResourcePin,
  registrySpecificationSha256,
} from './registry-maintenance-observation';
/** Synthetic resource observations shared by scoped parser checks and the isolated native host fixture; never actual controller evidence. */
export function registryClusterFixture() {
  const resources = new Map<
    string,
    {
      apiVersion: string;
      kind: string;
      metadata: {
        name: string;
        namespace?: string;
        uid: string;
        generation: number;
      };
      spec?: Record<string, unknown>;
      status?: Record<string, unknown>;
      data?: Record<string, unknown>;
    }
  >();
  const pin = (
    kind: string,
    name: string,
    spec: Record<string, unknown>,
    status: Record<string, unknown> = {},
  ) => {
    const resource = {
      apiVersion:
        kind === 'Deployment'
          ? 'apps/v1'
          : kind === 'Kustomization'
            ? 'kustomize.toolkit.fluxcd.io/v1'
            : kind === 'GitRepository'
              ? 'source.toolkit.fluxcd.io/v1'
              : 'v1',
      kind,
      metadata: {
        name,
        uid: name,
        generation: 1,
        ...(['Node', 'PersistentVolume'].includes(kind)
          ? {}
          : {
              namespace:
                ['Kustomization', 'GitRepository'].includes(kind) || name === 'kustomize-controller'
                  ? 'flux-system'
                  : 'puni-registry',
            }),
      },
      ...(kind === 'ConfigMap' ? { data: spec } : { spec }),
      status,
    };
    resources.set(`${kind}/${name}`, resource);
    return {
      apiVersion: resource.apiVersion,
      kind,
      name,
      namespace: resource.metadata.namespace ?? null,
      uid: name,
      owner: null,
      specificationSha256: registrySpecificationSha256(kind, spec),
    } satisfies RegistryResourcePin;
  };
  const source = (name: string) => ({
    resource: pin(
      'GitRepository',
      name,
      {},
      { artifact: { revision: 'revision', digest: 'sha256:' + 'a'.repeat(64) } },
    ),
    revision: 'revision',
    digest: 'sha256:' + 'a'.repeat(64),
  });
  const sources = [source('puni-platform'), source('puni-fleet')];
  const owners = registryOwnerPaths.map((owner) =>
    pin(
      'Kustomization',
      owner.name,
      {
        sourceRef: { kind: 'GitRepository', name: owner.source },
        path: owner.path,
        suspend: false,
      },
      { lastAppliedRevision: 'revision' },
    ),
  );
  const volumes = (name: string, path: string) => ({
    pvc: pin('PersistentVolumeClaim', name, { volumeName: name }, { phase: 'Bound' }),
    pv: pin(
      'PersistentVolume',
      name,
      {
        local: { path },
        claimRef: { name, namespace: 'puni-registry', uid: name },
        nodeAffinity: {
          required: {
            nodeSelectorTerms: [
              {
                matchExpressions: [
                  { key: 'kubernetes.io/hostname', operator: 'In', values: ['h4claw'] },
                ],
              },
            ],
          },
        },
      },
      { phase: 'Bound' },
    ),
  });
  const ordinaryVolumes = volumes('registry-bounded', '/var/lib/puni-registry/registry/contents');
  const journal = volumes('registry-journal', '/var/lib/puni-registry/journal');
  const guard = pin('ConfigMap', 'registry-storage-guard', { 'startup.sh': 'pinned guard' });
  const deployment = pin('Deployment', 'registry', {
    replicas: 1,
    template: {
      spec: {
        nodeSelector: { 'kubernetes.io/hostname': 'h4claw' },
        containers: [
          {
            name: 'registry',
            image:
              'docker.io/library/registry:2.8.3@sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
          },
        ],
        volumes: [
          { name: 'storage', persistentVolumeClaim: { claimName: 'registry-bounded' } },
          {
            name: 'registry-journal',
            persistentVolumeClaim: { claimName: 'registry-journal', readOnly: true },
          },
          { name: 'storage-guard', configMap: { name: 'registry-storage-guard' } },
        ],
      },
    },
  });
  const controller = pin(
    'Deployment',
    'kustomize-controller',
    {
      replicas: 1,
      template: {
        spec: {
          containers: [
            {
              name: 'manager',
              image:
                'ghcr.io/fluxcd/kustomize-controller:v1.9.5@sha256:a3a955eb2bc432c2eaa94d2d3714e3beae7fdf17586fd23aadf71ab597ac3339',
            },
          ],
        },
      },
    },
    { observedGeneration: 1, readyReplicas: 1, availableReplicas: 1 },
  );
  const node = pin(
    'Node',
    'h4claw',
    {},
    { nodeInfo: { machineID: 'a'.repeat(32) }, conditions: [{ type: 'Ready', status: 'True' }] },
  );
  const serviceSelector = { 'app.kubernetes.io/name': 'registry' };
  const service = pin('Service', 'registry', { selector: serviceSelector });
  // Fixture only: the cluster observer consumes these fields; root installation validation owns the other artifact/path fields.
  const installed = {
    sources,
    owners,
    controller,
    node,
    service,
    serviceSelector,
    machineId: 'a'.repeat(32),
    journalPvc: journal.pvc,
    journalPv: journal.pv,
    journalPath: '/var/lib/puni-registry/journal/contents',
    ordinary: {
      ...ordinaryVolumes,
      guard,
      deployment,
      path: '/var/lib/puni-registry/registry/contents',
    },
  } as unknown as RegistryMaintenanceInstallation;
  const read = (_cluster: 'management' | 'production', selected: RegistryResourcePin) =>
    invokeRegistryCallback(() => {
      const resource = resources.get(`${selected.kind}/${selected.name}`);
      if (resource === undefined) throw new Error('Missing fixture resource');
      return resource;
    });
  return { installed, read, resources };
}
