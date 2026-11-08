/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-dynamic-delete, @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Mutable Kubernetes JSON fault fixtures; Bun async rejection assertions have installed void typings. */
import { expect, test } from 'bun:test';

import { restoreController, suspendController } from './controller-lifecycle';
import { inspectStorageOwner } from './storage-controller';
import { sealStorageOwnership } from './storage-ownership';

function fixture(suspend?: boolean) {
  const namespace = 'wbs';
  const objects: Record<string, any> = {
    'namespace/kube-system': { metadata: { name: 'kube-system', uid: 'cluster' } },
    'pvc/wbs-data': {
      metadata: { name: 'wbs-data', namespace, uid: 'pvc' },
      spec: { volumeName: 'disk' },
      status: { phase: 'Bound' },
    },
    'pv/disk': {
      metadata: { name: 'disk', uid: 'pv' },
      spec: { claimRef: { name: 'wbs-data', namespace, uid: 'pvc' } },
      status: { phase: 'Bound' },
    },
    'cronjob/sqlite-backup': {
      apiVersion: 'batch/v1',
      kind: 'CronJob',
      metadata: { name: 'sqlite-backup', namespace, uid: 'backup', resourceVersion: '7' },
      spec: {
        schedule: '* * * * *',
        ...(suspend === undefined ? {} : { suspend }),
        jobTemplate: {
          spec: { template: { spec: { containers: [{ name: 'backup', image: 'backup:1' }] } } },
        },
      },
    },
  };
  const identity = {
    transactionId: 'transaction',
    clusterUid: 'cluster',
    namespace,
    storage: {
      namespace,
      pvcName: 'wbs-data',
      pvcUid: 'pvc',
      volumeName: 'disk',
      pvUid: 'pv',
      databasePath: '/data/wbs.sqlite',
    } as const,
    flux: null,
  };
  const patches: any[][] = [];
  const call = async (args: readonly string[]) => {
    await Promise.resolve();
    if (args.includes('get')) {
      const resource = args[args.indexOf('get') + 1];
      return JSON.stringify(
        resource.startsWith('job/')
          ? objects['jobs'].items.find(
              (job: any) => resource === `job/${String(job.metadata.name)}`,
            )
          : objects[resource],
      );
    }
    if (!args.includes('patch')) throw new Error('unexpected command');
    const operations = JSON.parse(args[args.indexOf('-p') + 1]) as any[];
    patches.push(operations);
    const resource = args[args.indexOf('patch') + 1];
    const backup = resource.startsWith('job/')
      ? objects['jobs'].items.find((job: any) => resource === `job/${String(job.metadata.name)}`)
      : objects['cronjob/sqlite-backup'];
    const draft = structuredClone(backup);
    for (const operation of operations) {
      const keys = operation.path
        .slice(1)
        .split('/')
        .map((key: string) => key.replaceAll('~1', '/').replaceAll('~0', '~'));
      let parent = draft;
      for (const key of keys.slice(0, -1)) parent = parent[key];
      const key = keys.at(-1);
      if (
        operation.op === 'test' &&
        JSON.stringify(parent[key]) !== JSON.stringify(operation.value)
      )
        throw new Error('Conflict');
      if (operation.op === 'add' || operation.op === 'replace') parent[key] = operation.value;
      if (operation.op === 'remove') delete parent[key];
    }
    draft.metadata.resourceVersion = String(Number(backup.metadata.resourceVersion) + 1);
    if (resource.startsWith('job/')) Object.assign(backup, draft);
    else objects['cronjob/sqlite-backup'] = draft;
    return JSON.stringify(draft);
  };
  return { objects, identity, call, patches };
}
async function prepared(cluster: ReturnType<typeof fixture>) {
  return sealStorageOwnership(
    cluster.identity,
    await inspectStorageOwner(cluster.identity, cluster.call),
    'token',
  );
}
function authority() {
  const records: unknown[] = [];
  return {
    records,
    assertLease: async () => {
      await Promise.resolve();
    },
    checkpoint: async (record: unknown) => {
      records.push(structuredClone(record));
      await Promise.resolve();
    },
  };
}
for (const original of [undefined, false, true])
  test(`conditionally suspends and restores exact ${String(original)} field`, async () => {
    const cluster = fixture(original);
    const owner = await prepared(cluster);
    const durable = authority();
    const suspended = await suspendController(owner, null, cluster.call, durable);
    expect(suspended.stage).toBe('suspended');
    expect(cluster.objects['cronjob/sqlite-backup'].spec.suspend).toBe(true);
    expect(
      cluster.objects['cronjob/sqlite-backup'].metadata.annotations['puni.dev/storage-owner'],
    ).toBe('token');
    expect(durable.records.map((record: any) => record.stage)).toEqual([
      'suspend-pending',
      'suspended',
    ]);
    const restored = await restoreController(suspended, cluster.call, durable);
    expect(restored.stage).toBe('restored');
    expect(cluster.objects['cronjob/sqlite-backup'].spec.suspend).toBe(original);
    expect(
      cluster.objects['cronjob/sqlite-backup'].metadata.annotations['puni.dev/storage-owner'],
    ).toBeUndefined();
  });
