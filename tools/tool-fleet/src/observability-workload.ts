import { type } from 'arktype';

const QuantityMap = type({
  memory: 'string',
  cpu: 'string',
  'ephemeral-storage?': 'string',
  '+': 'reject',
});
const Mount = type({
  name: 'string>0',
  mountPath: 'string>0',
  'readOnly?': 'boolean',
  'subPath?': 'string',
  'subPathExpr?': 'string',
  '+': 'reject',
});
// Proof: `mode-lower-bound` guard/dependency mutation failed `fix2 source projected file mode -1 is malformed` with an assertion (fix-2 receipt).
// Proof: `mode-upper-bound` guard/dependency mutation failed `fix2 observed projected file mode 512 is malformed` with an assertion (fix-2 receipt).
const FileMode = type('number.integer').atLeast(0).atMost(511);
const Projection = type({
  'secret?': {
    name: 'string>0',
    'items?': type({ key: 'string>0', path: 'string>0', 'mode?': FileMode }).array(),
    'optional?': 'boolean',
  },
  'configMap?': {
    name: 'string>0',
    'items?': type({ key: 'string>0', path: 'string>0', 'mode?': FileMode }).array(),
    'optional?': 'boolean',
  },
  'downwardAPI?': {
    items: type({
      path: 'string>0',
      'mode?': FileMode,
      'fieldRef?': { fieldPath: 'string>0', 'apiVersion?': 'string' },
      'resourceFieldRef?': 'unknown',
    }).array(),
  },
  'serviceAccountToken?': {
    path: 'string>0',
    'audience?': 'string',
    'expirationSeconds?': 'number.integer>0',
  },
  'unsupportedKind?': 'string',
  '+': 'reject',
});
const Volume = type({
  name: 'string>0',
  'persistentVolumeClaim?': { claimName: 'string>0', 'readOnly?': 'boolean' },
  'emptyDir?': { 'sizeLimit?': 'string', 'medium?': 'string' },
  'configMap?': {
    name: 'string>0',
    'items?': type({ key: 'string>0', path: 'string>0', 'mode?': 'number', '+': 'reject' }).array(),
    'optional?': 'boolean',
    'defaultMode?': 'number',
  },
  'secret?': {
    secretName: 'string>0',
    'items?': type({ key: 'string>0', path: 'string>0', 'mode?': 'number', '+': 'reject' }).array(),
    'optional?': 'boolean',
    'defaultMode?': 'number',
  },
  'projected?': { sources: Projection.array(), 'defaultMode?': 'number' },
  'downwardAPI?': { items: 'unknown' },
  'ephemeral?': 'unknown',
  'csi?': 'unknown',
  'hostPath?': 'unknown',
  'unsupportedKind?': 'string',
  '+': 'reject',
});
const containerFields = {
  name: 'string>0',
  image: 'string>0',
  resources: { requests: QuantityMap, limits: QuantityMap, '+': 'reject' },
  'securityContext?': { 'readOnlyRootFilesystem?': 'boolean' },
  'volumeMounts?': Mount.array(),
  'restartPolicy?': 'string',
  'volumeDevices?': 'unknown',
  'resizePolicy?': 'unknown',
  'unsupported?': 'boolean',
} as const;
const Container = type(containerFields);
const SafeContainer = type({
  ...containerFields,
  'securityContext?': { 'readOnlyRootFilesystem?': 'boolean', '+': 'reject' },
  'volumeDevices?': 'never',
  'resizePolicy?': 'never',
  '+': 'reject',
});
const specFields = {
  containers: Container.array().atLeastLength(1),
  'initContainers?': Container.array(),
  'volumes?': Volume.array(),
  'overhead?': { 'memory?': 'string', 'cpu?': 'string', '+': 'reject' },
  'runtimeClassName?': 'string',
  'resources?': 'unknown',
  'resourceClaims?': 'unknown',
  'ephemeralContainers?': 'unknown',
  'serviceAccountName?': 'string',
  'automountServiceAccountToken?': 'boolean',
  'unsupported?': 'boolean',
  'nodeName?': 'string',
  'nodeSelector?': type({ '[string]': 'string' }),
  'affinity?': {
    'nodeAffinity?': {
      'requiredDuringSchedulingIgnoredDuringExecution?': {
        nodeSelectorTerms: type({
          'matchExpressions?': type({
            key: 'string>0',
            operator: 'string',
            values: 'string[]',
          }).array(),
          'matchFields?': 'unknown',
        }).array(),
      },
    },
    'podAffinity?': {
      'requiredDuringSchedulingIgnoredDuringExecution?': 'unknown',
      'preferredDuringSchedulingIgnoredDuringExecution?': 'unknown',
    },
    'podAntiAffinity?': {
      'requiredDuringSchedulingIgnoredDuringExecution?': 'unknown',
      'preferredDuringSchedulingIgnoredDuringExecution?': 'unknown',
    },
  },
} as const;

