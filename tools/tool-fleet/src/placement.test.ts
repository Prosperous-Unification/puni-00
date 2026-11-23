import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';
import { parse, stringify } from 'yaml';

import { decodeFleet, type Fleet } from './contracts';
import { bindInventory } from './inventory-binding';
import {
  digestObservation,
  type FleetObservation,
  type FleetObservationBody,
  type ObservedNode,
} from './observation';
import { planOperation, requireEnrollmentTarget } from './plan';

const root = join(import.meta.dir, '../../..');
const h4MachineId = '4'.repeat(32);
const h3MachineId = '3'.repeat(32);
const enrollEvidence = {
  inventorySha256: 'a'.repeat(64),
  ansibleVariablesSha256: 'b'.repeat(64),
  knownHostsSha256: 'c'.repeat(64),
};

async function readDesiredInput(): Promise<Record<string, unknown>> {
  return parse(await readFile(join(root, 'infra/fleet/desired.yaml'), 'utf8')) as Record<
    string,
    unknown
  >;
}

/** The committed placement with the operator's machine IDs substituted, as after preflight. */
async function resolvedFleet(): Promise<Fleet> {
  const input = await readDesiredInput();
  const nodes = input['nodes'] as { id: string; provider: Record<string, unknown> }[];
  for (const node of nodes) {
    if (node.id === 'h4claw') node.provider['machineId'] = h4MachineId;
    if (node.id === 'h3mon') node.provider['machineId'] = h3MachineId;
  }
  return decodeFleet(input);
}

function observed(node: Partial<ObservedNode> & Pick<ObservedNode, 'states'>): ObservedNode {
  return {
    clusterId: 'platform',
    displayName: 'h3mon',
    providerIdentity: `ssh:${h3MachineId}`,
    identitySource: 'ssh-facts:platform/h3mon',
    capabilities: [],
    capabilitiesObserved: false,
    storageAttachments: [],
    ...node,
  };
}

function observation(nodes: readonly ObservedNode[]): FleetObservation {
  const observedAt = '2026-09-27T09:00:00.000Z';
  const body: FleetObservationBody = {
    schemaVersion: 1,
    desiredRevision: 'production-h4claw-h3mon-v1',
    observedAt,
    complete: true,
    sources: (
      [
        'provider:platform',
        'kubernetes-nodes:platform',
        'kubernetes-pvcs:platform',
        'kubernetes-pvs:platform',
        'kubernetes-volumeattachments:platform',
        'ssh-facts:platform/h4claw',
        'ssh-facts:platform/h3mon',
      ] as const
    ).map((name) => ({ name, observedAt })),
    clusters: [{ id: 'platform', state: 'ready' }],
    storage: [{ clusterId: 'platform', claims: [], volumes: [], attachments: [] }],
    nodes,
  };
  return { ...body, digest: digestObservation(body) };
}

const h4Enrolled = observed({
  desiredNodeId: 'h4claw',
  displayName: 'h4claw',
  providerIdentity: `ssh:${h4MachineId}`,
  identitySource: 'ssh-facts:platform/h4claw',
  privateAddress: '10.1.0.4',
  machineId: h4MachineId,
  kubernetesNodeUid: 'uid-h4claw',
  states: ['enrolled', 'ready'],
});
const h3Unenrolled = observed({
  desiredNodeId: 'h3mon',
  privateAddress: '10.1.0.2',
  machineId: h3MachineId,
  states: ['discovered-unenrolled'],
});

