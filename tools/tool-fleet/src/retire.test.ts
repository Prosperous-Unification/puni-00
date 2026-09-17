import { createHash } from 'node:crypto';
import { access, chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';
import { parse } from 'yaml';

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
    expect(playbook).toContain('set -euo pipefail;');
    expect(playbook).toContain('/v3/cluster/member/list');
    expect(playbook).toContain('https://127.0.0.1:2382/v3/cluster/member/list');
    expect(playbook).toContain(`--data '{"linearizable":true}'`);
    expect(playbook).toContain("'etcd.k3s.cattle.io/removed-node-name'");
    expect(playbook).toContain('- /etc/rancher/k3s');
    expect(playbook).toContain('- /var/lib/rancher/k3s/server/tls');
    expect(playbook).toContain('/var/lib/rancher/k3s/server/agent-token');
    expect(playbook).toContain('state: absent');
    expect(playbook).not.toContain('--force');
    expect(playbook).not.toContain('--delete-emptydir-data');

    const plays = parse(playbook) as {
      tasks: {
        name: string;
        'ansible.builtin.shell'?: { cmd: string };
      }[];
    }[];
    const shell = (name: string): string => {
      const command = plays[0]?.tasks.find((task) => task.name === name)?.['ansible.builtin.shell']
        ?.cmd;
      if (command === undefined) throw new Error(`Missing retirement shell task ${name}`);
      return command;
    };
    const directory = await mkdtemp(join(tmpdir(), 'fleet-retirement-shell-'));
    const kubectl = join(directory, 'kubectl');
    await writeFile(
      kubectl,
      `#!/bin/bash
if [[ "$*" == *"volumeattachments"* || "$*" == *"--field-selector"* ]]; then
  printf '%s\\n' '{"items":[]}'
else
  printf '%s\\n' '{"items":[{"status":{"phase":"Pending"}}]}'
fi
`,
    );
    await chmod(kubectl, 0o700);
    const detach = Bun.spawnSync(
      [
        '/bin/bash',
        '-c',
        shell('Require workloads healthy elsewhere and all volume attachments detached'),
      ],
      {
        env: { ...process.env, PATH: `${directory}:${process.env['PATH'] ?? ''}` },
      },
    );
    expect(detach.exitCode).not.toBe(0);

    const members = {
      members: [
        { ID: '1', name: 'target', isLearner: false, clientURLs: ['https://target:2379'] },
        ...Array.from({ length: 6 }, (_, position) => ({
          ID: String(position + 2),
          name: `survivor-${String(position + 1)}`,
          isLearner: false,
          clientURLs: [`https://survivor-${String(position + 1)}:2379`],
        })),
      ],
    };
    const curl = join(directory, 'curl');
    await writeFile(curl, `#!/bin/bash\nprintf '%s\\n' '${JSON.stringify(members)}'\n`);
    await chmod(curl, 0o700);
    const membership = Bun.spawnSync(
      [
        '/bin/bash',
        '-c',
        shell('Read actual embedded etcd voting membership').replace(
          "target='{{ puni_etcd_member_name }}';",
          "target='target';",
        ),
      ],
      { env: { ...process.env, PATH: `${directory}:${process.env['PATH'] ?? ''}` } },
    );
    expect(membership.exitCode).toBe(0);
    const voters = membership.stdout.toString().trim();
    const voterNodes = Array.from({ length: 6 }, (_, position) => ({
      metadata: {
        name: `node-${String(position + 1)}`,
        annotations: {
          'etcd.k3s.cattle.io/node-name': `survivor-${String(position + 1)}`,
        },
      },
    }));
    const mappingCommand = shell('Map every surviving etcd voter to one exact Kubernetes node')
      .replace("'{{ puni_kube_context }}'", "'workers'")
      .replace("'{{ puni_etcd_member_name }}'", "'target'")
      .replace("'{{ puni_actual_etcd_voters.stdout }}'", `'${voters}'`);
    const runMapping = async (nodes: readonly (typeof voterNodes)[number][]) => {
      await writeFile(
        kubectl,
        `#!/bin/bash\nprintf '%s\\n' '${JSON.stringify({ items: nodes })}'\n`,
      );
      return Bun.spawnSync(['/bin/bash', '-c', mappingCommand], {
        env: { ...process.env, PATH: `${directory}:${process.env['PATH'] ?? ''}` },
      });
    };
    expect((await runMapping(voterNodes)).exitCode).toBe(0);
    const firstNode = voterNodes[0];
    expect(
      (
        await runMapping([
          ...voterNodes,
          { ...firstNode, metadata: { ...firstNode.metadata, name: 'duplicate-node' } },
        ])
      ).exitCode,
    ).not.toBe(0);

    const probes = (healthyCount: number) =>
      Array.from({ length: 6 }, (_, position) => ({
        rc: position < healthyCount ? 0 : 22,
        puni_surviving_etcd_node: { memberId: String(position + 2) },
      }));
    const quorumCommand = shell(
      'Require a freshly healthy surviving majority of distinct etcd voters',
    )
      .replace("'{{ puni_actual_etcd_voters.stdout }}'", `'${voters}'`)
      .replace("'{{ puni_minimum_surviving_control_planes | int }}'", '3');
    const runQuorum = (healthyCount: number) =>
      Bun.spawnSync(
        [
          '/bin/bash',
          '-c',
          quorumCommand.replace(
            "'{{ puni_surviving_etcd_health.results | to_json }}'",
            `'${JSON.stringify(probes(healthyCount))}'`,
          ),
        ],
        { env: process.env },
      );
    expect(runQuorum(4).exitCode).toBe(0);
    expect(runQuorum(3).exitCode).not.toBe(0);
    expect(shell('Probe fresh linearizable health on every surviving etcd voter')).toContain(
      'https://127.0.0.1:2382/health?serializable=false',
    );
    // Proof: the exact production shells fail when a later empty attachment query follows a
    // Pending workload and when only three survivors of seven actual etcd voters are healthy.
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

function retirementOperation(
  inventorySha256: string,
  knownHostsSha256: string,
  backupReceiptSha256: string,
): OperationPlan {
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
      backupReceiptSha256,
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
      ...Object.entries(retirement.requiredCapabilityFloors).map(
        ([capability, floor]) => `capability-floor:${capability}:${String(floor)}`,
      ),
    ],
    preconditions: ['fresh complete observation'],
    effects: retirement.steps,
    affectedCapabilities: retirement.affectedCapabilities,
    storageImplication: 'volume-detach-and-retention-must-converge',
    downtimeImplication: 'capacity-dependent',
    summary: 'retire workers-agent-a',
  });
}