/** Source-only zero-cost fields may remain in manifests; all cost-bearing shapes are explicit. */
export const WorkloadSpec = type(specFields);
// Proof: fix1-mount-propagation-enum widening admitted a malformed propagation marker.
const NativeMount = Mount.merge({
  'mountPropagation?': "'None'|'HostToContainer'|'Bidirectional'",
});
const NativeContainer = Container.merge({ 'volumeMounts?': NativeMount.array() });
/** Recognize authored mount propagation as an explicit unsupported fact, without widening cutover's closed source/observed decoders. */
export const NativeWorkloadSpec = WorkloadSpec.merge({
  containers: NativeContainer.array().atLeastLength(1),
  'initContainers?': NativeContainer.array(),
});
const SafeReference = type({
  name: 'string>0',
  'optional?': 'boolean',
  'items?': type({ key: 'string>0', path: 'string>0', 'mode?': FileMode, '+': 'reject' }).array(),
  '+': 'reject',
});
const SafeProjection = type({
  'secret?': SafeReference,
  'configMap?': SafeReference,
  'downwardAPI?': {
    items: type({
      path: 'string>0',
      'mode?': FileMode,
      'fieldRef?': { fieldPath: 'string>0', '+': 'reject' },
      'resourceFieldRef?': 'boolean',
      '+': 'reject',
    }).array(),
    '+': 'reject',
  },
  'serviceAccountToken?': {
    path: 'string>0',
    'audience?': 'string',
    'expirationSeconds?': 'number.integer>0',
    '+': 'reject',
  },
  'unsupportedKind?': 'string',
  '+': 'reject',
});
const ObservedVolume = type({
  name: 'string>0',
  'persistentVolumeClaim?': { claimName: 'string>0', 'readOnly?': 'boolean', '+': 'reject' },
  'emptyDir?': { 'sizeLimit?': 'string', 'medium?': 'string', '+': 'reject' },
  'configMap?': { name: 'string>0', '+': 'reject' },
  'secret?': { secretName: 'string>0', '+': 'reject' },
  'projected?': { sources: SafeProjection.array(), 'defaultMode?': 'number', '+': 'reject' },
  'unsupportedKind?': 'string',
  '+': 'reject',
});

/** The live projection is closed and cannot carry Env, Secret values or arbitrary provider bodies. */
export const ObservedWorkloadSpec = type({
  ...specFields,
  'resources?': 'never',
  'resourceClaims?': 'never',
  'ephemeralContainers?': 'never',
  'volumes?': ObservedVolume.array(),
  containers: SafeContainer.array().atLeastLength(1),
  'initContainers?': SafeContainer.array(),
  'nodeName?': 'never',
  'nodeSelector?': 'never',
  'affinity?': 'never',
  '+': 'reject',
});

const SourceVolume = Volume.merge({ 'downwardAPI?': 'unknown' });
/** Source-policy input keeps the full standalone body until normalization validates it; cutover decoders remain unchanged. */
export const SourceWorkloadSpec = NativeWorkloadSpec.merge({ 'volumes?': SourceVolume.array() });
// Proof: Task25c3a context-null/context-malformed faults respectively rejected valid null and admitted a supplied malformed security context.
const InventoryContainer = NativeContainer.omit('resources', 'securityContext').merge({
  'resources?': 'unknown',
  'securityContext?': type({ 'readOnlyRootFilesystem?': 'boolean' }).or('null'),
});
const InventoryVolume = SourceVolume.merge({ 'image?': 'unknown' });
/** Broad source declarations preserve absent/null resource maps; strict normalization and cutover schemas stay unchanged. */
export const InventoryWorkloadSpec = SourceWorkloadSpec.merge({
  containers: InventoryContainer.array().atLeastLength(1),
  'initContainers?': InventoryContainer.array(),
  'ephemeralContainers?': InventoryContainer.array(),
  'volumes?': InventoryVolume.array(),
});

const StandaloneDownwardAPI = type({
  items: type({
    path: 'string>0',
    // Proof: metadata-mode-entry widened this dependency to number; invalid item mode's malformed-first assertion failed.
    'mode?': FileMode,
    'fieldRef?': { fieldPath: 'string>0', 'apiVersion?': 'string', '+': 'reject' },
    'resourceFieldRef?': 'unknown',
    '+': 'reject',
  }).array(),
  // Proof: metadata-mode-default widened this dependency to number; invalid default/noninteger mode negatives failed.
  'defaultMode?': FileMode,
  // Proof: metadata-closed-body removed this boundary; unknown source field's malformed-first assertion failed.
  '+': 'reject',
});
const VolumePolicy = type({
  'standaloneDownwardAPI?': 'string[]',
  'podMemoryVolume?': 'string>0',
  '+': 'reject',
});
/** Internal source authorization names volumes, never numeric caps or runtime enforcement. */
export interface SourceVolumePolicy {
  readonly standaloneDownwardAPI?: readonly string[];
  readonly podMemoryVolume?: string;
}