test('checkpoint failure refuses mutation', async () => {
  const cluster = fixture();
  const owner = await prepared(cluster);
  await expect(
    suspendController(owner, null, cluster.call, {
      ...authority(),
      checkpoint: async () => {
        await Promise.resolve();
        throw new Error('disk failed');
      },
    }),
  ).rejects.toThrow('disk failed');
  expect(cluster.patches).toHaveLength(0);
});
test('restart acknowledges only its exact patch after checkpoint failure', async () => {
  const cluster = fixture();
  const owner = await prepared(cluster);
  const durable = authority();
  let pending: any;
  await expect(
    suspendController(owner, null, cluster.call, {
      ...durable,
      checkpoint: async (record: any) => {
        await Promise.resolve();
        if (record.stage === 'suspended') throw new Error('crash');
        pending = structuredClone(record);
      },
    }),
  ).rejects.toThrow('crash');
  const resumed = await suspendController(owner, pending, cluster.call, durable);
  expect(resumed.stage).toBe('suspended');
  expect(cluster.patches).toHaveLength(1);
});
for (const [fault, change] of Object.entries({
  UID: (backup: any) => {
    backup.metadata.uid = 'replacement';
  },
  template: (backup: any) => {
    backup.spec.schedule = 'foreign';
  },
  token: (backup: any) => {
    backup.metadata.annotations = { 'puni.dev/storage-owner': 'foreign' };
  },
  suspension: (backup: any) => {
    backup.spec.suspend = true;
  },
}))
  test(`refuses foreign ${fault} before mutation`, async () => {
    const cluster = fixture(false);
    const owner = await prepared(cluster);
    change(cluster.objects['cronjob/sqlite-backup']);
    await expect(suspendController(owner, null, cluster.call, authority())).rejects.toThrow();
    expect(cluster.patches).toHaveLength(0);
  });