async function prepareRetirement(
  directory: string,
  backupProviderIdentity = 'hcloud:2002',
): Promise<{
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
  const backupReceiptSource = `${JSON.stringify({
    schemaVersion: 1,
    receiptId: 'backup-workers-1',
    nodeId: 'workers-agent-a',
    providerIdentity: backupProviderIdentity,
    snapshotId: 'snapshot-workers-20260917',
    verifiedAt: '2026-09-17T08:55:00.000Z',
    state: 'complete',
  })}\n`;
  await writeFile(`${planPath}.inventory.json`, inventorySource, { mode: 0o600 });
  await writeFile(knownHostsPath, knownHostsSource, { mode: 0o600 });
  await writeFile(`${planPath}.backup-receipt.json`, backupReceiptSource, { mode: 0o600 });
  return {
    planPath,
    plan: retirementOperation(
      createHash('sha256').update(inventorySource).digest('hex'),
      createHash('sha256').update(knownHostsSource).digest('hex'),
      createHash('sha256').update(backupReceiptSource).digest('hex'),
    ),
  };
}

function retirementRunner(failingTag: string) {
  let holder: string | undefined;
  let nodePresent = true;
  let removedMemberName: string | undefined;
  const calls: CommandRequest[] = [];
  const run = (request: CommandRequest): Promise<CommandResponse> =>
    Promise.resolve().then(() => {
      calls.push(request);
      if (request.executable === 'kubectl') {
        if (request.arguments.includes('node') && request.arguments.includes('get')) {
          return nodePresent
            ? {
                exitCode: 0,
                stdout: JSON.stringify({
                  metadata: {
                    name: 'workers-agent-a',
                    uid: 'uid-3',
                    annotations: {
                      ...(removedMemberName === undefined
                        ? { 'etcd.k3s.cattle.io/node-name': 'etcd-workers-agent-a' }
                        : { 'etcd.k3s.cattle.io/removed-node-name': removedMemberName }),
                    },
                  },
                  spec: { providerID: 'hcloud://2002' },
                }),
                stderr: '',
              }
            : { exitCode: 1, stdout: '', stderr: 'Error from server (NotFound)' };
        }
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
        if (tag === 'kubernetes-membership' && tag !== failingTag) nodePresent = false;
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
  return {
    calls,
    removeNode: () => (nodePresent = false),
    run,
    setRemovedMemberName: (memberName: string) => (removedMemberName = memberName),
  };
}

describe('production retirement', () => {
  it('binds response-lost etcd removal recovery to the persisted exact member name', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-retirement-etcd-identity-'));
    const prepared = await prepareRetirement(directory);
    const { planSha256: _planSha256, ...body } = prepared.plan;
    const plan = sealOperationPlan({
      ...body,
      affectedCapabilities: ['control-plane', ...prepared.plan.affectedCapabilities],
    });
    const controlled = retirementRunner('never');
    const dependencies = createProductionApplyDependencies(
      directory,
      plan,
      prepared.planPath,
      controlled.run,
      () => new Date('2026-09-17T09:00:00.000Z'),
      'retirement-test',
    );
    await dependencies.applyEffect(
      plan,
      'remove embedded etcd membership',
      'effect-9',
      () => Promise.resolve(),
      false,
    );
    controlled.setRemovedMemberName('etcd-workers-agent-a');
    expect(await dependencies.observe(plan)).toMatchObject({ providerState: 'ready' });
    controlled.setRemovedMemberName('stale-member-from-an-earlier-incarnation');
    expect(dependencies.observe(plan)).rejects.toThrow(/etcd member identity/i);
    // Proof: injecting an unrelated K3s removed-node-name after a lost response is rejected
    // against the identity persisted before the membership mutation.
  });

  it('recovers a lost Kubernetes deletion response without deleting membership twice', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-retirement-delete-recovery-'));
    const { planPath, plan } = await prepareRetirement(directory);
    const controlled = retirementRunner('never');
    const dependencies = createProductionApplyDependencies(
      directory,
      plan,
      planPath,
      controlled.run,
      () => new Date('2026-09-17T09:00:00.000Z'),
      'retirement-test',
    );
    const beforeMutation = () => Promise.resolve();
    await dependencies.applyEffect(
      plan,
      'remove embedded etcd membership',
      'effect-9',
      beforeMutation,
      false,
    );
    controlled.removeNode();
    await dependencies.applyEffect(
      plan,
      'remove Kubernetes membership',
      'effect-11',
      beforeMutation,
      true,
    );
    expect(
      controlled.calls.filter(
        ({ executable, arguments: commandArguments }) =>
          executable === 'ansible-playbook' && commandArguments.includes('kubernetes-membership'),
      ),
    ).toHaveLength(0);
    // Proof: an exact prior etcd-removal record plus live Node absence recovers a lost deletion
    // response without replaying the membership mutation.
  });

  it('uses hash-bound static enrollment evidence for an external SSH node', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-retirement-ssh-'));
    const prepared = await prepareRetirement(directory, 'ssh:0123456789abcdef0123456789abcdef');
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

  it('refuses changed backup evidence before observing the host', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-retirement-backup-'));
    const { planPath, plan } = await prepareRetirement(directory);
    await writeFile(`${planPath}.backup-receipt.json`, '{}\n', { mode: 0o600 });
    const { calls, run } = retirementRunner('never');
    const dependencies = createProductionApplyDependencies(
      directory,
      plan,
      planPath,
      run,
      () => new Date('2026-09-17T09:00:00.000Z'),
      'retirement-test',
    );

    expect(dependencies.observe(plan)).rejects.toThrow(/backup receipt.*SHA-256/i);
    expect(calls).toHaveLength(0);
    // Proof: changing the reviewed backup receipt reaches neither host observation nor retirement
    // mutation through the production adapter.
  });

  it('persists an authoritative exclusion consumed by later enrollment', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-retirement-exclusion-'));
    const { planPath, plan } = await prepareRetirement(directory);
    const { run } = retirementRunner('never');
    const dependencies = createProductionApplyDependencies(
      directory,
      plan,
      planPath,
      run,
      () => new Date('2026-09-17T09:00:00.000Z'),
      'retirement-test',
    );
    await applyOperation({
      plan,
      expectedSha256: plan.planSha256,
      journalPath: `${planPath}.journal.json`,
      dependencies,
    });
    const exclusionPath = join(
      directory,
      '.puni/fleet/retired',
      `${createHash('sha256').update('workers-agent-a').digest('hex')}.json`,
    );
    expect(JSON.parse(await readFile(exclusionPath, 'utf8'))).toMatchObject({
      nodeId: 'workers-agent-a',
      providerIdentity: 'hcloud:2002',
      state: 'retired',
    });

    const enroll = sealOperationPlan({
      schemaVersion: 1,
      desiredRevision: 'fleet-test-1',
      observationDigest: 'a'.repeat(64),
      observedAt: '2026-09-17T09:00:00.000Z',
      expiresAt: '2026-09-18T00:00:00.000Z',
      request: {
        kind: 'enroll',
        nodeId: 'workers-agent-a',
        clusterId: 'workers',
        inventorySha256: 'a'.repeat(64),
        ansibleVariablesSha256: 'b'.repeat(64),
        knownHostsSha256: 'c'.repeat(64),
      },
      targetIdentities: ['node:workers-agent-a', 'hcloud:2002', 'cluster:workers'],
      preconditions: ['exact membership'],
      effects: ['verify provider identity'],
      affectedCapabilities: ['execution'],
      storageImplication: 'unchanged',
      downtimeImplication: 'none',
      summary: 'refuse retired enrollment',
    });
    const enrollment = createProductionApplyDependencies(
      directory,
      enroll,
      join(directory, 'enroll.json'),
      run,
    );
    expect(enrollment.observe(enroll)).rejects.toThrow(/retired membership/i);
    // Proof: the completed production retirement writes the shared exclusion registry, and the
    // production enrollment adapter consumes it before SSH or provider observation.
  });

  it('refuses a live provider identity that differs from the reviewed target', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-retirement-identity-'));
    const { planPath, plan } = await prepareRetirement(directory);
    const run = (request: CommandRequest): Promise<CommandResponse> =>
      Promise.resolve().then(() => {
        if (request.executable === 'kubectl' && request.arguments.includes('node')) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              metadata: { name: 'workers-agent-a', uid: 'uid-3' },
              spec: { providerID: 'hcloud://2002' },
            }),
            stderr: '',
          };
        }
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
    ['preflight', 'a lost capability floor or target-affined persistent volume'],
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
      ).rejects.toThrow(
        tag === 'preflight'
          ? /capacity and storage safety.*failed/i
          : new RegExp(`${tag}.*failed`, 'i'),
      );
      expect(access(receiptPath)).rejects.toThrow();
      expect(
        calls.some(
          ({ executable, arguments: arguments_ }) =>
            executable === 'ansible-playbook' &&
            arguments_.includes('--tags') &&
            arguments_.includes('verify'),
        ),
      ).toBe(tag === 'verify');
      // Proof: injected live capacity/storage, PDB drain, and retained-service verification
      // failures leave the production apply journal recoverable and cannot reach the receipt.
    });
  }
});
