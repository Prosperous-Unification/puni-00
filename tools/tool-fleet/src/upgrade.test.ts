import { describe, expect, it } from 'bun:test';

import { digestObservation } from './observation';
import { fleetFixture, observationFixture } from './testing/fleet';
import { planUpgrade } from './upgrade';

describe('planUpgrade', () => {
  it('orders servers before agents and requires a snapshot for every server', () => {
    const fleet = fleetFixture();
    const observation = observationFixture(fleet);
    expect(() =>
      planUpgrade(fleet, observation, 'v1.36.5+k3s1', {
        installedVersion: 'v1.36.4+k3s1',
        snapshotIds: {},
      }),
    ).toThrow(/snapshot/i);
    const plan = planUpgrade(fleet, observation, 'v1.36.5+k3s1', {
      installedVersion: 'v1.36.4+k3s1',
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
        installedVersion: 'v1.36.4+k3s1',
        snapshotIds: {},
      }),
    ).toThrow(/version/i);
    expect(() =>
      planUpgrade(fleet, observation, 'v1.35.9+k3s1', {
        installedVersion: 'v1.36.4+k3s1',
        snapshotIds: {},
      }),
    ).toThrow(/downgrade/i);
    expect(() =>
      planUpgrade(fleet, observation, 'v1.36.4+k3s1', {
        installedVersion: 'v1.36.4+k3s1',
        snapshotIds: {},
      }),
    ).toThrow(/already installed/i);
    expect(() =>
      planUpgrade(fleet, { ...observation, desiredRevision: 'stale-revision' }, 'v1.36.5+k3s1', {
        installedVersion: 'v1.36.4+k3s1',
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
        installedVersion: 'v1.36.4+k3s1',
        snapshotIds: {
          platform: 'etcd-platform-snapshot',
          workers: 'etcd-workers-snapshot',
        },
      }),
    ).toThrow(/Ready/i);
  });
});
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
