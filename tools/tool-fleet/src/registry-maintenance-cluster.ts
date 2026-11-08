import { dirname } from 'node:path';

import { type } from 'arktype';

import type { RegistryFluxOwner } from './registry-maintenance-flux';
import {
  type RegistryMaintenanceInstallation,
  registryOwnerPaths,
} from './registry-maintenance-installation';
import {
  type RegistryResourcePin,
  verifyRegistryResource,
} from './registry-maintenance-observation';

const Fields = type('Record<string, unknown>');
const Selector = type('Record<string, string>');
const distributionImage =
  'docker.io/library/registry:2.8.3@sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278';
const controllerImage =
  'ghcr.io/fluxcd/kustomize-controller:v1.9.5@sha256:a3a955eb2bc432c2eaa94d2d3714e3beae7fdf17586fd23aadf71ab597ac3339';
export const withdrawnRegistrySelector = { 'puni-registry-maintenance': 'withdrawn' } as const;
export type RegistryClusterReader = (
  cluster: 'management' | 'production',
  pin: RegistryResourcePin,
) => Promise<unknown>;
export interface RegistryClusterObservation {
  owners: RegistryFluxOwner[];
  acknowledgements: { name: string; requestedAt: string | null }[];
  replicas: number;
  serviceSelector: Record<string, string>;
}

const sameSelector = (left: Record<string, string>, right: Record<string, string>) =>
  JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());

/**
 * Validate the complete installed ownership graph from fresh API objects, including both local
 * volumes and the controller that acknowledges suspension. Pins cover immutable specifications;
 * excluded mutable fields are accepted only in the modeled ordinary/withdrawn/stopped states.
 * This observation alone is not a stop receipt: the host also drains endpoints, pods and /proc.
 */
export async function observeRegistryCluster(
  installed: RegistryMaintenanceInstallation,
  storage: RegistryMaintenanceInstallation['ordinary'],
  read: RegistryClusterReader,
): Promise<RegistryClusterObservation> {
  const get = async (cluster: 'management' | 'production', pin: RegistryResourcePin) =>
    verifyRegistryResource(pin, await read(cluster, pin));
  const sources = new Map<string, { revision: string; digest: string }>();
  for (const source of installed.sources) {
    const observed = await get('management', source.resource);
    const status = type({
      artifact: { revision: 'string > 0', digest: /^sha256:[a-f0-9]{64}$/ },
    }).assert(observed.status);
    // Proof: source-artifact drift refuses even when its resource UID and immutable specification still match.
    if (status.artifact.revision !== source.revision || status.artifact.digest !== source.digest)
      throw new Error('Registry source artifact differs from installed pin');
    sources.set(source.resource.name, status.artifact);
  }
  const owners: RegistryFluxOwner[] = [];
  const acknowledgements: RegistryClusterObservation['acknowledgements'] = [];
  for (const [index, pin] of installed.owners.entries()) {
    const expected = registryOwnerPaths.at(index);
    const hasOwner = expected !== undefined;
    if (!hasOwner || expected.name !== pin.name) throw new Error('Incomplete registry owner graph');
    const observed = await get('management', pin);
    const spec = type({
      sourceRef: { kind: "'GitRepository'", name: 'string > 0' },
      path: 'string > 0',
      'suspend?': 'boolean',
    }).assert(observed.spec);
    const status = type({
      lastAppliedRevision: 'string > 0',
      'lastHandledReconcileAt?': 'string > 0',
    }).assert(observed.status);
    const source = sources.get(expected.source);
    const hasSource = source !== undefined;
    // Proof: owner-applied drift catches an unapplied source artifact before suspension can be trusted.
    if (
      spec.sourceRef.name !== expected.source ||
      spec.path !== expected.path ||
      !hasSource ||
      status.lastAppliedRevision !== source.revision
    )
      throw new Error('Registry owner source/path/applied artifact disagreement');
    owners.push({
      name: pin.name,
      uid: pin.uid,
      cluster: 'management',
      source: expected.source,
      path: expected.path,
      specificationSha256: pin.specificationSha256,
      sourceRevision: source.revision,
      suspended: spec.suspend === true,
      requestedAt: observed.metadata.annotations?.['reconcile.fluxcd.io/requestedAt'] ?? null,
    });
    // Missing first acknowledgement is modeled pending, never converted into a fresh token.
    acknowledgements.push({ name: pin.name, requestedAt: status.lastHandledReconcileAt ?? null });
  }
  if (owners.length !== 4 || sources.size !== 2)
    throw new Error('Incomplete registry owner/source graph');
  const controller = await get('management', installed.controller);
  const generation = type({ metadata: { generation: 'number.safe > 0' } }).assert(controller)
    .metadata.generation;
  const controllerStatus = type({
    observedGeneration: 'number.safe > 0',
    readyReplicas: 'number.safe > 0',
    availableReplicas: 'number.safe > 0',
  }).assert(controller.status);
  const controllerSpec = type({
    replicas: 'number.safe > 0',
    template: { spec: { containers: type({ name: 'string', image: 'string' }).array() } },
  }).assert(controller.spec);
  // Proof: controller-ready refusal requires actual current controller convergence, not only its image pin.
  if (
    controllerSpec.replicas !== 1 ||
    controllerStatus.observedGeneration !== generation ||
    controllerStatus.readyReplicas !== controllerSpec.replicas ||
    controllerStatus.availableReplicas !== controllerSpec.replicas ||
    !controllerSpec.template.spec.containers.some(
      (container) => container.name === 'manager' && container.image === controllerImage,
    )
  )
    throw new Error('Pinned Flux controller is not converged');
  const node = await get('production', installed.node);
  const nodeStatus = type({
    nodeInfo: { machineID: 'string > 0' },
    conditions: type({ type: 'string', status: 'string' }).array(),
  }).assert(node.status);
  // Proof: node-machine mutation refuses a ready node with the wrong host identity.
  if (
    nodeStatus.nodeInfo.machineID !== installed.machineId ||
    !nodeStatus.conditions.some(
      (condition) => condition.type === 'Ready' && condition.status === 'True',
    )
  )
    throw new Error('Registry node is not the ready installed machine');
  await observeRegistryVolume(installed, read, storage.pvc, storage.pv, storage.path);
  await observeRegistryVolume(
    installed,
    read,
    installed.journalPvc,
    installed.journalPv,
    dirname(installed.journalPath),
  );
  await get('production', storage.guard);
  const deployment = await get('production', storage.deployment);
  const spec = type({
    replicas: '0 | 1',
    template: {
      spec: {
        nodeSelector: Selector,
        containers: type({ name: 'string', image: 'string' }).array(),
        volumes: Fields.array(),
      },
    },
  }).assert(deployment.spec);
  const pod = spec.template.spec;
  const claim = (name: string) =>
    type({ persistentVolumeClaim: { claimName: 'string > 0', 'readOnly?': 'boolean' } }).assert(
      pod.volumes.find((volume) => volume['name'] === name),
    ).persistentVolumeClaim;
  const guard = type({ configMap: { name: 'string > 0' } }).assert(
    pod.volumes.find((volume) => volume['name'] === 'storage-guard'),
  ).configMap;
  if (
    pod.nodeSelector['kubernetes.io/hostname'] !== installed.node.name ||
    claim('storage').claimName !== storage.pvc.name ||
    claim('registry-journal').claimName !== installed.journalPvc.name ||
    claim('registry-journal').readOnly !== true ||
    guard.name !== storage.guard.name ||
    !pod.containers.some(
      (container) => container.name === 'registry' && container.image === distributionImage,
    )
  )
    throw new Error('Registry desired pod does not bind verified storage/runtime');
  const service = await get('production', installed.service);
  const selector = type({ selector: Selector }).assert(service.spec).selector;
  // Proof: arbitrary service-selector and replica mutations bypass immutable hashes but refuse here.
  if (
    !sameSelector(selector, installed.serviceSelector) &&
    !sameSelector(selector, withdrawnRegistrySelector)
  )
    throw new Error('Registry service selector is not an allowed maintenance state');
  return { owners, acknowledgements, replicas: spec.replicas, serviceSelector: selector };
}

