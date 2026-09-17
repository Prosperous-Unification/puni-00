import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { type } from 'arktype';

import { type DiscoverySource, type FleetObservation, serializeObservation } from './observation';

// Proof: replacing this checksum expression with an accepting expression made
// the invalid-checksum production-reader negative fail on 2026-09-17.
const sha256 = /^[0-9a-f]{64}$/;
const digest = /^sha256:[0-9a-f]{64}$/;
// Proof: replacing this exact-version expression with /.+/ made the release
// channel production-reader negative fail on 2026-09-17.
const exactVersion = /^v?\d+\.\d+\.\d+(?:[+-][0-9A-Za-z.-]+)?$/;
const pythonPackageVersion = /^\d+\.\d+(?:\.\d+)?(?:\.post\d+)?$/;

const BinaryLock = type({
  version: exactVersion,
  url: 'string.url',
  sha256,
  // Proof: widening these literals to Darwin/arm64 made the unsupported
  // platform production-reader negative fail on 2026-09-17.
  os: "'linux'",
  arch: "'amd64'",
  '+': 'reject',
});

const TerraformBinaryLock = type({
  version: exactVersion,
  url: 'string.url',
  sha256,
  executableSha256: sha256,
  os: "'linux'",
  arch: "'amd64'",
  '+': 'reject',
});

const ImageLock = type({ role: 'string>0', name: 'string>0', digest, '+': 'reject' });

const ChartLock = type({
  version: exactVersion,
  url: 'string.url',
  sha256,
  images: ImageLock.array().atLeastLength(1),
  disabledComponents: 'string[]',
  '+': 'reject',
});

const ToolchainSchema = type({
  schemaVersion: '1',
  supportedHosts: type({
    distribution: "'ubuntu'",
    version: "'24.04'",
    arch: "'amd64'",
    '+': 'reject',
  })
    .array()
    .atLeastLength(1),
  binaries: {
    terraform: TerraformBinaryLock,
    // Proof: making this optional made the absent-Terragrunt production-reader negative fail.
    terragrunt: BinaryLock,
    // Proof: making k3s optional made the missing-lock production-reader
    // negative fail on 2026-09-17.
    k3s: BinaryLock,
    k3d: BinaryLock,
    flux: BinaryLock,
    kubectl: BinaryLock,
    helm: BinaryLock,
    multipass: BinaryLock,
    '+': 'reject',
  },
  terraform: {
    hcloudProvider: {
      version: exactVersion,
      source: "'registry.terraform.io/hetznercloud/hcloud'",
      url: 'string.url',
      sha256,
      os: "'linux'",
      arch: "'amd64'",
      '+': 'reject',
    },
    '+': 'reject',
  },
  runtimeImages: { k3dNode: ImageLock, '+': 'reject' },
  controller: {
    image: 'string>0',
    digest,
    python: exactVersion,
    // Proof: making this dependency closure optional made the missing-Python-packages
    // production-reader negative fail on 2026-09-17.
    pythonPackages: {
      certifi: pythonPackageVersion,
      charsetNormalizer: pythonPackageVersion,
      idna: pythonPackageVersion,
      pythonDateutil: pythonPackageVersion,
      requests: pythonPackageVersion,
      six: pythonPackageVersion,
      urllib3: pythonPackageVersion,
      '+': 'reject',
    },
    ansibleCore: exactVersion,
    collections: {
      communityGeneral: exactVersion,
      hetznerHcloud: exactVersion,
      kubernetesCore: exactVersion,
      '+': 'reject',
    },
    '+': 'reject',
  },
  charts: {
    hcloudCcm: ChartLock,
    hcloudCsi: ChartLock,
    traefik: ChartLock,
    certManager: ChartLock,
    eckOperator: ChartLock,
    elasticsearch: ChartLock,
    kibana: ChartLock,
    kubePrometheusStack: ChartLock,
    opentelemetryCollector: ChartLock,
    velero: ChartLock,
    '+': 'reject',
  },
  // Proof: removing this root exactness guard made the unknown-key
  // production-reader negative fail on 2026-09-17.
  '+': 'reject',
});

