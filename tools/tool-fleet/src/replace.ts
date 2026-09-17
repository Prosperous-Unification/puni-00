import type { Fleet } from './contracts';
import { digestObservation, type FleetObservation } from './observation';

export interface FenceEvidence {
  readonly providerIdentity: string;
  readonly state: 'powered-off' | 'deleted' | 'running';
  readonly fenceId: string;
}

export interface ReplacementPlan {
  readonly nodeId: string;
  readonly clusterId: string;
  readonly oldProviderIdentity: string;
  readonly fenceId: string;
  readonly observationDigest: string;
  readonly steps: readonly string[];
}

/** Plan dead-node replacement only after exact evidence proves that the old writer cannot resume. */
export function planReplacement(
  fleet: Fleet,
  observation: FleetObservation,
  nodeId: string,
  fence?: FenceEvidence,
): ReplacementPlan {
  const desired = fleet.nodes.find(({ id }) => id === nodeId);
  if (desired === undefined) throw new Error(`Replacement targets unknown node ${nodeId}`);
  const observed = observation.nodes.filter(({ desiredNodeId }) => desiredNodeId === nodeId);
  const target = observed[0];
  if (observed.length !== 1) {
    throw new Error(`Replacement requires one observed identity for ${nodeId}`);
  }
  const { digest: _digest, ...body } = observation;
  if (
    observation.desiredRevision !== fleet.revision ||
    digestObservation(body) !== observation.digest
  ) {
    // Proof: the stale-observation replacement negative refuses before fence evidence can be
    // applied to an unreviewed provider identity.
    throw new Error('Replacement requires an exact current observation');
  }
  if (!target.states.includes('missing')) {
    throw new Error(`Replacement target ${nodeId} is not missing; use planned retirement`);
  }
  if (fence === undefined || fence.fenceId.length === 0) {
    // Proof: the missing-fence planner negative refuses before replacement storage or capacity can
    // create a second writer.
    throw new Error(`Replacement of ${nodeId} requires verified external fence evidence`);
  }
  if (fence.providerIdentity !== target.providerIdentity) {
    // Proof: the wrong-identity fence negative refuses before storage can move away from a
    // different missing writer.
    throw new Error('Fence evidence belongs to a different provider identity');
  }
  if (fence.state !== 'powered-off' && fence.state !== 'deleted') {
    // Proof: the running-provider planner negative refuses even when a caller labels the evidence
    // as a fence.
    throw new Error('Replacement requires proof the old provider instance cannot resume');
  }
  return {
    nodeId,
    clusterId: desired.cluster,
    oldProviderIdentity: target.providerIdentity,
    fenceId: fence.fenceId,
    observationDigest: observation.digest,
    steps: [
      'record verified external fence',
      'persist authoritative enrollment exclusion',
      'record replacement authorization for a distinct provisioning plan',
    ],
  };
}
