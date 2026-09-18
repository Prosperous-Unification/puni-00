import type { Capability, Fleet, FleetNode } from './contracts';
import { digestObservation, type FleetObservation, type ObservedNode } from './observation';

export interface RetirementPlan {
  readonly nodeId: string;
  readonly clusterId: string;
  readonly apiEndpoint: string;
  readonly controlPlaneTarget: boolean;
  readonly minimumSurvivingControlPlanes: number;
  readonly providerIdentity: string;
  readonly kubernetesNodeUid: string;
  readonly observationDigest: string;
  readonly affectedCapabilities: readonly Capability[];
  readonly requiredCapabilityFloors: Readonly<Partial<Record<Capability, number>>>;
  readonly steps: readonly string[];
}

function requireTarget(
  fleet: Fleet,
  observation: FleetObservation,
  nodeId: string,
): {
  readonly desired: FleetNode;
  readonly observed: ObservedNode & { readonly kubernetesNodeUid: string };
} {
  if (observation.desiredRevision !== fleet.revision) {
    // Proof: the stale-revision planner negative refuses before capacity from another desired
    // topology can authorize retirement.
    throw new Error('Retirement observation belongs to another desired fleet revision');
  }
  const { digest: _digest, ...body } = observation;
  if (digestObservation(body) !== observation.digest) {
    // Proof: the changed-observation planner negative refuses bytes that no longer match the
    // reviewed observation identity before a drain plan is emitted.
    throw new Error('Retirement observation digest is malformed or stale');
  }
  const desired = fleet.nodes.find(({ id }) => id === nodeId);
  if (desired === undefined) throw new Error(`Retirement targets unknown node ${nodeId}`);
  if (desired.lifecycle !== 'present') {
    throw new Error(`Retirement target ${nodeId} is already ${desired.lifecycle}`);
  }
  const matches = observation.nodes.filter(({ desiredNodeId }) => desiredNodeId === nodeId);
  if (matches.length !== 1) {
    throw new Error(`Retirement requires one complete observed identity for ${nodeId}`);
  }
  const observed = matches[0];
  if (!observed.capabilitiesObserved) {
    // Proof: the missing-capability-evidence planner negative refuses before a drain plan can hide
    // the loss of the fleet's last required capability.
    throw new Error(`Retirement lacks capability evidence for ${nodeId}`);
  }
  if (observed.states.includes('missing')) {
    // Proof: the missing-node planner negative requires a separately verified external fence
    // instead of treating provider absence as successful de-enrollment.
    throw new Error(`Missing node ${nodeId} requires a verified external fence before retirement`);
  }
  if (!observed.states.includes('enrolled') || !observed.states.includes('ready')) {
    // Proof: the not-Ready planner negative refuses before ordinary retirement can make an
    // already degraded cluster worse.
    throw new Error(`Retirement target ${nodeId} is not an enrolled Ready node`);
  }
  if (observed.storageAttachments.length > 0) {
    // Proof: the attached-storage planner negative refuses generic drain before a retained writer
    // can be detached or local state can be discarded.
    throw new Error(`Retirement target ${nodeId} has attached storage`);
  }
  const kubernetesNodeUid = observed.kubernetesNodeUid;
  if (kubernetesNodeUid === undefined) {
    // Proof: the missing-Kubernetes-UID planner negative refuses before a same-name Node can be
    // cordoned or deleted.
    throw new Error(`Retirement target ${nodeId} lacks Kubernetes identity`);
  }
  return { desired, observed: { ...observed, kubernetesNodeUid } };
}

function requireCapacity(fleet: Fleet, observation: FleetObservation, target: FleetNode): void {
  const cluster = fleet.clusters.find(({ id }) => id === target.cluster);
  if (cluster === undefined)
    throw new Error(`Retirement target names unknown cluster ${target.cluster}`);
  const survivors = fleet.nodes.filter((node) => {
    if (node.id === target.id || node.cluster !== target.cluster || node.lifecycle !== 'present') {
      return false;
    }
    const observed = observation.nodes.find(({ desiredNodeId }) => desiredNodeId === node.id);
    return (
      observed?.states.includes('ready') === true &&
      observed.capabilitiesObserved &&
      node.capabilities.every((capability) => observed.capabilities.includes(capability))
    );
  });
  if (target.capabilities.includes('control-plane')) {
    const controlPlanes = survivors.filter(({ capabilities }) =>
      capabilities.includes('control-plane'),
    ).length;
    if (controlPlanes === 0) {
      // Proof: the sole-control-plane planner negative refuses before ordinary retirement can make
      // the API and etcd unavailable.
      throw new Error(`Cannot retire sole control-plane node ${target.id}`);
    }
    if (cluster.controlPlane === 'ha' && controlPlanes < 3) {
      throw new Error(`HA cluster ${cluster.id} requires three proven replacement servers`);
    }
  }
  for (const [capability, floor] of Object.entries(cluster.requiredCapabilities)) {
    const remaining = survivors.filter(({ capabilities }) =>
      // The fleet decoder restricts required-capability keys to the Capability vocabulary.
      capabilities.includes(capability as Capability),
    ).length;
    if (remaining < floor) {
      // Proof: the last-execution planner negative refuses before a drain can violate the desired
      // capability floor.
      throw new Error(
        `Retirement would violate required capability ${capability}: ${String(remaining)} < ${String(floor)}`,
      );
    }
  }
}

/** Plan only a reachable, replaceable node retirement from complete identity and capacity evidence. */
export function planRetirement(
  fleet: Fleet,
  observation: FleetObservation,
  nodeId: string,
): RetirementPlan {
  const { desired, observed } = requireTarget(fleet, observation, nodeId);
  requireCapacity(fleet, observation, desired);
  const cluster = fleet.clusters.find(({ id }) => id === desired.cluster);
  if (cluster === undefined)
    throw new Error(`Retirement target names unknown cluster ${desired.cluster}`);
  return {
    nodeId,
    clusterId: desired.cluster,
    apiEndpoint: cluster.apiEndpoint,
    controlPlaneTarget: desired.capabilities.includes('control-plane'),
    minimumSurvivingControlPlanes: cluster.controlPlane === 'ha' ? 3 : 1,
    providerIdentity: observed.providerIdentity,
    kubernetesNodeUid: observed.kubernetesNodeUid,
    observationDigest: observation.digest,
    affectedCapabilities: [...desired.capabilities].sort(),
    requiredCapabilityFloors: { ...cluster.requiredCapabilities },
    steps: [
      'verify replacement capacity, storage topology, and backup status',
      'cordon node',
      'evict workloads respecting disruption budgets',
      'wait for workload rescheduling and volume detach',
      'verify no unmanaged or local-state workload remains',
      'remove embedded etcd membership',
      'record etcd membership removal',
      'stop and disable k3s service',
      'remove enrollment configuration and node credentials',
      'verify retired node cannot re-register',
      'remove Kubernetes membership',
      'persist authoritative enrollment exclusion',
      'record auditable retirement receipt',
    ],
  };
}
