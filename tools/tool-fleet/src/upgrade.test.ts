import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { applyOperation } from './apply';
import { digestObservation } from './observation';
import { sealOperationPlan } from './plan';
import {
  type CommandRequest,
  type CommandResponse,
  createProductionApplyDependencies,
} from './production-apply';
import { fleetFixture, observationFixture } from './testing/fleet';
import { planUpgrade } from './upgrade';

const installedVersions = {
  'platform-a': 'v1.36.4+k3s1',
  'workers-server-a': 'v1.36.4+k3s1',
  'workers-agent-a': 'v1.36.4+k3s1',
  'workers-agent-b': 'v1.36.4+k3s1',
} as const;

describe('planUpgrade', () => {
  it('orders servers before agents and requires a snapshot for every server', () => {
    const fleet = fleetFixture();
    const observation = observationFixture(fleet);
    expect(() =>
      planUpgrade(fleet, observation, 'v1.36.5+k3s1', {
        installedVersions,
        snapshotIds: {},
      }),
    ).toThrow(/snapshot/i);
    const plan = planUpgrade(fleet, observation, 'v1.36.5+k3s1', {
      installedVersions,
      snapshotIds: {
        platform: 'etcd-platform-snapshot',
        workers: 'etcd-workers-snapshot',
      },
    });
    expect(plan.nodes.map(({ nodeId }) => nodeId)).toEqual([
      'platform-a',
      'workers-server-a',
      'workers-agent-a',
      'workers-agent-b',
    ]);
    expect(plan.nodes[0]?.steps).toContain('prove etcd snapshot and token recovery material');
  });

  it('uses serial health-gated playbook upgrades with exact artifacts', async () => {
    const root = join(import.meta.dir, '../../..');
    const playbook = await readFile(join(root, 'infra/ansible/playbooks/upgrade.yml'), 'utf8');
    expect(playbook).toContain('serial: 1');
    expect(playbook).toContain('etcd-snapshot');
    expect(playbook).toContain("checksum: 'sha256:{{ puni_k3s_sha256 }}'");
    expect(playbook).toContain('--for=condition=Ready');
    expect(playbook).not.toContain('--force');
    expect(playbook).not.toContain('--delete-emptydir-data');
  });

  it('refuses channels, downgrades, and an unhealthy node', () => {
    const fleet = fleetFixture();
    const observation = observationFixture(fleet);
    expect(() =>
      planUpgrade(fleet, observation, 'latest', {
        installedVersions,
        snapshotIds: {},
      }),
    ).toThrow(/version/i);
    expect(() =>
      planUpgrade(fleet, observation, 'v1.35.9+k3s1', {
        installedVersions,
        snapshotIds: {},
      }),
    ).toThrow(/downgrade/i);
    expect(() =>
      planUpgrade(fleet, observation, 'v1.36.4+k3s1', {
        installedVersions,
        snapshotIds: {},
      }),
    ).toThrow(/already installed/i);
    expect(() =>
      planUpgrade(fleet, { ...observation, desiredRevision: 'stale-revision' }, 'v1.36.5+k3s1', {
        installedVersions,
        snapshotIds: {},
      }),
    ).toThrow(/current fleet observation/i);
    const target = observation.nodes[0];
    const { digest: _digest, ...body } = observation;
    const changed = {
      ...body,
      nodes: observation.nodes.map((node) =>
        node === target ? { ...node, states: ['enrolled', 'not-ready'] as const } : node,
      ),
    };
    const changedObservation = { ...changed, digest: digestObservation(changed) };
    expect(() =>
      planUpgrade(fleet, changedObservation, 'v1.36.5+k3s1', {
        installedVersions,
        snapshotIds: {
          platform: 'etcd-platform-snapshot',
          workers: 'etcd-workers-snapshot',
        },
      }),
    ).toThrow(/Ready/i);
  });

  it('applies one exact version transition and verifies the installed result', async () => {
    const fleet = fleetFixture();
    const observation = observationFixture(fleet);
    const directory = await mkdtemp(join(tmpdir(), 'fleet-upgrade-'));
    const planPath = join(directory, 'upgrade.json');
    const knownHostsPath = `${planPath}.known_hosts`;
    const inventorySource = `${JSON.stringify({
      all: {
        children: {
          k3s_agents: { hosts: {} },
          k3s_join_servers: {
            hosts: {
              'platform-a': {
                ansible_host: '10.0.0.11',
                puni_machine_id: '0123456789abcdef0123456789abcdef',
                puni_provider_identity: '1001',
                ansible_ssh_common_args: `-o UserKnownHostsFile=${knownHostsPath} -o StrictHostKeyChecking=yes`,
              },
            },
          },
        },
      },
    })}\n`;
    const knownHostsSource = '10.0.0.11 ssh-ed25519 AAAAC3NzaUpgradeKey\n';
    const evidenceSource = `${JSON.stringify({
      schemaVersion: 1,
      installedVersions: {
        'platform-a': 'v1.36.3+k3s1',
        'workers-server-a': 'v1.36.4+k3s1',
        'workers-agent-a': 'v1.36.4+k3s1',
        'workers-agent-b': 'v1.36.4+k3s1',
      },
      snapshotIds: { platform: 'snapshot-platform-20260917' },
    })}\n`;
    await writeFile(`${planPath}.inventory.json`, inventorySource, { mode: 0o600 });
    await writeFile(knownHostsPath, knownHostsSource, { mode: 0o600 });
    await writeFile(`${planPath}.upgrade-evidence.json`, evidenceSource, { mode: 0o600 });
    const plan = sealOperationPlan({
      schemaVersion: 1,
      desiredRevision: fleet.revision,
      observationDigest: observation.digest,
      observedAt: observation.observedAt,
      expiresAt: '2026-09-18T00:00:00.000Z',
      request: {
        kind: 'upgrade',
        nodeId: 'platform-a',
        version: 'v1.36.4+k3s1',
        upgradeEvidenceSha256: createHash('sha256').update(evidenceSource).digest('hex'),
        inventorySha256: createHash('sha256').update(inventorySource).digest('hex'),
        knownHostsSha256: createHash('sha256').update(knownHostsSource).digest('hex'),
      },
      targetIdentities: ['node:platform-a', 'hcloud:1001', 'kubernetes:uid-1', 'cluster:platform'],
      preconditions: ['exact serial upgrade evidence'],
      effects: ['upgrade platform-a from v1.36.3+k3s1 to v1.36.4+k3s1 with serial health gates'],
      affectedCapabilities: ['control-plane', 'ingress', 'product'],
      storageImplication: 'preserved',
      downtimeImplication: 'serial-reschedule',
      summary: 'upgrade platform-a',
    });
    let leaseHolder: string | undefined;
    let installedVersion = 'v1.36.3+k3s1';
    const run = (request: CommandRequest): Promise<CommandResponse> =>
      Promise.resolve().then(() => {
        if (request.executable === 'kubectl') {
          if (request.arguments.includes('node')) {
            return {
              exitCode: 0,
              stdout: JSON.stringify({
                metadata: { uid: 'uid-1' },
                status: { conditions: [{ type: 'Ready', status: 'True' }] },
              }),
              stderr: '',
            };
          }
          if (request.arguments.includes('get')) {
            return leaseHolder === undefined
              ? { exitCode: 1, stdout: '', stderr: 'NotFound' }
              : {
                  exitCode: 0,
                  stdout: JSON.stringify({
                    metadata: { resourceVersion: '4' },
                    spec: {
                      holderIdentity: leaseHolder,
                      leaseDurationSeconds: 300,
                      renewTime: '2026-09-17T09:00:00.000Z',
                    },
                  }),
                  stderr: '',
                };
          }
          if (request.arguments.includes('delete')) {
            leaseHolder = undefined;
            return { exitCode: 0, stdout: '', stderr: '' };
          }
          const manifest = JSON.parse(request.stdin ?? '{}') as {
            spec?: { holderIdentity?: string };
          };
          leaseHolder = manifest.spec?.holderIdentity;
          return {
            exitCode: 0,
            stdout: JSON.stringify({ ...manifest, metadata: { resourceVersion: '4' } }),
            stderr: '',
          };
        }
        if (request.executable === 'ansible-inventory') {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              _meta: {
                hostvars: {
                  'platform-a': {
                    puni_instance_id: '1001',
                    puni_logical_node: 'platform-a',
                    puni_operation_id: 'provision-platform-a',
                    puni_provider_state: 'running',
                  },
                },
              },
            }),
            stderr: '',
          };
        }
        if (request.executable === 'ansible-playbook') {
          if (request.arguments.some((argument) => argument.endsWith('/discover.yml'))) {
            return {
              exitCode: 0,
              stdout:
                'PUNI_MACHINE_FACT={"address":"10.0.0.11","machineId":"0123456789abcdef0123456789abcdef","name":"platform-a"}\nPLAY RECAP\nplatform-a : ok=1 changed=0 unreachable=0 failed=0',
              stderr: '',
            };
          }
          if (!request.arguments.includes('--tags')) installedVersion = 'v1.36.4+k3s1';
          return {
            exitCode: 0,
            stdout: `PUNI_K3S_VERSION=${installedVersion}\nPLAY RECAP\nplatform-a : ok=3 changed=0 unreachable=0 failed=0`,
            stderr: '',
          };
        }
        throw new Error(`Unexpected upgrade command ${request.executable}`);
      });
    const dependencies = createProductionApplyDependencies(
      join(import.meta.dir, '../../..'),
      plan,
      planPath,
      run,
      () => new Date('2026-09-17T09:00:00.000Z'),
      'upgrade-test',
    );

    const receipt = await applyOperation({
      plan,
      expectedSha256: plan.planSha256,
      journalPath: `${planPath}.journal.json`,
      dependencies,
    });
    expect(receipt.state).toBe('complete');
    expect(installedVersion).toBe('v1.36.4+k3s1');
  });
});
