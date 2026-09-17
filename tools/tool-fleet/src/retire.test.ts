import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { applyOperation } from './apply';
import { digestObservation, type FleetObservation } from './observation';
import { type OperationPlan, sealOperationPlan } from './plan';
import {
  type CommandRequest,
  type CommandResponse,
  createProductionApplyDependencies,
} from './production-apply';
import { planRetirement } from './retire';
import { fleetFixture, observationFixture } from './testing/fleet';

function withNodes(
  observation: FleetObservation,
  nodes: FleetObservation['nodes'],
): FleetObservation {
  const { digest: _digest, ...body } = observation;
  const changed = { ...body, nodes };
  return { ...changed, digest: digestObservation(changed) };
}

describe('planRetirement', () => {
  it('plans an enrolled replaceable node without fixed host names', () => {
    const plan = planRetirement(fleetFixture(), observationFixture(), 'workers-agent-a');
    expect(plan.nodeId).toBe('workers-agent-a');
    expect(plan.providerIdentity).toBe('hcloud:2002');
    expect(plan.steps).toContain('evict workloads respecting disruption budgets');
  });

  it('uses the production drain path without bypassing PDB or local-storage refusal', async () => {
    const root = join(import.meta.dir, '../../..');
    const playbook = await readFile(join(root, 'infra/ansible/playbooks/retire.yml'), 'utf8');
    expect(playbook).toContain('puni_kubernetes_node_uid');
    expect(playbook).toContain('puni_backup_receipt');
    expect(playbook).toContain('puni.dev/local-state');
    expect(playbook).toContain('puni.dev/forge-worktree');
    expect(playbook).toContain('puni.dev/singleton-sqlite');
    expect(playbook).toContain('volumeattachments.storage.k8s.io');
    expect(playbook).toContain('state: absent');
    expect(playbook).not.toContain('--force');
    expect(playbook).not.toContain('--delete-emptydir-data');
  });

  it('refuses the last required capability and sole control-plane server', () => {
    const fleet = fleetFixture();
    expect(() => planRetirement(fleet, observationFixture(fleet), 'platform-a')).toThrow(
      /required capability|sole control-plane/i,
    );
    const withoutSpare = {
      ...fleet,
      nodes: fleet.nodes.filter(({ id }) => id !== 'workers-agent-b'),
    };
    expect(() =>
      planRetirement(withoutSpare, observationFixture(withoutSpare), 'workers-agent-a'),
    ).toThrow(/required capability.*execution/i);
  });

  it('refuses missing, not-ready, attached-storage, and incomplete identity evidence', () => {
    const fleet = fleetFixture();
    const observation = observationFixture(fleet);
    const target = observation.nodes.find(
      ({ desiredNodeId }) => desiredNodeId === 'workers-agent-a',
    );
    if (target === undefined) throw new Error('Fixture target is missing');
    expect(() =>
      planRetirement(
        fleet,
        withNodes(
          observation,
          observation.nodes.map((node) =>
            node === target ? { ...node, states: ['missing'] } : node,
          ),
        ),
        'workers-agent-a',
      ),
    ).toThrow(/missing.*fence/i);
    expect(() =>
      planRetirement(
        fleet,
        withNodes(
          observation,
          observation.nodes.map((node) =>
            node === target ? { ...node, storageAttachments: ['volume-7'] } : node,
          ),
        ),
        'workers-agent-a',
      ),
    ).toThrow(/attached storage/i);
    expect(() =>
      planRetirement(
        fleet,
        withNodes(
          observation,
          observation.nodes.map((node) =>
            node === target ? { ...node, capabilitiesObserved: false } : node,
          ),
        ),
        'workers-agent-a',
      ),
    ).toThrow(/capability evidence/i);
    expect(() =>
      planRetirement(
        fleet,
        withNodes(
          observation,
          observation.nodes.map((node) =>
            node === target ? { ...node, states: ['enrolled', 'not-ready'] } : node,
          ),
        ),
        'workers-agent-a',
      ),
    ).toThrow(/not an enrolled Ready/i);
    expect(() =>
      planRetirement(
        fleet,
        withNodes(
          observation,
          observation.nodes.map((node) =>
            node.desiredNodeId === 'workers-agent-b'
              ? { ...node, states: ['enrolled', 'not-ready'] }
              : node,
          ),
        ),
        'workers-agent-a',
      ),
    ).toThrow(/required capability.*execution/i);
    expect(() =>
      planRetirement(
        fleet,
        withNodes(
          observation,
          observation.nodes.map((node) =>
            node === target ? { ...node, kubernetesNodeUid: undefined } : node,
          ),
        ),
        'workers-agent-a',
      ),
    ).toThrow(/Kubernetes identity/i);
    expect(() =>
      planRetirement(fleet, { ...observation, desiredRevision: 'stale' }, 'workers-agent-a'),
    ).toThrow(/desired fleet revision/i);
    expect(() =>
      planRetirement(
        fleet,
        { ...observation, observedAt: '2026-09-17T09:01:00.000Z' },
        'workers-agent-a',
      ),
    ).toThrow(/digest.*stale/i);
  });
});

