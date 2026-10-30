/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Fault fixtures deliberately permit malformed Kubernetes JSON; Bun's runtime rejects assertions are awaited although the installed types declare void. */
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { kubectlEffects } from './execute';
import { inspectStorageFence } from './storage-fence';

const namespace = 'wbs-solver';
const inventory =
  'deployments,statefulsets,daemonsets,replicasets,replicationcontrollers,jobs,cronjobs,podtemplates';
function fixture() {
  const metadata = (name: string) => ({ name, namespace, uid: `${name}-uid` });
  const writable = {
    volumes: [{ name: 'source', persistentVolumeClaim: { claimName: 'wbs-data' } }],
    containers: [{ name: 'backup', volumeMounts: [{ name: 'source', mountPath: '/data' }] }],
  };
  const objects: Record<string, any> = {
    'pvc/wbs-data': {
      metadata: metadata('wbs-data'),
      spec: { volumeName: 'disk' },
      status: { phase: 'Bound' },
    },
    'pv/disk': {
      metadata: { name: 'disk', uid: 'disk-uid' },
      spec: { claimRef: { name: 'wbs-data', namespace, uid: 'wbs-data-uid' } },
      status: { phase: 'Bound' },
    },
    'networkpolicy/wbs-backend-writers': {
      metadata: metadata('wbs-backend-writers'),
      spec: {
        podSelector: { matchLabels: { 'puni.dev/writes': 'fenced' } },
        policyTypes: ['Ingress'],
      },
    },
    'deployment/wbs-backend': {
      metadata: metadata('wbs-backend'),
      spec: { replicas: 0 },
      status: { replicas: 0 },
    },
    pods: { items: [] },
    [inventory]: {
      items: [
        {
          kind: 'Deployment',
          metadata: metadata('wbs-backend'),
          spec: { replicas: 0, template: { spec: writable } },
        },
        {
          kind: 'CronJob',
          metadata: metadata('sqlite-backup'),
          spec: { suspend: true, jobTemplate: { spec: { template: { spec: writable } } } },
        },
      ],
    },
    'kustomizations.kustomize.toolkit.fluxcd.io/release': {
      metadata: { name: 'release', namespace: 'flux-system', uid: 'flux-uid' },
      spec: { suspend: true },
    },
  };
  const calls: string[][] = [];
  return {
    objects,
    writable,
    calls,
    call: async (args: readonly string[]) => {
      await Promise.resolve();
      calls.push([...args]);
      const key = args[args.indexOf('get') + 1];
      if (!(key in objects)) throw new Error(`missing fixture ${key}`);
      return JSON.stringify(objects[key]);
    },
  };
}
const options = { namespace, flux: { namespace: 'flux-system', kustomization: 'release' } };
test('binds PVC/PV and stopped controllers with unfiltered inventory', async () => {
  const cluster = fixture();
  const fence = await inspectStorageFence(options, cluster.call);
  expect(fence.storage).toEqual({
    namespace,
    pvcName: 'wbs-data',
    pvcUid: 'wbs-data-uid',
    volumeName: 'disk',
    pvUid: 'disk-uid',
    databasePath: '/data/wbs.sqlite',
  });
  expect(fence.controllers).toContainEqual({
    kind: 'CronJob',
    name: 'sqlite-backup',
    uid: 'sqlite-backup-uid',
    state: 'suspended',
  });
  expect(cluster.calls.some((args) => args.includes('-l'))).toBe(false);
  expect(await inspectStorageFence(options, cluster.call, fence)).toEqual(fence);
});
const faults: Record<string, (cluster: ReturnType<typeof fixture>) => void> = {
  'replaced PVC': (c) => {
    c.objects['pvc/wbs-data'].metadata.uid = 'foreign';
    c.objects['pv/disk'].spec.claimRef.uid = 'foreign';
  },
  'foreign PV claim': (c) => {
    c.objects['pv/disk'].spec.claimRef.uid = 'foreign';
  },
  'unbound PVC': (c) => {
    c.objects['pvc/wbs-data'].status.phase = 'Pending';
  },
  'deleting PVC': (c) => {
    c.objects['pvc/wbs-data'].metadata.deletionTimestamp = 'now';
  },
  'unfenced selector': (c) => {
    c.objects['networkpolicy/wbs-backend-writers'].spec.podSelector = {};
  },
  'backend replicas': (c) => {
    c.objects['deployment/wbs-backend'].spec.replicas = 1;
  },
  'unsuspended backup': (c) => {
    c.objects[inventory].items[1].spec.suspend = false;
  },
  'unsuspended Flux': (c) => {
    c.objects['kustomizations.kustomize.toolkit.fluxcd.io/release'].spec.suspend = false;
  },
  'unlabelled writable Pod': (c) => {
    c.objects['pods'].items.push({
      metadata: { name: 'backup', uid: 'backup-uid', namespace },
      spec: c.writable,
      status: { phase: 'Running' },
    });
  },
  'unknown writable Deployment': (c) => {
    c.objects[inventory].items.push({
      kind: 'Deployment',
      metadata: { name: 'foreign', uid: 'foreign-uid', namespace },
      spec: { replicas: 0, template: { spec: c.writable } },
    });
  },
};
for (const [name, mutate] of Object.entries(faults))
  test(`refuses ${name}`, async () => {
    const cluster = fixture();
    const fence = await inspectStorageFence(options, cluster.call);
    mutate(cluster);
    await expect(inspectStorageFence(options, cluster.call, fence)).rejects.toThrow();
  });

