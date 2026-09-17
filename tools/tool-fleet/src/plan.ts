import { createHash } from 'node:crypto';

import operationPlanSchema from '@infra/fleet-operation-plan-schema' with { type: 'json' };
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';

import type { Capability, Fleet, FleetNode, Observation } from './contracts';

export type OperationRequest =
  | {
      readonly kind: 'enroll';
      readonly nodeId: string;
      readonly clusterId: string;
      readonly inventorySha256: string;
      readonly ansibleVariablesSha256: string;
      readonly knownHostsSha256: string;
    }
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
      readonly k3sRole: 'server' | 'agent';
      readonly capabilities: readonly Capability[];
      readonly budgetCapEur: number;
      readonly providerOwnershipId: string;
      readonly terraformPlanSha256: string;
      readonly terraformBackendEvidenceSha256: string;
      readonly ansibleVariablesSha256: string;
      readonly terraformStateLineage: string;
      readonly terraformStateSerial: number;
    }
  | { readonly kind: 'destroy'; readonly nodeId: string };

export interface OperationPlan {
  readonly schemaVersion: 1;
  readonly desiredRevision: string;
  readonly observationDigest: string;
  readonly observedAt: string;
  readonly expiresAt: string;
  readonly request: OperationRequest;
  readonly targetIdentities: readonly string[];
  readonly preconditions: readonly string[];
  readonly effects: readonly string[];
  readonly affectedCapabilities: readonly Capability[];
  readonly storageImplication: string;
  readonly downtimeImplication: string;
  readonly summary: string;
  readonly planSha256: string;
}

function serializeCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serializeCanonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${serializeCanonical(member)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

type OperationPlanBody = Omit<OperationPlan, 'planSha256'>;

let persistedPlanValidator: ValidateFunction<OperationPlan> | undefined;

function operationPlanValidator(): ValidateFunction<OperationPlan> {
  persistedPlanValidator ??= new Ajv2020({
    allErrors: true,
    strict: true,
    formats: { 'date-time': true },
  }).compile<OperationPlan>(operationPlanSchema);
  return persistedPlanValidator;
}

/** Decode exact persisted operation-plan bytes before they can authorize an effect. */
export function decodeOperationPlan(input: unknown): OperationPlan {
  const validate = operationPlanValidator();
  if (!validate(input)) {
    // Proof: the persisted-plan production CLI negative injects an unknown property and reaches no
    // adapter mutation before this exact schema boundary rejects it.
    throw new Error(`Operation plan validation failed: ${JSON.stringify(validate.errors)}`);
  }
  const candidate = input;
  const observedAt = Date.parse(candidate.observedAt);
  const expiresAt = Date.parse(candidate.expiresAt);
  if (
    !Number.isFinite(observedAt) ||
    !Number.isFinite(expiresAt) ||
    new Date(observedAt).toISOString() !== candidate.observedAt ||
    new Date(expiresAt).toISOString() !== candidate.expiresAt
  ) {
    throw new Error('Operation plan contains an invalid calendar instant');
  }
  return candidate;
}

/** Bind every operation field to the SHA-256 reviewed by apply. */
export function sealOperationPlan(plan: OperationPlanBody): OperationPlan {
  const planSha256 = createHash('sha256').update(serializeCanonical(plan)).digest('hex');
  return { ...plan, planSha256 };
}

function identifyNodeProvider(node: FleetNode): string {
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
    request.providerOwnershipId,
  ];
  if (
    strings.some((value) => value.length === 0) ||
    request.sshKeyIds.length === 0 ||
    request.sshKeyIds.some((key) => key.length === 0) ||
    !Number.isFinite(request.budgetCapEur) ||
    request.budgetCapEur <= 0 ||
    !/^[0-9a-f]{64}$/.test(request.terraformPlanSha256) ||
    !/^[0-9a-f]{64}$/.test(request.terraformBackendEvidenceSha256) ||
    !/^[0-9a-f]{64}$/.test(request.ansibleVariablesSha256) ||
    request.terraformStateLineage.length === 0 ||
    !Number.isSafeInteger(request.terraformStateSerial) ||
    request.terraformStateSerial < 0
  ) {
    // Proof: disabling this boundary made the invalid-budget/empty-key production planner negative
    // emit provisioning effects; restored validation refuses before an external identity exists.
    throw new Error('Provision request is incomplete or has an invalid budget cap');
  }
  if (
    request.capabilities.length === 0 ||
    new Set(request.capabilities).size !== request.capabilities.length ||
    (request.k3sRole === 'agent' && request.capabilities.includes('control-plane'))
  ) {
    throw new Error('Provision request has invalid role or capability intent');
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
  let storageImplication: string;
  let downtimeImplication: string;
  if (request.kind === 'provision') {
    requireProvisioningRequest(fleet, request);
    targetIdentities = [`pending:${request.nodeId}`, `cluster:${request.clusterId}`];
    affectedCapabilities = [...request.capabilities].sort();
    effects = [
      'create provider instance',
      'record provider identity',
      'record desired membership',
      'enroll configured host',
    ];
    storageImplication = request.retainedStorage
      ? 'retained-volume-requested-and-unverified'
      : 'system-disk-only-with-no-retention';
    downtimeImplication = 'none-new-capacity';
  } else {
    if (
      request.kind === 'enroll' &&
      (!/^[0-9a-f]{64}$/.test(request.inventorySha256) ||
        !/^[0-9a-f]{64}$/.test(request.ansibleVariablesSha256) ||
        !/^[0-9a-f]{64}$/.test(request.knownHostsSha256))
    ) {
      throw new Error('Enroll request lacks reviewed inventory, variables, or host keys');
    }
    const node = requireNode(fleet, request.nodeId);
    const cluster = fleet.clusters.find(({ id }) => id === node.cluster);
    if (cluster === undefined) {
      // Proof: disabling this defensive refusal made the production planner negative reach an
      // undefined control-plane policy instead of naming the inconsistent desired node.
      throw new Error(`Desired node names unknown cluster: ${node.cluster}`);
    }
    if (request.kind === 'enroll' && request.clusterId !== node.cluster) {
      // Proof: disabling this guard made the wrong-cluster enrollment production negative pass.
      throw new Error(`Enroll request cluster differs from desired node cluster: ${node.cluster}`);
    }
    if (request.kind === 'upgrade' && !/^v\d+\.\d+\.\d+\+k3s\d+$/.test(request.version)) {
      // Proof: disabling this guard made the release-channel upgrade production negative pass.
      throw new Error(`Upgrade request has invalid k3s version: ${request.version}`);
    }
    targetIdentities = [`node:${node.id}`, identifyNodeProvider(node), `cluster:${node.cluster}`];
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
    storageImplication =
      request.kind === 'enroll'
        ? 'attachments-must-be-verified-before-scheduling'
        : request.kind === 'retire'
          ? 'volume-detach-and-retention-must-converge'
          : request.kind === 'replace'
            ? 'storage-transfer-or-explicit-loss-required'
            : request.kind === 'upgrade'
              ? 'attached-storage-preserved-and-verified'
              : 'system-disk-destruction-requires-retirement-receipt';
    const isSingleServer =
      cluster.controlPlane === 'single' && node.capabilities.includes('control-plane');
    downtimeImplication = isSingleServer
      ? 'cluster-api-unavailable-during-server-effect'
      : request.kind === 'retire' || request.kind === 'replace' || request.kind === 'upgrade'
        ? 'workload-reschedule-required'
        : request.kind === 'destroy'
          ? 'none-after-verified-retirement'
          : 'none-before-schedulable';
  }

  const planBody = {
    schemaVersion: 1 as const,
    desiredRevision: fleet.revision,
    observationDigest: observation.digest,
    observedAt: observation.observedAt,
    expiresAt: new Date(Date.parse(observation.observedAt) + 30 * 60 * 1000).toISOString(),
    request,
    targetIdentities,
    preconditions: [
      'observation remains current',
      'target identities still match',
      'operation lease is owned',
    ],
    effects,
    affectedCapabilities,
    storageImplication,
    downtimeImplication,
    summary: `${request.kind} ${request.nodeId}; capabilities=${affectedCapabilities.join(',') || 'pending'}; storage=${storageImplication}; downtime=${downtimeImplication}`,
  };
  return sealOperationPlan(planBody);
}