type Spec = typeof SourceWorkloadSpec.infer;
interface WorkloadReaders {
  readonly memory: (quantity: string) => number;
  readonly cpu: (quantity: string) => number;
  readonly refuse: (reason: string) => never;
  /** Distinguish malformed trusted structure from supported-shape limitations; legacy callers keep the same refusal category. */
  readonly refuseMalformed?: (reason: string) => never;
}

function requireProjectionStructure(
  source: typeof Projection.infer,
  refuseMalformed: (reason: string) => never,
): void {
  const count = [
    source.secret,
    source.configMap,
    source.downwardAPI,
    source.serviceAccountToken,
  ].filter((variant) => variant !== undefined).length;
  // Proof: fix1-ordering-projection-cardinality downgrade failed the contradictory-projection negative.
  if (count > 1 || (count === 0 && !source.unsupportedKind))
    refuseMalformed('workload-volume-unsupported');
  // Proof: fix1-ordering-downward-cardinality downgrade failed missing/both selector negatives.
  if (
    source.downwardAPI?.items.some(
      (entry) =>
        [entry.fieldRef, entry.resourceFieldRef].filter((selector) => selector !== undefined)
          .length !== 1,
    )
  )
    refuseMalformed('workload-volume-unsupported');
}
function requireVolumeStructure(
  volume: typeof InventoryVolume.infer,
  refuseMalformed: (reason: string) => never,
): void {
  const count = [
    volume.persistentVolumeClaim,
    volume.emptyDir,
    volume.configMap,
    volume.secret,
    volume.projected,
    volume.ephemeral,
    volume.csi,
    volume.hostPath,
    volume.downwardAPI,
    volume.image,
  ].filter((variant) => variant !== undefined).length;
  // Proof: fix1-ordering-volume-cardinality downgrade failed supported/supported and hostPath/supported contradiction negatives.
  if (count > 1) refuseMalformed('workload-volume-unsupported');
  // Proof: fix1-ordering-missing-source downgrade failed the missing-source native negative.
  if (count === 0 && !volume.unsupportedKind) refuseMalformed('workload-volume-unsupported');
  // Proof: fix1-ordering-projection-traversal truncation hid a contradiction after an unsupported projection.
  for (const source of volume.projected?.sources ?? [])
    requireProjectionStructure(source, refuseMalformed);
}
function requireUniqueVolumes(
  volumes: readonly { readonly name: string }[],
  refuseMalformed: (reason: string) => never,
): void {
  // Proof: fix1-ordering-volume-uniqueness downgrade failed the duplicate-name native negative.
  if (new Set(volumes.map((volume) => volume.name)).size !== volumes.length)
    refuseMalformed('workload-volume-unsupported');
}
function readWorkloadMetadata(
  volume: { downwardAPI?: unknown },
  refuseMalformed: (reason: string) => never,
) {
  // Proof: metadata-decoder substituted empty items for the actual body; malformed items lost its early refusal and its assertion failed.
  const projection = StandaloneDownwardAPI(volume.downwardAPI);
  if (projection instanceof type.errors) return refuseMalformed('workload-volume-unsupported');
  // Proof: metadata-selectors skipped this shared dependency; missing/both selector malformed-first negatives failed.
  requireProjectionStructure({ downwardAPI: projection }, refuseMalformed);
  if (
    // Proof: metadata-path-safety removal hid unsafe/absolute/empty/dot/reserved/NUL paths behind unsupported recovery; all six negatives failed.
    projection.items.some(
      (entry) =>
        entry.path.includes('\0') ||
        entry.path
          .split('/')
          .some((segment) => segment === '' || segment === '.' || segment.startsWith('..')),
    ) ||
    // Proof: metadata-path-uniqueness removal hid duplicate path behind unsupported recovery; its negative failed.
    new Set(projection.items.map((entry) => entry.path)).size !== projection.items.length
  )
    refuseMalformed('workload-volume-unsupported');
  return projection;
}

