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
const Projection = type({
  'secret?': {
    name: 'string>0',
    'items?': type({ key: 'string>0', path: 'string>0' }).array(),
    'optional?': 'boolean',
  },
  'configMap?': {
    name: 'string>0',
    'items?': type({ key: 'string>0', path: 'string>0' }).array(),
    'optional?': 'boolean',
  },
  'downwardAPI?': {
    items: type({
      path: 'string>0',
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
const SafeReference = type({
  name: 'string>0',
  'optional?': 'boolean',
  'items?': type({ key: 'string>0', path: 'string>0', '+': 'reject' }).array(),
  '+': 'reject',
});
const SafeProjection = type({
  'secret?': SafeReference,
  'configMap?': SafeReference,
  'downwardAPI?': {
    items: type({
      path: 'string>0',
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

type Spec = typeof WorkloadSpec.infer;
interface WorkloadReaders {
  readonly memory: (quantity: string) => number;
  readonly cpu: (quantity: string) => number;
  readonly refuse: (reason: string) => never;
}

/** Normalize the same named resource/mount model for source and observed replicas; never infer rollout identity from images alone. */
export function normalizeWorkload(spec: Spec, readers: WorkloadReaders) {
  const { memory, cpu } = readers;
  function refuse(reason: string): never {
    return readers.refuse(reason);
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
  // Proof: `generic-ephemeral` removal/broken dependency failed `fix1 generic ephemeral storage is refused rather than silently costed at zero` with an assertion.
  // Proof: `csi-volume` removal/broken dependency failed `fix1 source CSI is explicitly refused` with an assertion.
  // Proof: `missing-volume-variant` removal/broken dependency failed `fix1 source missing volume variant is explicitly refused` with an assertion.
  // Proof: `duplicate-volume` removal/broken dependency failed `fix1 source duplicate volume names are explicitly refused` with an assertion.
  // Proof: `bad-projection` removal/broken dependency failed `fix1 source malformed projection variants are explicitly refused` with an assertion.
  // Proof: `resource-field-projection` removal/broken dependency failed `fix1 source resource-field projection is explicitly refused` with an assertion.
  const volumes = (spec.volumes ?? []).map((volume) => {
    if (
      volume.unsupportedKind ||
      volume.ephemeral !== undefined ||
      volume.csi !== undefined ||
      volume.hostPath !== undefined ||
      volume.downwardAPI !== undefined
    )
      refuse('workload-volume-unsupported');
    const variants = [
      volume.persistentVolumeClaim,
      volume.emptyDir,
      volume.configMap,
      volume.secret,
      volume.projected,
    ].filter((variant) => variant !== undefined);
    // Proof: `multiple-volume-variants` removal/broken dependency failed `fix1 source multiple volume variants are explicitly refused` with an assertion.
    if (variants.length > 1) refuse('workload-volume-unsupported');
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
        if (
          source.unsupportedKind ||
          [source.secret, source.configMap, source.downwardAPI, source.serviceAccountToken].filter(
            (variant) => variant !== undefined,
          ).length !== 1
        )
          refuse('workload-volume-unsupported');
        if (
          source.downwardAPI?.items.some(
            (entry) => entry.resourceFieldRef !== undefined || entry.fieldRef === undefined,
          )
        )
          refuse('workload-volume-unsupported');
        const reference = (entry: typeof source.secret) =>
          entry === undefined
            ? undefined
            : {
                name: entry.name,
                optional: entry.optional ?? false,
                items: (entry.items ?? []).map((key) => ({ key: key.key, path: key.path })),
              };
        return {
          secret: reference(source.secret),
          configMap: reference(source.configMap),
          downwardAPI: source.downwardAPI?.items.map((entry) => ({
            path: entry.path,
            fieldPath: entry.fieldRef?.fieldPath,
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
  if (new Set(volumes.map((volume) => volume.name)).size !== volumes.length)
    refuse('workload-volume-unsupported');
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
        namespace?.items.length === 1 &&
        namespace.items[0].path === 'namespace' &&
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
  const normalizeContainer = (container: typeof Container.infer) => {
    if (
      container.unsupported ||
      (container.restartPolicy !== undefined && container.restartPolicy !== '') ||
      container.volumeDevices !== undefined ||
      container.resizePolicy !== undefined
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