describe('the committed production placement', () => {
  it('makes h4claw the only platform server and h3mon an observability agent', async () => {
    const fleet = decodeFleet(await readDesiredInput());
    const platform = fleet.nodes.filter(({ cluster }) => cluster === 'platform');
    expect(platform.map(({ id, capabilities }) => [id, capabilities])).toEqual([
      ['h4claw', ['control-plane', 'product', 'ingress']],
      ['h3mon', ['observability']],
    ]);
    expect(
      platform.map(({ provider }) => (provider.kind === 'ssh' ? provider.address : '')),
    ).toEqual(['10.1.0.4', '10.1.0.2']);
    // h2puni (10.1.0.3) and h1claw are deliberately absent from every cluster.
    expect(fleet.nodes.map(({ id }) => id)).not.toContain('h2puni');
    expect(fleet.nodes.map(({ id }) => id)).not.toContain('h1claw');
    expect(fleet.clusters.find(({ id }) => id === 'platform')?.apiEndpoint).toBe(
      'https://10.1.0.4:6443',
    );
  });

  it('refuses every operation on an unresolved operator input', async () => {
    // The committed IDs are resolved since the 2026-09-27 preflight; restore the placeholder.
    const input = await readDesiredInput();
    for (const node of input['nodes'] as { id: string; provider: Record<string, unknown> }[]) {
      node.provider['machineId'] = `operator-input:${node.id} /etc/machine-id`;
    }
    const fleet = decodeFleet(input);
    for (const nodeId of ['h4claw', 'h3mon']) {
      expect(() =>
        planOperation(
          fleet,
          {
            schemaVersion: 1,
            observedAt: '2026-09-27T09:00:00.000Z',
            digest: 'd'.repeat(64),
            complete: true,
          },
          { kind: 'enroll', nodeId, clusterId: 'platform', ...enrollEvidence },
        ),
      ).toThrow(new RegExp(`${nodeId} machine ID is an unresolved operator input`));
    }
  });

  it('rejects two SSH nodes at one address or with one machine ID', async () => {
    const sameAddress = await readDesiredInput();
    const addressNodes = sameAddress['nodes'] as {
      id: string;
      provider: Record<string, unknown>;
    }[];
    for (const node of addressNodes) node.provider['address'] = '10.1.0.4';
    expect(() => decodeFleet(sameAddress)).toThrow(
      /Duplicate SSH address 10\.1\.0\.4: h4claw and h3mon/,
    );

    const sameMachine = await readDesiredInput();
    const machineNodes = sameMachine['nodes'] as { provider: Record<string, unknown> }[];
    for (const node of machineNodes) node.provider['machineId'] = h4MachineId;
    expect(() => decodeFleet(sameMachine)).toThrow(
      new RegExp(`Duplicate provider identity ssh:${h4MachineId}: h4claw and h3mon`),
    );
  });

  it('plans h3mon enrollment only when observed unenrolled at its desired identity', async () => {
    const fleet = await resolvedFleet();
    expect(() => {
      requireEnrollmentTarget(fleet, observation([h4Enrolled, h3Unenrolled]), 'h3mon');
    }).not.toThrow();
  });

  it('refuses enrollment of a missing, enrolled, or wrong-address target', async () => {
    const fleet = await resolvedFleet();
    for (const target of [
      { ...h3Unenrolled, states: ['missing'] as const },
      { ...h3Unenrolled, kubernetesNodeUid: 'uid-h3mon', states: ['enrolled', 'ready'] as const },
      { ...h3Unenrolled, privateAddress: '10.1.0.9' },
    ]) {
      expect(() => {
        requireEnrollmentTarget(fleet, observation([h4Enrolled, target]), 'h3mon');
      }).toThrow(new RegExp(`h3mon is not observed unenrolled at ssh:${h3MachineId}`));
    }
    expect(() => {
      requireEnrollmentTarget(fleet, observation([h4Enrolled]), 'h3mon');
    }).toThrow(/h3mon is not observed unenrolled/);
  });

  it('refuses enrollment when another machine answers at the desired address', async () => {
    const fleet = await resolvedFleet();
    const otherMachine = 'e'.repeat(32);
    // Discovery reports the desired node missing and the answering machine as unmatched.
    const impostor = observed({
      displayName: 'h4claw',
      providerIdentity: `ssh:${otherMachine}`,
      identitySource: 'ssh-facts:platform/h4claw',
      privateAddress: '10.1.0.4',
      machineId: otherMachine,
      states: ['discovered-unenrolled'],
    });
    const h4Missing = observed({
      desiredNodeId: 'h4claw',
      displayName: 'h4claw',
      providerIdentity: `ssh:${h4MachineId}`,
      identitySource: 'ssh-facts:platform/h4claw',
      states: ['missing'],
    });
    expect(() => {
      requireEnrollmentTarget(fleet, observation([h4Missing, impostor, h3Unenrolled]), 'h4claw');
    }).toThrow(new RegExp(`h4claw address 10\\.1\\.0\\.4 is observed as ssh:${otherMachine}`));
  });

  it('refuses enrolling h3mon into the workers cluster', async () => {
    const fleet = await resolvedFleet();
    expect(() =>
      planOperation(
        fleet,
        {
          schemaVersion: 1,
          observedAt: '2026-09-27T09:00:00.000Z',
          digest: 'd'.repeat(64),
          complete: true,
        },
        { kind: 'enroll', nodeId: 'h3mon', clusterId: 'workers', ...enrollEvidence },
      ),
    ).toThrow(/cluster differs from desired node cluster: platform/);
  });
});

