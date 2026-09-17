import type { Fleet } from './contracts';
import { digestObservation, type FleetObservation } from './observation';

export interface UpgradeNodePlan {
  readonly nodeId: string;
  readonly clusterId: string;
  readonly role: 'server' | 'agent';
  readonly steps: readonly string[];
}

export interface UpgradePlan {
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly nodes: readonly UpgradeNodePlan[];
}

export interface UpgradeEvidence {
  readonly installedVersion: string;
  readonly snapshotIds: Readonly<Partial<Record<string, string>>>;
}

function versionTuple(version: string): readonly [number, number, number, number] {
  const match = /^v(\d+)\.(\d+)\.(\d+)\+k3s(\d+)$/.exec(version);
  if (match === null) throw new Error(`Upgrade version is not exact: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
}

function compareVersion(left: readonly number[], right: readonly number[]): number {
  for (let position = 0; position < left.length; position += 1) {
    const difference = (left[position] ?? 0) - (right[position] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Plan a serial health-gated k3s upgrade, with every server preceding every agent. */
export function planUpgrade(
  fleet: Fleet,
  observation: FleetObservation,
  targetVersion: string,
  evidence: UpgradeEvidence,
): UpgradePlan {
  const { digest: _digest, ...body } = observation;
  if (
    observation.desiredRevision !== fleet.revision ||
    digestObservation(body) !== observation.digest
  ) {
    // Proof: the stale-observation upgrade negative refuses before a server can be drained from an
    // unreviewed topology.
    throw new Error('Upgrade requires an exact current fleet observation');
  }
  const target = versionTuple(targetVersion);
  const installed = versionTuple(evidence.installedVersion);
  const direction = compareVersion(target, installed);
  if (direction < 0) {
    // Proof: the downgrade planner negative refuses a binary rollback that requires the separate
    // documented etcd restore transaction.
    throw new Error(
      `k3s downgrade from ${evidence.installedVersion} to ${targetVersion} is unsupported`,
    );
  }
  if (direction === 0) {
    // Proof: the same-version planner negative refuses a drain that cannot change the installed
    // release and therefore has no lifecycle benefit.
    throw new Error(`k3s target ${targetVersion} is already installed`);
  }
  const nodes = fleet.nodes.filter(({ lifecycle }) => lifecycle === 'present');
  for (const node of nodes) {
    const observed = observation.nodes.find(({ desiredNodeId }) => desiredNodeId === node.id);
    if (!observed?.states.includes('ready')) {
      // Proof: the unhealthy-node planner negative refuses before a serial upgrade can reduce
      // healthy topology further.
      throw new Error(`Upgrade requires Ready evidence for ${node.id}`);
    }
  }
  const servers = nodes.filter(({ capabilities }) => capabilities.includes('control-plane'));
  for (const clusterId of new Set(servers.map(({ cluster }) => cluster))) {
    const snapshotId = evidence.snapshotIds[clusterId];
    if (snapshotId === undefined || snapshotId.trim().length === 0) {
      // Proof: the missing-snapshot planner negative refuses before changing a server binary.
      throw new Error(`Upgrade requires an etcd snapshot and token for ${clusterId}`);
    }
  }
  const ordered = [
    ...servers,
    ...nodes.filter(({ capabilities }) => !capabilities.includes('control-plane')),
  ];
  return {
    fromVersion: evidence.installedVersion,
    toVersion: targetVersion,
    nodes: ordered.map((node) => {
      const role = node.capabilities.includes('control-plane') ? 'server' : 'agent';
      return {
        nodeId: node.id,
        clusterId: node.cluster,
        role,
        steps: [
          ...(role === 'server' ? ['prove etcd snapshot and token recovery material'] : []),
          'cordon and drain node respecting disruption budgets',
          `install locked k3s ${targetVersion}`,
          'restart node service',
          'prove API, etcd, node, workload, and storage health',
          'uncordon node',
        ],
      };
    }),
  };
}