export async function observeRegistryVolume(
  installed: Pick<RegistryMaintenanceInstallation, 'node'>,
  read: RegistryClusterReader,
  pvcPin: RegistryResourcePin,
  pvPin: RegistryResourcePin,
  path: string,
) {
  const get = async (_cluster: 'production', pin: RegistryResourcePin) =>
    verifyRegistryResource(pin, await read('production', pin));
  const pvc = await get('production', pvcPin);
  const pv = await get('production', pvPin);
  const claimSpec = type({ volumeName: 'string > 0' }).assert(pvc.spec);
  // Proof: pvc-bound and missing-journal faults prevent a complete storage observation.
  type({ phase: "'Bound'" }).assert(pvc.status);
  type({ phase: "'Bound'" }).assert(pv.status);
  const volumeSpec = type({
    local: { path: 'string > 0' },
    claimRef: { name: 'string', namespace: 'string', uid: 'string' },
    nodeAffinity: {
      required: {
        nodeSelectorTerms: type({
          matchExpressions: type({
            key: 'string',
            operator: 'string',
            values: 'string[]',
          }).array(),
        }).array(),
      },
    },
  }).assert(pv.spec);
  const terms = volumeSpec.nodeAffinity.required.nodeSelectorTerms;
  if (
    claimSpec.volumeName !== pvPin.name ||
    volumeSpec.local.path !== path ||
    volumeSpec.claimRef.name !== pvcPin.name ||
    volumeSpec.claimRef.namespace !== pvcPin.namespace ||
    volumeSpec.claimRef.uid !== pvcPin.uid ||
    terms.length !== 1 ||
    terms[0]?.matchExpressions.length !== 1 ||
    terms[0].matchExpressions[0]?.key !== 'kubernetes.io/hostname' ||
    terms[0].matchExpressions[0].operator !== 'In' ||
    JSON.stringify(terms[0].matchExpressions[0].values) !== JSON.stringify([installed.node.name])
  )
    throw new Error('Registry local volume binding differs from installed storage');
}

/** Kubernetes omits zero replica counters while a stopped deployment has no pods; a running deployment needs exact fresh generation and availability. */
export function registryDeploymentReady(input: unknown, replicas: 0 | 1): boolean {
  const observed = type({
    metadata: { generation: 'number.safe > 0' },
    status: {
      'observedGeneration?': 'number.safe > 0',
      'readyReplicas?': 'number.safe >= 0',
      'availableReplicas?': 'number.safe >= 0',
    },
  }).assert(input);
  // Proof: stale generation and unavailable current generation both remain pending in the restoration test.
  return (
    observed.status.observedGeneration === observed.metadata.generation &&
    (observed.status.readyReplicas ?? 0) === replicas &&
    (observed.status.availableReplicas ?? 0) === replicas
  );
}