export type Toolchain = typeof ToolchainSchema.infer;

function parseToolchain(input: unknown): Toolchain {
  const toolchain = ToolchainSchema(input);
  if (toolchain instanceof type.errors) {
    throw new Error(`Toolchain validation failed: ${toolchain.summary}`, { cause: toolchain });
  }
  return toolchain;
}

const requiredImageRoles = {
  hcloudCcm: ['controller'],
  hcloudCsi: [
    'controller',
    'csiAttacher',
    'csiNodeDriverRegistrar',
    'csiProvisioner',
    'csiResizer',
    'livenessProbe',
  ],
  traefik: ['controller'],
  certManager: ['acmeSolver', 'caInjector', 'controller', 'startupApiCheck', 'webhook'],
  eckOperator: ['operator'],
  elasticsearch: ['node'],
  kibana: ['node'],
  kubePrometheusStack: [
    'admissionWebhook',
    'admissionWebhookCertgen',
    'alertmanager',
    'configReloader',
    'kubeStateMetrics',
    'nodeExporter',
    'operator',
    'prometheus',
  ],
  opentelemetryCollector: ['collector'],
  velero: ['server'],
} as const satisfies Record<keyof Toolchain['charts'], readonly string[]>;

function assertCompleteImageLocks(toolchain: Toolchain): void {
  const chartNames = [
    'hcloudCcm',
    'hcloudCsi',
    'traefik',
    'certManager',
    'eckOperator',
    'elasticsearch',
    'kibana',
    'kubePrometheusStack',
    'opentelemetryCollector',
    'velero',
  ] as const satisfies readonly (keyof Toolchain['charts'])[];
  for (const chartName of chartNames) {
    const chart = toolchain.charts[chartName];
    const expectedRoles = [...requiredImageRoles[chartName]].sort();
    const actualRoles = chart.images.map(({ role }) => role).sort();
    if (
      actualRoles.length !== expectedRoles.length ||
      actualRoles.some((role, position) => role !== expectedRoles[position])
    ) {
      // Proof: replacing this element comparison with newline joins let one
      // role hide a missing role; the production reader negative failed on
      // 2026-09-17.
      throw new Error(`${chartName} image roles must be exactly: ${expectedRoles.join(', ')}`);
    }
  }
}

/**
 * Read the complete immutable fleet toolchain lock.
 *
 * Missing, unreadable, malformed, incomplete, extended, inexact, or
 * unsupported-platform input throws. The caller may use the returned value
 * without release-channel or architecture fallback.
 */
export async function readToolchain(path: string): Promise<Toolchain> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    // Proof: reading without this contextual guard made the absent/unreadable
    // production-reader negative fail on 2026-09-17.
    throw new Error(`Cannot read required toolchain at ${path}`, { cause });
  }

  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch (cause) {
    // Proof: parsing without this contextual guard made the malformed-state
    // production-reader negative fail on 2026-09-17.
    throw new Error(`Required toolchain at ${path} is not valid JSON`, { cause });
  }

  // Proof: accepting unknown keys or a missing k3s lock made their production
  // reader negatives fail on 2026-09-17; exact parsing restored both failures.
  const toolchain = parseToolchain(input);
  assertCompleteImageLocks(toolchain);
  return toolchain;
}

