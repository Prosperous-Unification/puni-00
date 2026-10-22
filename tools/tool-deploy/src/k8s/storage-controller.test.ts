/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Kubernetes fault fixtures deliberately model malformed boundary JSON; Bun rejects assertions return promises despite installed void typings. */
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  inspectStorageOwner,
  prepareStorageOwnership,
  validateStorageOwnership,
} from './storage-controller';
import { assertStorageOwnership } from './storage-ownership';

function fixture() {
  const namespace = 'wbs';
  const objects: Record<string, any> = {
    'namespace/kube-system': { metadata: { name: 'kube-system', uid: 'cluster-1' } },
    'pvc/wbs-data': {
      metadata: { name: 'wbs-data', namespace, uid: 'pvc-1' },
      spec: { volumeName: 'disk' },
      status: { phase: 'Bound' },
    },
    'pv/disk': {
      metadata: { name: 'disk', uid: 'pv-1' },
      spec: { claimRef: { name: 'wbs-data', namespace, uid: 'pvc-1' } },
      status: { phase: 'Bound' },
    },
    'cronjob/sqlite-backup': {
      apiVersion: 'batch/v1',
      kind: 'CronJob',
      metadata: { name: 'sqlite-backup', namespace, uid: 'backup-1', resourceVersion: '7' },
      spec: {
        schedule: '0 * * * *',
        jobTemplate: {
          spec: { template: { spec: { containers: [{ name: 'backup', image: 'backup:1' }] } } },
        },
      },
    },
    'kustomizations.kustomize.toolkit.fluxcd.io/release': {
      metadata: { name: 'release', namespace: 'flux-system', uid: 'flux-1' },
      spec: { suspend: true },
    },
  };
  const calls: string[][] = [];
  const identity = {
    transactionId: 'transaction-1',
    clusterUid: 'cluster-1',
    namespace,
    storage: {
      namespace,
      pvcName: 'wbs-data',
      pvcUid: 'pvc-1',
      volumeName: 'disk',
      pvUid: 'pv-1',
      databasePath: '/data/wbs.sqlite',
    } as const,
    flux: { namespace: 'flux-system', kustomization: 'release' },
  };
  const call = async (args: readonly string[]) => {
    await Promise.resolve();
    calls.push([...args]);
    if (!args.includes('get')) throw new Error('fixture permits GET only');
    const resource = args[args.indexOf('get') + 1];
    if (!(resource in objects)) throw new Error(`missing ${resource}`);
    return JSON.stringify(objects[resource]);
  };
  return {
    objects,
    calls,
    identity,
    call,
    effects: { inspectStorageOwner: () => inspectStorageOwner(identity, call) },
  };
}
function authority() {
  return {
    assertLease: async () => {
      await Promise.resolve();
    },
    checkpoint: async () => {
      await Promise.resolve();
    },
  };
}
for (const suspension of [undefined, false, true])
  test(`checkpoints original ${String(suspension)} suspension before returning`, async () => {
    const cluster = fixture();
    if (suspension !== undefined)
      cluster.objects['cronjob/sqlite-backup'].spec.suspend = suspension;
    const directory = scratchSync('ownership-checkpoint-');
    const path = join(directory, 'ownership.json');
    const temporary = join(directory, 'write.json');
    let leaseAssertions = 0;
    try {
      const ownership = await prepareStorageOwnership(cluster.identity, cluster.effects, {
        assertLease: async () => {
          leaseAssertions++;
          await Promise.resolve();
        },
        checkpoint: async (record) => {
          await Promise.resolve();
          writeFileSync(temporary, JSON.stringify(record));
          const fd = openSync(temporary, 'r');
          try {
            fsyncSync(fd);
          } finally {
            closeSync(fd);
          }
          renameSync(temporary, path);
          const fdDirectory = openSync(directory, 'r');
          try {
            fsyncSync(fdDirectory);
          } finally {
            closeSync(fdDirectory);
          }
        },
      });
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(ownership);
      expect(ownership.owner.suspension).toEqual(
        suspension === undefined ? { kind: 'absent' } : { kind: 'present', value: suspension },
      );
      expect(leaseAssertions).toBe(2);
      expect(cluster.calls.every((args) => args.includes('get'))).toBe(true);
      assertStorageOwnership(ownership, cluster.identity);
      await validateStorageOwnership(
        JSON.parse(readFileSync(path, 'utf8')),
        cluster.identity,
        cluster.effects,
        authority(),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
test('failed checkpoint cannot return prepared ownership', async () => {
  const cluster = fixture();
  await expect(
    prepareStorageOwnership(cluster.identity, cluster.effects, {
      ...authority(),
      checkpoint: async () => {
        await Promise.resolve();
        throw new Error('disk failed');
      },
    }),
  ).rejects.toThrow('disk failed');
});
test('lost Lease prevents both observation and checkpoint', async () => {
  const cluster = fixture();
  await expect(
    prepareStorageOwnership(cluster.identity, cluster.effects, {
      ...authority(),
      assertLease: async () => {
        await Promise.resolve();
        throw new Error('Lease lost');
      },
    }),
  ).rejects.toThrow('Lease lost');
  expect(cluster.calls).toHaveLength(0);
});
test('corrupt prepared history refuses before a cluster call', async () => {
  const cluster = fixture();
  const record = await prepareStorageOwnership(cluster.identity, cluster.effects, authority());
  cluster.calls.length = 0;
  await expect(
    validateStorageOwnership(
      { ...record, token: 'foreign' },
      cluster.identity,
      cluster.effects,
      authority(),
    ),
  ).rejects.toThrow();
  expect(cluster.calls).toHaveLength(0);
});
const faults: Record<string, (cluster: ReturnType<typeof fixture>) => void> = {
  cluster: (c) => {
    c.objects['namespace/kube-system'].metadata.uid = 'foreign';
  },
  PVC: (c) => {
    c.objects['pvc/wbs-data'].metadata.uid = 'foreign';
    c.objects['pv/disk'].spec.claimRef.uid = 'foreign';
  },
  'backup UID': (c) => {
    c.objects['cronjob/sqlite-backup'].metadata.uid = 'foreign';
  },
  'backup template': (c) => {
    c.objects['cronjob/sqlite-backup'].spec.jobTemplate.spec.template.spec.containers[0].image =
      'foreign';
  },
  'backup suspension': (c) => {
    c.objects['cronjob/sqlite-backup'].spec.suspend = true;
  },
  'Flux UID': (c) => {
    c.objects['kustomizations.kustomize.toolkit.fluxcd.io/release'].metadata.uid = 'foreign';
  },
  'unsuspended Flux': (c) => {
    c.objects['kustomizations.kustomize.toolkit.fluxcd.io/release'].spec.suspend = false;
  },
  'foreign token': (c) => {
    c.objects['cronjob/sqlite-backup'].metadata.annotations = {
      'puni.dev/storage-owner': 'foreign',
    };
  },
};
for (const [name, corrupt] of Object.entries(faults))
  test(`resume refuses changed ${name} without replacing original history`, async () => {
    const cluster = fixture();
    const record = await prepareStorageOwnership(cluster.identity, cluster.effects, authority());
    corrupt(cluster);
    await expect(
      validateStorageOwnership(record, cluster.identity, cluster.effects, authority()),
    ).rejects.toThrow();
  });
for (const [name, corrupt] of Object.entries({
  'missing spec': (c: ReturnType<typeof fixture>) => {
    delete c.objects['cronjob/sqlite-backup'].spec;
  },
  'invalid suspension': (c: ReturnType<typeof fixture>) => {
    c.objects['cronjob/sqlite-backup'].spec.suspend = 'false';
  },
  'missing template': (c: ReturnType<typeof fixture>) => {
    delete c.objects['cronjob/sqlite-backup'].spec.jobTemplate;
  },
  'deleting backup': (c: ReturnType<typeof fixture>) => {
    c.objects['cronjob/sqlite-backup'].metadata.deletionTimestamp = 'now';
  },
  'foreign backup kind': (c: ReturnType<typeof fixture>) => {
    c.objects['cronjob/sqlite-backup'].kind = 'Job';
  },
  'foreign backup namespace': (c: ReturnType<typeof fixture>) => {
    c.objects['cronjob/sqlite-backup'].metadata.namespace = 'foreign';
  },
  'missing backup version': (c: ReturnType<typeof fixture>) => {
    delete c.objects['cronjob/sqlite-backup'].metadata.resourceVersion;
  },
}))
  test(`preparation refuses ${name}`, async () => {
    const cluster = fixture();
    corrupt(cluster);
    await expect(
      prepareStorageOwnership(cluster.identity, cluster.effects, authority()),
    ).rejects.toThrow();
  });
for (const resource of [
  'namespace/kube-system',
  'pvc/wbs-data',
  'pv/disk',
  'cronjob/sqlite-backup',
  'kustomizations.kustomize.toolkit.fluxcd.io/release',
])
  test(`preparation propagates absent and unreadable ${resource}`, async () => {
    const cluster = fixture();
    Reflect.deleteProperty(cluster.objects, resource);
    await expect(
      prepareStorageOwnership(cluster.identity, cluster.effects, authority()),
    ).rejects.toThrow('missing');
    await expect(
      inspectStorageOwner(cluster.identity, async (args) => {
        if (args.includes(resource)) throw new Error('Forbidden');
        return cluster.call(args);
      }),
    ).rejects.toThrow('Forbidden');
  });

test('rechecks observations before checkpoint and permits resourceVersion progress only', async () => {
  const cluster = fixture();
  const effects = {
    inspectStorageOwner: () =>
      inspectStorageOwner(cluster.identity, async (args) => {
        const stdout = await cluster.call(args);
        if (args.includes('cronjob/sqlite-backup'))
          cluster.objects['cronjob/sqlite-backup'].metadata.resourceVersion = '8';
        return stdout;
      }),
  };
  const record = await prepareStorageOwnership(cluster.identity, effects, authority());
  expect(record.owner.resourceVersion).toBe('8');
  const changed = {
    inspectStorageOwner: () =>
      inspectStorageOwner(cluster.identity, async (args) => {
        const stdout = await cluster.call(args);
        if (args.includes('cronjob/sqlite-backup'))
          cluster.objects['cronjob/sqlite-backup'].metadata.uid = 'replacement';
        return stdout;
      }),
  };
  await expect(prepareStorageOwnership(cluster.identity, changed, authority())).rejects.toThrow(
    'changed',
  );
});
test('Lease loss after reads prevents durable preparation', async () => {
  const cluster = fixture();
  let assertions = 0;
  await expect(
    prepareStorageOwnership(cluster.identity, cluster.effects, {
      assertLease: async () => {
        await Promise.resolve();
        if (++assertions === 2) throw new Error('Lease lost after read');
      },
      checkpoint: async () => {
        await Promise.resolve();
        throw new Error('checkpoint reached after Lease loss');
      },
    }),
  ).rejects.toThrow('Lease lost after read');
});
test('validated local topology records null Flux without reading a Flux unit', async () => {
  const cluster = fixture();
  const identity = { ...cluster.identity, flux: null };
  const record = await prepareStorageOwnership(
    identity,
    { inspectStorageOwner: () => inspectStorageOwner(identity, cluster.call) },
    authority(),
  );
  expect(record.fluxUid).toBeNull();
  expect(cluster.calls.some((args) => args.some((arg) => arg.includes('kustomizations')))).toBe(
    false,
  );
});

test('adapter rejects malformed spec before constructing a typed observation', async () => {
  const cluster = fixture();
  delete cluster.objects['cronjob/sqlite-backup'].spec;
  await expect(inspectStorageOwner(cluster.identity, cluster.call)).rejects.toThrow(
    'malformed backup spec',
  );
});
test('adapter rejects missing version before constructing a typed observation', async () => {
  const cluster = fixture();
  delete cluster.objects['cronjob/sqlite-backup'].metadata.resourceVersion;
  await expect(inspectStorageOwner(cluster.identity, cluster.call)).rejects.toThrow(
    'missing backup resourceVersion',
  );
});
test('adapter rejects invalid suspension before constructing a typed observation', async () => {
  const cluster = fixture();
  cluster.objects['cronjob/sqlite-backup'].spec.suspend = 'false';
  await expect(inspectStorageOwner(cluster.identity, cluster.call)).rejects.toThrow(
    'invalid backup suspension',
  );
});

test('preparation waits for the authoritative checkpoint to become durable', async () => {
  const cluster = fixture();
  const checkpoint = Promise.withResolvers<undefined>();
  let settled = false;
  const preparation = prepareStorageOwnership(cluster.identity, cluster.effects, {
    ...authority(),
    checkpoint: () => checkpoint.promise,
  }).then((record) => {
    settled = true;
    return record;
  });
  await Bun.sleep(10);
  expect(settled).toBe(false);
  checkpoint.resolve(undefined);
  await preparation;
  expect(settled).toBe(true);
});

test('resume reasserts Lease before returning original-history validation', async () => {
  const cluster = fixture();
  const record = await prepareStorageOwnership(cluster.identity, cluster.effects, authority());
  let assertions = 0;
  await expect(
    validateStorageOwnership(record, cluster.identity, cluster.effects, {
      ...authority(),
      assertLease: async () => {
        await Promise.resolve();
        if (++assertions === 2) throw new Error('resume Lease lost');
      },
    }),
  ).rejects.toThrow('resume Lease lost');
});