test('allows only stopped backend ReplicaSets and terminal Jobs', async () => {
  const cluster = fixture();
  cluster.objects[inventory].items.push(
    {
      kind: 'ReplicaSet',
      metadata: {
        name: 'old-backend',
        namespace,
        uid: 'rs-uid',
        ownerReferences: [
          { kind: 'Deployment', name: 'wbs-backend', uid: 'wbs-backend-uid', controller: true },
        ],
      },
      spec: { replicas: 0, template: { spec: cluster.writable } },
      status: { replicas: 0 },
    },
    {
      kind: 'Job',
      metadata: { name: 'completed-backup', namespace, uid: 'job-uid' },
      spec: { template: { spec: cluster.writable } },
      status: { active: 0, conditions: [{ type: 'Complete', status: 'True' }] },
    },
  );
  expect((await inspectStorageFence(options, cluster.call)).controllers).toHaveLength(4);
});
for (const family of ['containers', 'initContainers', 'ephemeralContainers'])
  test(`refuses writable ${family} on unlabelled Pods`, async () => {
    const cluster = fixture();
    const spec = structuredClone(cluster.writable) as any;
    spec.volumes[0].persistentVolumeClaim.readOnly = true;
    spec.containers[0].volumeMounts[0] = {
      name: 'source',
      mountPath: '/data',
      readOnly: true,
      recursiveReadOnly: 'Enabled',
    };
    spec[family] = [{ name: 'foreign', volumeMounts: [{ name: 'source', mountPath: '/foreign' }] }];
    cluster.objects['pods'].items.push({
      metadata: { name: 'reader', namespace, uid: 'reader-uid' },
      spec,
      status: { phase: 'Running' },
    });
    await expect(inspectStorageFence(options, cluster.call)).rejects.toThrow(
      'writable PVC consumer',
    );
  });
test('refuses live readonly consumers without runtime proof and raw source devices', async () => {
  const cluster = fixture();
  const spec = structuredClone(cluster.writable) as any;
  spec.volumes[0].persistentVolumeClaim.readOnly = true;
  spec.containers[0].volumeMounts[0] = {
    name: 'source',
    mountPath: '/data',
    readOnly: true,
    recursiveReadOnly: 'Enabled',
  };
  cluster.objects['pods'].items.push({
    metadata: { name: 'reader', namespace, uid: 'reader-uid' },
    spec,
    status: { phase: 'Running' },
  });
  await expect(inspectStorageFence(options, cluster.call)).rejects.toThrow(
    'live readonly PVC consumer',
  );
  spec.containers[0].volumeDevices = [{ name: 'source', devicePath: '/dev/disk' }];
  await expect(inspectStorageFence(options, cluster.call)).rejects.toThrow('unclassifiable');
});
for (const resource of [
  'pvc/wbs-data',
  'pv/disk',
  'networkpolicy/wbs-backend-writers',
  'deployment/wbs-backend',
  'pods',
  inventory,
])
  test(`propagates absent or unreadable ${resource}`, async () => {
    const cluster = fixture();
    Reflect.deleteProperty(cluster.objects, resource);
    await expect(inspectStorageFence(options, cluster.call)).rejects.toThrow('missing fixture');
    await expect(
      inspectStorageFence(options, async (args) => {
        if (args.includes(resource)) throw new Error('Forbidden');
        return cluster.call(args);
      }),
    ).rejects.toThrow('Forbidden');
  });

