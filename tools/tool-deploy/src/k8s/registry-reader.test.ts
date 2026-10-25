import { expect, it } from 'bun:test';

import { readKubernetesInventory } from './registry-reader';
import {
  kubernetesFixtureImages as images,
  kubernetesReaderFixture as source,
} from './registry-reader.fixture';
it('reads actual discovered APIs including scaled-zero and completed job templates', async () => {
  const { read } = source();
  const inventory = await readKubernetesInventory(
    [{ name: 'wbs', uid: 'namespace' }],
    'cluster',
    read,
  );
  expect(inventory.images.sort()).toEqual([...images].sort());
  expect(inventory.sourceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
});
it('refuses undiscovered custom selectors, pagination omission and foreign namespace identity', async () => {
  for (const fault of ['custom', 'page', 'namespace', 'missing']) {
    const { documents, read } = source();
    if (fault === 'custom') {
      documents.set('/apis/apps/v1', {
        groupVersion: 'apps/v1',
        resources: [{ name: 'widgets', kind: 'Widget', namespaced: true, verbs: ['list'] }],
      });
      documents.set('/apis/apps/v1/namespaces/wbs/widgets', {
        metadata: { resourceVersion: '2' },
        items: [
          {
            apiVersion: 'apps/v1',
            kind: 'Widget',
            metadata: { name: 'custom', namespace: 'wbs' },
            spec: { image: images[0] },
          },
        ],
      });
    }
    if (fault === 'page')
      documents.set('/api/v1/namespaces/wbs/pods', {
        metadata: { resourceVersion: '1', continue: 'next' },
        items: [],
      });
    if (fault === 'namespace')
      documents.set('/api/v1/namespaces/wbs', { metadata: { uid: 'foreign' } });
    if (fault === 'missing') documents.delete('/apis/batch/v1/namespaces/wbs/jobs');
    expect(
      await readKubernetesInventory([{ name: 'wbs', uid: 'namespace' }], 'cluster', read).then(
        () => false,
        () => true,
      ),
    ).toBe(true);
  }
});
it('distinguishes an explicitly empty Kubernetes origin from an existing release record even with no workloads', async () => {
  const { documents, read } = source();
  documents.set('/apis/apps/v1/namespaces/wbs/deployments', {
    metadata: { resourceVersion: '2' },
    items: [],
  });
  documents.set('/apis/batch/v1/namespaces/wbs/jobs', {
    metadata: { resourceVersion: '3' },
    items: [],
  });
  const path = '/api/v1/namespaces/wbs/configmaps?fieldSelector=metadata.name%3Dwbs-release';
  documents.set(path, { metadata: { resourceVersion: '4' }, items: [] });
  const leasePath =
    '/apis/coordination.k8s.io/v1/namespaces/wbs/leases?fieldSelector=metadata.name%3Dwbs-release';
  documents.set(leasePath, { metadata: { resourceVersion: '4' }, items: [] });
  const record = { namespace: 'wbs', name: 'wbs-release' };
  const empty = await readKubernetesInventory(
    [{ name: 'wbs', uid: 'namespace' }],
    'cluster',
    read,
    record,
  );
  expect(empty.hasReleaseEvidence).toBe(false);
  documents.set(leasePath, {
    metadata: { resourceVersion: '5' },
    items: [
      {
        apiVersion: 'coordination.k8s.io/v1',
        kind: 'Lease',
        metadata: { name: 'wbs-release', namespace: 'wbs', uid: 'lease' },
        spec: { holderIdentity: 'interrupted' },
      },
    ],
  });
  expect(
    (await readKubernetesInventory([{ name: 'wbs', uid: 'namespace' }], 'cluster', read, record))
      .hasReleaseEvidence,
  ).toBe(true);
  documents.set(leasePath, { metadata: { resourceVersion: '6' }, items: [] });
  documents.set(path, {
    metadata: { resourceVersion: '5' },
    items: [
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'wbs-release', namespace: 'wbs', uid: 'record' },
        data: {
          sourceSha: 'a'.repeat(40),
          images: JSON.stringify({
            backend: images[0],
            gateway: images[0],
            frontend: images[0],
            mcp: images[0],
          }),
        },
      },
    ],
  });
  const existing = await readKubernetesInventory(
    [{ name: 'wbs', uid: 'namespace' }],
    'cluster',
    read,
    record,
  );
  expect(existing.hasReleaseEvidence).toBe(true);
  expect(existing.currentImages).toHaveLength(4);
  expect(existing.sourceRevision).not.toBe(empty.sourceRevision);
  documents.delete(path);
  await expectRejection(
    readKubernetesInventory([{ name: 'wbs', uid: 'namespace' }], 'cluster', read, record),
  );
});

async function expectRejection(
  promise: Promise<unknown>,
  expected?: string | RegExp,
): Promise<void> {
  const refusal = await promise.then(
    () => {
      throw new Error('Expected refusal');
    },
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (expected !== undefined)
    expect(() => {
      throw refusal;
    }).toThrow(expected);
}

it('checks nonpreferred served resources and refuses unknown populated versions before certifying genesis', async () => {
  const { documents, read } = source();
  documents.set('/apis', {
    groups: [
      {
        preferredVersion: { groupVersion: 'example.test/v1' },
        versions: [{ groupVersion: 'example.test/v1' }, { groupVersion: 'example.test/v1alpha1' }],
      },
    ],
  });
  documents.set('/apis/example.test/v1', { groupVersion: 'example.test/v1', resources: [] });
  documents.set('/apis/example.test/v1alpha1', {
    groupVersion: 'example.test/v1alpha1',
    resources: [{ name: 'runners', kind: 'Runner', namespaced: true, verbs: ['list'] }],
  });
  const path = '/apis/example.test/v1alpha1/namespaces/wbs/runners';
  documents.set(path, {
    metadata: { resourceVersion: '9' },
    items: [
      {
        apiVersion: 'example.test/v1alpha1',
        kind: 'Runner',
        metadata: { namespace: 'wbs', name: 'hidden' },
        spec: { image: images[0] },
      },
    ],
  });
  await expectRejection(
    readKubernetesInventory([{ name: 'wbs', uid: 'namespace' }], 'cluster', read),
    'Unknown image-selecting',
  );
  documents.set(path, { metadata: { resourceVersion: '10' }, items: [] });
  const calls: string[] = [];
  const empty = await readKubernetesInventory(
    [{ name: 'wbs', uid: 'namespace' }],
    'cluster',
    (path) => {
      calls.push(path);
      return read(path);
    },
  );
  expect(empty.hasReleaseEvidence).toBe(false);
  expect(calls).toContain(path);
  documents.delete(path);
  await expectRejection(
    readKubernetesInventory([{ name: 'wbs', uid: 'namespace' }], 'cluster', read),
    'Unknown source',
  );
  documents.set(path, { metadata: { resourceVersion: '11' }, items: [] });
  for (const versions of [
    undefined,
    [],
    [{ groupVersion: 'example.test/v1alpha1' }],
    [{ groupVersion: 'example.test/v1' }, { groupVersion: 'example.test/v1' }],
  ]) {
    documents.set('/apis', {
      groups: [{ preferredVersion: { groupVersion: 'example.test/v1' }, versions }],
    });
    await expectRejection(
      readKubernetesInventory([{ name: 'wbs', uid: 'namespace' }], 'cluster', read),
      'discovery',
    );
  }
});
