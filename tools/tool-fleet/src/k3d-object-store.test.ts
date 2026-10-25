import { describe, expect, it } from 'bun:test';

import { bootstrapLab, type K3dLabRecord, objectStoreNodes } from './k3d-lab';

const tools = { k3d: 'locked-k3d', kubectl: 'locked-kubectl' };
const clusters: K3dLabRecord['clusters'] = [
  {
    name: 'owned-platform',
    role: 'platform',
    clusterId: 'platform-local',
    context: 'owned-platform',
    kubeconfig: '/owned/kubeconfig',
    apiPort: 40001,
  },
];
describe('Flux lab object-store prerequisite', () => {
  it('registers both worker agents as well as the platform and worker servers', () => {
    const cluster = clusters[0];
    expect(objectStoreNodes(cluster)).toEqual(['k3d-owned-platform-server-0']);
    expect(objectStoreNodes({ ...cluster, name: 'owned-workers', role: 'workers' })).toEqual([
      'k3d-owned-workers-server-0',
      'k3d-owned-workers-agent-0',
      'k3d-owned-workers-agent-1',
    ]);
  });
  for (const fault of [
    'absent digest',
    'wrong manifest digest',
    'failed import',
    'missing TLS input',
  ]) {
    it(`refuses ${fault} before Flux bootstrap`, async () => {
      let scheduled = false;
      await bootstrapLab(
        '/owned',
        tools,
        'owned',
        clusters,
        true,
        () => Promise.reject(new Error(fault)),
        () => {
          scheduled = true;
          return Promise.resolve();
        },
      ).then(
        () => {
          throw new Error('Preparation succeeded');
        },
        (cause: unknown) => {
          expect(cause).toEqual(new Error(fault));
        },
      );
      expect(scheduled).toBe(false);
    });
  }
  it('prepares all nodes before bootstrapping the Flux controllers', async () => {
    const events: string[] = [];
    await bootstrapLab(
      '/owned',
      tools,
      'owned',
      clusters,
      true,
      (_root, _tools, prepared) => {
        events.push(`prepare:${prepared.map((cluster) => cluster.name).join(',')}`);
        return Promise.resolve();
      },
      (_root, _tools, _labId, cluster) => {
        events.push(`bootstrap:${cluster.name}`);
        return Promise.resolve();
      },
    );
    expect(events).toEqual(['prepare:owned-platform', 'bootstrap:owned-platform']);
  });
  it('does not require the object store for the app-only profile', async () => {
    await bootstrapLab(
      '/owned',
      tools,
      'owned',
      clusters,
      false,
      () => Promise.reject(new Error('App profile must not build object storage')),
      () => Promise.resolve(),
    );
  });
});