test('drains actual UID descendants and refuses unrelated unlabelled source readers', async () => {
  const { drainController } = await import('./controller-lifecycle');
  const cluster = fixture();
  const owner = await prepared(cluster);
  const suspended = await suspendController(owner, null, cluster.call, authority());
  cluster.objects['jobs'] = {
    items: [
      {
        kind: 'Job',
        metadata: {
          name: 'backup-job',
          namespace: 'wbs',
          uid: 'job',
          resourceVersion: '1',
          ownerReferences: [
            { kind: 'CronJob', name: 'sqlite-backup', uid: 'backup', controller: true },
          ],
        },
        spec: { template: { spec: { containers: [{ name: 'backup' }] } } },
      },
    ],
  };
  cluster.objects['pods'] = {
    items: [
      {
        metadata: {
          name: 'backup-pod',
          namespace: 'wbs',
          uid: 'pod',
          ownerReferences: [{ kind: 'Job', name: 'backup-job', uid: 'job', controller: true }],
        },
        spec: {
          containers: [{ name: 'backup' }],
          volumes: [{ name: 'db', persistentVolumeClaim: { claimName: 'wbs-data' } }],
        },
      },
    ],
  };
  const deleted: unknown[] = [];
  const call = async (args: readonly string[], input?: string) => {
    if (!args.includes('delete')) return cluster.call(args);
    const options = JSON.parse(input ?? '{}');
    deleted.push(options.preconditions);
    const resource = args[args.indexOf('--raw') + 1].includes('/pods/') ? 'pods' : 'jobs';
    cluster.objects[resource].items = [];
    return '{}';
  };
  await drainController(suspended, call, authority(), {
    attempts: 4,
    sleep: async () => {
      await Promise.resolve();
    },
  });
  expect(deleted).toEqual([{ uid: 'pod' }, { uid: 'job' }]);
  cluster.objects['pods'].items = [
    {
      metadata: { name: 'unlabelled-reader', namespace: 'wbs', uid: 'foreign' },
      status: { phase: 'Running' },
      spec: {
        containers: [
          {
            name: 'reader',
            volumeMounts: [
              { name: 'db', mountPath: '/data', readOnly: true, recursiveReadOnly: 'Enabled' },
            ],
          },
        ],
        volumes: [{ name: 'db', persistentVolumeClaim: { claimName: 'wbs-data', readOnly: true } }],
      },
    },
  ];
  await expect(
    drainController(suspended, call, authority(), {
      attempts: 2,
      sleep: async () => {
        await Promise.resolve();
      },
    }),
  ).rejects.toThrow('foreign source consumer');
  expect(deleted).toHaveLength(2);
});

for (const [name, race] of Object.entries({
  UID: (backup: any) => {
    backup.metadata.uid = 'replacement';
  },
  resourceVersion: (backup: any) => {
    backup.metadata.resourceVersion = '99';
  },
  template: (backup: any) => {
    backup.spec.schedule = 'changed';
  },
  token: (backup: any) => {
    backup.metadata.annotations['puni.dev/storage-owner'] = 'foreign';
  },
}))
  test(`atomic ${name} race refuses before changing suspension`, async () => {
    const cluster = fixture(false);
    cluster.objects['cronjob/sqlite-backup'].metadata.annotations = {};
    const owner = await prepared(cluster);
    let raced = false;
    const call = async (args: readonly string[]) => {
      if (args.includes('patch') && !raced) {
        raced = true;
        race(cluster.objects['cronjob/sqlite-backup']);
      }
      return cluster.call(args);
    };
    await expect(suspendController(owner, null, call, authority())).rejects.toThrow();
    expect(cluster.objects['cronjob/sqlite-backup'].spec.suspend).toBe(false);
  });

test('lost Lease after suspension patch cannot acknowledge or restore', async () => {
  const cluster = fixture(false);
  const owner = await prepared(cluster);
  let patched = false;
  const durable = authority();
  const call = async (args: readonly string[]) => {
    const stdout = await cluster.call(args);
    if (args.includes('patch')) patched = true;
    return stdout;
  };
  await expect(
    suspendController(owner, null, call, {
      ...durable,
      assertLease: async () => {
        await Promise.resolve();
        if (patched) throw new Error('Lease lost');
      },
    }),
  ).rejects.toThrow('Lease lost');
  expect(durable.records.map((record: any) => record.stage)).toEqual(['suspend-pending']);
  expect(cluster.objects['cronjob/sqlite-backup'].spec.suspend).toBe(true);
});