// Proof: widening this union to nonempty string made the unknown-capability production decoder
// negative fail by accepting `database`.
const CapabilitySchema = type(
  "'control-plane' | 'product' | 'ingress' | 'observability' | 'forge' | 'execution'",
);
const fleetCapabilities = [
  'control-plane',
  'product',
  'ingress',
  'observability',
  'forge',
  'execution',
] as const;
const LifecycleSchema = type("'present' | 'draining' | 'retired'");
const RequiredCapabilitiesSchema = type({
  'control-plane?': 'number.integer>=1',
  'product?': 'number.integer>=1',
  'ingress?': 'number.integer>=1',
  'observability?': 'number.integer>=1',
  'forge?': 'number.integer>=1',
  'execution?': 'number.integer>=1',
  '+': 'reject',
});
const HcloudProviderSchema = type({
  kind: "'hcloud'",
  // Proof: making this identity optional made the absent-instance production decoder negative pass
  // and construct `hcloud:undefined`; restored schema owns the provider boundary.
  instanceId: 'string>0',
  '+': 'reject',
});
const SshProviderSchema = type({
  kind: "'ssh'",
  machineId: 'string>0',
  address: 'string>0',
  '+': 'reject',
});
const FleetNodeSchema = type({
  id: 'string>0',
  cluster: 'string>0',
  capabilities: CapabilitySchema.array().atLeastLength(1),
  lifecycle: LifecycleSchema,
  provider: HcloudProviderSchema.or(SshProviderSchema),
  '+': 'reject',
});
const ClusterSchema = type({
  id: 'string>0',
  purpose: "'platform' | 'workers'",
  apiEndpoint: 'string.url',
  controlPlane: "'single' | 'ha'",
  // Proof: making bootstrap optional made a missing intent reach topology handling without saying
  // whether an unavailable Kubernetes API could mean the cluster does not exist yet.
  bootstrap: "'required' | 'complete'",
  // Proof: making this policy optional changed the missing-policy production decoder negative to a
  // later untyped access; restored schema refuses the absent policy at the input boundary.
  requiredCapabilities: RequiredCapabilitiesSchema,
  '+': 'reject',
});
const FleetSchema = type({
  schemaVersion: '1',
  revision: 'string>0',
  clusters: ClusterSchema.array().atLeastLength(1),
  nodes: FleetNodeSchema.array(),
  '+': 'reject',
});

export type Capability = typeof CapabilitySchema.infer;
export type Lifecycle = typeof LifecycleSchema.infer;
export type FleetNode = typeof FleetNodeSchema.infer;
export type Cluster = typeof ClusterSchema.infer;
export type Fleet = typeof FleetSchema.infer;

/** Decode one exact desired membership record before an operation can consume it. */
export function decodeFleetNode(input: unknown): FleetNode {
  const node = FleetNodeSchema(input);
  if (node instanceof type.errors) {
    throw new Error(`Fleet node validation failed: ${node.summary}`, { cause: node });
  }
  return node;
}

export interface Observation {
  readonly schemaVersion: 1;
  readonly observedAt: string;
  readonly digest: string;
  readonly complete: boolean;
}

const IsoInstantSchema = type(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).narrow(
  (value, context) => {
    const milliseconds = Date.parse(value);
    return !Number.isNaN(milliseconds) && new Date(milliseconds).toISOString() === value
      ? true
      : context.mustBe('a real UTC calendar instant');
  },
);

const ObservationSchema = type({
  schemaVersion: '1',
  // Proof: removing the calendar narrow made `2026-99-99T99:99:99.000Z` pass the production
  // observation decoder and become part of a signed plan; restored validation rejects it.
  observedAt: IsoInstantSchema,
  // Proof: widening this to string made the invalid-digest production decoder negative fail.
  digest: sha256,
  complete: 'boolean',
  // Proof: accepting undeclared keys made the candidate-hint production decoder negative fail.
  '+': 'reject',
});

