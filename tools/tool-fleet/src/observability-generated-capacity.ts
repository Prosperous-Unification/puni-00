import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parseDocument } from 'yaml';

import { readCPUMilli, readMemoryMiB } from './observability-capacity';
import type { ObservabilitySource } from './observability-source';
import { type ColdStartInventory, readColdStartSource } from './observability-source-inventory';
import {
  readObservabilitySelectedResources,
  type SelectedRole,
} from './observability-source-resources';
import { normalizeWorkload, SourceWorkloadSpec } from './observability-workload';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const Record = type('Record<string,unknown>');
const Image = type({ role: 'string', name: 'string>0', digest: /^sha256:[a-f0-9]{64}$/ });
const Chart = type({ version: 'string>0', sha256: /^[a-f0-9]{64}$/, images: Image.array() });
const Lock = type({
  binaries: { k3s: { version: 'string', sha256: 'string' } },
  runtimeImages: { k3dNode: Image },
  charts: { eckOperator: Chart, elasticsearch: Chart, kibana: Chart, kubePrometheusStack: Chart },
});
const Claim = type({
  'metadata?': { 'name?': 'string>0', 'namespace?': 'string>0' },
  spec: {
    storageClassName: 'string>0',
    accessModes: 'string[]',
    resources: { requests: { storage: 'string>0' } },
  },
});
const ContainerInput = type({ name: 'string>0', 'image?': 'string>0', resources: 'unknown' });
/** The pinned CRD/model permits zero; selected-source counts remain nonnegative int32. */
const ShardCount = type('number.integer>=0').atMost(2147483647);
// Proof: Task25b2 fix1 pod-resource-map-kind removal admitted array requirement bodies and request/limit maps.
const ResourceList = type('Record<string,string|number>').narrow(
  (quantities) => !Array.isArray(quantities),
);
const PodResources = type({ 'requests?': ResourceList, 'limits?': ResourceList }).narrow(
  (resources) => !Array.isArray(resources),
);
/** Validate only supplied Pod resource maps and bounds before leaving the policy unsupported.
 * Returns detached validated supplied maps for source inventory. Optional maps stay absent;
 * this derives no Pod charge or default limit. Existing accounting callers discard the maps.
 */
export function assertPodResources(input: unknown) {
  const resources = PodResources(input);
  // Proof: Task25b2 fix1 pod-requirements-shape removal admitted malformed maps and quantity types.
  if (resources instanceof type.errors) refuse('pod-resources-malformed');
  const readAmounts = (quantities: typeof ResourceList.infer | undefined) => {
    const amounts = new Map<string, number>();
    if (quantities === undefined) return amounts;
    // Proof: Task25b2 fix1 pod-cpu/memory-quantity-reader substitutions admitted malformed quantities.
    for (const [name, quantity] of Object.entries(quantities))
      amounts.set(
        name,
        name === 'cpu'
          ? readCPUMilli(String(quantity), refuse)
          : readMemoryMiB(String(quantity), refuse),
      );
    return amounts;
  };
  const limits = readAmounts(resources.limits);
  for (const [name, request] of readAmounts(resources.requests)) {
    const limit = limits.get(name);
    // Proof: Task25b2 fix1 pod-request-limit-bounds removal admitted selected/extra-template contradictions.
    if (limit !== undefined && request > limit) refuse('pod-resources-contradiction');
  }
  // Proof: Task25c2a resource-alias returning the input let returned facts mutate original request/limit maps.
  return {
    ...(resources.requests === undefined ? {} : { requests: { ...resources.requests } }),
    ...(resources.limits === undefined ? {} : { limits: { ...resources.limits } }),
  };
}

class UnsupportedGeneratedWorkload extends Error {}
function refuse(reason: string): never {
  throw new Error(`Generated capacity ${reason}`);
}
function readRecord(input: unknown) {
  const record = Record(input);
  // Proof: Task25b2 record-decoder bypass admitted malformed annotations; its production negative failed.
  if (record instanceof type.errors) return refuse('source-malformed');
  return record;
}
function readImage(images: (typeof Image.infer)[], role: string) {
  const selected = images.filter((image) => image.role === role);
  // Proof: Task25b2 image-role-uniqueness removal admitted duplicate locked reloader roles.
  if (selected.length !== 1) return refuse('image-role');
  return `${selected[0].name}@${selected[0].digest}`;
}
/** Exact source bytes for the retained fork contract, never a claim about the running kubelet. */
export interface SelectedRuntimeFrame {
  readonly bytes: string;
  readonly sha256: string;
}
/** Derive conservative per-replica traits from the shared selected maps and pinned provider/runtime source contracts.
 * The internal workload is an accounting input, not an effective PodSpec. Conditional keystore realization,
 * generated readonly input overhead, operator overlap and runtime enforcement remain unresolved.
 * Throws on malformed source/maps/claims or byte/provider/runtime drift; valid unmodeled surfaces remain named facts.
 */