test('real kubectl adapter reads all consumers and propagates failed readback', async () => {
  const root = scratchSync('storage-fence-adapter-');
  try {
    const cluster = fixture();
    const path = join(root, 'kubectl');
    const store = join(root, 'cluster.json');
    const log = join(root, 'calls.jsonl');
    writeFileSync(store, JSON.stringify(cluster.objects));
    writeFileSync(
      path,
      `#!/usr/bin/env bun
import { readFileSync, appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
const objects = JSON.parse(readFileSync(${JSON.stringify(store)}, 'utf8'));
const resource = args[args.indexOf('get') + 1];
if (!(resource in objects)) { console.error('Forbidden readback'); process.exit(1); }
console.log(JSON.stringify(objects[resource]));
`,
    );
    chmodSync(path, 0o755);
    const effects = kubectlEffects({
      kubectl: path,
      kubeconfig: null,
      context: 'lab',
      namespaces: { app: 'wbs', backend: namespace },
      stateDir: root,
      overlay: root,
      anonymousProjectsStatus: 200,
      rolloutTimeoutSeconds: 1,
      jobTimeoutSeconds: 1,
      drainTimeoutMs: 1000,
      leaseDurationSeconds: 20,
      log: () => undefined,
    });
    const fence = await effects.inspectStorageFence(options.flux);
    expect(fence.storage.pvcUid).toBe('wbs-data-uid');
    expect(readFileSync(log, 'utf8')).toContain(inventory);
    cluster.objects['pods'].items.push({
      metadata: { name: 'unlabelled-backup', namespace, uid: 'backup-uid' },
      spec: cluster.writable,
      status: { phase: 'Running' },
    });
    writeFileSync(store, JSON.stringify(cluster.objects));
    await expect(effects.inspectStorageFence(options.flux, fence)).rejects.toThrow(
      'writable PVC consumer',
    );
    delete cluster.objects['pods'];
    writeFileSync(store, JSON.stringify(cluster.objects));
    await expect(effects.inspectStorageFence(options.flux, fence)).rejects.toThrow(
      'Forbidden readback',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [name, alter] of Object.entries({
  'PV UID': (c: ReturnType<typeof fixture>) => {
    c.objects['pv/disk'].metadata.uid = 'foreign';
  },
  'policy UID': (c: ReturnType<typeof fixture>) => {
    c.objects['networkpolicy/wbs-backend-writers'].metadata.uid = 'foreign';
  },
  'backend UID': (c: ReturnType<typeof fixture>) => {
    c.objects['deployment/wbs-backend'].metadata.uid = 'foreign';
    c.objects[inventory].items[0].metadata.uid = 'foreign';
  },
  'Flux UID': (c: ReturnType<typeof fixture>) => {
    c.objects['kustomizations.kustomize.toolkit.fluxcd.io/release'].metadata.uid = 'foreign';
  },
  'backup UID': (c: ReturnType<typeof fixture>) => {
    c.objects[inventory].items[1].metadata.uid = 'foreign';
  },
  'backup template': (c: ReturnType<typeof fixture>) => {
    c.objects[inventory].items[1].spec.jobTemplate.spec.template.spec.containers[0].image =
      'foreign';
  },
}))
  test(`rechecks ${name} across observations`, async () => {
    const cluster = fixture();
    const fence = await inspectStorageFence(options, cluster.call);
    alter(cluster);
    await expect(inspectStorageFence(options, cluster.call, fence)).rejects.toThrow();
  });
for (const kind of [
  'ReplicaSet',
  'StatefulSet',
  'DaemonSet',
  'ReplicationController',
  'PodTemplate',
  'CronJob',
  'Job',
])
  test(`refuses unknown writable ${kind}`, async () => {
    const cluster = fixture();
    const template = { spec: cluster.writable };
    cluster.objects[inventory].items.push({
      kind,
      metadata: { name: 'foreign', namespace, uid: 'foreign-uid' },
      template,
      spec: { replicas: 0, template, jobTemplate: { spec: { template } } },
      status: { replicas: 0, active: 1, conditions: [] },
    });
    await expect(inspectStorageFence(options, cluster.call)).rejects.toThrow();
  });
for (const phase of ['Running', 'Pending', 'Succeeded', 'Failed'])
  test(`refuses terminating ${phase} source Pod`, async () => {
    const cluster = fixture();
    cluster.objects['pods'].items.push({
      metadata: { name: 'backup', namespace, uid: 'backup-uid', deletionTimestamp: 'now' },
      spec: cluster.writable,
      status: { phase },
    });
    await expect(inspectStorageFence(options, cluster.call)).rejects.toThrow(
      'writable PVC consumer',
    );
  });

test('refuses replacement during inventory before returning evidence', async () => {
  const cluster = fixture();
  await expect(
    inspectStorageFence(options, async (args) => {
      const stdout = await cluster.call(args);
      if (args.includes(inventory)) cluster.objects['pvc/wbs-data'].metadata.uid = 'replacement';
      return stdout;
    }),
  ).rejects.toThrow('changed during');
});

for (const [name, alter] of Object.entries({
  'malformed PVC': (c: ReturnType<typeof fixture>) => {
    c.objects['pvc/wbs-data'] = null;
  },
  'missing PVC UID': (c: ReturnType<typeof fixture>) => {
    delete c.objects['pvc/wbs-data'].metadata.uid;
  },
  'foreign PVC namespace': (c: ReturnType<typeof fixture>) => {
    c.objects['pvc/wbs-data'].metadata.namespace = 'foreign';
  },
  'malformed Pod list': (c: ReturnType<typeof fixture>) => {
    c.objects['pods'].items = null;
  },
  'missing source container': (c: ReturnType<typeof fixture>) => {
    c.objects[inventory].items[0].spec.template.spec.containers = [];
  },
  'malformed volumes': (c: ReturnType<typeof fixture>) => {
    c.objects[inventory].items[0].spec.template.spec.volumes = null;
  },
  'duplicate source volume': (c: ReturnType<typeof fixture>) => {
    c.objects[inventory].items[0].spec.template.spec.volumes.push(c.writable.volumes[0]);
  },
  'backend active status': (c: ReturnType<typeof fixture>) => {
    c.objects['deployment/wbs-backend'].status.replicas = 1;
  },
  'missing policy selector': (c: ReturnType<typeof fixture>) => {
    delete c.objects['networkpolicy/wbs-backend-writers'].spec.podSelector;
  },
  'deleting controller': (c: ReturnType<typeof fixture>) => {
    c.objects[inventory].items[1].metadata.deletionTimestamp = 'now';
  },
}))
  test(`refuses ${name}`, async () => {
    const cluster = fixture();
    alter(cluster);
    await expect(inspectStorageFence(options, cluster.call)).rejects.toThrow();
  });

test('refuses unsuspended backup on initial inspection', async () => {
  const cluster = fixture();
  cluster.objects[inventory].items[1].spec.suspend = false;
  await expect(inspectStorageFence(options, cluster.call)).rejects.toThrow(
    'unexcluded writable controller',
  );
});

for (const fault of ['owner', 'replicas', 'status'])
  test(`refuses backend ReplicaSet ${fault} drift`, async () => {
    const cluster = fixture();
    const replicaSet = {
      kind: 'ReplicaSet',
      metadata: {
        name: 'backend-rs',
        namespace,
        uid: 'rs-uid',
        ownerReferences: [
          { kind: 'Deployment', name: 'wbs-backend', uid: 'wbs-backend-uid', controller: true },
        ],
      },
      spec: { replicas: 0, template: { spec: cluster.writable } },
      status: { replicas: 0 },
    };
    if (fault === 'owner') replicaSet.metadata.ownerReferences[0].uid = 'foreign';
    if (fault === 'replicas') replicaSet.spec.replicas = 1;
    if (fault === 'status') replicaSet.status.replicas = 1;
    cluster.objects[inventory].items.push(replicaSet);
    await expect(inspectStorageFence(options, cluster.call)).rejects.toThrow();
  });
for (const fault of ['active', 'condition'])
  test(`refuses Job ${fault} evidence`, async () => {
    const cluster = fixture();
    cluster.objects[inventory].items.push({
      kind: 'Job',
      metadata: { name: 'backup-job', namespace, uid: 'job-uid' },
      spec: { template: { spec: cluster.writable } },
      status: {
        active: fault === 'active' ? 1 : 0,
        conditions: [{ type: 'Complete', status: fault === 'condition' ? 'False' : 'True' }],
      },
    });
    await expect(inspectStorageFence(options, cluster.call)).rejects.toThrow('not terminal');
  });
for (const fault of ['uid', 'namespace'])
  test(`refuses source Pod missing or foreign ${fault}`, async () => {
    const cluster = fixture();
    cluster.objects['pods'].items.push({
      metadata: {
        name: 'completed',
        namespace: fault === 'namespace' ? 'foreign' : namespace,
        uid: fault === 'uid' ? '' : 'pod-uid',
      },
      spec: cluster.writable,
      status: { phase: 'Succeeded' },
    });
    await expect(inspectStorageFence(options, cluster.call)).rejects.toThrow();
  });

test('refuses terminal Job evidence while a terminating worker remains', async () => {
  const cluster = fixture();
  cluster.objects[inventory].items.push({
    kind: 'Job',
    metadata: { name: 'completed-source', namespace, uid: 'completed-uid' },
    spec: { template: { spec: cluster.writable } },
    status: { active: 0, terminating: 1, conditions: [{ type: 'Complete', status: 'True' }] },
  });
  await expect(inspectStorageFence(options, cluster.call)).rejects.toThrow('not terminal');
});