function retirementOperation(inventorySha256: string, knownHostsSha256: string): OperationPlan {
  const fleet = fleetFixture();
  const observation = observationFixture(fleet);
  const retirement = planRetirement(fleet, observation, 'workers-agent-a');
  return sealOperationPlan({
    schemaVersion: 1,
    desiredRevision: fleet.revision,
    observationDigest: observation.digest,
    observedAt: observation.observedAt,
    expiresAt: '2026-09-18T00:00:00.000Z',
    request: {
      kind: 'retire',
      nodeId: retirement.nodeId,
      backupReceipt: 'backup-workers-1',
      inventorySha256,
      knownHostsSha256,
    },
    targetIdentities: [
      `node:${retirement.nodeId}`,
      retirement.providerIdentity,
      `kubernetes:${retirement.kubernetesNodeUid}`,
      `cluster:${retirement.clusterId}`,
      `api-endpoint:${retirement.apiEndpoint}`,
      `minimum-control-planes:${String(retirement.minimumSurvivingControlPlanes)}`,
    ],
    preconditions: ['fresh complete observation'],
    effects: retirement.steps,
    affectedCapabilities: retirement.affectedCapabilities,
    storageImplication: 'volume-detach-and-retention-must-converge',
    downtimeImplication: 'capacity-dependent',
    summary: 'retire workers-agent-a',
  });
}

async function prepareRetirement(directory: string): Promise<{
  readonly plan: OperationPlan;
  readonly planPath: string;
}> {
  const planPath = join(directory, 'retire.json');
  const knownHostsPath = `${planPath}.known_hosts`;
  const inventorySource = `${JSON.stringify({
    all: {
      children: {
        k3s_agents: {
          hosts: {
            'workers-agent-a': {
              ansible_host: '10.0.0.22',
              puni_machine_id: '0123456789abcdef0123456789abcdef',
              puni_provider_identity: '2002',
              ansible_ssh_common_args: `-o UserKnownHostsFile=${knownHostsPath} -o StrictHostKeyChecking=yes`,
            },
          },
        },
        k3s_join_servers: { hosts: {} },
      },
    },
  })}\n`;
  const knownHostsSource = '10.0.0.22 ssh-ed25519 AAAAC3NzaRetirementKey\n';
  await writeFile(`${planPath}.inventory.json`, inventorySource, { mode: 0o600 });
  await writeFile(knownHostsPath, knownHostsSource, { mode: 0o600 });
  return {
    planPath,
    plan: retirementOperation(
      createHash('sha256').update(inventorySource).digest('hex'),
      createHash('sha256').update(knownHostsSource).digest('hex'),
    ),
  };
}

function retirementRunner(failingTag: string) {
  let holder: string | undefined;
  const calls: CommandRequest[] = [];
  const run = (request: CommandRequest): Promise<CommandResponse> =>
    Promise.resolve().then(() => {
      calls.push(request);
      if (request.executable === 'kubectl') {
        if (request.arguments.includes('get')) {
          return holder === undefined
            ? { exitCode: 1, stdout: '', stderr: 'NotFound' }
            : {
                exitCode: 0,
                stdout: JSON.stringify({
                  metadata: { resourceVersion: '7' },
                  spec: {
                    holderIdentity: holder,
                    leaseDurationSeconds: 120,
                    renewTime: '2026-09-17T09:00:00.000Z',
                  },
                }),
                stderr: '',
              };
        }
        if (request.arguments.includes('delete')) {
          holder = undefined;
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        const manifest = JSON.parse(request.stdin ?? '{}') as {
          spec?: { holderIdentity?: unknown };
        };
        if (typeof manifest.spec?.holderIdentity !== 'string') {
          throw new Error('Lease mutation lacks a holder');
        }
        holder = manifest.spec.holderIdentity;
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            ...manifest,
            metadata: { resourceVersion: '7' },
          }),
          stderr: '',
        };
      }
      if (request.executable === 'ansible-playbook') {
        if (request.arguments.some((argument) => argument.endsWith('/discover.yml'))) {
          return {
            exitCode: 0,
            stdout:
              'PUNI_MACHINE_FACT={"address":"10.0.0.22","machineId":"0123456789abcdef0123456789abcdef","name":"workers-agent-a"}\nPLAY RECAP\nworkers-agent-a : ok=1 changed=0 unreachable=0 failed=0',
            stderr: '',
          };
        }
        const tag = request.arguments[request.arguments.indexOf('--tags') + 1];
        return tag === failingTag
          ? { exitCode: 2, stdout: '', stderr: `${failingTag} injected failure` }
          : {
              exitCode: 0,
              stdout: 'PLAY RECAP\nworkers-agent-a : ok=1 changed=0 unreachable=0 failed=0',
              stderr: '',
            };
      }
      if (request.executable === 'ansible-inventory') {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            _meta: {
              hostvars: {
                'workers-agent-a': {
                  puni_instance_id: '2002',
                  puni_logical_node: 'workers-agent-a',
                  puni_operation_id: 'provision-workers-agent-a',
                  puni_provider_state: 'running',
                },
              },
            },
          }),
          stderr: '',
        };
      }
      throw new Error(`Unexpected command ${request.executable}`);
    });
  return { calls, run };
}