test('malformed lifecycle never reaches cluster transport', async () => {
  const cluster = fixture();
  const owner = await prepared(cluster);
  for (const corrupted of [
    null,
    {},
    { ownership: owner, stage: 'unknown' },
    { ownership: { ...owner, token: 'changed' }, stage: 'suspended' },
    { ownership: owner, stage: 'suspended', extra: true },
  ]) {
    await expect(
      restoreController(
        corrupted as never,
        async () => {
          await Promise.resolve();
          throw new Error('unexpected cluster call');
        },
        authority(),
      ),
    ).rejects.toThrow();
  }
});

test('restore mismatch retains token and suspension', async () => {
  const cluster = fixture(false);
  const owner = await prepared(cluster);
  const durable = authority();
  const suspended = await suspendController(owner, null, cluster.call, durable);
  cluster.objects['cronjob/sqlite-backup'].spec.schedule = 'foreign';
  await expect(restoreController(suspended, cluster.call, durable)).rejects.toThrow('template');
  expect(cluster.objects['cronjob/sqlite-backup'].spec.suspend).toBe(true);
  expect(
    cluster.objects['cronjob/sqlite-backup'].metadata.annotations['puni.dev/storage-owner'],
  ).toBe('token');
});

for (const withPod of [false, true])
  test(`drain timeout retains suspended owner and reports survivors (Pod ${String(withPod)})`, async () => {
    const { drainController } = await import('./controller-lifecycle');
    const cluster = fixture();
    const owner = await prepared(cluster);
    const suspended = await suspendController(owner, null, cluster.call, authority());
    cluster.objects['jobs'] = {
      items: [
        {
          metadata: {
            name: 'backup-job',
            namespace: 'wbs',
            uid: 'job',
            resourceVersion: '1',
            deletionTimestamp: '2026-10-23T01:00:00Z',
            finalizers: ['test.puni.dev/hold'],
            ownerReferences: [
              { kind: 'CronJob', name: 'sqlite-backup', uid: 'backup', controller: true },
            ],
          },
          spec: { template: { spec: {} } },
        },
      ],
    };
    cluster.objects['pods'] = {
      items: withPod
        ? [
            {
              metadata: {
                name: 'backup-pod',
                namespace: 'wbs',
                uid: 'pod',
                deletionTimestamp: '2026-10-23T01:00:00Z',
                finalizers: ['test.puni.dev/pod-hold'],
                ownerReferences: [
                  { kind: 'Job', name: 'backup-job', uid: 'job', controller: true },
                ],
              },
              spec: {},
              status: { phase: 'Running' },
            },
          ]
        : [],
    };
    const deleted: unknown[] = [];
    const call = async (args: readonly string[], input?: string) => {
      if (!args.includes('delete')) return cluster.call(args);
      deleted.push(JSON.parse(input ?? '{}').preconditions);
      return '{}';
    };
    const timeout = drainController(suspended, call, authority(), {
      attempts: 2,
      sleep: async () => {
        await Promise.resolve();
      },
    });
    await expect(timeout).rejects.toThrow('Job/backup-job (job)');
    await expect(timeout).rejects.toThrow('attempts=2');
    await expect(timeout).rejects.toThrow('test.puni.dev/hold');
    await expect(timeout).rejects.toThrow('2026-10-23T01:00:00Z');
    if (withPod) {
      await expect(timeout).rejects.toThrow('Running');
      await expect(timeout).rejects.toThrow('test.puni.dev/pod-hold');
    }
    expect(deleted).toEqual(withPod ? [] : [{ uid: 'job' }, { uid: 'job' }]);
    expect(cluster.objects['cronjob/sqlite-backup'].spec.suspend).toBe(true);
  });

