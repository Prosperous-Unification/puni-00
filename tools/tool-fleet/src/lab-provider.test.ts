import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { decodeFleet } from './contracts';
import { type DiscoveryCommand, observeFleet } from './discover';
import { readLabDiscoveryHosts, requireLabFleet } from './lab-provider';

const repositoryRoot = join(import.meta.dir, '../../..');
const serverId = 'a'.repeat(32);
const agentId = 'b'.repeat(32);

function labFleet(apiEndpoint = 'https://127.0.0.1:45109'): ReturnType<typeof decodeFleet> {
  return decodeFleet({
    schemaVersion: 1,
    revision: 'lab-1',
    clusters: [
      {
        id: 'workers',
        purpose: 'workers',
        apiEndpoint,
        controlPlane: 'single',
        bootstrap: 'complete',
        requiredCapabilities: { execution: 1 },
      },
    ],
    nodes: [
      {
        id: 'puni-vm-l-workers-server-1',
        cluster: 'workers',
        capabilities: ['control-plane'],
        lifecycle: 'present',
        provider: { kind: 'ssh', machineId: serverId, address: '10.55.0.11' },
      },
      {
        id: 'puni-vm-l-workers-agent-1',
        cluster: 'workers',
        capabilities: ['execution'],
        lifecycle: 'present',
        provider: { kind: 'ssh', machineId: agentId, address: '10.55.0.12' },
      },
    ],
  });
}

function kubernetesNode(name: string, machineId: string, ready: boolean): unknown {
  return {
    metadata: {
      name,
      uid: `uid-${name}`,
      labels: {
        [`puni.dev/capability-${name.includes('server') ? 'control-plane' : 'execution'}`]: 'true',
      },
    },
    spec: {},
    status: {
      conditions: [{ type: 'Ready', status: ready ? 'True' : 'Unknown' }],
      nodeInfo: { machineID: machineId },
    },
  };
}