const DiscoverySourceSchema = type(
  /^(?:provider|kubernetes-nodes|kubernetes-pvcs|kubernetes-pvs|kubernetes-volumeattachments):[^/\s]+$|^ssh-facts:[^/\s]+\/[^/\s]+$/,
);
const ObservedNodeStateSchema = type(
  "'enrolled' | 'discovered-unenrolled' | 'missing' | 'ready' | 'not-ready' | 'retiring'",
);
const ObservationSourceSchema = type({
  name: DiscoverySourceSchema,
  observedAt: IsoInstantSchema,
  '+': 'reject',
});
const ObservedClusterSchema = type({
  id: 'string>0',
  state: "'ready' | 'not-bootstrapped'",
  '+': 'reject',
});
const ObservedNodeSchema = type({
  clusterId: 'string>0',
  'desiredNodeId?': 'string>0',
  displayName: 'string>0',
  providerIdentity: 'string>0',
  identitySource: DiscoverySourceSchema,
  'privateAddress?': 'string>0',
  'machineId?': 'string>0',
  'kubernetesNodeUid?': 'string>0',
  'kubernetesProviderId?': 'string>0',
  capabilities: CapabilitySchema.array(),
  capabilitiesObserved: 'boolean',
  states: ObservedNodeStateSchema.array().atLeastLength(1),
  storageAttachments: 'string[]',
  '+': 'reject',
});
const DetailedObservationSchema = type({
  schemaVersion: '1',
  desiredRevision: 'string>0',
  observedAt: IsoInstantSchema,
  digest: sha256,
  complete: 'true',
  sources: ObservationSourceSchema.array().atLeastLength(1),
  clusters: ObservedClusterSchema.array().atLeastLength(1),
  storage: type({
    clusterId: 'string>0',
    claims: 'string[]',
    volumes: 'string[]',
    attachments: 'string[]',
    '+': 'reject',
  }).array(),
  nodes: ObservedNodeSchema.array(),
  '+': 'reject',
});

function isUnknownRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