for (const interrupted of ['restore-applied', 'restored'])
  test(`restart finishes exact restoration after ${interrupted} acknowledgment crash`, async () => {
    const cluster = fixture(false);
    const owner = await prepared(cluster);
    const suspended = await suspendController(owner, null, cluster.call, authority());
    let durable: any = suspended;
    await expect(
      restoreController(suspended, cluster.call, {
        ...authority(),
        checkpoint: async (record: any) => {
          await Promise.resolve();
          if (record.stage === interrupted) throw new Error('crash');
          durable = structuredClone(record);
        },
      }),
    ).rejects.toThrow('crash');
    const restored = await restoreController(durable, cluster.call, authority());
    expect(restored.stage).toBe('restored');
    expect(cluster.objects['cronjob/sqlite-backup'].spec.suspend).toBe(false);
    expect(
      cluster.objects['cronjob/sqlite-backup'].metadata.annotations['puni.dev/storage-owner'],
    ).toBeUndefined();
  });

test('completed restore history is checked against current state before writer rollout', async () => {
  const cluster = fixture(false);
  const owner = await prepared(cluster);
  const suspended = await suspendController(owner, null, cluster.call, authority());
  const restored = await restoreController(suspended, cluster.call, authority());
  cluster.objects['cronjob/sqlite-backup'].spec.suspend = true;
  await expect(restoreController(restored, cluster.call, authority())).rejects.toThrow('restored');
});

test('malformed lifecycle object identifies the trusted-state boundary', async () => {
  await expect(
    restoreController(
      null as never,
      async () => {
        await Promise.resolve();
        throw new Error('unexpected call');
      },
      authority(),
    ),
  ).rejects.toThrow('malformed backup controller');
});

test('owned token changing between read passes refuses before acknowledgment', async () => {
  const cluster = fixture(true);
  const owner = await prepared(cluster);
  const suspended = await suspendController(owner, null, cluster.call, authority());
  let reads = 0;
  const call = async (args: readonly string[]) => {
    const text = await cluster.call(args);
    if (args.includes('cronjob/sqlite-backup') && ++reads === 1)
      delete cluster.objects['cronjob/sqlite-backup'].metadata.annotations[
        'puni.dev/storage-owner'
      ];
    return text;
  };
  await expect(suspendController(owner, suspended, call, authority())).rejects.toThrow(
    'token changed during observation',
  );
});

test('unknown lifecycle fields refuse before any cluster transport', async () => {
  const cluster = fixture();
  const owner = await prepared(cluster);
  let calls = 0;
  await expect(
    restoreController(
      { ownership: owner, stage: 'suspended', extra: true } as never,
      async () => {
        calls++;
        await Promise.resolve();
        throw new Error('unexpected transport');
      },
      authority(),
    ),
  ).rejects.toThrow('malformed controller lifecycle');
  expect(calls).toBe(0);
});