describe('the lab discovery provider', () => {
  it('is never selectable for a production fleet', async () => {
    expect(() => {
      requireLabFleet(labFleet(), join(repositoryRoot, 'infra/fleet/desired.yaml'), repositoryRoot);
    }).toThrow(/never selectable for production fleet/);
    expect(() => {
      requireLabFleet(
        labFleet('https://workers.example.invalid:6443'),
        '/lab.yaml',
        repositoryRoot,
      );
    }).toThrow(/never selectable for workers/);
    expect(() => {
      requireLabFleet(labFleet(), '/lab.yaml', repositoryRoot);
    }).not.toThrow();
    const cloud = labFleet();
    const withCloudNode = decodeFleet({
      ...cloud,
      nodes: [
        ...cloud.nodes,
        {
          id: 'hcloud-node',
          cluster: 'workers',
          capabilities: ['execution'],
          lifecycle: 'present',
          provider: { kind: 'hcloud', instanceId: '42' },
        },
      ],
    });
    expect(() => {
      requireLabFleet(withCloudNode, '/lab.yaml', repositoryRoot);
    }).toThrow(/hcloud node hcloud-node/);
    const alias = join(await mkdtemp(join(tmpdir(), 'fleet-lab-alias-')), 'desired.yaml');
    await symlink(join(repositoryRoot, 'infra/fleet/desired.yaml'), alias);
    expect(() => {
      requireLabFleet(labFleet(), alias, repositoryRoot);
    }).toThrow(/never selectable for production fleet/);
    const malformed = await mkdtemp(join(tmpdir(), 'fleet-lab-malformed-'));
    await writeFile(join(malformed, 'discovery-inventory.json'), '{');
    expect(readLabDiscoveryHosts({ stateDirectory: malformed })).rejects.toThrow(
      /unreadable or malformed JSON/,
    );
    const invocation = Bun.spawnSync(
      [
        process.execPath,
        join(import.meta.dir, 'entrypoint.ts'),
        'discover',
        '--fleet',
        join(repositoryRoot, 'infra/fleet/desired.yaml'),
        '--output',
        join(tmpdir(), `never-${String(Date.now())}.json`),
        '--lab-state',
        '/nonexistent',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(invocation.stderr.toString()).toMatch(/never selectable for production fleet/);

    const labObservation = join(tmpdir(), `lab-observation-${String(Date.now())}.json`);
    await writeFile(
      labObservation,
      JSON.stringify({ sources: [{ name: 'lab-provider:workers', observedAt: 'x' }] }),
    );
    const plan = Bun.spawnSync(
      [
        process.execPath,
        join(import.meta.dir, 'entrypoint.ts'),
        'plan',
        '--fleet',
        join(repositoryRoot, 'infra/fleet/desired.yaml'),
        '--observation',
        labObservation,
        '--operation',
        'retire',
        '--node',
        'workers-agent-a',
        '--backup-receipt',
        'r',
        '--backup-receipt-sha256',
        'a'.repeat(64),
        '--inventory-sha256',
        'b'.repeat(64),
        '--known-hosts-sha256',
        'c'.repeat(64),
        '--output',
        join(tmpdir(), `never-plan-${String(Date.now())}.json`),
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(plan.exitCode).not.toBe(0);
    expect(plan.stderr.toString()).toMatch(/never selectable for production fleet/);
  });

  it('reports a machine the lab provider saw stop as missing without reading its SSH facts', async () => {
    const state = await mkdtemp(join(tmpdir(), 'fleet-lab-provider-'));
    await writeFile(
      join(state, 'discovery-inventory.json'),
      JSON.stringify({
        all: { hosts: { 'puni-vm-l-workers-server-1': {}, 'puni-vm-l-workers-agent-1': {} } },
      }),
    );
    const commands: DiscoveryCommand[] = [];
    const observation = await observeFleet(labFleet(), {
      root: repositoryRoot,
      labProvider: { stateDirectory: state },
      observeLab: () => Promise.resolve({ running: ['puni-vm-l-workers-server-1'] }),
      run: (command) => {
        commands.push(command);
        const observedAt = new Date().toISOString();
        const stdout =
          command.source === 'kubernetes-nodes:workers'
            ? JSON.stringify({
                items: [
                  kubernetesNode('puni-vm-l-workers-server-1', serverId, true),
                  kubernetesNode('puni-vm-l-workers-agent-1', agentId, false),
                ],
              })
            : command.source.startsWith('ssh-facts:')
              ? `PUNI_MACHINE_FACT={"machineId":"${serverId}","address":"10.55.0.11","name":"puni-vm-l-workers-server-1"}`
              : JSON.stringify({ items: [] });
        return Promise.resolve({ exitCode: 0, stdout, stderr: '', observedAt });
      },
    });
    expect(commands.map(({ source }) => source)).not.toContain('provider:workers');
    expect(commands.map(({ source }) => source)).toContain(
      'ssh-facts:workers/puni-vm-l-workers-server-1',
    );
    expect(commands.map(({ source }) => source)).not.toContain(
      'ssh-facts:workers/puni-vm-l-workers-agent-1',
    );
    const resources = Object.fromEntries(
      commands
        .filter(({ executable }) => executable === 'kubectl')
        .map(({ source, arguments: argv }) => [source, argv[argv.indexOf('get') + 1]]),
    );
    expect(resources).toEqual({
      'kubernetes-nodes:workers': 'nodes',
      'kubernetes-pvcs:workers': 'persistentvolumeclaims',
      'kubernetes-pvs:workers': 'persistentvolumes',
      'kubernetes-volumeattachments:workers': 'volumeattachments',
    });
    const factCommand = commands.find(({ source }) => source.startsWith('ssh-facts:'));
    expect(factCommand?.arguments).toContain(join(state, 'discovery-inventory.json'));
    expect(observation.sources.map(({ name }) => name)).toContain('lab-provider:workers');
    const agent = observation.nodes.find(
      ({ desiredNodeId }) => desiredNodeId === 'puni-vm-l-workers-agent-1',
    );
    expect(agent?.states).toEqual(['missing', 'not-ready']);
    expect(agent?.identitySource).toBe('kubernetes-nodes:workers');
  });

  it('refuses a fleet node the lab does not own', async () => {
    const state = await mkdtemp(join(tmpdir(), 'fleet-lab-provider-'));
    await writeFile(
      join(state, 'discovery-inventory.json'),
      JSON.stringify({ all: { hosts: { 'puni-vm-l-workers-server-1': {} } } }),
    );
    expect(
      observeFleet(labFleet(), {
        root: repositoryRoot,
        labProvider: { stateDirectory: state },
        observeLab: () => Promise.resolve({ running: [] }),
        run: () => Promise.reject(new Error('no command may run')),
      }),
    ).rejects.toThrow(/does not own fleet node puni-vm-l-workers-agent-1/);
  });
});