/** Decode the observation identity needed to bind an operation plan. */
export function decodeObservation(input: unknown): Observation {
  let identityInput = input;
  if (isUnknownRecord(input) && 'desiredRevision' in input) {
    const detailed = DetailedObservationSchema(input);
    if (detailed instanceof type.errors) {
      // Proof: bypassing this schema made recomputed observations containing null sources,
      // numeric clusters, and arbitrary node objects pass the production decoder.
      throw new Error(`Observation validation failed: ${detailed.summary}`, { cause: detailed });
    }
    // Proof: disabling these uniqueness checks made recomputed detailed observations with duplicate
    // sources, clusters, provider identities, states, capabilities, and attachments pass decoding.
    const unique = (values: readonly string[], label: string): void => {
      if (new Set(values).size !== values.length) {
        throw new Error(`Observation validation failed: duplicate ${label}`);
      }
    };
    unique(
      detailed.sources.map(({ name }) => name),
      'source',
    );
    unique(
      detailed.clusters.map(({ id }) => id),
      'cluster',
    );
    unique(
      detailed.nodes.map(({ providerIdentity }) => providerIdentity),
      'provider identity',
    );
    unique(
      detailed.nodes.flatMap(({ desiredNodeId }) =>
        desiredNodeId === undefined ? [] : [desiredNodeId],
      ),
      'desired node identity',
    );
    unique(
      detailed.nodes.flatMap(({ kubernetesNodeUid }) =>
        kubernetesNodeUid === undefined ? [] : [kubernetesNodeUid],
      ),
      'Kubernetes node UID',
    );
    unique(
      detailed.storage.map(({ clusterId }) => clusterId),
      'storage cluster',
    );
    const clusterIds = new Set(detailed.clusters.map(({ id }) => id));
    const sourceNames = new Set(detailed.sources.map(({ name }) => name));
    for (const source of detailed.sources) {
      const clusterId = source.name.slice(source.name.indexOf(':') + 1).split('/')[0];
      if (!clusterIds.has(clusterId)) {
        // Proof: accepting an unknown source cluster let recomputed external evidence escape the
        // observed cluster set in the production decoder negative.
        throw new Error(
          `Observation validation failed: source references unknown cluster ${clusterId}`,
        );
      }
    }
    for (const cluster of detailed.clusters) {
      const requiredSources =
        cluster.state === 'not-bootstrapped'
          ? [`provider:${cluster.id}`]
          : [
              `provider:${cluster.id}`,
              `kubernetes-nodes:${cluster.id}`,
              `kubernetes-pvcs:${cluster.id}`,
              `kubernetes-pvs:${cluster.id}`,
              `kubernetes-volumeattachments:${cluster.id}`,
            ];
      if (requiredSources.some((source) => !sourceNames.has(source))) {
        // Proof: omitting one required source let a recomputed partial detailed observation claim
        // completeness until the production decoder negative restored this source closure.
        throw new Error(`Observation validation failed: incomplete sources for ${cluster.id}`);
      }
      if (!detailed.storage.some(({ clusterId }) => clusterId === cluster.id)) {
        // Proof: omitting storage closure let a recomputed detailed observation claim completeness
        // without any PVC/PV/attachment evidence for its ready cluster.
        throw new Error(`Observation validation failed: missing storage state for ${cluster.id}`);
      }
    }
    for (const storage of detailed.storage) {
      if (!clusterIds.has(storage.clusterId)) {
        // Proof: accepting unknown storage clusters detached evidence from the observed fleet.
        throw new Error(
          `Observation validation failed: storage references unknown cluster ${storage.clusterId}`,
        );
      }
      unique(storage.claims, `claim for ${storage.clusterId}`);
      unique(storage.volumes, `volume for ${storage.clusterId}`);
      unique(storage.attachments, `attachment for ${storage.clusterId}`);
    }
    for (const node of detailed.nodes) {
      if (!clusterIds.has(node.clusterId)) {
        // Proof: accepting an unknown cluster let a recomputed node escape the observed cluster set.
        throw new Error(
          `Observation validation failed: node references unknown cluster ${node.clusterId}`,
        );
      }
      unique(node.states, `state for ${node.providerIdentity}`);
      unique(node.capabilities, `capability for ${node.providerIdentity}`);
      unique(node.storageAttachments, `storage attachment for ${node.providerIdentity}`);
      if (!sourceNames.has(node.identitySource)) {
        // Proof: accepting an unrecorded identity source let a recomputed replacement SSH node
        // claim machine evidence that no discovery command supplied.
        throw new Error(
          `Observation validation failed: ${node.providerIdentity} identity source is absent`,
        );
      }
      const identitySourceCluster = node.identitySource
        .slice(node.identitySource.indexOf(':') + 1)
        .split('/')[0];
      if (identitySourceCluster !== node.clusterId) {
        // Proof: accepting a cross-cluster identity source let one cluster lend machine evidence to
        // a recomputed node in another cluster.
        throw new Error(
          `Observation validation failed: ${node.providerIdentity} identity source belongs to ${identitySourceCluster}`,
        );
      }
      const enrolled = node.states.includes('enrolled');
      if (
        (enrolled || node.states.includes('ready') || node.states.includes('not-ready')) &&
        node.kubernetesNodeUid === undefined
      ) {
        // Proof: accepting enrollment/readiness without a Kubernetes UID let a recomputed SSH
        // observation claim complete provenance without Kubernetes identity evidence.
        throw new Error(
          `Observation validation failed: ${node.providerIdentity} enrollment lacks Kubernetes UID`,
        );
      }
      if (node.machineId !== undefined && !node.identitySource.startsWith('ssh-facts:')) {
        // Proof: accepting controlled SSH machine facts attributed to Kubernetes let a recomputed
        // provider observation bypass its exact playbook source.
        throw new Error(
          `Observation validation failed: ${node.providerIdentity} machine fact lacks SSH source`,
        );
      }
    }
    const { digest: claimedDigest, ...body } = detailed;
    const actualDigest = createHash('sha256').update(serializeObservation(body)).digest('hex');
    if (claimedDigest !== actualDigest) {
      // Proof: disabling this comparison made a changed node identity with the old digest pass the
      // production observation decoder and authorize planning from unbound detail.
      throw new Error('Observation validation failed: detailed observation digest differs');
    }
    identityInput = {
      schemaVersion: detailed.schemaVersion,
      observedAt: detailed.observedAt,
      digest: detailed.digest,
      complete: detailed.complete,
    };
  }
  const decoded = ObservationSchema(identityInput);
  if (decoded instanceof type.errors) {
    throw new Error(`Observation validation failed: ${decoded.summary}`, { cause: decoded });
  }
  return decoded;
}