for (const autonomous of [false, true])
  test(`drain suspends a reconciling Job before graceful delayed Pod deletion (controller termination ${String(autonomous)})`, async () => {
    const { drainController } = await import('./controller-lifecycle');
    const cluster = fixture();
    const owner = await prepared(cluster);
    const durable = authority();
    const suspended = await suspendController(owner, null, cluster.call, durable);
    const job = {
      metadata: {
        name: 'backup-job',
        namespace: 'wbs',
        uid: 'job',
        resourceVersion: '1',
        ownerReferences: [
          { kind: 'CronJob', name: 'sqlite-backup', uid: 'backup', controller: true },
        ],
      },
      spec: { suspend: false, template: { spec: {} } },
    };
    const pod = {
      metadata: {
        name: 'backup-pod',
        namespace: 'wbs',
        uid: 'pod',
        ownerReferences: [{ kind: 'Job', name: 'backup-job', uid: 'job', controller: true }],
      },
      spec: {},
    };
    const bystander = {
      metadata: {
        name: 'bystander',
        namespace: 'wbs',
        uid: 'bystander',
        ownerReferences: [{ kind: 'Job', name: 'backup-job', uid: 'job', controller: false }],
      },
      spec: {},
    };
    cluster.objects['jobs'] = { items: [job] };
    cluster.objects['pods'] = { items: [pod, bystander] };
    let terminating = 0;
    let replacements = 0;
    let inventories = 0;
    let emptyInventories = 0;
    const call = async (args: readonly string[], input?: string) => {
      if (autonomous && args.includes('patch') && args.includes('job/backup-job')) {
        terminating = 1;
        Object.assign(pod.metadata, { deletionTimestamp: '2026-10-23T01:00:00Z' });
      }
      if (
        args.includes('get') &&
        args.includes('jobs') &&
        cluster.objects['jobs'].items.length === 0
      )
        emptyInventories++;
      if (args.includes('get') && args.includes('pods')) {
        inventories++;
        if (terminating > 0 && ++terminating === 4) {
          cluster.objects['pods'].items = [bystander];
          if (!job.spec.suspend) {
            replacements++;
            cluster.objects['pods'].items.push(structuredClone(pod));
            terminating = 0;
          }
        }
      }
      if (args.includes('get') && args.includes('job/backup-job')) return JSON.stringify(job);
      if (!args.includes('delete')) return cluster.call(args);
      if (autonomous && args.some((a) => a.includes('/pods/')))
        throw new Error('must wait already terminating Pod');
      const options = JSON.parse(input ?? '{}');
      expect(options).toEqual({
        apiVersion: 'v1',
        kind: 'DeleteOptions',
        preconditions: { uid: args.some((a) => a.includes('/pods/')) ? 'pod' : 'job' },
        propagationPolicy: 'Orphan',
      });
      if (args.some((a) => a.includes('/pods/'))) {
        if (terminating === 0) terminating = 1;
      } else cluster.objects['jobs'].items = [];
      return '{}';
    };
    await drainController(suspended, call, durable, {
      attempts: 9,
      sleep: async () => {
        await Promise.resolve();
      },
    });
    expect(replacements).toBe(0);
    expect(job.spec.suspend).toBe(true);
    expect(cluster.objects['jobs'].items).toEqual([]);
    expect(cluster.objects['pods'].items).toEqual([bystander]);
    expect(inventories).toBeGreaterThanOrEqual(5);
    expect(emptyInventories).toBe(2);
  });

for (const fault of [
  'UID',
  'resourceVersion',
  'ownerReferences',
  'spec',
  'readback',
  'revalidation',
  'Lease',
  'NotFound',
  'Forbidden',
])
  test(`drain refuses Job ${fault} before descendant deletion`, async () => {
    const { drainController } = await import('./controller-lifecycle');
    const cluster = fixture();
    const owner = await prepared(cluster);
    const suspended = await suspendController(owner, null, cluster.call, authority());
    const job: any = {
      metadata: {
        name: 'backup-job',
        namespace: 'wbs',
        uid: 'job',
        resourceVersion: '1',
        ownerReferences: [
          { kind: 'CronJob', name: 'sqlite-backup', uid: 'backup', controller: true },
        ],
      },
      spec: { template: { spec: {} } },
    };
    cluster.objects['jobs'] = { items: [job] };
    cluster.objects['pods'] = { items: [] };
    let deleted = false;
    let patched = false;
    let reads = 0;
    const call = async (args: readonly string[]) => {
      if (args.includes('delete')) {
        deleted = true;
        throw new Error('unexpected deletion');
      }
      if (args.includes('job/backup-job') && args.includes('get')) {
        reads++;
        if (fault === 'NotFound' || fault === 'Forbidden') throw new Error(fault);
        if (fault === 'readback' || (fault === 'revalidation' && reads === 2))
          job.spec.suspend = false;
      }
      if (args.includes('job/backup-job') && args.includes('patch')) {
        if (fault === 'UID') job.metadata.uid = 'foreign';
        if (fault === 'resourceVersion') job.metadata.resourceVersion = '9';
        if (fault === 'ownerReferences') job.metadata.ownerReferences = [];
        if (fault === 'spec') job.spec.parallelism = 9;
        patched = true;
      }
      return cluster.call(args);
    };
    await expect(
      drainController(
        suspended,
        call,
        {
          ...authority(),
          assertLease: async () => {
            await Promise.resolve();
            if (fault === 'Lease' && patched) throw new Error('Lease lost');
          },
        },
        {
          attempts: 3,
          sleep: async () => {
            await Promise.resolve();
          },
        },
      ),
    ).rejects.toThrow();
    expect(deleted).toBe(false);
    if (['UID', 'resourceVersion', 'ownerReferences', 'spec'].includes(fault))
      expect(job.spec.suspend).toBeUndefined();
    expect(suspended.stage).toBe('suspended');
    expect(cluster.objects['cronjob/sqlite-backup'].spec.suspend).toBe(true);
  });

