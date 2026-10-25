import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import {
  isNonImageKubernetesResource,
  kubernetesImageReferences,
  managedImageReferences,
  readRegistrySource,
  runRegistryProcess,
  serveRegistryReader,
  withRegistryExecutable,
} from '@tools/registry-publication';
import { type } from 'arktype';
import { parse } from 'yaml';

const Text = type('string > 0');
const Name = type(/^[a-z0-9][a-z0-9.-]*$/);
const Pin = type({ path: Text.narrow(isAbsolute), sha256: /^[0-9a-f]{64}$/, '+': 'reject' });
const Namespace = type({ name: Name, uid: Text, '+': 'reject' });
const Input = type({
  renderer: Pin,
  kubeconfig: Pin,
  context: Text,
  clusterUid: Text,
  namespaces: Namespace.array().atLeastLength(1),
  'releaseRecord?': { namespace: Name, name: Name, '+': 'reject' },
  registryUrl: Text,
  '+': 'reject',
});
const GroupVersion = type(/^[a-z0-9][a-z0-9.-]*\/v[0-9][a-z0-9]*$/);
const Discovery = type({
  groupVersion: Text,
  resources: type({ name: Text, kind: Text, namespaced: 'boolean', verbs: 'string[]' }).array(),
});
const List = type({
  metadata: { resourceVersion: Text, 'continue?': 'string' },
  items: 'unknown[]',
});

/**
 * Enumerate the actual served namespace APIs, not kubectl's incomplete `all` category. Read every
 * listable image-capable/unknown kind; unknown populated controllers and incomplete lists refuse.
 * Every served version is inspected independently; duplicate representations contribute a union of refs,
 * never permission to skip another version. Configured namespaces and cluster identity must
 * exist and match immutable UIDs.
 */
export async function readKubernetesInventory(
  namespaces: readonly { name: string; uid: string }[],
  clusterUid: string,
  read: (path: string) => Promise<unknown>,
  releaseRecord?: { namespace: string; name: string },
): Promise<{
  images: string[];
  sourceRevision: string;
  hasReleaseEvidence: boolean;
  currentImages?: string[];
}> {
  const observed: unknown[] = [];
  const identity = type({ metadata: { uid: Text } })(await read('/api/v1/namespaces/kube-system'));
  if (identity instanceof type.errors || identity.metadata.uid !== clusterUid)
    throw new Error('Kubernetes inventory cluster identity differs');
  for (const namespace of namespaces) {
    const current = type({ metadata: { uid: Text } })(
      await read(`/api/v1/namespaces/${namespace.name}`),
    );
    if (current instanceof type.errors || current.metadata.uid !== namespace.uid)
      throw new Error('Kubernetes inventory namespace identity differs');
    observed.push(current);
  }
  const groups = type({
    groups: type({
      preferredVersion: { groupVersion: GroupVersion },
      versions: type({ groupVersion: GroupVersion }).array().atLeastLength(1),
    }).array(),
  })(await read('/apis'));
  if (groups instanceof type.errors) throw new Error('Malformed Kubernetes API discovery');
  // Proof: removing membership validation accepts discovery whose preferred version is not served.
  if (
    groups.groups.some(
      (group) =>
        !group.versions.some(
          (version) => version.groupVersion === group.preferredVersion.groupVersion,
        ),
    )
  )
    throw new Error('Preferred Kubernetes API version is absent from served discovery');
  // Proof: registry-reader.test.ts observed preferred-only enumeration certify genesis while a nonpreferred Runner selected an image.
  const versions = [
    'v1',
    ...groups.groups.flatMap((group) => group.versions.map((version) => version.groupVersion)),
  ];
  if (new Set(versions).size !== versions.length)
    throw new Error('Duplicate Kubernetes API discovery');
  observed.push(groups);
  const images: string[] = [];
  for (const version of versions) {
    const prefix = version === 'v1' ? '/api/v1' : `/apis/${version}`;
    const discovery = Discovery(await read(prefix));
    if (discovery instanceof type.errors || discovery.groupVersion !== version)
      throw new Error('Malformed Kubernetes resource discovery');
    observed.push(discovery);
    for (const resource of discovery.resources) {
      if (!resource.namespaced || !resource.verbs.includes('list') || resource.name.includes('/'))
        continue;
      if (Name(resource.name) instanceof type.errors)
        throw new Error('Malformed Kubernetes API resource name');
      if (isNonImageKubernetesResource(version, resource.kind)) continue;
      for (const namespace of namespaces) {
        const inventory = List(
          await read(`${prefix}/namespaces/${namespace.name}/${resource.name}`),
        );
        if (
          inventory instanceof type.errors ||
          (inventory.metadata.continue !== undefined && inventory.metadata.continue !== '')
        )
          throw new Error('Incomplete Kubernetes source list');
        for (const raw of inventory.items) {
          const identity = type({ apiVersion: Text, kind: Text, metadata: { namespace: Text } })(
            raw,
          );
          if (
            identity instanceof type.errors ||
            identity.apiVersion !== version ||
            identity.kind !== resource.kind ||
            identity.metadata.namespace !== namespace.name
          )
            throw new Error('Kubernetes source object identity differs from requested list');
        }
        observed.push(inventory);
        images.push(...kubernetesImageReferences(inventory.items));
      }
    }
  }
  let currentImages: string[] | undefined;
  let hasReleaseEvidence = images.length !== 0;
  if (releaseRecord !== undefined) {
    if (
      !namespaces.some((namespace) => namespace.name === releaseRecord.namespace) ||
      Name(releaseRecord.name) instanceof type.errors
    )
      throw new Error('Release record source is outside configured namespaces');
    const leases = List(
      await read(
        `/apis/coordination.k8s.io/v1/namespaces/${releaseRecord.namespace}/leases?fieldSelector=metadata.name%3D${releaseRecord.name}`,
      ),
    );
    if (
      leases instanceof type.errors ||
      leases.items.length > 1 ||
      (leases.metadata.continue !== undefined && leases.metadata.continue !== '')
    )
      throw new Error('Incomplete release Lease source');
    for (const raw of leases.items) {
      const lease = type({
        apiVersion: "'coordination.k8s.io/v1'",
        kind: "'Lease'",
        metadata: { name: Text, namespace: Text, uid: Text },
      })(raw);
      if (
        lease instanceof type.errors ||
        lease.metadata.name !== releaseRecord.name ||
        lease.metadata.namespace !== releaseRecord.namespace
      )
        throw new Error('Malformed or foreign release Lease');
    }
    observed.push(leases);
    // Proof: interrupted release Lease with no workloads or ConfigMap was incorrectly reported as empty genesis.
    if (leases.items.length !== 0) hasReleaseEvidence = true;
    const records = List(
      await read(
        `/api/v1/namespaces/${releaseRecord.namespace}/configmaps?fieldSelector=metadata.name%3D${releaseRecord.name}`,
      ),
    );
    if (
      records instanceof type.errors ||
      records.items.length > 1 ||
      (records.metadata.continue !== undefined && records.metadata.continue !== '')
    )
      throw new Error('Incomplete release record source');
    observed.push(records);
    currentImages = [];
    for (const raw of records.items) {
      const record = type({
        apiVersion: "'v1'",
        kind: "'ConfigMap'",
        metadata: { name: Text, namespace: Text, uid: Text },
        data: { sourceSha: /^[0-9a-f]{40}$/, images: Text },
      })(raw);
      if (
        record instanceof type.errors ||
        record.metadata.name !== releaseRecord.name ||
        record.metadata.namespace !== releaseRecord.namespace
      )
        throw new Error('Malformed or foreign release record');
      const recorded = type({
        backend: Text,
        gateway: Text,
        frontend: Text,
        mcp: Text,
        '+': 'reject',
      })(JSON.parse(record.data.images) as unknown);
      if (recorded instanceof type.errors) throw new Error('Incomplete recorded release images');
      currentImages = Object.values(recorded);
      hasReleaseEvidence = true;
    }
  }
  return {
    images: [...new Set(images)],
    hasReleaseEvidence,
    ...(currentImages === undefined ? {} : { currentImages }),
    sourceRevision: `sha256:${createHash('sha256').update(JSON.stringify(observed)).digest('hex')}`,
  };
}