/** Decode the complete observed topology required by lifecycle planning. */
export function decodeFleetObservation(input: unknown): FleetObservation {
  decodeObservation(input);
  const detailed = DetailedObservationSchema(input);
  if (detailed instanceof type.errors) {
    throw new Error(`Detailed fleet observation is required: ${detailed.summary}`, {
      cause: detailed,
    });
  }
  const discoverySource = (name: string): DiscoverySource => {
    for (const prefix of [
      'provider:',
      'kubernetes-nodes:',
      'kubernetes-pvcs:',
      'kubernetes-pvs:',
      'kubernetes-volumeattachments:',
      'ssh-facts:',
    ] as const) {
      if (name.startsWith(prefix)) return `${prefix}${name.slice(prefix.length)}`;
    }
    throw new Error(`Detailed fleet observation has unknown source ${name}`);
  };
  return {
    ...detailed,
    sources: detailed.sources.map((source) => ({
      ...source,
      name: discoverySource(source.name),
    })),
    nodes: detailed.nodes.map((node) => ({
      ...node,
      identitySource: discoverySource(node.identitySource),
    })),
  };
}

function identifyProvider(node: FleetNode): string {
  return node.provider.kind === 'hcloud'
    ? `hcloud:${node.provider.instanceId}`
    : `ssh:${node.provider.machineId}`;
}

/**
 * Decode desired fleet state and enforce identities and placement rules that
 * cannot be expressed as independent object fields.
 *
 * Duplicate logical/provider identities, unknown cluster references, invalid
 * server topology, and cross-cluster capability placement throw.
 */