test('foreign source Pod preflight refuses before any owned Job patch or deletion', async () => {
  const { drainController } = await import('./controller-lifecycle');
  const cluster = fixture();
  const owner = await prepared(cluster);
  const suspended = await suspendController(owner, null, cluster.call, authority());
  const patches = cluster.patches.length;
  cluster.objects['jobs'] = {
    items: [
      {
        metadata: {
          name: 'backup-job',
          namespace: 'wbs',
          uid: 'job',
          resourceVersion: '1',
          ownerReferences: [
            { kind: 'CronJob', name: 'sqlite-backup', uid: 'backup', controller: true },
          ],
        },
        spec: { template: { spec: {} } },
      },
    ],
  };
  cluster.objects['pods'] = {
    items: [
      {
        metadata: { name: 'foreign-reader', namespace: 'wbs', uid: 'foreign' },
        spec: {
          volumes: [
            { name: 'db', persistentVolumeClaim: { claimName: 'wbs-data', readOnly: true } },
          ],
        },
        status: { phase: 'Running' },
      },
    ],
  };
  let deletes = 0;
  const call = async (args: readonly string[]) => {
    if (args.includes('delete')) {
      deletes++;
      throw new Error('unexpected deletion');
    }
    return cluster.call(args);
  };
  await expect(
    drainController(suspended, call, authority(), {
      attempts: 3,
      sleep: async () => {
        await Promise.resolve();
      },
    }),
  ).rejects.toThrow('foreign source consumer Pod');
  expect(cluster.patches).toHaveLength(patches);
  expect(deletes).toBe(0);
  expect(cluster.objects['jobs'].items[0].spec.suspend).toBeUndefined();
});

test('drain timeout bounds survivor count and serialized metadata', async () => {
  const { drainController } = await import('./controller-lifecycle');
  const cluster = fixture();
  const owner = await prepared(cluster);
  const suspended = await suspendController(owner, null, cluster.call, authority());
  cluster.objects['jobs'] = {
    items: Array.from({ length: 25 }, (_, index) => ({
      metadata: {
        name: `job-${String(index)}`,
        uid: `uid-${String(index)}`,
        namespace: 'wbs',
        resourceVersion: '1',
        finalizers: ['x'.repeat(5000)],
        ownerReferences: [
          { kind: 'CronJob', name: 'sqlite-backup', uid: 'backup', controller: true },
        ],
      },
      spec: { template: { spec: {} } },
    })),
  };
  cluster.objects['pods'] = { items: [] };
  const call = async (args: readonly string[]) =>
    args.includes('delete') ? '{}' : cluster.call(args);
  try {
    await drainController(suspended, call, authority(), {
      attempts: 2,
      sleep: async () => {
        await Promise.resolve();
      },
    });
    throw new Error('expected bounded timeout');
  } catch (failure) {
    if (!(failure instanceof Error)) throw failure;
    expect(failure.message).toContain('omitted=5');
    expect(failure.message).not.toContain('Job/job-24');
    expect(failure.message.length).toBeLessThan(22_000);
  }
});
