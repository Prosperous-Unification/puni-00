import { readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import type { Cluster, Fleet } from './contracts';
import { listQemuMachines } from './lab-qemu';

/**
 * The `lab` discovery provider: provider inventory for SSH nodes that are disposable QEMU lab
 * machines. It replaces the hcloud inventory source for every cluster of a lab fleet so planning,
 * retirement, and replacement run their real production paths against local VMs.
 *
 * It is never selectable for production. {@link requireLabFleet} refuses a fleet that names an
 * hcloud node, a non-loopback API endpoint, or the committed production desired state.
 */
export interface LabProviderSource {
  /** Lab state directory `.puni/fleet-labs/<lab>-<profile>` written by `tool-fleet:lab`. */
  readonly stateDirectory: string;
}

/** Machine names the lab provider observed running, i.e. the provider inventory of a lab. */
export interface LabProviderInventory {
  readonly running: readonly string[];
}

const PRODUCTION_FLEETS = ['infra/fleet/desired.yaml', 'infra/fleet/examples/production.yaml'];

/**
 * Refuse any fleet that could describe production before the lab provider observes it.
 * @throws Error naming the first production trait found.
 */
export function requireLabFleet(fleet: Fleet, fleetPath: string, root: string): void {
  const absolute = resolve(fleetPath);
  if (PRODUCTION_FLEETS.some((path) => absolute === join(root, path))) {
    // Proof: disabling this refusal made `is never selectable for a production fleet` fail: the
    // production discover CLI accepted infra/fleet/desired.yaml with --lab-state.
    throw new Error(`The lab provider is never selectable for production fleet ${fleetPath}`);
  }
  for (const cluster of fleet.clusters) {
    if (new URL(cluster.apiEndpoint).hostname !== '127.0.0.1') {
      // Proof: disabling this refusal made the same test accept workers.example.invalid.
      throw new Error(
        `The lab provider is never selectable for ${cluster.id} at ${cluster.apiEndpoint}`,
      );
    }
  }
  for (const node of fleet.nodes) {
    if (node.provider.kind !== 'ssh') {
      throw new Error(`The lab provider is never selectable for hcloud node ${node.id}`);
    }
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function labPrefix(source: LabProviderSource): string {
  return `puni-vm-${basename(source.stateDirectory)}-`;
}

/**
 * Observe which exact lab machines are running. A machine whose QEMU process is gone is absent
 * from provider inventory, exactly as a deleted cloud server is absent from hcloud inventory.
 */
export async function observeLabProvider(source: LabProviderSource): Promise<LabProviderInventory> {
  try {
    await stat(join(source.stateDirectory, 'discovery-inventory.json'));
  } catch (cause) {
    // Absent lab state must not decode as "every machine stopped"; not fault-injected.
    throw new Error(`Lab provider state ${source.stateDirectory} has no discovery inventory`, {
      cause,
    });
  }
  const machines = await listQemuMachines(source.stateDirectory, labPrefix(source));
  const unknown = machines.find(({ state }) => state === 'Unknown');
  if (unknown !== undefined) {
    throw new Error(`Lab provider found unexpected machine ${unknown.name}`);
  }
  return {
    running: machines.filter(({ state }) => state === 'Running').map(({ name }) => name),
  };
}

/** Decode the lab provider inventory captured in a discovery source response. */
export function decodeLabProviderInventory(stdout: string): LabProviderInventory {
  const input: unknown = JSON.parse(stdout);
  if (
    typeof input !== 'object' ||
    input === null ||
    !('running' in input) ||
    !Array.isArray(input.running) ||
    !input.running.every((name): name is string => typeof name === 'string')
  ) {
    throw new Error('Lab provider inventory is malformed');
  }
  return { running: input.running };
}

/**
 * The controlled SSH-fact command for one lab node. It reuses the production discover playbook
 * with the lab's discovery inventory, which pins user, key, and host key for every lab machine.
 */
export function labSshDiscoveryArguments(
  root: string,
  source: LabProviderSource,
  nodeId: string,
): readonly string[] {
  return [
    join(root, 'infra/ansible/playbooks/discover.yml'),
    '--inventory',
    join(source.stateDirectory, 'discovery-inventory.json'),
    '--limit',
    nodeId,
    '--extra-vars',
    JSON.stringify({ puni_display_name: nodeId }),
  ];
}

/** Read the lab's discovery inventory host names, used to refuse fleet nodes it cannot reach. */
export async function readLabDiscoveryHosts(source: LabProviderSource): Promise<readonly string[]> {
  const input: unknown = JSON.parse(
    await readFile(join(source.stateDirectory, 'discovery-inventory.json'), 'utf8'),
  );
  const all = isRecord(input) ? input['all'] : undefined;
  const hosts = isRecord(all) ? all['hosts'] : undefined;
  if (!isRecord(hosts)) {
    throw new Error('Lab discovery inventory has no hosts');
  }
  return Object.keys(hosts);
}

/** Every cluster's lab nodes must be lab machines; anything else could be a real host. */
export function requireLabNodes(
  fleet: Fleet,
  cluster: Cluster,
  source: LabProviderSource,
  hosts: readonly string[],
): void {
  for (const node of fleet.nodes) {
    if (node.cluster === cluster.id && !hosts.includes(node.id)) {
      // Proof: disabling this refusal made `refuses a fleet node the lab does not own` proceed to
      // command execution for a node outside the lab's discovery inventory.
      throw new Error(`Lab provider ${labPrefix(source)} does not own fleet node ${node.id}`);
    }
  }
}