export function decodeFleet(input: unknown): Fleet {
  const decoded = FleetSchema(input);
  if (decoded instanceof type.errors) {
    throw new Error(`Fleet validation failed: ${decoded.summary}`, { cause: decoded });
  }

  const clusters = new Map<string, Cluster>();
  for (const cluster of decoded.clusters) {
    // Proof: disabling this guard made the duplicate-cluster production decoder negative pass and
    // let the later declaration silently replace the first cluster policy.
    if (clusters.has(cluster.id)) throw new Error(`Duplicate cluster id: ${cluster.id}`);
    if (cluster.purpose === 'platform' && cluster.requiredCapabilities.execution !== undefined) {
      // Proof: disabling this guard made the wrong-purpose policy production decoder negative pass.
      throw new Error(`Platform cluster ${cluster.id} cannot require execution capability`);
    }
    if (
      cluster.purpose === 'workers' &&
      (cluster.requiredCapabilities.product !== undefined ||
        cluster.requiredCapabilities.ingress !== undefined ||
        cluster.requiredCapabilities.observability !== undefined ||
        cluster.requiredCapabilities.forge !== undefined)
    ) {
      // Proof: disabling this guard made the workers-platform-policy production decoder negative
      // pass and allowed a worker cluster to claim platform capacity.
      throw new Error(`Workers cluster ${cluster.id} cannot require platform capabilities`);
    }
    clusters.set(cluster.id, cluster);
  }

  const nodes = new Map<string, FleetNode>();
  const providers = new Map<string, string>();
  for (const node of decoded.nodes) {
    if (nodes.has(node.id)) {
      // Proof: accepting a repeated logical id made the duplicate-node production decoder
      // negative fail; restored uniqueness prevents one desired node hiding another.
      throw new Error(`Duplicate node id: ${node.id}`);
    }
    nodes.set(node.id, node);
    const cluster = clusters.get(node.cluster);
    // Proof: disabling this guard made the unknown-cluster production decoder negative advance to
    // an uncontextualized property failure instead of refusing the invalid desired identity.
    if (cluster === undefined)
      throw new Error(`Node ${node.id} names unknown cluster ${node.cluster}`);
    if (new Set(node.capabilities).size !== node.capabilities.length) {
      // Proof: disabling this guard made the duplicate-capability production decoder negative pass.
      throw new Error(`Node ${node.id} has a duplicate capability`);
    }
    const identity = identifyProvider(node);
    const owner = providers.get(identity);
    if (owner !== undefined) {
      // Proof: reusing one cloud identity across clusters made the cross-cluster duplicate
      // production decoder negative fail; restored ownership names both logical nodes.
      throw new Error(`Duplicate provider identity ${identity}: ${owner} and ${node.id}`);
    }
    providers.set(identity, node.id);
    if (node.capabilities.includes('execution') && cluster.purpose !== 'workers') {
      // Proof: allowing execution on the platform cluster made the placement negative fail.
      throw new Error(`Execution capability for ${node.id} must belong to workers`);
    }
    if (
      cluster.purpose === 'workers' &&
      node.capabilities.includes('control-plane') &&
      node.capabilities.includes('execution')
    ) {
      // Proof: disabling this guard made the dedicated-server production decoder negative pass and
      // let one server plus one real agent satisfy an execution floor of two.
      throw new Error(`Worker node ${node.id} cannot combine control-plane and execution`);
    }
    if (
      cluster.purpose === 'workers' &&
      node.capabilities.some((capability) =>
        ['product', 'ingress', 'observability', 'forge'].includes(capability),
      )
    ) {
      // Proof: disabling this guard made the workers-node placement production decoder negative
      // pass with a product capability assigned to the execution cluster.
      throw new Error(`Platform capability for ${node.id} must belong to platform`);
    }
  }

  for (const cluster of decoded.clusters) {
    const serverCount = decoded.nodes.filter(
      (node) =>
        node.cluster === cluster.id &&
        node.lifecycle !== 'retired' &&
        node.capabilities.includes('control-plane'),
    ).length;
    const validTopology = cluster.controlPlane === 'single' ? serverCount === 1 : serverCount >= 3;
    // Proof: removing the bootstrap exemption made the explicit empty-bootstrap production
    // observation negative fail before provider inspection with a zero-server topology error.
    const clusterNodeCount = decoded.nodes.filter(
      (node) => node.cluster === cluster.id && node.lifecycle !== 'retired',
    ).length;
    if ((cluster.bootstrap === 'complete' || clusterNodeCount > 0) && !validTopology) {
      // Proof: disabling this guard made the zero-server production decoder negative pass.
      throw new Error(
        `${cluster.id} ${cluster.controlPlane} control plane has ${String(serverCount)} servers`,
      );
    }
    for (const capability of fleetCapabilities) {
      const floor = cluster.requiredCapabilities[capability];
      if (floor === undefined) continue;
      const actual = decoded.nodes.filter(
        (node) =>
          node.cluster === cluster.id &&
          node.lifecycle !== 'retired' &&
          node.capabilities.includes(capability),
      ).length;
      // Proof: removing the bootstrap exemption made the explicit empty-bootstrap production
      // observation negative fail on the future capability floor before discovery.
      if ((cluster.bootstrap === 'complete' || clusterNodeCount > 0) && actual < floor) {
        // Proof: disabling this guard made the retired-last-capability production decoder negative
        // pass even though desired state could not satisfy its explicit floor.
        throw new Error(
          `${cluster.id} capability ${capability} requires ${String(floor)} but provides ${String(actual)}`,
        );
      }
    }
  }
  return decoded;
}