/** Source-owned CLI verifies its installed renderer and kubeconfig before read-only API access. */
export async function readKubernetesSource(input: unknown) {
  const configuration = Input(input);
  if (configuration instanceof type.errors)
    throw new Error('Malformed Kubernetes reader configuration');
  const credentials = await readRegistrySource(configuration.kubeconfig.path, 65536);
  if (
    createHash('sha256').update(credentials.bytes).digest('hex') !== configuration.kubeconfig.sha256
  )
    throw new Error('Kubernetes source credential configuration digest mismatch');
  const kubeconfig = type({
    kind: "'Config'",
    apiVersion: "'v1'",
    'users?': type({ user: { 'exec?': 'unknown', 'auth-provider?': 'unknown' } }).array(),
  })(parse(credentials.text) as unknown);
  if (
    kubeconfig instanceof type.errors ||
    kubeconfig.users?.some(
      (user) => user.user.exec !== undefined || user.user['auth-provider'] !== undefined,
    )
  )
    throw new Error('Kubernetes reader forbids credential execution plugins');
  return withRegistryExecutable(configuration.renderer, async (renderer, directory) => {
    const kubeconfigPath = join(directory, 'config');
    await writeFile(kubeconfigPath, credentials.bytes, { mode: 0o600 });
    const inventory = await readKubernetesInventory(
      configuration.namespaces,
      configuration.clusterUid,
      async (path) =>
        JSON.parse(
          await runRegistryProcess(
            [
              renderer,
              `--kubeconfig=${kubeconfigPath}`,
              `--context=${configuration.context}`,
              'get',
              `--raw=${path}`,
            ],
            directory,
          ),
        ) as unknown,
      configuration.releaseRecord,
    );
    return { ...inventory, registryUrl: configuration.registryUrl };
  });
}

/** Source reports include current recorded identity when explicitly configured for recovery observation. */
export async function readKubernetesConsumers(input: unknown) {
  const source = await readKubernetesSource(input);
  return {
    sourceRevision: source.sourceRevision,
    references: managedImageReferences(source.images, source.registryUrl),
    ...(source.currentImages === undefined
      ? {}
      : { currentReferences: managedImageReferences(source.currentImages, source.registryUrl) }),
  };
}
if (import.meta.main) await serveRegistryReader(readKubernetesConsumers);
