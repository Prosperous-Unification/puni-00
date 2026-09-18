import type { Fleet } from '../contracts';
import {
  digestObservation,
  type FleetObservation,
  type FleetObservationBody,
} from '../observation';

/** Build a compact two-cluster desired fleet for lifecycle planner tests. */
export function fleetFixture(): Fleet {
  return {
    schemaVersion: 1,
    revision: 'fleet-test-1',
    clusters: [
      {
        id: 'platform',
        purpose: 'platform',
        apiEndpoint: 'https://platform.test.invalid:6443',
        controlPlane: 'single',
        bootstrap: 'complete',
        requiredCapabilities: { 'control-plane': 1, product: 1, ingress: 1 },
      },
      {
        id: 'workers',
        purpose: 'workers',
        apiEndpoint: 'https://workers.test.invalid:6443',
        controlPlane: 'ha',
        bootstrap: 'complete',
        requiredCapabilities: { 'control-plane': 1, execution: 1 },
      },
    ],
    nodes: [
      {
        id: 'platform-a',
        cluster: 'platform',
        capabilities: ['control-plane', 'product', 'ingress'],
        lifecycle: 'present',
        provider: { kind: 'hcloud', instanceId: '1001' },
      },
      {
        id: 'workers-server-a',
        cluster: 'workers',
        capabilities: ['control-plane'],
        lifecycle: 'present',
        provider: { kind: 'hcloud', instanceId: '2001' },
      },
      {
        id: 'workers-agent-a',
        cluster: 'workers',
        capabilities: ['execution'],
        lifecycle: 'present',
        provider: { kind: 'hcloud', instanceId: '2002' },
      },
      {
        id: 'workers-agent-b',
        cluster: 'workers',
        capabilities: ['execution'],
        lifecycle: 'present',
        provider: {
          kind: 'ssh',
          machineId: 'abcdefabcdefabcdefabcdefabcdefab',
          address: '10.0.0.23',
        },
      },
    ],
  };
}

/** Build complete fresh identity, readiness, capability, and storage evidence for a fleet. */
export function observationFixture(fleet: Fleet = fleetFixture()): FleetObservation {
  const body: FleetObservationBody = {
    schemaVersion: 1,
    desiredRevision: fleet.revision,
    observedAt: '2026-09-17T09:00:00.000Z',
    complete: true,
    sources: [
      ...fleet.clusters.flatMap(({ id }) => [
        { name: `provider:${id}` as const, observedAt: '2026-09-17T09:00:00.000Z' },
        { name: `kubernetes-nodes:${id}` as const, observedAt: '2026-09-17T09:00:00.000Z' },
        { name: `kubernetes-pvcs:${id}` as const, observedAt: '2026-09-17T09:00:00.000Z' },
        { name: `kubernetes-pvs:${id}` as const, observedAt: '2026-09-17T09:00:00.000Z' },
        {
          name: `kubernetes-volumeattachments:${id}` as const,
          observedAt: '2026-09-17T09:00:00.000Z',
        },
      ]),
      ...fleet.nodes.flatMap((node) =>
        node.provider.kind === 'ssh'
          ? [
              {
                name: `ssh-facts:${node.cluster}/${node.id}` as const,
                observedAt: '2026-09-17T09:00:00.000Z',
              },
            ]
          : [],
      ),
    ],
    clusters: fleet.clusters.map(({ id }) => ({ id, state: 'ready' as const })),
    storage: fleet.clusters.map(({ id }) => ({
      clusterId: id,
      claims: [],
      volumes: [],
      attachments: [],
    })),
    nodes: fleet.nodes.map((node, position) => ({
      clusterId: node.cluster,
      desiredNodeId: node.id,
      displayName: node.id,
      providerIdentity:
        node.provider.kind === 'hcloud'
          ? `hcloud:${node.provider.instanceId}`
          : `ssh:${node.provider.machineId}`,
      identitySource:
        node.provider.kind === 'hcloud'
          ? (`provider:${node.cluster}` as const)
          : (`ssh-facts:${node.cluster}/${node.id}` as const),
      ...(node.provider.kind === 'ssh'
        ? { privateAddress: node.provider.address, machineId: node.provider.machineId }
        : {}),
      kubernetesNodeUid: `uid-${String(position + 1)}`,
      ...(node.provider.kind === 'hcloud'
        ? { kubernetesProviderId: `hcloud://${node.provider.instanceId}` }
        : {}),
      capabilities: node.capabilities,
      capabilitiesObserved: true,
      states: ['enrolled', 'ready'] as const,
      storageAttachments: [],
    })),
  };
  return { ...body, digest: digestObservation(body) };
}
