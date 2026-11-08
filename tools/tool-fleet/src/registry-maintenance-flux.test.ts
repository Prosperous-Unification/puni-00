import { expect, test } from 'bun:test';

import { fenceRegistryControllers } from './registry-maintenance-flux';

function fixture(fault = '') {
  const order = ['puni-cluster', 'fleet-helsinki', 'registry-storage', 'platform'];
  const owners = order.map((name) => ({
    name,
    uid: name + '-uid',
    cluster: name === 'fleet-helsinki' || name === 'registry-storage' ? 'management' : 'platform',
    source:
      name === 'fleet-helsinki' || name === 'registry-storage' ? 'puni-fleet' : 'puni-platform',
    path:
      name === 'fleet-helsinki'
        ? './clusters/helsinki'
        : name === 'registry-storage'
          ? './infrastructure/registry-storage'
          : name === 'puni-cluster'
            ? './infra/clusters/platform/production'
            : './infra/platform/registry/production',
    specificationSha256: 'a'.repeat(64),
    sourceRevision: 'pinned-revision',
    suspended: false,
    requestedAt: null,
  }));
  const states = new Map(
    owners.map((owner) => [
      owner.name,
      {
        spec: { suspend: false },
        status: { lastHandledReconcileAt: 'old' },
        polls: 0,
        request: '',
      },
    ]),
  );
  const events: string[] = [];
  let replicas = 1;
  const ports = {
    withdraw: () => {
      events.push('withdraw');
      return Promise.resolve();
    },
    patch: (owner: (typeof owners)[number], requestedAt: string) => {
      const state = states.get(owner.name);
      if (state === undefined) throw Error('Missing fixture owner');
      state.spec.suspend = true;
      state.request = requestedAt;
      events.push('patch:' + owner.name);
      return Promise.resolve();
    },
    observe: (owner: (typeof owners)[number]) => {
      const state = states.get(owner.name);
      if (state === undefined) throw Error('Missing fixture owner');
      state.polls++;
      if (state.polls === 1) {
        if (owner.name === 'fleet-helsinki') {
          const child = states.get('registry-storage');
          if (child !== undefined) child.spec.suspend = false;
        }
        if (owner.name === 'puni-cluster') replicas = 1;
      } else if (fault !== owner.name + '-stale')
        state.status.lastHandledReconcileAt = state.request;
      return Promise.resolve({
        suspended: fault === owner.name + '-revive' ? false : state.spec.suspend,
        requestedAt: state.status.lastHandledReconcileAt,
      });
    },
    verify: () => Promise.resolve(),
    stop: () => {
      replicas = 0;
      events.push('stop');
      return Promise.resolve();
    },
    hasWriters: () => Promise.resolve(fault === 'writer' || replicas !== 0),
  };
  return { owners, ports, events };
}

test('both parent barriers drain old child reconciles before stopping writers', async () => {
  const run = fixture();
  const receipt = await fenceRegistryControllers(run.owners, run.ports, 1000, 1);
  expect(receipt).toHaveLength(4);
  expect(run.events).toEqual([
    'withdraw',
    'patch:puni-cluster',
    'patch:fleet-helsinki',
    'patch:registry-storage',
    'patch:platform',
    'stop',
  ]);
});
for (const fault of [
  'puni-cluster-stale',
  'fleet-helsinki-stale',
  'registry-storage-stale',
  'platform-stale',
  'registry-storage-revive',
  'writer',
]) {
  test(`fresh complete controller fence refuses ${fault}`, async () => {
    const run = fixture(fault);
    let failure: unknown;
    try {
      await fenceRegistryControllers(run.owners, run.ports, 10, 1);
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(Error);
    if (fault !== 'writer') expect(run.events).not.toContain('stop');
  });
}