export function deriveSelectedCapacityTraits(
  source: ObservabilitySource,
  rendered: Record<string, string>,
  inventory: readonly ColdStartInventory[],
  runtime: SelectedRuntimeFrame,
) {
  // Proof: Task25b2 adapter-source-boundary bypass admitted changed source bytes; source-hash negative failed.
  return deriveSelectedCapacityInputs(
    source,
    readColdStartSource(
      Object.entries(rendered).map(([owner, bytes]) => ({ owner, bytes })),
      inventory,
    ),
    runtime,
  );
}
/** Consume the same validated source/index value as the native ledger; callers must use {@link readColdStartSource}. */
export function deriveSelectedCapacityInputs(
  source: ObservabilitySource,
  validated: ReturnType<typeof readColdStartSource>,
  runtime: SelectedRuntimeFrame,
) {
  const { indexed, inventory } = validated;
  const selected = readObservabilitySelectedResources(source, indexed);
  // Proof: Task25b2 runtime-byte-hash removal admitted changed runtime evidence bytes.
  if (hash(runtime.bytes) !== runtime.sha256) refuse('runtime-hash');
  const lock = Lock.assert(JSON.parse(runtime.bytes));
  // Proof: Task25b2 runtime-contract removal admitted changed k3s build and node-image identities.
  if (
    lock.binaries.k3s.version !== 'v1.36.4+k3s1' ||
    lock.binaries.k3s.sha256 !==
      '835873f37245fc615f547a2fe2af9402a347875f13fa64a1f136de644955ea3f' ||
    lock.runtimeImages.k3dNode.name !== 'docker.io/rancher/k3s:v1.36.4-k3s1' ||
    lock.runtimeImages.k3dNode.digest !==
      'sha256:edad48e12bf81c3a09ac1c05c0c0ffaaa22145980b989d6fae84543a76b83657'
  )
    refuse('runtime-contract');
  const runtimeIdentity = {
    lockSHA256: runtime.sha256,
    binary: lock.binaries.k3s,
    nodeImage: `${lock.runtimeImages.k3dNode.name}@${lock.runtimeImages.k3dNode.digest}`,
    kubernetesCommit: '5f3efbf9f6b592422439471c5fe1a1ab2887e189',
  };
  const reloader = readImage(lock.charts.kubePrometheusStack.images, 'configReloader');
  const arguments_ = selected.providers.prometheus.arguments;
  const reloaderFlags = arguments_.filter(
    (flag) =>
      flag === '--prometheus-config-reloader' || flag.startsWith('--prometheus-config-reloader='),
  );
  // Proof: Task25b2 reloader-image-flag removal admitted a missing flag; unique-reloader-image-flag removal admitted later equals/separate overrides.
  if (reloaderFlags.length !== 1 || reloaderFlags[0] !== `--prometheus-config-reloader=${reloader}`)
    refuse('reloader-image');
  // Proof: Task25b2 provider-controller-chart removal admitted a changed locked controller chart.
  if (
    selected.providers.eck.chartVersion !== lock.charts.eckOperator.version ||
    selected.providers.prometheus.chartVersion !== lock.charts.kubePrometheusStack.version
  )
    refuse('provider-chart');
  // Proof: Task25b2 provider-image removal admitted a changed locked ECK image.
  if (
    selected.providers.eck.image !== readImage(lock.charts.eckOperator.images, 'operator') ||
    selected.providers.prometheus.image !==
      readImage(lock.charts.kubePrometheusStack.images, 'operator')
  )
    refuse('provider-image');
  return selected.roles.map((role) => {
    const spec = readRecord(role.manifest['spec']);
    const eck = role.kind === 'Elasticsearch' || role.kind === 'Kibana';
    const chartName =
      role.kind === 'Elasticsearch'
        ? 'elasticsearch'
        : role.kind === 'Kibana'
          ? 'kibana'
          : 'kubePrometheusStack';
    const chart = lock.charts[chartName];
    const release = source.releases.filter((release) => release.owner === role.owner);
    // Proof: Task25b2 source-release-identity removal admitted a foreign release chart identity.
    if (release.length !== 1 || release[0].chart !== chartName) refuse('source-owner');
    const manifest = type({ spec: { chart: { spec: { version: 'string' } } } }).assert(
      parseDocument(release[0].manifest).toJSON(),
    );
    // Proof: Task25b2 service-chart removal admitted a changed selected source chart version.
    if (manifest.spec.chart.spec.version !== chart.version) refuse('provider-chart');
    const expectedImage = readImage(chart.images, eck ? 'node' : role.kind.toLowerCase());
    // Proof: Task25b2 service-image removal admitted an unpinned selected service image.
    if (spec['image'] !== expectedImage) refuse('service-image');
    // Proof: Task25b2 service-version removal admitted an unsupported service version.
    if (
      spec['version'] !==
      (eck ? '9.3.8' : role.kind === 'Prometheus' ? 'v3.14.0-distroless' : 'v0.34.0')
    )
      refuse('service-version');
    const missingFacts = [
      'operator-reconciliation-and-terminating-overlap',
      'generated-readonly-input-memory-overhead',
      'generated-volume-mount-equality',
      'operator-effective-template-equality',
      'runtime-overhead',
      'actual-claim-mount-binding',
      'admitted-pod-ancestor-memory-cgroup-tmpfs-and-swap',
    ];
    const unsupported = (path: string) =>
      missingFacts.push(`unsupported-source:${role.identity}${path}`);
    const inspectKeys = (input: Record<string, unknown>, keys: readonly string[], path: string) => {
      // Proof: Task25b2 unsupported-key-inspection removal hid Thanos, template/node/container/Pod additions and changed metadata branches.
      for (const key of Object.keys(input)) if (!keys.includes(key)) unsupported(`${path}/${key}`);
    };
    const pod = readRecord(role.pod);
    // Proof: Task25b2 fix1 selected-pod-policy-boundary removal hid malformed selected ECK quantities.
    if (eck && Object.hasOwn(pod, 'resources')) assertPodResources(pod['resources']);
    if (!eck && Object.hasOwn(spec, 'podTemplate')) {
      const template = readRecord(spec['podTemplate']);
      if (Object.hasOwn(template, 'spec')) {
        const templatePod = readRecord(template['spec']);
        // Proof: Task25b2 fix1 unsupported-template-policy-boundary removal hid malformed Prometheus/Alertmanager template quantities.
        if (Object.hasOwn(templatePod, 'resources')) assertPodResources(templatePod['resources']);
      }
    }
    const origins: { name: string; image: string; origin: string; pointer: string }[] = [];
    const readContainers = (containers: SelectedRole['containers'], phase: string) =>
      containers.map((container) => {
        const authored = ContainerInput.assert(container);
        inspectKeys(
          readRecord(container),
          [
            'name',
            'image',
            'resources',
            'securityContext',
            'volumeMounts',
            'env',
            'command',
            'args',
            'restartPolicy',
            'resizePolicy',
            'volumeDevices',
          ],
          `${phase}/${container.name}`,
        );
        const image =
          authored.image ?? (container.name.includes('config-reloader') ? reloader : expectedImage);
        // Proof: Task25b2 container-image removal admitted a foreign authored image override.
        if (
          authored.image !== undefined &&
          authored.image !== (container.name.includes('config-reloader') ? reloader : expectedImage)
        )
          refuse('container-image');
        origins.push({
          name: container.name,
          image,
          origin:
            authored.image !== undefined
              ? 'authored-container-image'
              : container.name.includes('config-reloader')
                ? 'pinned-controller-reloader-flag'
                : 'pinned-service-image',
          // Proof: Task25b2 source-role-pointer removal lost the actual CR Pod path and failed the image-origin assertion.
          pointer: `${role.identity}${role.podPointer}${phase}/${container.name}`,
        });
        const resources = {
          requests: Object.fromEntries(
            Object.entries(container.resources.requests).map(([name, quantity]) => [
              name,
              String(quantity),
            ]),
          ),
          limits: Object.fromEntries(
            Object.entries(container.resources.limits).map(([name, quantity]) => [
              name,
              String(quantity),
            ]),
          ),
        };
        const mounts = readRecord(container)['volumeMounts'];
        const expectedMounts =
          role.kind === 'Elasticsearch' && container.name === 'elasticsearch'
            ? [
                {
                  name: 's3-trust',
                  mountPath: '/usr/share/elasticsearch/config/s3-trust',
                  readOnly: true,
                },
                {
                  name: 's3-trust',
                  mountPath: '/usr/share/elasticsearch/config/jvm.options.d/s3.options',
                  readOnly: true,
                  subPath: 's3.options',
                },
              ]
            : container.name === 'prepare-s3-trust'
              ? [
                  { name: 's3-trust', mountPath: '/usr/share/elasticsearch/config/s3-trust' },
                  { name: 's3-credentials', mountPath: '/s3-credentials', readOnly: true },
                ]
              : [];
        // Proof: Task25b2 authored-mount-contract removal hid an extra mount to a known scratch volume.
        if (!isDeepStrictEqual(mounts ?? [], expectedMounts))
          unsupported(`${phase}/${container.name}/volumeMounts`);
        const mutable: Record<string, unknown> = { ...container, image, resources };
        // Proof: Task25b2 container-policy-closure removal hid restartable init and resizing; policy-shape removal admitted a malformed init policy.
        for (const key of ['restartPolicy', 'resizePolicy', 'volumeDevices'])
          if (Object.hasOwn(container, key)) {
            const policy = readRecord(container)[key];
            if (key === 'restartPolicy' && policy !== 'Always') refuse('source-malformed');
            if (key === 'resizePolicy')
              type({
                resourceName: "'cpu'|'memory'",
                restartPolicy: "'NotRequired'|'RestartContainer'",
                '+': 'reject',
              })
                .array()
                .assert(policy);
            if (key === 'volumeDevices')
              type({ name: 'string>0', devicePath: 'string>0' }).array().assert(policy);
            unsupported(`${phase}/${container.name}/${key}`);
          }
        // Proof: Task25b2 authored-structure-before-rewrite removal let null authored mounts vanish during provider accounting rewrites.
        SourceWorkloadSpec.assert({ containers: [mutable] });
        return Object.fromEntries(
          Object.entries(mutable).filter(
            ([key]) => !['restartPolicy', 'resizePolicy', 'volumeDevices'].includes(key),
          ),
        );
      });
    const containers = readContainers(role.containers, '/containers');
    const initContainers = readContainers(role.initContainers, '/initContainers');
    const authoredVolumes = type('unknown[]').assert(pod['volumes'] ?? []);
    // Proof: Task25b2 immutable-validated-index alias mutation changed the shared source index and failed repeated consumption.
    const volumes = [...authoredVolumes];
    const unmodeledVolumes = new Set<string>();
    const claims: {
      name: string;
      requestedMiB: number;
      storageClassName: string;
      sourcePointer: string;
      mount: { path: string; subPath: string };
    }[] = [];
    const addClaim = (
      input: unknown,
      name: string,
      path: string,
      mountPath: string,
      subPath: string,
    ) => {
      // Proof: Task25b2 claim-decoder widening admitted an empty claim storage class.
      const claim = Claim.assert(input);
      // Proof: Task25b2 claim-binding removal admitted foreign namespace/name/bound-volume and absent ES claim-name inputs.
      if (
        (role.kind === 'Elasticsearch' && claim.metadata?.name !== name) ||
        (claim.metadata?.name !== undefined && claim.metadata.name !== name) ||
        (claim.metadata?.namespace !== undefined && claim.metadata.namespace !== role.namespace) ||
        Object.keys(readRecord(input)).some((key) => !['metadata', 'spec'].includes(key)) ||
        Object.keys(readRecord(claim.spec)).some(
          (key) => !['storageClassName', 'accessModes', 'resources'].includes(key),
        )
      )
        refuse('claim-binding');
      const requestedMiB = readMemoryMiB(claim.spec.resources.requests.storage, refuse);
      // Proof: Task25b2 claim-positive-and-mode removal admitted zero storage and unsupported access modes.
      if (requestedMiB <= 0 || !isDeepStrictEqual(claim.spec.accessModes, ['ReadWriteOnce']))
        refuse('claim-shape');
      claims.push({
        name,
        requestedMiB,
        storageClassName: claim.spec.storageClassName,
        sourcePointer: `${role.identity}${path}`,
        mount: { path: mountPath, subPath },
      });
      if (!volumes.some((volume) => readRecord(volume)['name'] === name))
        volumes.push({ name, persistentVolumeClaim: { claimName: name } });
      containers[0] = {
        ...containers[0],
        volumeMounts: [
          ...type('unknown[]').assert(readRecord(containers[0])['volumeMounts'] ?? []),
          { name, mountPath, ...(subPath === '' ? {} : { subPath }) },
        ],
      };
    };
    let replicas: number;
    if (role.kind === 'Elasticsearch') {
      const nodes = type({
        name: 'string>0',
        count: 'number.integer>=0',
        podTemplate: { spec: 'object' },
        volumeClaimTemplates: 'unknown[]',
        'config?': 'object',
      })
        .array()
        .atLeastLength(1)
        .assert(spec['nodeSets']);
      for (const node of nodes.slice(1)) {
        const extra = readRecord(node.podTemplate.spec);
        // Proof: Task25b2 fix1 extra-node-policy-boundary removal hid malformed quantities/bounds behind an extra-nodeSet CSI branch.
        if (Object.hasOwn(extra, 'resources')) assertPodResources(extra['resources']);
      }
      replicas = nodes[0].count;
      // Proof: Task25b2 nodeset-shape removal hid extra nodeSets and changed ES count/name.
      if (nodes.length !== 1 || nodes[0].name !== 'default' || replicas !== 1)
        unsupported('/spec/nodeSets');
      for (const [ordinal, node] of nodes.entries()) {
        inspectKeys(
          readRecord(node),
          ['name', 'count', 'config', 'podTemplate', 'volumeClaimTemplates'],
          `/spec/nodeSets/${String(ordinal)}`,
        );
        inspectKeys(
          readRecord(node.podTemplate),
          ['spec'],
          `/spec/nodeSets/${String(ordinal)}/podTemplate`,
        );
        // Proof: Task25b2 extra-nodeset-validation removal hid malformed resources in an additional nodeSet.
        if (ordinal !== 0) {
          const extra = readRecord(node.podTemplate.spec);
          const applications = type({ name: 'string', resources: 'object', 'image?': 'string' })
            .array()
            .assert(extra['containers'])
            .map((container) => ({ ...container, image: container.image ?? expectedImage }));
          const inits = type({ name: 'string', resources: 'object', 'image?': 'string' })
            .array()
            .assert(extra['initContainers'] ?? [])
            .map((container) => ({ ...container, image: container.image ?? expectedImage }));
          // Proof: Task25b2 extra-claim-boundary removal hid malformed and zero additional-nodeSet claim requests.
          for (const template of node.volumeClaimTemplates) {
            const claim = Claim.assert(template);
            if (readMemoryMiB(claim.spec.resources.requests.storage, refuse) <= 0)
              refuse('claim-shape');
          }
          const accounting = SourceWorkloadSpec.assert({
            containers: applications,
            initContainers: inits,
            volumes: extra['volumes'] ?? [],
          });
          const readers = {
            memory: (quantity: string) => readMemoryMiB(quantity, refuse),
            cpu: (quantity: string) => readCPUMilli(quantity, refuse),
            // Proof: Task25b2 extra-malformed-callback removal downgraded an additional-nodeSet contradictory volume union.
            refuseMalformed: refuse,
            refuse: (reason: string) => {
              if (
                reason === 'workload-volume-unsupported' ||
                reason === 'workload-shape-unsupported'
              )
                throw new UnsupportedGeneratedWorkload(reason);
              return refuse(reason);
            },
          };
          try {
            normalizeWorkload(accounting, readers);
          } catch (failure) {
            // Proof: Task25b2 extra-modeled-only-recovery removal downgraded an additional-nodeSet malformed volume union.
            if (!(failure instanceof UnsupportedGeneratedWorkload)) throw failure;
            unsupported(`/spec/nodeSets/${String(ordinal)}/accounting/${failure.message}`);
            // Proof: Task25b2 extra-resource-fallback removal hid request>limit behind an additional-nodeSet CSI limitation.
            const resourcesOnly = (containers: typeof accounting.containers) =>
              containers.map((container) => ({
                name: container.name,
                image: container.image,
                resources: container.resources,
              }));
            normalizeWorkload(
              {
                containers: resourcesOnly(accounting.containers),
                initContainers: resourcesOnly(accounting.initContainers ?? []),
              },
              readers,
            );
          }
        }
      }
      // Proof: Task25b2 selected-claim-template-count removal hid an additional selected-nodeSet claim template.
      if (nodes[0].volumeClaimTemplates.length !== 1) refuse('claim-count');
      addClaim(
        nodes[0].volumeClaimTemplates[0],
        'elasticsearch-data',
        '/spec/nodeSets/0/volumeClaimTemplates/0',
        '/usr/share/elasticsearch/data',
        '',
      );
      if (!volumes.some((volume) => readRecord(volume)['name'] === 'downward-api'))
        volumes.push({
          name: 'downward-api',
          downwardAPI: { items: [{ path: 'labels', fieldRef: { fieldPath: 'metadata.labels' } }] },
        });
      containers[0] = {
        ...containers[0],
        volumeMounts: [
          ...type('unknown[]').assert(readRecord(containers[0])['volumeMounts'] ?? []),
          { name: 'downward-api', mountPath: '/mnt/elastic-internal/downward-api', readOnly: true },
        ],
      };
      missingFacts.push('keystore-secret-resource-realization');
      inspectKeys(
        spec,
        ['version', 'image', 'nodeSets', 'auth', 'secureSettings', 'volumeClaimDeletePolicy'],
        '/spec',
      );
      const settings = type({
        secretName: 'string>0',
        entries: type({ key: 'string>0' }).array(),
        '+': 'reject',
      })
        .array()
        .assert(spec['secureSettings']);
      // Proof: Task25b2 secure-settings-branch removal hid a changed ES keystore branch.
      if (
        settings.length !== 1 ||
        settings[0].secretName !== 'elastic-s3-credentials' ||
        !isDeepStrictEqual(settings[0].entries.map((entry) => entry.key).sort(), [
          's3.client.default.access_key',
          's3.client.default.secret_key',
        ])
      )
        unsupported('/spec/secureSettings');
    } else if (role.kind === 'Kibana') {
      inspectKeys(readRecord(spec['podTemplate']), ['spec'], '/spec/podTemplate');
      replicas = type('number.integer>=0').assert(spec['count']);
      // Proof: Task25b2 kibana-replica-shape removal hid zero replicas; replica-decoder widening admitted fractional count.
      if (replicas !== 1) unsupported('/spec/count');
      inspectKeys(spec, ['version', 'image', 'count', 'elasticsearchRef', 'podTemplate'], '/spec');
    } else {
      replicas = type('number.integer>=0').assert(spec['replicas']);
      // Proof: Task25b2 monitoring-replica-shape removal hid multiple replicas.
      if (replicas !== 1) unsupported('/spec/replicas');
      // Proof: Task25b2 prometheus-shard-shape removal hid multiple shards.
      if (role.kind === 'Prometheus') {
        const shards = spec['shards'] === undefined ? undefined : ShardCount(spec['shards']);
        // Proof: Task25b2 fix1 shard-count-validation removal downgraded string/negative/fraction/int32-overflow/null shards to partial.
        if (shards instanceof type.errors) refuse('shards-malformed');
        if (shards !== 1) unsupported('/spec/shards');
      }
      // Proof: Task25b2 primary-resource-map removal admitted contradictory primary resource overrides.
      if (!isDeepStrictEqual(role.containers[0].resources, spec['resources']))
        refuse('primary-resource-map');
      const storage = type({ volumeClaimTemplate: 'object', '+': 'reject' }).assert(
        spec['storage'],
      );
      const name = `${role.kind.toLowerCase()}-kps-${role.kind.toLowerCase()}-db`;
      addClaim(
        storage.volumeClaimTemplate,
        name,
        '/spec/storage/volumeClaimTemplate',
        role.kind === 'Prometheus' ? '/prometheus' : '/alertmanager',
        `${role.kind.toLowerCase()}-db`,
      );
      volumes.push({ name: 'config-out', emptyDir: { medium: 'Memory' } });
      inspectKeys(spec, monitoringFields, '/spec');
    }
    if (eck)
      inspectKeys(
        pod,
        [
          'containers',
          'initContainers',
          'volumes',
          'nodeSelector',
          'securityContext',
          'overhead',
          'runtimeClassName',
          'resources',
          'resourceClaims',
          'ephemeralContainers',
        ],
        '/podTemplate/spec',
      );
    // Proof: Task25b2 node-selector-contract removal hid unsupported placement.
    if (!isDeepStrictEqual(pod['nodeSelector'], { 'puni.dev/capability-observability': 'true' }))
      unsupported(`${eck ? '/podTemplate/spec' : '/spec'}/nodeSelector`);
    // Proof: Task25b2 host-network-contract removal hid host networking.
    if (pod['hostNetwork'] === true) unsupported('/spec/hostNetwork');
    // Proof: Task25b2 affinity-contract removal hid unsupported node affinity.
    if (pod['affinity'] !== undefined && readRecord(pod['affinity'])['nodeAffinity'] !== undefined)
      unsupported('/spec/affinity');
    // Proof: Task25b2 pod-policy-closure removal hid Pod-level resource policy.
    for (const key of [
      'runtimeClassName',
      ...(eck ? ['resources'] : []),
      'resourceClaims',
      'ephemeralContainers',
    ])
      if (pod[key] !== undefined) unsupported(`/podTemplate/spec/${key}`);
    const metadata = readRecord(role.manifest['metadata']);
    if (metadata['annotations'] !== undefined)
      inspectKeys(
        readRecord(metadata['annotations']),
        ['eck.k8s.elastic.co/license'],
        '/metadata/annotations',
      );
    // Proof: Task25b2 volume-closure removal hid extra readonly and persistent volumes; scratch-medium-contract removal hid a changed medium.
    for (const volume of authoredVolumes) {
      const named = readRecord(volume);
      if (
        named['emptyDir'] === undefined &&
        !(
          role.kind === 'Elasticsearch' &&
          named['name'] === 's3-credentials' &&
          named['secret'] !== undefined &&
          readRecord(named['secret'])['secretName'] === 'elastic-s3-credentials'
        )
      ) {
        const name = type('string>0').assert(named['name']);
        unmodeledVolumes.add(name);
        unsupported(`/volumes/${name}`);
      }
      if (
        named['emptyDir'] !== undefined &&
        readRecord(named['emptyDir'])['medium'] !== undefined &&
        readRecord(named['emptyDir'])['medium'] !== ''
      )
        unsupported(`/volumes/${String(named['name'])}/medium`);
    }
    const accounting = SourceWorkloadSpec.assert({
      containers,
      initContainers,
      volumes,
      ...(pod['overhead'] === undefined ? {} : { overhead: pod['overhead'] }),
    });
    // Proof: Task25b2 metadata-source-policy and memory-source-policy removals failed the actual quantity/metadata positive; default callers remain strict.
    const normalizeAccounting = (candidate: typeof accounting) =>
      normalizeWorkload(
        candidate,
        {
          memory: (quantity) => readMemoryMiB(quantity, refuse),
          cpu: (quantity) => readCPUMilli(quantity, refuse),
          // Proof: Task25b2 malformed-normalizer-binding substitution downgraded a contradictory CSI union.
          refuseMalformed: refuse,
          refuse: (reason) => {
            if (reason === 'workload-volume-unsupported' || reason === 'workload-shape-unsupported')
              throw new UnsupportedGeneratedWorkload(reason);
            return refuse(reason);
          },
        },
        role.kind === 'Elasticsearch'
          ? {
              standaloneDownwardAPI: candidate.volumes?.some(
                (volume) => volume.name === 'downward-api' && volume.downwardAPI !== undefined,
              )
                ? ['downward-api']
                : [],
            }
          : eck
            ? undefined
            : { podMemoryVolume: 'config-out' },
      );
    let model: ReturnType<typeof normalizeWorkload>;
    try {
      model = normalizeAccounting(accounting);
    } catch (failure) {
      // Proof: Task25b2 modeled-only-recovery removal downgraded a malformed CSI union.
      if (!(failure instanceof UnsupportedGeneratedWorkload)) throw failure;
      unsupported(`/accounting/${failure.message}`);
      const stripMounts = (containers: typeof accounting.containers) =>
        containers.map((container) => ({
          ...container,
          volumeMounts: container.volumeMounts
            ?.filter((mount) => !unmodeledVolumes.has(mount.name))
            .map(({ mountPropagation: _propagation, ...mount }) => mount),
        }));
      model = normalizeAccounting({
        ...accounting,
        containers: stripMounts(accounting.containers),
        initContainers: stripMounts(accounting.initContainers ?? []),
        volumes: accounting.volumes?.filter((volume) => !unmodeledVolumes.has(volume.name)),
      });
    }
    // The shared source/inventory boundary and selected role reader establish exact owner/resource membership.
    const provenance = Object.fromEntries(inventory.map((frame) => [frame.owner, frame]))[
      role.owner
    ];
    return {
      identity: role.identity,
      kind: role.kind,
      namespace: role.namespace,
      role: role.kind === 'Elasticsearch' ? 'default' : role.kind.toLowerCase(),
      replicas,
      scope: 'source-derived-capacity-traits' as const,
      state: 'partial' as const,
      // Proof: Task25b2 effective-pod-unobserved relabeling failed the eight-trait source-only assertion.
      effectivePodObserved: false as const,
      source: { owner: role.owner, sha256: provenance.sha256, pointer: role.identity },
      provider: {
        ...selected.providers[eck ? 'eck' : 'prometheus'],
        commit: eck
          ? '386c7b14f2d1bbb7f2af1e7da997e64875f16e47'
          : '2e4af1d7d8f0ae634fcf0ac967a76fb381a65542',
        controllerChart: {
          version: lock.charts[eck ? 'eckOperator' : 'kubePrometheusStack'].version,
          sha256: lock.charts[eck ? 'eckOperator' : 'kubePrometheusStack'].sha256,
        },
        chart: { name: chartName, version: chart.version, sha256: chart.sha256 },
      },
      runtime: runtimeIdentity,
      derivation: 'selected-generated-capacity/v1',
      initSequence: 'supported-conservative-provider-sequence' as const,
      containers: model.containers,
      initContainers: model.initContainers,
      imageOrigins: origins,
      volumes: model.volumes,
      claims,
      // Proof: Task25b2 no-nominal-unsupported-bound removal emitted a nominal amount for Thanos.
      perReplica: missingFacts.some((fact) => fact.startsWith('unsupported-source:'))
        ? null
        : {
            memoryMiB: model.memoryMiB,
            cpuMilli: model.cpuMilli,
            ephemeralMiB: model.ephemeralMiB,
          },
      // Proof: Task25b2 source-memory-unobserved relabeling failed the unobserved enforcement assertion.
      ...(model.sourceMemoryVolume === undefined ? {} : { memoryVolume: model.sourceMemoryVolume }),
      concurrency: {
        state: 'unassessed' as const,
        missingFact: 'operator-reconciliation-and-terminating-overlap',
      },
      missingFacts,
    };
  });
}
const monitoringFields = [
  'image',
  'imagePullPolicy',
  'version',
  'sha',
  'replicas',
  'shards',
  'listenLocal',
  'serviceAccountName',
  'automountServiceAccountToken',
  'externalUrl',
  'nodeSelector',
  'paused',
  'logFormat',
  'logLevel',
  'retention',
  'configSecret',
  'alertmanagerConfigSelector',
  'alertmanagerConfigNamespaceSelector',
  'resources',
  'routePrefix',
  'securityContext',
  'storage',
  'persistentVolumeClaimRetentionPolicy',
  'affinity',
  'portName',
  'hostNetwork',
  'alerting',
  'enableRemoteWriteReceiver',
  'enableOTLPReceiver',
  'enableAdminAPI',
  'retentionSize',
  'tsdb',
  'walCompression',
  'serviceMonitorSelector',
  'serviceMonitorNamespaceSelector',
  'podMonitorSelector',
  'podMonitorNamespaceSelector',
  'probeSelector',
  'probeNamespaceSelector',
  'ruleNamespaceSelector',
  'ruleSelector',
  'scrapeConfigSelector',
  'scrapeConfigNamespaceSelector',
  'scrapeInterval',
  'evaluationInterval',
  'ignoreNamespaceSelectors',
  'containers',
  'initContainers',
];