describe('tool-fleet plan for enrollment', () => {
  async function planEnroll(target: ObservedNode): Promise<ReturnType<typeof Bun.spawnSync>> {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-placement-'));
    const fleetPath = join(directory, 'fleet.yaml');
    const observationPath = join(directory, 'observation.json');
    const input = await readDesiredInput();
    for (const node of input['nodes'] as { id: string; provider: Record<string, unknown> }[]) {
      if (node.id === 'h4claw') node.provider['machineId'] = h4MachineId;
      if (node.id === 'h3mon') node.provider['machineId'] = h3MachineId;
    }
    await writeFile(fleetPath, stringify(input));
    await writeFile(observationPath, JSON.stringify(observation([h4Enrolled, target])));
    return Bun.spawnSync(
      [
        process.execPath,
        join(import.meta.dir, 'entrypoint.ts'),
        'plan',
        '--fleet',
        fleetPath,
        '--observation',
        observationPath,
        '--operation',
        'enroll',
        '--node',
        'h3mon',
        '--cluster',
        'platform',
        '--inventory-sha256',
        enrollEvidence.inventorySha256,
        '--ansible-variables-sha256',
        enrollEvidence.ansibleVariablesSha256,
        '--known-hosts-sha256',
        enrollEvidence.knownHostsSha256,
        '--output',
        join(directory, 'enroll-h3mon.json'),
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
  }

  it('writes an enrollment plan for an observed unenrolled target', async () => {
    const accepted = await planEnroll(h3Unenrolled);
    expect(String(accepted.stderr)).toBe('');
    expect(accepted.exitCode).toBe(0);
  });

  it('refuses a target discovery reported missing', async () => {
    // Proof: removing the requireEnrollmentTarget call from cli.ts made this exit 0 and write a plan.
    const refused = await planEnroll({ ...h3Unenrolled, states: ['missing'] });
    expect(refused.exitCode).not.toBe(0);
    expect(String(refused.stderr)).toMatch(/h3mon is not observed unenrolled/);
  });
});

describe('the existing-host inventory', () => {
  it('matches desired placement, addresses, capabilities and machine IDs', async () => {
    const fleet = decodeFleet(await readDesiredInput());
    const inventory = parse(
      await readFile(join(root, 'infra/ansible/inventory/production-existing-hosts.yml'), 'utf8'),
    ) as {
      all: {
        children: Record<
          'k3s_bootstrap_servers' | 'k3s_agents' | 'k3s_join_servers',
          { hosts: Partial<Record<string, Record<string, unknown>>> }
        >;
      };
    };
    const groups = inventory.all.children;
    const hosts = { ...groups.k3s_bootstrap_servers.hosts, ...groups.k3s_agents.hosts };
    expect(Object.keys(groups.k3s_bootstrap_servers.hosts)).toEqual(['h4claw']);
    expect(Object.keys(groups.k3s_agents.hosts)).toEqual(['h3mon']);
    expect(Object.keys(groups.k3s_join_servers.hosts)).toEqual([]);
    for (const node of fleet.nodes.filter(({ cluster }) => cluster === 'platform')) {
      const host = hosts[node.id];
      if (host === undefined || node.provider.kind === 'hcloud') {
        throw new Error(`inventory lacks SSH host ${node.id}`);
      }
      expect(host['ansible_host']).toBe(node.provider.address);
      expect(host['puni_node_ip']).toBe(node.provider.address);
      expect(host['puni_node_capabilities']).toEqual(node.capabilities);
      // Proof: setting h3mon's inventory ID to a hex value while desired.yaml keeps the operator
      // input made this fail, so the two files cannot drift after preflight.
      expect(host['puni_machine_id']).toBe(
        node.provider.machineId.startsWith('operator-input:') ? 'unread' : node.provider.machineId,
      );
    }
  });
});

describe('the platform-2 inventory', () => {
  async function readInventory(file: string): Promise<Record<string, unknown>> {
    return parse(await readFile(join(root, 'infra/ansible/inventory', file), 'utf8')) as Record<
      string,
      unknown
    >;
  }
  type Groups = Record<string, { hosts: Record<string, Record<string, unknown> | null> }>;
  const groupsOf = (inventory: Record<string, unknown>): Groups =>
    (inventory['all'] as { children: Groups }).children;

  it('binds production-hosts.yml to platform-2 beside the existing pair', async () => {
    const fleet = decodeFleet(await readDesiredInput());
    const bound = bindInventory(fleet, 'platform-2', await readInventory('production-hosts.yml'));
    expect(bound.nodes).toEqual(['m1plat1']);
    expect(bound.bastions).toEqual(['m2bast1']);
    const legacy = bindInventory(
      fleet,
      'platform',
      await readInventory('production-existing-hosts.yml'),
    );
    expect(legacy.nodes).toEqual(['h3mon', 'h4claw']);
  });

  it('refuses a machine id that differs between the two files', async () => {
    // Proof: comparing node names only made this resolve instead of throw (2026-11-22).
    const fleet = decodeFleet(await readDesiredInput());
    const inventory = await readInventory('production-hosts.yml');
    const server = groupsOf(inventory)['k3s_bootstrap_servers'].hosts['m1plat1'];
    if (server === null) throw new Error('m1plat1 has no host variables');
    server['puni_machine_id'] = 'f'.repeat(32);
    expect(() => bindInventory(fleet, 'platform-2', inventory)).toThrow(
      /m1plat1 machine id differs between desired\.yaml and the inventory/,
    );
  });

  it('refuses a node present in one file only', async () => {
    const fleet = decodeFleet(await readDesiredInput());
    const extra = await readInventory('production-hosts.yml');
    groupsOf(extra)['k3s_agents'].hosts['h7obs'] = {
      ansible_host: '10.10.1.13',
      puni_node_ip: '10.10.1.13',
      puni_machine_id: '7'.repeat(32),
      puni_node_capabilities: ['observability'],
    };
    expect(() => bindInventory(fleet, 'platform-2', extra)).toThrow(
      /h7obs is in the inventory but not in desired\.yaml cluster platform-2/,
    );
    const missing = await readInventory('production-hosts.yml');
    groupsOf(missing)['k3s_bootstrap_servers'].hosts = {};
    expect(() => bindInventory(fleet, 'platform-2', missing)).toThrow(
      /m1plat1 is in desired\.yaml cluster platform-2 but not in the inventory/,
    );
  });

  it('refuses a gate host in a k3s group', async () => {
    // Proof: skipping the gate-host comparison made this resolve instead of throw (2026-11-22).
    const fleet = decodeFleet(await readDesiredInput());
    const inventory = await readInventory('production-hosts.yml');
    const groups = groupsOf(inventory);
    groups['gate_hosts'] = { hosts: { m1plat1: {} } };
    expect(() => bindInventory(fleet, 'platform-2', inventory)).toThrow(
      /gate host m1plat1 is in k3s group k3s_bootstrap_servers/,
    );
  });

  it('refuses the bastion in a k3s group or among the gate hosts', async () => {
    // Proof: skipping the bastion group in the comparison made this fail (2026-11-22).
    const fleet = decodeFleet(await readDesiredInput());
    const agent = await readInventory('production-hosts.yml');
    groupsOf(agent)['k3s_agents'].hosts['m2bast1'] = {};
    expect(() => bindInventory(fleet, 'platform-2', agent)).toThrow(
      /bastion m2bast1 is in k3s group k3s_agents/,
    );
    const gate = await readInventory('production-hosts.yml');
    groupsOf(gate)['gate_hosts'] = { hosts: { m2bast1: {} } };
    expect(() => bindInventory(fleet, 'platform-2', gate)).toThrow(
      /bastion m2bast1 is in gate_hosts/,
    );
  });

  it('refuses an enrolled address set that holds the bastion or misses a node', async () => {
    const fleet = decodeFleet(await readDesiredInput());
    const inventory = await readInventory('production-hosts.yml');
    const vars = (inventory['all'] as { vars: Record<string, unknown> }).vars;
    vars['puni_enrolled_private_addresses'] = ['10.10.1.11', '10.10.1.12'];
    expect(() => bindInventory(fleet, 'platform-2', inventory)).toThrow(
      /puni_enrolled_private_addresses must be exactly the node addresses 10\.10\.1\.11/,
    );
  });
});

describe('the otel-gateway NodePorts the separated firewall admits', () => {
  it('are the NodePorts of the production otlp-ingress Service', async () => {
    // Proof: changing one port in production-hosts.yml made this fail (2026-11-22).
    const service = (
      await readFile(
        join(root, 'infra/platform/observability/production/otlp-ingress.yaml'),
        'utf8',
      )
    )
      .split(/^---$/m)
      .map((document) => parse(document) as { kind?: string; spec?: { ports?: unknown } })
      .find(({ kind }) => kind === 'Service')?.spec?.ports;
    const nodePorts = (service as { nodePort: number }[]).map(({ nodePort }) => nodePort).sort();
    const inventory = parse(
      await readFile(join(root, 'infra/ansible/inventory/production-hosts.yml'), 'utf8'),
    ) as { all: { vars: { puni_otel_gateway_node_ports: number[] } } };
    expect([...inventory.all.vars.puni_otel_gateway_node_ports].sort()).toEqual(nodePorts);
    expect(nodePorts).toHaveLength(2);
  });
});