describe('production retirement', () => {
  it('uses hash-bound static enrollment evidence for an external SSH node', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-retirement-ssh-'));
    const prepared = await prepareRetirement(directory);
    const { planSha256: _planSha256, ...body } = prepared.plan;
    const plan = sealOperationPlan({
      ...body,
      targetIdentities: prepared.plan.targetIdentities.map((identity) =>
        identity === 'hcloud:2002' ? 'ssh:0123456789abcdef0123456789abcdef' : identity,
      ),
    });
    const { calls, run } = retirementRunner('never');
    const dependencies = createProductionApplyDependencies(
      join(import.meta.dir, '../../..'),
      plan,
      prepared.planPath,
      run,
      () => new Date('2026-09-17T09:00:00.000Z'),
      'retirement-test',
    );

    expect(await dependencies.observe(plan)).toMatchObject({ providerState: 'ready' });
    expect(calls.some(({ executable }) => executable === 'ansible-inventory')).toBe(false);
  });

  it('refuses changed static enrollment bytes before observing the host', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-retirement-artifact-'));
    const { planPath, plan } = await prepareRetirement(directory);
    await writeFile(`${planPath}.inventory.json`, '{}\n', { mode: 0o600 });
    const { calls, run } = retirementRunner('never');
    const dependencies = createProductionApplyDependencies(
      join(import.meta.dir, '../../..'),
      plan,
      planPath,
      run,
      () => new Date('2026-09-17T09:00:00.000Z'),
      'retirement-test',
    );

    expect(dependencies.observe(plan)).rejects.toThrow(/inventory.*SHA-256/i);
    expect(calls).toHaveLength(0);
    // Proof: changing the reviewed retirement inventory bytes reaches neither host discovery nor
    // any retirement mutation through the production adapter.
  });

  it('refuses a live provider identity that differs from the reviewed target', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-retirement-identity-'));
    const { planPath, plan } = await prepareRetirement(directory);
    const run = (request: CommandRequest): Promise<CommandResponse> =>
      Promise.resolve().then(() => {
        if (
          request.executable === 'ansible-playbook' &&
          request.arguments.some((argument) => argument.endsWith('/discover.yml'))
        ) {
          return {
            exitCode: 0,
            stdout:
              'PUNI_MACHINE_FACT={"address":"10.0.0.22","machineId":"0123456789abcdef0123456789abcdef","name":"workers-agent-a"}\nPLAY RECAP\nworkers-agent-a : ok=1 changed=0 unreachable=0 failed=0',
            stderr: '',
          };
        }
        if (request.executable !== 'ansible-inventory') {
          throw new Error(`Unexpected command ${request.executable}`);
        }
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            _meta: {
              hostvars: {
                'workers-agent-a': {
                  puni_instance_id: 'different-instance',
                  puni_logical_node: 'workers-agent-a',
                  puni_operation_id: 'replacement-operation',
                  puni_provider_state: 'running',
                },
              },
            },
          }),
          stderr: '',
        };
      });
    const dependencies = createProductionApplyDependencies(
      join(import.meta.dir, '../../..'),
      plan,
      planPath,
      run,
      () => new Date('2026-09-17T09:00:00.000Z'),
      'retirement-test',
    );

    expect(dependencies.observe(plan)).rejects.toThrow(/live hcloud identity/i);
    // Proof: substituting a same-name provider instance in the production observation reaches no
    // retirement playbook against the replacement machine.
  });

  for (const [tag, label] of [
    ['drain', 'a blocked disruption budget'],
    ['verify', 'a retained enabled service or credential'],
  ] as const) {
    it(`does not issue a receipt after ${label}`, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'fleet-retirement-'));
      const { planPath, plan } = await prepareRetirement(directory);
      const journalPath = `${planPath}.journal.json`;
      const receiptPath = `${planPath}.retirement-receipt.json`;
      const { calls, run } = retirementRunner(tag);
      const dependencies = createProductionApplyDependencies(
        join(import.meta.dir, '../../..'),
        plan,
        planPath,
        run,
        () => new Date('2026-09-17T09:00:00.000Z'),
        'retirement-test',
      );

      expect(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath,
          dependencies,
        }),
      ).rejects.toThrow(new RegExp(`${tag}.*failed`, 'i'));
      expect(access(receiptPath)).rejects.toThrow();
      expect(
        calls.some(
          ({ executable, arguments: arguments_ }) =>
            executable === 'ansible-playbook' &&
            arguments_.includes('--tags') &&
            arguments_.includes('verify'),
        ),
      ).toBe(tag === 'verify');
      // Proof: injected PDB drain and retained-service verification failures leave the production
      // apply journal recoverable and cannot reach the completion-receipt effect.
    });
  }
});
