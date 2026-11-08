import { expect, test } from 'bun:test';

import { observeRegistryCluster } from './registry-maintenance-cluster';
import { registryClusterFixture } from './registry-maintenance-cluster.fixture';
import { registryOwnerPaths } from './registry-maintenance-installation';
import { requireRejection } from './registry-rejection.fixture';

test('cluster audit covers both parent graphs, source artifacts, controller, journal and registry storage', async () => {
  const proof = registryClusterFixture();
  const observed = await observeRegistryCluster(
    proof.installed,
    proof.installed.ordinary,
    proof.read,
  );
  expect(observed.owners.map((owner) => owner.name)).toEqual(
    registryOwnerPaths.map((owner) => owner.name),
  );
  expect(observed.replicas).toBe(1);
});
for (const fault of [
  'source-artifact',
  'owner-applied',
  'controller-ready',
  'node-machine',
  'pvc-bound',
  'service-selector',
  'missing-journal',
  'replicas',
] as const) {
  test(`fresh complete cluster audit refuses ${fault}`, async () => {
    const proof = registryClusterFixture();
    const resource = (kind: string, name: string) => {
      const selected = proof.resources.get(`${kind}/${name}`);
      if (!selected) throw new Error('Missing fixture');
      return selected;
    };
    if (fault === 'source-artifact')
      resource('GitRepository', 'puni-fleet').status = {
        artifact: { revision: 'foreign', digest: 'sha256:' + 'a'.repeat(64) },
      };
    if (fault === 'owner-applied')
      resource('Kustomization', 'fleet-helsinki').status = { lastAppliedRevision: 'foreign' };
    if (fault === 'controller-ready')
      resource('Deployment', 'kustomize-controller').status = {
        observedGeneration: 1,
        readyReplicas: 0,
        availableReplicas: 0,
      };
    if (fault === 'node-machine')
      resource('Node', 'h4claw').status = {
        nodeInfo: { machineID: 'b'.repeat(32) },
        conditions: [{ type: 'Ready', status: 'True' }],
      };
    if (fault === 'pvc-bound')
      resource('PersistentVolumeClaim', 'registry-bounded').status = { phase: 'Pending' };
    if (fault === 'service-selector')
      resource('Service', 'registry').spec = { selector: { arbitrary: 'writer' } };
    if (fault === 'missing-journal') {
      const journal = proof.installed.journalPvc;
      // Proof: restoring the old nonexistent managed key made this setup assertion fail false; no missing-state admission is claimed.
      expect(proof.resources.delete(`${journal.kind}/${journal.name}`)).toBe(true);
    }
    if (fault === 'replicas')
      resource('Deployment', 'registry').spec = {
        ...resource('Deployment', 'registry').spec,
        replicas: 2,
      };
    expect(
      (
        await requireRejection(
          observeRegistryCluster(proof.installed, proof.installed.ordinary, proof.read),
        )
      ).throwCause,
    ).toThrow();
  });
}

test('service restoration waits for the current deployment generation to become available', async () => {
  const { registryDeploymentReady } = await import('./registry-maintenance-cluster');
  expect(
    registryDeploymentReady(
      {
        metadata: { generation: 4 },
        status: { observedGeneration: 3, readyReplicas: 1, availableReplicas: 1 },
      },
      1,
    ),
  ).toBe(false);
  expect(
    registryDeploymentReady(
      {
        metadata: { generation: 4 },
        status: { observedGeneration: 4, readyReplicas: 0, availableReplicas: 0 },
      },
      1,
    ),
  ).toBe(false);
  expect(
    registryDeploymentReady(
      {
        metadata: { generation: 4 },
        status: { observedGeneration: 4, readyReplicas: 1, availableReplicas: 1 },
      },
      1,
    ),
  ).toBe(true);
  expect(() => registryDeploymentReady({ metadata: { generation: 4 } }, 1)).toThrow();
});
