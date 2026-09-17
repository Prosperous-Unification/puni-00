import { createHash } from 'node:crypto';

import type { Capability, Fleet, FleetNode, Observation } from './contracts';

export type OperationRequest =
  | { readonly kind: 'enroll'; readonly nodeId: string; readonly clusterId: string }
  | { readonly kind: 'retire'; readonly nodeId: string }
  | { readonly kind: 'replace'; readonly nodeId: string }
  | { readonly kind: 'upgrade'; readonly nodeId: string; readonly version: string }
  | {
      readonly kind: 'provision';
      readonly nodeId: string;
      readonly clusterId: string;
      readonly cloudAccount: string;
      readonly region: string;
      readonly machineType: string;
      readonly image: string;
      readonly network: string;
      readonly sshKeyIds: readonly string[];
      readonly retainedStorage: boolean;
      readonly budgetCapEur: number;
    }
  | { readonly kind: 'destroy'; readonly nodeId: string };

export interface OperationPlan {
  readonly schemaVersion: 1;
  readonly desiredRevision: string;
  readonly observationDigest: string;
  readonly observedAt: string;
  readonly request: OperationRequest;
  readonly targetIdentities: readonly string[];
  readonly preconditions: readonly string[];
  readonly effects: readonly string[];
  readonly affectedCapabilities: readonly Capability[];
  readonly summary: string;
  readonly planSha256: string;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function identityOf(node: FleetNode): string {
  return node.provider.kind === 'hcloud'
    ? `hcloud:${node.provider.instanceId}`
    : `ssh:${node.provider.machineId}`;
}

function requireNode(fleet: Fleet, nodeId: string): FleetNode {
  const node = fleet.nodes.find(({ id }) => id === nodeId);
  // Proof: disabling this guard made the unknown-node production planner negative reach an
  // undefined property access instead of naming the invalid target.
  if (node === undefined) throw new Error(`Operation targets unknown fleet node: ${nodeId}`);
  return node;
}

function requireProvisioningRequest(
  fleet: Fleet,
  request: Extract<OperationRequest, { kind: 'provision' }>,
): void {
  const strings = [
    request.nodeId,
    request.clusterId,
    request.cloudAccount,
    request.region,
    request.machineType,
    request.image,
    request.network,
  ];
  if (
    strings.some((value) => value.length === 0) ||
    request.sshKeyIds.length === 0 ||
    request.sshKeyIds.some((key) => key.length === 0) ||
    !Number.isFinite(request.budgetCapEur) ||
    request.budgetCapEur <= 0
  ) {
    // Proof: disabling this boundary made the invalid-budget/empty-key production planner negative
    // emit provisioning effects; restored validation refuses before an external identity exists.
    throw new Error('Provision request is incomplete or has an invalid budget cap');
  }
  if (!fleet.clusters.some(({ id }) => id === request.clusterId)) {
    // Proof: disabling this guard let the provisioning production planner emit effects for an
    // unknown cluster; the invalid-provisioning negative then failed.
    throw new Error(`Provision request names unknown cluster: ${request.clusterId}`);
  }
  if (fleet.nodes.some(({ id }) => id === request.nodeId)) {
    // Proof: disabling this guard made the provisioning-collision production negative pass.
    throw new Error(`Provision request reuses fleet node id: ${request.nodeId}`);
  }
}

/**
 * Produce an immutable, deterministic plan from complete desired and observed state.
 * The digest covers every emitted field except itself and authorizes no effect by itself.
 */
export function planOperation(
  fleet: Fleet,
  observation: Observation,
  request: OperationRequest,
): OperationPlan {
  if (!observation.complete) {
    // Proof: accepting an incomplete observation made the production planner negative emit a
    // retirement plan from unknown provider state; restored refusal prevents inferred absence.
    throw new Error('Operation planning requires a complete observation');
  }
  if (!/^[0-9a-f]{64}$/.test(observation.digest)) {
    // Proof: disabling this guard made the invalid-observation-identity production negative pass.
    throw new Error('Operation planning requires an observation SHA-256');
  }

  let targetIdentities: readonly string[];
  let affectedCapabilities: readonly Capability[];
  let effects: readonly string[];
  if (request.kind === 'provision') {
    requireProvisioningRequest(fleet, request);
    targetIdentities = [`pending:${request.nodeId}`, `cluster:${request.clusterId}`];
    affectedCapabilities = [];
    effects = ['create provider instance', 'record provider identity', 'enroll configured host'];
  } else {
    const node = requireNode(fleet, request.nodeId);
    if (request.kind === 'enroll' && request.clusterId !== node.cluster) {
      // Proof: disabling this guard made the wrong-cluster enrollment production negative pass.
      throw new Error(`Enroll request cluster differs from desired node cluster: ${node.cluster}`);
    }
    if (request.kind === 'upgrade' && !/^v\d+\.\d+\.\d+\+k3s\d+$/.test(request.version)) {
      // Proof: disabling this guard made the release-channel upgrade production negative pass.
      throw new Error(`Upgrade request has invalid k3s version: ${request.version}`);
    }
    targetIdentities = [`node:${node.id}`, identityOf(node), `cluster:${node.cluster}`];
    affectedCapabilities = [...node.capabilities].sort();
    effects =
      request.kind === 'enroll'
        ? ['verify provider identity', 'configure host', 'join cluster']
        : request.kind === 'retire'
          ? ['verify replacement capacity', 'drain workloads', 'remove cluster membership']
          : request.kind === 'replace'
            ? ['provision replacement', 'transfer capabilities', 'retire replaced node']
            : request.kind === 'upgrade'
              ? ['verify cluster health', 'drain node', `install k3s ${request.version}`]
              : ['require completed retirement receipt', 'destroy provider instance'];
  }

  const planBody = {
    schemaVersion: 1 as const,
    desiredRevision: fleet.revision,
    observationDigest: observation.digest,
    observedAt: observation.observedAt,
    request,
    targetIdentities,
    preconditions: [
      'observation remains current',
      'target identities still match',
      'operation lease is owned',
    ],
    effects,
    affectedCapabilities,
    summary: `${request.kind} ${request.nodeId}; capabilities=${affectedCapabilities.join(',') || 'pending'}; storage=${request.kind === 'provision' && request.retainedStorage ? 'retained' : 'unchanged'}; downtime=possible`,
  };
  const planSha256 = createHash('sha256').update(canonicalJson(planBody)).digest('hex');
  return { ...planBody, planSha256 };
}
