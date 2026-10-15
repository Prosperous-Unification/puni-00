import { describe, expect, it } from 'bun:test';

import {
  createNamespace,
  deleteNamespace,
  namespaceAccess,
  type NamespaceClient,
  readNamespace,
} from './forge-namespace';

async function expectRefusal(promise: Promise<void>, message = ''): Promise<void> {
  const rejection = await promise.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(rejection).toBeInstanceOf(Error);
  expect(String(rejection)).toContain(message);
}

const OWNER = { slug: 'alpha', labId: 'lab', worktree: '/worktrees/alpha' };

/** In-memory API boundary; namespace creation and UID-precondition deletion are atomic. */
function api() {
  const namespaces = new Map<string, Record<string, unknown>>();
  const resources = new Map<string, unknown[]>();
  let sequence = 0;
  const client: NamespaceClient = {
    kubectl: async (arguments_, options) => {
      await Promise.resolve();
      const name = arguments_[2] ?? '';
      if (arguments_[0] === 'get')
        return namespaces.has(name) ? JSON.stringify(namespaces.get(name)) : '';
      if (arguments_[0] === 'delete') {
        const namespace = arguments_[1]?.split('/').at(-1) ?? '';
        const deletion = JSON.parse(options?.input ?? '{}') as { preconditions?: { uid: string } };
        if (
          deletion.preconditions !== undefined &&
          deletion.preconditions.uid !==
            (namespaces.get(namespace)?.['metadata'] as { uid?: string } | undefined)?.uid
        )
          throw new Error('UID changed');
        namespaces.delete(namespace);
        resources.delete(namespace);
        return '';
      }
      if (arguments_[0] === 'wait') return '';
      throw new Error(`Unexpected command ${arguments_.join(' ')}`);
    },
    attempt: async (_, options) => {
      await Promise.resolve();
      const namespace = JSON.parse(options?.input ?? '{}') as {
        metadata: { name: string; uid: string };
      };
      const name = namespace.metadata.name;
      if (namespaces.has(name)) return { exitCode: 1, stdout: '', stderr: '(AlreadyExists)' };
      namespace.metadata.uid = `uid-${String(++sequence)}`;
      namespaces.set(name, namespace);
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  };
  return { client, namespaces, resources };
}

describe('forge namespace lifecycle', () => {
  it('grants namespace-local Pod authority to the shared controller only', () => {
    const access = namespaceAccess('alpha', 'lab');
    expect(access).toContainEqual({
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: {
        name: 'source-workload-manager',
        namespace: 'puni-forge-alpha',
        labels: { 'puni.dev/dev-slug': 'alpha', 'puni.dev/lab-id': 'lab' },
      },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Role',
        name: 'source-workload-manager',
      },
      subjects: [
        { kind: 'ServiceAccount', name: 'dev-environment-controller', namespace: 'puni-forge' },
      ],
    });
    expect(access.find((object) => object['kind'] === 'ServiceAccount')).toMatchObject({
      metadata: { namespace: 'puni-forge-alpha' },
      automountServiceAccountToken: false,
    });
  });
  it('creates two environments without sharing namespace resources or controller authority', async () => {
    const cluster = api();
    await Promise.all([
      createNamespace(cluster.client, OWNER),
      createNamespace(cluster.client, { ...OWNER, slug: 'beta', worktree: '/worktrees/beta' }),
    ]);
    expect([...cluster.namespaces.keys()].sort()).toEqual(['puni-forge-alpha', 'puni-forge-beta']);
    expect(await readNamespace(cluster.client, OWNER)).toMatchObject({
      name: 'puni-forge-alpha',
      worktree: '/worktrees/alpha',
    });
    expect(cluster.namespaces.has('puni-forge')).toBe(false);
  });

  it('recovers a partial create only for the same owner', async () => {
    const cluster = api();
    await createNamespace(cluster.client, OWNER);
    const before = structuredClone(cluster.namespaces.get('puni-forge-alpha'));
    await createNamespace(cluster.client, OWNER);
    expect(cluster.namespaces.get('puni-forge-alpha')).toEqual(before);
    await expectRefusal(
      createNamespace(cluster.client, { ...OWNER, worktree: '/worktrees/foreign' }),
      'ownership',
    );
  });

  it.each(['name', 'lab', 'slug', 'worktree', 'trust', 'uid', 'terminating', 'unlabelled'])(
    'refuses %s namespace before adoption',
    async (fault) => {
      const cluster = api();
      await createNamespace(cluster.client, OWNER);
      const namespace = cluster.namespaces.get('puni-forge-alpha') as {
        metadata: {
          name: string;
          labels: Record<string, string>;
          annotations: Record<string, string>;
          uid?: string;
          deletionTimestamp?: string;
        };
      };
      if (fault === 'name') namespace.metadata.name = 'puni-forge-beta';
      if (fault === 'lab') namespace.metadata.labels['puni.dev/lab-id'] = 'foreign';
      if (fault === 'slug') namespace.metadata.labels['puni.dev/dev-slug'] = 'beta';
      if (fault === 'trust') namespace.metadata.labels['puni.dev/trusted-hostpath'] = 'solver';
      if (fault === 'worktree')
        namespace.metadata.annotations['puni.dev/worktree'] = '/worktrees/foreign';
      if (fault === 'uid') delete namespace.metadata.uid;
      if (fault === 'terminating') namespace.metadata.deletionTimestamp = 'now';
      if (fault === 'unlabelled') namespace.metadata.labels = {};
      await expectRefusal(createNamespace(cluster.client, OWNER));
      expect(cluster.namespaces.get('puni-forge-alpha')).toBe(namespace);
    },
  );

  it('refuses a namespace disappearing during partial-create recovery', async () => {
    const cluster = api();
    const client: NamespaceClient = {
      ...cluster.client,
      attempt: async () => {
        await Promise.resolve();
        return { exitCode: 1, stdout: '', stderr: '(AlreadyExists)' };
      },
    };
    await expectRefusal(createNamespace(client, OWNER), 'disappeared');
  });

  it('distinguishes absence from unreadable namespace state', async () => {
    const cluster = api();
    expect(await readNamespace(cluster.client, OWNER)).toBeUndefined();
    const client = {
      ...cluster.client,
      kubectl: async () => {
        await Promise.resolve();
        throw new Error('Forbidden');
      },
    };
    const rejection = await readNamespace(client, OWNER).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(String(rejection)).toContain('Forbidden');
  });

  it('deletes only the owned namespace and its database while retaining a second environment', async () => {
    const cluster = api();
    await createNamespace(cluster.client, OWNER);
    await createNamespace(cluster.client, { ...OWNER, slug: 'beta', worktree: '/worktrees/beta' });
    cluster.resources.set('puni-forge-alpha', ['database']);
    cluster.resources.set('puni-forge-beta', ['database']);
    const namespace = await readNamespace(cluster.client, OWNER);
    if (namespace === undefined) throw new Error('Expected alpha');
    await deleteNamespace(cluster.client, namespace);
    expect(cluster.namespaces.has('puni-forge-alpha')).toBe(false);
    expect(cluster.resources.has('puni-forge-alpha')).toBe(false);
    expect(cluster.resources.get('puni-forge-beta')).toEqual(['database']);
    expect(await readNamespace(cluster.client, OWNER)).toBeUndefined();
  });

  it('refuses a namespace replaced between ownership inspection and deletion', async () => {
    const cluster = api();
    await createNamespace(cluster.client, OWNER);
    const namespace = await readNamespace(cluster.client, OWNER);
    if (namespace === undefined) throw new Error('Expected alpha');
    cluster.namespaces.delete(namespace.name);
    await createNamespace(cluster.client, OWNER);
    await expectRefusal(deleteNamespace(cluster.client, namespace), 'UID changed');
    expect(cluster.namespaces.has(namespace.name)).toBe(true);
  });
});
