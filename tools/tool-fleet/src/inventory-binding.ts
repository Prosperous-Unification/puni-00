import { type } from 'arktype';

import type { Fleet } from './contracts';

const k3sGroups = ['k3s_bootstrap_servers', 'k3s_join_servers', 'k3s_agents'] as const;

const HostVariablesSchema = type({ '[string]': 'unknown' }).or('null');
const GroupSchema = type({ hosts: type({ '[string]': HostVariablesSchema }) });
const InventorySchema = type({
  all: {
    vars: { '[string]': 'unknown' },
    children: { '[string]': GroupSchema },
  },
});

/** The members a static inventory was bound with. */
export interface BoundInventory {
  /** The k3s hosts, sorted; each is a node of the cluster in desired.yaml. */
  readonly nodes: readonly string[];
  /** The hosts of the `bastion` group, sorted; none is a node or a gate host. */
  readonly bastions: readonly string[];
}

/**
 * Binds a static Ansible inventory to one cluster of the desired fleet: the k3s hosts are exactly
 * the cluster's nodes, each with the same machine id, address and capabilities.
 *
 * Where the cluster requires `platform-services` (the separated roles of
 * openspec/changes/separate-node-roles, rules 1.2 and 1.9) it also refuses a gate host in a k3s
 * group, a bastion in a k3s group or among the gate hosts, a bastion address that is not the
 * bastion host's, and an enrolled address set other than the node addresses. The existing
 * two-node inventory keeps h4claw as a gate host and a server, so those rules do not apply to it.
 *
 * A malformed inventory, an unknown cluster or any difference throws.
 */
export function bindInventory(fleet: Fleet, clusterId: string, input: unknown): BoundInventory {
  const inventory = InventorySchema(input);
  if (inventory instanceof type.errors) {
    throw new Error(`Inventory for ${clusterId} is malformed: ${inventory.summary}`);
  }
  const cluster = fleet.clusters.find(({ id }) => id === clusterId);
  if (cluster === undefined) throw new Error(`desired.yaml has no cluster ${clusterId}`);
  const groups = inventory.all.children;
  // A group the inventory does not declare has no members.
  const members = (group: string): string[] =>
    Object.hasOwn(groups, group) ? Object.keys(groups[group].hosts).sort() : [];
  const hostVariables = (host: string): Record<string, unknown> => {
    for (const group of Object.values(groups)) {
      if (!Object.hasOwn(group.hosts, host)) continue;
      const variables = group.hosts[host];
      if (variables !== null && Object.keys(variables).length > 0) return variables;
    }
    return {};
  };

  const k3sHosts = new Map<string, string>();
  for (const group of k3sGroups) {
    for (const host of members(group)) {
      const earlier = k3sHosts.get(host);
      if (earlier !== undefined) throw new Error(`${host} is in ${earlier} and ${group}`);
      k3sHosts.set(host, group);
    }
  }
  const bastions = members('bastion');
  if (cluster.requiredCapabilities['platform-services'] !== undefined) {
    const gateHosts = members('gate_hosts');
    // Proof: skipping this comparison made placement.test.ts `refuses a gate host in a k3s
    // group` resolve instead of throw (2026-11-22).
    for (const host of gateHosts) {
      const group = k3sHosts.get(host);
      if (group !== undefined) throw new Error(`gate host ${host} is in k3s group ${group}`);
    }
    // Proof: skipping the bastion group here made placement.test.ts `refuses the bastion in a
    // k3s group or among the gate hosts` fail (2026-11-22).
    for (const host of bastions) {
      const group = k3sHosts.get(host);
      if (group !== undefined) throw new Error(`bastion ${host} is in k3s group ${group}`);
      if (gateHosts.includes(host)) throw new Error(`bastion ${host} is in gate_hosts`);
    }
  }
  const desired = fleet.nodes.filter(
    (node) => node.cluster === clusterId && node.lifecycle !== 'retired',
  );
  for (const node of desired) {
    if (!k3sHosts.has(node.id)) {
      throw new Error(
        `${node.id} is in desired.yaml cluster ${clusterId} but not in the inventory`,
      );
    }
  }
  for (const host of k3sHosts.keys()) {
    if (!desired.some(({ id }) => id === host)) {
      throw new Error(`${host} is in the inventory but not in desired.yaml cluster ${clusterId}`);
    }
  }
  for (const node of desired) {
    if (node.provider.kind !== 'ssh') {
      throw new Error(`${node.id} is not an SSH node, so no static inventory can bind it`);
    }
    const variables = hostVariables(node.id);
    const machineId = node.provider.machineId.startsWith('operator-input:')
      ? 'unread'
      : node.provider.machineId;
    // Proof: comparing node names only made placement.test.ts `refuses a machine id that differs
    // between the two files` resolve instead of throw (2026-11-22).
    if (variables['puni_machine_id'] !== machineId) {
      throw new Error(`${node.id} machine id differs between desired.yaml and the inventory`);
    }
    for (const key of ['ansible_host', 'puni_node_ip']) {
      if (variables[key] !== node.provider.address) {
        throw new Error(`${node.id} ${key} differs from desired.yaml address`);
      }
    }
    if (JSON.stringify(variables['puni_node_capabilities']) !== JSON.stringify(node.capabilities)) {
      throw new Error(`${node.id} capabilities differ between desired.yaml and the inventory`);
    }
  }

  if (cluster.requiredCapabilities['platform-services'] !== undefined) {
    const vars = inventory.all.vars;
    if (bastions.length !== 1) {
      throw new Error(`${clusterId} needs exactly one bastion, found ${String(bastions.length)}`);
    }
    if (
      hostVariables(bastions[0])['puni_bastion_private_address'] !== vars['puni_bastion_address']
    ) {
      throw new Error(`puni_bastion_address is not the private address of ${bastions[0]}`);
    }
    const addresses = desired.map(({ provider }) =>
      provider.kind === 'ssh' ? provider.address : '',
    );
    const enrolled = type('string[]')(vars['puni_enrolled_private_addresses']);
    if (
      enrolled instanceof type.errors ||
      JSON.stringify([...enrolled].sort()) !== JSON.stringify([...addresses].sort())
    ) {
      throw new Error(
        `puni_enrolled_private_addresses must be exactly the node addresses ${addresses.join(', ')}`,
      );
    }
  }
  return { nodes: [...k3sHosts.keys()].sort(), bastions };
}
