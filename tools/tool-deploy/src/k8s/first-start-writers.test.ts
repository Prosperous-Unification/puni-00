import { expect, it } from 'bun:test';

import { assertAppActors, assertPvcControllers, assertPvcWriters } from './first-start-writers';

const pvc = 'wbs-data';
const template = {
  volumes: [{ name: 'database', persistentVolumeClaim: { claimName: pvc } }],
  containers: [{ name: 'unlabeled', volumeMounts: [{ name: 'database', mountPath: '/stolen' }] }],
};
for (const fault of ['unlabeled', 'terminating', 'readonly', 'pending', 'init-only'] as const) {
  it(`complete PVC inventory refuses ${fault} live mount`, () => {
    const spec = structuredClone(template);
    const pod = {
      metadata: {
        name: 'rogue',
        labels: {},
        deletionTimestamp: fault === 'terminating' ? '2026-10-14' : null,
      },
      spec,
      status: { phase: fault === 'pending' ? 'Pending' : 'Running' },
    };
    if (fault === 'readonly')
      Object.assign(spec.volumes[0].persistentVolumeClaim, { readOnly: true });
    if (fault === 'init-only') {
      Object.assign(spec, { initContainers: [spec.containers[0]] });
      spec.containers = [];
    }
    expect(() => {
      assertPvcWriters({ items: [pod] }, pvc, true, new Set());
    }).toThrow();
  });
}
it('completed Pods are ignored but active unknown controllers cannot create a PVC writer', () => {
  expect(() => {
    assertPvcWriters(
      { items: [{ metadata: { name: 'done' }, spec: template, status: { phase: 'Succeeded' } }] },
      pvc,
      true,
      new Set(),
    );
  }).not.toThrow();
  const source = [
    {
      kind: 'Deployment',
      metadata: { name: 'wbs-backend', uid: 'backend' },
      spec: { replicas: 0, template: { spec: template } },
    },
  ];
  expect(() =>
    assertPvcControllers({ items: source }, pvc, true, 'backend', new Set()),
  ).not.toThrow();
  for (const kind of [
    'Deployment',
    'StatefulSet',
    'DaemonSet',
    'ReplicationController',
    'ReplicaSet',
    'Job',
    'CronJob',
  ]) {
    const spec =
      kind === 'CronJob'
        ? { suspend: false, jobTemplate: { spec: { template: { spec: template } } } }
        : { replicas: 1, template: { spec: template } };
    expect(() =>
      assertPvcControllers(
        { items: [{ kind, metadata: { name: 'rogue' }, spec }] },
        pvc,
        true,
        'backend',
        new Set(),
      ),
    ).toThrow();
  }
});

for (const fault of ['controller', 'missing', 'pod', 'selected'] as const) {
  it(`complete app inventory refuses ${fault} public traffic actor`, () => {
    const deployment = { kind: 'Deployment', metadata: { uid: 'gateway' }, spec: { replicas: 0 } };
    const controllers = fault === 'missing' ? [] : [deployment];
    if (fault === 'controller')
      controllers.push({ kind: 'Deployment', metadata: { uid: 'rogue' }, spec: { replicas: 0 } });
    const pod = {
      metadata: {
        labels: fault === 'selected' ? { 'puni.dev/writes': 'fenced' } : {},
        ownerReferences: [{ controller: true, kind: 'ReplicaSet', uid: 'unknown' }],
      },
      status: { phase: 'Running' },
    };
    expect(() => {
      assertAppActors(
        { items: controllers },
        { items: fault === 'pod' || fault === 'selected' ? [pod] : [] },
        new Set(['gateway']),
        true,
      );
    }).toThrow();
  });
}