/** Validate supplied structure/quantities even when absent bounds or unsupported lifecycle prevent normalization. Does not fill resource maps or derive demand. */
export function assertInventoryWorkload(
  spec: typeof InventoryWorkloadSpec.infer,
  readers: WorkloadReaders,
) {
  const refuseMalformed = readers.refuseMalformed ?? readers.refuse;
  for (const volume of spec.volumes ?? []) {
    requireVolumeStructure(volume, refuseMalformed);
    // Proof: Task25c3a volume-quantity bypass admitted negative supplied size behind unsupported management.
    if (volume.emptyDir?.sizeLimit !== undefined) readers.memory(volume.emptyDir.sizeLimit);
    // Proof: Task25c3a metadata-shape/metadata-complete bypasses hid malformed standalone bodies, both selectors and unsafe paths behind unsupported policy.
    if (volume.downwardAPI !== undefined) readWorkloadMetadata(volume, refuseMalformed);
  }
  requireUniqueVolumes(spec.volumes ?? [], refuseMalformed);
  // Proof: Task25c3a overhead-memory/overhead-quantity reader faults admitted malformed supplied memory/CPU overhead.
  if (spec.overhead?.memory !== undefined) readers.memory(spec.overhead.memory);
  if (spec.overhead?.cpu !== undefined) readers.cpu(spec.overhead.cpu);
  const containers = [
    ...spec.containers,
    ...(spec.initContainers ?? []),
    ...(spec.ephemeralContainers ?? []),
  ];
  // Proof: Task25c3a container-identity removal hid duplicate names behind unsupported policy.
  if (new Set(containers.map((container) => container.name)).size !== containers.length)
    refuseMalformed('workload-container-duplicate');
  for (const container of containers)
    for (const mount of container.volumeMounts ?? [])
      // Proof: Task25c3a mount-identity removal hid an absent mounted volume behind unsupported policy.
      if (!spec.volumes?.some((volume) => volume.name === mount.name))
        refuseMalformed('workload-mount-unknown');
}

/**
 * Normalize named resources/mounts without inferring rollout identity from images.
 * Optional source authorization validates standalone metadata and derives one Memory volume's
 * conservative Pod bound; enforcement and generated-input overhead remain unobserved.
 * Throws through reader policy for malformed or unsupported inputs. Default calls retain cutover identity.
 */
export function normalizeWorkload(
  spec: Spec,
  readers: WorkloadReaders,
  policy?: SourceVolumePolicy,
) {
  const { memory, cpu } = readers;
  function refuse(reason: string): never {
    return readers.refuse(reason);
  }
  function refuseMalformed(reason: string): never {
    // Proof: fix1-malformed-callback bypass failed the native contradictory-volume negative; legacy fallback preserves its category.
    if (readers.refuseMalformed !== undefined) return readers.refuseMalformed(reason);
    return refuse(reason);
  }
  const sourceVolumes = spec.volumes ?? [];
  // Proof: policy-shape bypass admitted numeric cap override; that production normalization negative failed.
  if (policy !== undefined && !VolumePolicy.allows(policy))
    refuseMalformed('source-volume-policy-malformed');
  const metadataNames = policy?.standaloneDownwardAPI ?? [];
  const memoryName = policy?.podMemoryVolume;
  const authorizedNames = [...metadataNames, ...(memoryName === undefined ? [] : [memoryName])];
  if (
    // Proof: policy-name-syntax removal changed wildcard metadata authorization's malformed refusal; its assertion failed.
    authorizedNames.some((name) => !/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(name)) ||
    // Proof: policy-name-uniqueness removal admitted duplicate metadata authorization; its negative failed.
    new Set(authorizedNames).size !== authorizedNames.length
  )
    refuseMalformed('source-volume-policy-malformed');
  const metadata = new Map<string, typeof StandaloneDownwardAPI.infer>();
  function readMetadata(volume: NonNullable<Spec['volumes']>[number]) {
    const projection = readWorkloadMetadata(volume, refuseMalformed);
    metadata.set(volume.name, projection);
    return projection;
  }
  // Proof: fix1-ordering-native-prepass bypass hid a later contradiction; enabling it for legacy changed the first quantity refusal.
  const checksStructureFirst = readers.refuseMalformed !== undefined;
  if (checksStructureFirst) {
    for (const volume of sourceVolumes) {
      requireVolumeStructure(volume, refuseMalformed);
      // Proof: metadata-malformed-prepass removal hid selector/mode/path faults behind unrelated unsupported; all three assertions failed.
      if (policy !== undefined && volume.downwardAPI !== undefined) readMetadata(volume);
    }
    requireUniqueVolumes(sourceVolumes, refuseMalformed);
  }
  if (
    spec.unsupported ||
    // Proof: `runtime-class` removal/broken dependency failed `fix1 source runtime class is explicitly refused` with an assertion.
    spec.runtimeClassName ||
    // Proof: `pod-resources` removal/broken dependency failed `fix1 source pod-level resources are explicitly refused` with an assertion.
    spec.resources !== undefined ||
    spec.resourceClaims !== undefined ||
    spec.ephemeralContainers !== undefined
  )
    refuse('workload-shape-unsupported');
  for (const name of metadataNames) {
    const matches = sourceVolumes.filter((volume) => volume.name === name);
    // Proof: metadata-policy-identity removal lost the named missing/wrong-kind policy refusals; both assertions failed.
    if (matches.length !== 1 || matches[0].downwardAPI === undefined)
      refuse('source-volume-policy-unsupported');
  }
  if (memoryName !== undefined) {
    const matches = sourceVolumes.filter((volume) => volume.name === memoryName);
    if (
      // Proof: memory-policy-identity removal replaced missing Memory name's modeled refusal with a property-access error; its assertion failed.
      matches.length !== 1 ||
      // Proof: memory-policy-medium removal admitted empty/Disk/absent media as Memory; all three negatives failed.
      matches[0].emptyDir?.medium !== 'Memory' ||
      // Proof: memory-policy-literal removal admitted zero/empty/invalid/positive explicit caps; all four absence negatives failed.
      Object.hasOwn(matches[0].emptyDir, 'sizeLimit') ||
      // Proof: memory-policy-single-volume removal admitted extra bounded Memory outside the derived contract; its negative failed.
      sourceVolumes.some(
        (volume) => volume.name !== memoryName && volume.emptyDir?.medium === 'Memory',
      )
    )
      refuse('source-volume-policy-unsupported');
  }
  // Proof: `generic-ephemeral` removal/broken dependency failed `fix1 generic ephemeral storage is refused rather than silently costed at zero` with an assertion.
  // Proof: `csi-volume` removal/broken dependency failed `fix1 source CSI is explicitly refused` with an assertion.
  // Proof: `missing-volume-variant` removal/broken dependency failed `fix1 source missing volume variant is explicitly refused` with an assertion.
  // Proof: `duplicate-volume` removal/broken dependency failed `fix1 source duplicate volume names are explicitly refused` with an assertion.
  // Proof: `bad-projection` removal/broken dependency failed `fix1 source malformed projection variants are explicitly refused` with an assertion.
  // Proof: `resource-field-projection` removal/broken dependency failed `fix1 source resource-field projection is explicitly refused` with an assertion.
  const volumes = sourceVolumes.map((volume) => {
    if (!checksStructureFirst) requireVolumeStructure(volume, refuseMalformed);
    if (
      volume.unsupportedKind ||
      volume.ephemeral !== undefined ||
      volume.csi !== undefined ||
      volume.hostPath !== undefined ||
      // Proof: metadata-authorization removal admitted an unselected standalone name and changed default refusal; both negatives failed.
      (volume.downwardAPI !== undefined && !metadataNames.includes(volume.name))
    )
      refuse('workload-volume-unsupported');
    if (volume.downwardAPI !== undefined) {
      const projection = metadata.get(volume.name) ?? readMetadata(volume);
      if (
        projection.items.some(
          (entry) =>
            // Proof: metadata-field-selector removal admitted metadata.name; its modeled-unsupported negative failed.
            (entry.fieldRef?.fieldPath !== 'metadata.labels' &&
              entry.fieldRef?.fieldPath !== 'metadata.annotations') ||
            // Proof: metadata-api-version removal admitted v2; its modeled-unsupported negative failed.
            (entry.fieldRef.apiVersion !== undefined && entry.fieldRef.apiVersion !== 'v1'),
        ) ||
        [...spec.containers, ...(spec.initContainers ?? [])].some((container) =>
          container.volumeMounts?.some(
            // Proof: metadata-read-only removal admitted false/absent readOnly mounts; both production negatives failed.
            (mount) => mount.name === volume.name && mount.readOnly !== true,
          ),
        )
      )
        refuse('workload-volume-unsupported');
      return {
        name: volume.name,
        kind: 'downwardAPI',
        reference: '',
        readOnly: true,
        medium: '',
        sizeMiB: 0,
        projection: JSON.stringify({
          defaultMode: projection.defaultMode ?? 420,
          items: projection.items.map((entry) => ({
            path: entry.path,
            fieldPath: entry.fieldRef?.fieldPath,
            // Proof: metadata-effective-mode replaced nullish selection with ||; explicit zero became 420 and its identity assertion failed.
            mode: entry.mode ?? projection.defaultMode ?? 420,
          })),
        }),
      };
    }
    if (volume.persistentVolumeClaim !== undefined)
      return {
        name: volume.name,
        kind: 'claim',
        reference: volume.persistentVolumeClaim.claimName,
        readOnly: volume.persistentVolumeClaim.readOnly ?? false,
        medium: '',
        sizeMiB: 0,
        projection: '',
      };
    if (volume.emptyDir !== undefined) {
      // Proof: memory-volume-authorization authorized every emptyDir; disk demand vanished and default refusal changed, failing both controls.
      if (volume.name === memoryName)
        return {
          name: volume.name,
          kind: 'emptyDir',
          reference: '',
          readOnly: false,
          medium: 'Memory',
          sizeMiB: 0,
          projection: '',
        };
      const quantity = volume.emptyDir.sizeLimit;
      if (
        quantity === undefined ||
        (volume.emptyDir.medium !== undefined && !['', 'Memory'].includes(volume.emptyDir.medium))
      )
        // Proof: `emptydir-bound` removal/broken dependency failed `source emptyDir without sizeLimit remains a concrete blocker` with an assertion.
        refuse('candidate-emptydir-unbounded');
      const sizeMiB = memory(quantity);
      // Proof: `zero-emptydir` removal/broken dependency failed `fix1 zero emptyDir size cannot become bounded zero-cost demand` with an assertion.
      if (sizeMiB <= 0) refuse('candidate-emptydir-unbounded');
      return {
        name: volume.name,
        kind: 'emptyDir',
        reference: '',
        readOnly: false,
        medium: volume.emptyDir.medium ?? '',
        sizeMiB,
        projection: '',
      };
    }
    if (volume.configMap !== undefined)
      return {
        name: volume.name,
        kind: 'configMap',
        reference: volume.configMap.name,
        readOnly: true,
        medium: '',
        sizeMiB: 0,
        projection: '',
      };
    if (volume.secret !== undefined)
      return {
        name: volume.name,
        kind: 'secret',
        reference: volume.secret.secretName,
        readOnly: true,
        medium: '',
        sizeMiB: 0,
        projection: '',
      };
    if (volume.projected !== undefined) {
      const projected = volume.projected;
      const sources = projected.sources.map((source) => {
        if (source.unsupportedKind) refuse('workload-volume-unsupported');
        if (source.downwardAPI?.items.some((entry) => entry.resourceFieldRef !== undefined))
          refuse('workload-volume-unsupported');
        const reference = (entry: typeof source.secret) =>
          entry === undefined
            ? undefined
            : {
                name: entry.name,
                optional: entry.optional ?? false,
                items: (entry.items ?? []).map((key) => ({
                  key: key.key,
                  path: key.path,
                  // Proof: `reference-mode-identity` guard/dependency mutation failed `fix2 explicit projected secret file modes remain part of workload identity` with an assertion (fix-2 receipt).
                  mode: key.mode ?? projected.defaultMode ?? 420,
                })),
              };
        return {
          secret: reference(source.secret),
          configMap: reference(source.configMap),
          downwardAPI: source.downwardAPI?.items.map((entry) => ({
            path: entry.path,
            fieldPath: entry.fieldRef?.fieldPath,
            // Proof: `downward-mode-identity` guard/dependency mutation failed `fix2 explicit projected downwardAPI file modes remain part of workload identity` with an assertion (fix-2 receipt).
            mode: entry.mode ?? projected.defaultMode ?? 420,
          })),
          serviceAccountToken:
            source.serviceAccountToken === undefined
              ? undefined
              : {
                  path: source.serviceAccountToken.path,
                  audience: source.serviceAccountToken.audience ?? '',
                  expirationSeconds: source.serviceAccountToken.expirationSeconds ?? 3600,
                },
        };
      });
      return {
        name: volume.name,
        kind: 'projected',
        reference: '',
        readOnly: true,
        medium: '',
        sizeMiB: 0,
        projection: JSON.stringify({ defaultMode: projected.defaultMode ?? 420, sources }),
      };
    }
    return refuse('workload-volume-unsupported');
  });
  if (!checksStructureFirst) requireUniqueVolumes(volumes, refuseMalformed);
  const admitted = new Set<string>();
  if (spec.automountServiceAccountToken !== false) {
    for (const volume of spec.volumes ?? []) {
      if (!/^kube-api-access-[a-z0-9]+$/.test(volume.name) || volume.projected === undefined)
        continue;
      const sources = volume.projected.sources;
      const token = sources.find(
        (source) => source.serviceAccountToken !== undefined,
      )?.serviceAccountToken;
      const ca = sources.find((source) => source.configMap !== undefined)?.configMap;
      const namespace = sources.find((source) => source.downwardAPI !== undefined)?.downwardAPI;
      const containers = [...spec.containers, ...(spec.initContainers ?? [])];
      if (
        (volume.projected.defaultMode ?? 420) === 420 &&
        sources.length === 3 &&
        token?.path === 'token' &&
        token.audience === undefined &&
        token.expirationSeconds !== undefined &&
        token.expirationSeconds <= 86400 &&
        // Proof: `sa-source` removal/broken dependency failed `fix1 altered admission projection source is not omitted` with an assertion.
        ca?.name === 'kube-root-ca.crt' &&
        ca.optional !== true &&
        ca.items?.length === 1 &&
        ca.items[0].key === 'ca.crt' &&
        ca.items[0].path === 'ca.crt' &&
        // Proof: `ca-effective-mode` guard/dependency mutation failed `fix2 source service-account ca file mode zero is not normalized away` with an assertion (fix-2 receipt).
        (ca.items[0].mode ?? volume.projected.defaultMode ?? 420) === 420 &&
        namespace?.items.length === 1 &&
        namespace.items[0].path === 'namespace' &&
        // Proof: `namespace-effective-mode` guard/dependency mutation failed `fix2 source service-account namespace file mode zero is not normalized away` with an assertion (fix-2 receipt).
        (namespace.items[0].mode ?? volume.projected.defaultMode ?? 420) === 420 &&
        namespace.items[0].fieldRef?.fieldPath === 'metadata.namespace' &&
        containers.every(
          (container) =>
            // Proof: `sa-extra-mount` removal/broken dependency failed `fix1 extra admission mount is not omitted` with an assertion.
            container.volumeMounts?.filter((mount) => mount.name === volume.name).length === 1 &&
            container.volumeMounts.some(
              (mount) =>
                mount.name === volume.name &&
                // Proof: `sa-mount` removal/broken dependency failed `fix1 altered admission mount is not omitted` with an assertion.
                mount.mountPath === '/var/run/secrets/kubernetes.io/serviceaccount' &&
                mount.readOnly === true &&
                mount.subPath === undefined &&
                mount.subPathExpr === undefined,
            ),
        )
      )
        admitted.add(volume.name);
    }
  }
  const normalizeContainer = (container: typeof NativeContainer.infer) => {
    if (
      container.unsupported ||
      (container.restartPolicy !== undefined && container.restartPolicy !== '') ||
      container.volumeDevices !== undefined ||
      container.resizePolicy !== undefined ||
      // Proof: fix1-mount-propagation-unsupported removal silently normalized an unmodeled source mount.
      container.volumeMounts?.some((mount) => mount.mountPropagation !== undefined)
    )
      // Proof: `restartable-init` removal/broken dependency failed `source restartable init accounting is refused instead of underestimated` with an assertion.
      refuse('workload-shape-unsupported');
    const requestMemory = container.resources.requests.memory;
    const limitMemory = container.resources.limits.memory;
    const requestCPU = container.resources.requests.cpu;
    const limitCPU = container.resources.limits.cpu;
    const memoryRequestMiB = memory(requestMemory);
    const memoryLimitMiB = memory(limitMemory);
    const cpuRequestMilli = cpu(requestCPU);
    const cpuLimitMilli = cpu(limitCPU);
    // Proof: `memory-limit-bound` removal/broken dependency failed `unbounded current memory limit refuses` with an assertion.
    if (memoryLimitMiB <= 0 || memoryRequestMiB > memoryLimitMiB) refuse('memory-unknown');
    // Proof: `cpu-limit-bound` removal/broken dependency failed `fix1 observed CPU limit must remain finite and cover its request` with an assertion.
    if (cpuLimitMilli <= 0 || cpuRequestMilli > cpuLimitMilli) refuse('cpu-unknown');
    const ephemeralLimit = container.resources.limits['ephemeral-storage'];
    const ephemeralRequest = container.resources.requests['ephemeral-storage'];
    if (ephemeralLimit === undefined && container.securityContext?.readOnlyRootFilesystem !== true)
      // Proof: `writable-bound` removal/broken dependency failed `unbounded writable source filesystem refuses` with an assertion.
      refuse('candidate-ephemeral-unbounded');
    const ephemeralMiB = ephemeralLimit === undefined ? 0 : memory(ephemeralLimit);
    if (
      (ephemeralLimit !== undefined && ephemeralMiB <= 0) ||
      (ephemeralRequest !== undefined && memory(ephemeralRequest) > ephemeralMiB)
    )
      // Proof: `ephemeral-positive-bound` removal/broken dependency failed `zero ephemeral limit cannot mean a bounded writable allowance` with an assertion.
      refuse('candidate-ephemeral-unbounded');
    const mounts = (container.volumeMounts ?? [])
      .filter((mount) => !admitted.has(mount.name))
      .map((mount) => {
        // Proof: `unknown-mount` removal/broken dependency failed `fix1 unknown mount reference is explicitly refused` with an assertion.
        if (!volumes.some((volume) => volume.name === mount.name)) refuse('workload-mount-unknown');
        return {
          name: mount.name,
          path: mount.mountPath,
          readOnly: mount.readOnly ?? false,
          subPath: mount.subPath ?? '',
          subPathExpr: mount.subPathExpr ?? '',
        };
      })
      .sort(
        (left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path),
      );
    return {
      // Proof: `container-identity` removal/broken dependency failed `fix1 named container identity must match source` with an assertion.
      name: container.name,
      image: container.image,
      memoryRequestMiB,
      memoryLimitMiB,
      cpuRequestMilli,
      cpuLimitMilli,
      ephemeralMiB,
      readOnlyRoot: container.securityContext?.readOnlyRootFilesystem ?? false,
      // Proof: `claim-mount-identity` removal/broken dependency failed `fix1 old claim mount cannot certify the source claim even when both claims exist` with an assertion.
      mounts,
    };
  };
  const containers = spec.containers
    .map(normalizeContainer)
    .sort((left, right) => left.name.localeCompare(right.name));
  // Proof: `init-identity` removal/broken dependency failed `fix1 named init resources must match source` with an assertion.
  const initContainers = (spec.initContainers ?? []).map(normalizeContainer);
  if (
    new Set([...containers, ...initContainers].map((container) => container.name)).size !==
    containers.length + initContainers.length
  )
    // Proof: `container-duplicate` removal/broken dependency failed `fix1 duplicate named containers are explicitly refused` with an assertion.
    refuse('workload-container-duplicate');
  const retainedVolumes = volumes
    .filter((volume) => !admitted.has(volume.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const memoryEmptyDirMiB = retainedVolumes
    .filter((volume) => volume.kind === 'emptyDir' && volume.medium === 'Memory')
    .reduce((sum, volume) => sum + volume.sizeMiB, 0);
  const diskEmptyDirMiB = retainedVolumes
    .filter((volume) => volume.kind === 'emptyDir' && volume.medium !== 'Memory')
    .reduce((sum, volume) => sum + volume.sizeMiB, 0);
  const overheadMemoryMiB = spec.overhead?.memory === undefined ? 0 : memory(spec.overhead.memory);
  const overheadCPUMilli = spec.overhead?.cpu === undefined ? 0 : cpu(spec.overhead.cpu);
  const memoryMiB =
    Math.max(
      containers.reduce((sum, container) => sum + container.memoryLimitMiB, 0),
      ...initContainers.map((container) => container.memoryLimitMiB),
      memoryEmptyDirMiB,
      0,
      // Proof: `memory-overhead` removal/broken dependency failed `fix1 explicit source overhead cannot vanish from declared resource cost` with an assertion.
    ) + overheadMemoryMiB;
  if (memoryName !== undefined) {
    for (const volume of retainedVolumes) {
      // Proof: memory-deferred-bound added overhead again here; derives P once observed 220 instead of 210 and failed.
      if (volume.name === memoryName) volume.sizeMiB = memoryMiB;
    }
  }
  const cpuMilli =
    Math.max(
      containers.reduce((sum, container) => sum + container.cpuRequestMilli, 0),
      ...initContainers.map((container) => container.cpuRequestMilli),
      0,
      // Proof: `cpu-overhead` removal/broken dependency failed `fix1 source CPU overhead cannot vanish independently of memory` with an assertion.
    ) + overheadCPUMilli;
  const ephemeralMiB = Math.max(
    containers.reduce((sum, container) => sum + container.ephemeralMiB, 0),
    ...initContainers.map((container) => container.ephemeralMiB),
    diskEmptyDirMiB,
    0,
  );
  return {
    // Proof: source-evidence-absence added an undefined evidence key for default calls; strict default-output identity failed.
    ...(memoryName === undefined
      ? {}
      : {
          sourceMemoryVolume: {
            name: memoryName,
            basis: 'pod-memory-limit' as const,
            upperBoundMiB: memoryMiB,
            literalSizeLimit: 'absent' as const,
            // Proof: source-evidence-state relabeled enforcement observed; derives P once's source-evidence assertion failed.
            enforcement: 'unobserved' as const,
          },
        }),
    // Proof: `sa-identity` removal/broken dependency failed `fix1 service-account identity cannot be normalized into the source account` with an assertion.
    serviceAccountName: spec.serviceAccountName ?? 'default',
    automountServiceAccountToken: spec.automountServiceAccountToken ?? true,
    containers,
    initContainers,
    volumes: retainedVolumes,
    overheadMemoryMiB,
    overheadCPUMilli,
    memoryMiB,
    cpuMilli,
    ephemeralMiB,
  };
}

export type WorkloadModel = ReturnType<typeof normalizeWorkload>;
