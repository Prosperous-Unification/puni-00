import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parseDocument } from 'yaml';

import { assertCandidatePodResources } from './observability-pod-resources';
import type { ObservabilityRenderRelease } from './observability-render';
import type { ObservabilitySource } from './observability-source';
import type { ObservabilitySourceIndex } from './observability-source-render';
import { assertVeleroCandidate } from './platform-releases';

// Proof: accepting zero made all six Kibana init request/limit negatives fail because source validation accepted them.
const Quantity = type('string | number').narrow(
  (quantity) =>
    /^(\d+(?:\.\d+)?)(m|Ki|Mi|Gi)?$/.test(String(quantity)) &&
    Number.isFinite(Number.parseFloat(String(quantity))) &&
    Number.parseFloat(String(quantity)) > 0,
);
const Bounds = type({
  cpu: Quantity,
  memory: Quantity,
  'ephemeral-storage': Quantity,
  '+': 'reject',
});
const Resources = type({ requests: Bounds, limits: Bounds, '+': 'reject' });
const Containers = type({ name: 'string', resources: Resources }).array();
const Volumes = type({ name: 'string', 'emptyDir?': { sizeLimit: Quantity } }).array();
/** Named source overrides follow the supported provider sequence; conditional realization remains an adapter prerequisite. */
export interface SelectedRole {
  readonly owner: string;
  readonly identity: string;
  readonly kind: 'Elasticsearch' | 'Kibana' | 'Prometheus' | 'Alertmanager';
  readonly namespace: string;
  readonly manifest: Record<string, unknown>;
  readonly pod: unknown;
  readonly podPointer: string;
  readonly containers: typeof Containers.infer;
  readonly initContainers: typeof Containers.infer;
}
function readPath(manifest: unknown, path: (string | number)[]): unknown {
  let value = manifest;
  for (const segment of path) {
    if (Array.isArray(value) && typeof segment === 'number') value = value[segment];
    else {
      const record = type('Record<string,unknown>')(value);
      if (record instanceof type.errors) return undefined;
      value = record[segment];
    }
  }
  return value;
}
function requireSelected(condition: boolean): asserts condition {
  if (!condition) throw new Error('Observability source selected resource contract differs');
}
function requireContainers(input: unknown, names: string[]) {
  const containers = Containers(input);
  // Proof: bypassing map decoding admitted missing Kibana init resources; its selected source negative failed.
  if (containers instanceof type.errors)
    throw new Error('Observability source selected resource contract differs');
  // Proof: removing role equality admitted the missing Kibana init role; its selected source negative failed.
  requireSelected(
    isDeepStrictEqual(containers.map((container) => container.name).sort(), names.toSorted()),
  );
  const byName = Object.fromEntries(containers.map((container) => [container.name, container]));
  // Proof: Task25b2 supported-init-order reversal failed the provider sequence assertion.
  return names.map((name) => byName[name]);
}
function requireScratch(input: unknown, names: string[]): void {
  const volumes = Volumes(input);
  // Proof: bypassing scratch decoding admitted a zero Kibana emptyDir limit; its selected scratch negative failed.
  requireSelected(!(volumes instanceof type.errors));
  // Proof: removing scratch identity equality admitted missing Kibana scratch; its selected scratch negative failed.
  requireSelected(
    isDeepStrictEqual(
      volumes
        .filter((volume) => volume.emptyDir)
        .map((volume) => volume.name)
        .sort(),
      names.toSorted(),
    ),
  );
}
/** The selected decoder consumes namespace and retained release declarations, without requiring a fabricated assembly. */
export interface SelectedCapacitySource {
  readonly instances: readonly { readonly namespace: string }[];
  readonly releases: readonly (Pick<ObservabilityRenderRelease, 'owner' | 'chart' | 'manifest'> & {
    /** Already decoded and matched to manifest by the retained source traversal; legacy string-only callers retain their decoder. */
    readonly declaration?: Record<string, unknown>;
  })[];
}

/** Conservative selected provider inputs only, never effective Pods or enforcement evidence.
 * The role contract follows ECK 3.5.0 and Prometheus Operator 0.94.0; a provider upgrade requires fresh role review.
 * Throws when selected role maps, scratch, provider pins or shared reloader flags differ.
 * ECK named overrides preserve default commands/mounts; Prometheus extra volumes append rather than replace generated config-out.
 */
export function readObservabilitySelectedResources(
  source: SelectedCapacitySource,
  indexed: ObservabilitySourceIndex,
) {
  const roles: SelectedRole[] = [];
  for (const [owner, version] of [
    ['observability/eck-operator', '3.5.0'],
    ['observability/prometheus-controller', '91.4.1'],
  ]) {
    const release = source.releases.find((release) => release.owner === owner);
    // Proof: removing provider pin binding admitted a changed provider version with obsolete role assumptions.
    requireSelected(
      release !== undefined &&
        readPath(release.declaration ?? parseDocument(release.manifest).toJSON(), [
          'spec',
          'chart',
          'spec',
          'version',
        ]) === version,
    );
  }
  for (const instance of source.instances) {
    const namespace = instance.namespace;
    const es = indexed[`${namespace}/elasticsearch`][`Elasticsearch:${namespace}:elasticsearch`];
    const pod = ['spec', 'nodeSets', 0, 'podTemplate', 'spec'];
    const esContainers = requireContainers(readPath(es, [...pod, 'containers']), ['elasticsearch']);
    const esInits = requireContainers(readPath(es, [...pod, 'initContainers']), [
      'elastic-internal-init-filesystem',
      'elastic-internal-init-keystore',
      'elastic-internal-suspend',
      'prepare-s3-trust',
    ]);
    requireScratch(readPath(es, [...pod, 'volumes']), [
      's3-trust',
      'elastic-internal-elasticsearch-bin-local',
      'elastic-internal-elasticsearch-config-local',
      'elastic-internal-elasticsearch-plugins-local',
      'elasticsearch-logs',
      'tmp-volume',
    ]);
    roles.push({
      owner: `${namespace}/elasticsearch`,
      identity: `Elasticsearch:${namespace}:elasticsearch`,
      kind: 'Elasticsearch',
      namespace,
      manifest: es,
      pod: readPath(es, pod),
      podPointer: '/spec/nodeSets/0/podTemplate/spec',
      containers: esContainers,
      initContainers: esInits,
    });
    const kibana = indexed[`${namespace}/kibana`][`Kibana:${namespace}:kibana`];
    const kibanaContainers = requireContainers(
      readPath(kibana, ['spec', 'podTemplate', 'spec', 'containers']),
      ['kibana'],
    );
    const kibanaInits = requireContainers(
      readPath(kibana, ['spec', 'podTemplate', 'spec', 'initContainers']),
      ['elastic-internal-init'],
    );
    requireScratch(readPath(kibana, ['spec', 'podTemplate', 'spec', 'volumes']), [
      'kibana-data',
      'kibana-plugins',
      'elastic-internal-kibana-config-local',
      'kibana-logs',
      'temp-volume',
    ]);
    roles.push({
      owner: `${namespace}/kibana`,
      identity: `Kibana:${namespace}:kibana`,
      kind: 'Kibana',
      namespace,
      manifest: kibana,
      pod: readPath(kibana, ['spec', 'podTemplate', 'spec']),
      podPointer: '/spec/podTemplate/spec',
      containers: kibanaContainers,
      initContainers: kibanaInits,
    });
    for (const [kind, name] of [
      ['Prometheus', 'prometheus'],
      ['Alertmanager', 'alertmanager'],
    ] as const) {
      const cr = indexed[`${namespace}/kube-prometheus-stack`][`${kind}:${namespace}:kps-${name}`];
      // Proof: removing primary map validation admitted missing Prometheus resources; its selected primary map negative failed.
      requireSelected(!(Resources(readPath(cr, ['spec', 'resources'])) instanceof type.errors));
      const containers = requireContainers(readPath(cr, ['spec', 'containers']), [
        name,
        'config-reloader',
      ]);
      const initContainers = requireContainers(readPath(cr, ['spec', 'initContainers']), [
        'init-config-reloader',
      ]);
      roles.push({
        owner: `${namespace}/kube-prometheus-stack`,
        identity: `${kind}:${namespace}:kps-${name}`,
        kind,
        namespace,
        manifest: cr,
        pod: readPath(cr, ['spec']),
        podPointer: '/spec',
        containers,
        initContainers,
      });
      // Proof: removing this restriction admitted duplicate generated Prometheus config-out; its production negative failed.
      requireSelected(readPath(cr, ['spec', 'volumes']) === undefined);
    }
  }
  for (const [owner, key, names] of [
    ['observability/eck-operator', 'StatefulSet:observability:elastic-operator', ['manager']],
    [
      'observability/prometheus-controller',
      'Deployment:observability:kps-operator',
      ['kube-prometheus-stack'],
    ],
    ['observability/prometheus-controller', 'Job:observability:kps-admission-create', ['create']],
    ['observability/prometheus-controller', 'Job:observability:kps-admission-patch', ['patch']],
  ] as const)
    requireContainers(readPath(indexed[owner][key], ['spec', 'template', 'spec', 'containers']), [
      ...names,
    ]);
  const controller =
    indexed['observability/prometheus-controller']['Deployment:observability:kps-operator'];
  const arguments_ = type('string[]')(
    readPath(controller, ['spec', 'template', 'spec', 'containers', 0, 'args']),
  );
  // Proof: removing flag binding admitted the missing CPU-request flag despite complete CR overrides; its reloader flag negative failed.
  requireSelected(
    !(arguments_ instanceof type.errors) &&
      [
        '--config-reloader-cpu-request=10m',
        '--config-reloader-cpu-limit=100m',
        '--config-reloader-memory-request=32Mi',
        '--config-reloader-memory-limit=64Mi',
      ].every((flag) => arguments_.includes(flag)),
  );
  // Proof: removing this binding admitted a changed Prometheus provider; its selected provider image negative failed.
  requireSelected(
    readPath(controller, ['spec', 'template', 'spec', 'containers', 0, 'image']) ===
      'quay.io/prometheus-operator/prometheus-operator:v0.94.0@sha256:cf153f64d6c38113fceb2cda7642365ea887f71edd7888f054e43e54cf177e55',
  );
  // Proof: removing this binding admitted a changed ECK provider; its selected provider image negative failed.
  requireSelected(
    readPath(indexed['observability/eck-operator']['StatefulSet:observability:elastic-operator'], [
      'spec',
      'template',
      'spec',
      'containers',
      0,
      'image',
    ]) ===
      'docker.elastic.co/eck/eck-operator:3.5.0@sha256:b6f261372d9d9af7b00aab03efea25263314d16063c4d440ac322e52c2fdf314',
  );
  return {
    roles,
    providers: {
      eck: {
        owner: 'observability/eck-operator',
        chartVersion: '3.5.0',
        image: readPath(
          indexed['observability/eck-operator']['StatefulSet:observability:elastic-operator'],
          ['spec', 'template', 'spec', 'containers', 0, 'image'],
        ),
      },
      prometheus: {
        owner: 'observability/prometheus-controller',
        chartVersion: '91.4.1',
        image: readPath(controller, ['spec', 'template', 'spec', 'containers', 0, 'image']),
        arguments: arguments_,
      },
    },
  };
}

/** Preserve the production selected-resource assertion; the adapter consumes the same validated inputs. */
export function assertObservabilitySelectedResources(
  source: ObservabilitySource,
  indexed: ObservabilitySourceIndex,
): void {
  // Proof: Task25b2 assertion-reader-dependency removal let the public assertion accept a malformed init role.
  readObservabilitySelectedResources(source, indexed);
}

/** Bind each enabled common exporter container's complete rendered maps to its current owning values.
 * Pinned KPS 91.4.1 realizes these two shared roles only in the production namespace; resource closure remains independently checked.
 */
export function assertObservabilityExporterResources(
  source: Pick<ObservabilitySource, 'releases'>,
  indexed: ObservabilitySourceIndex,
): void {
  const owner = 'observability/kube-prometheus-stack';
  const releases = source.releases.filter((release) => release.owner === owner);
  if (releases.length !== 1) throw new Error('Observability exporter source owner differs');
  const values = type({
    spec: {
      values: {
        'kube-state-metrics': { resources: 'unknown' },
        'prometheus-node-exporter': { resources: 'unknown' },
      },
    },
  }).assert(parseDocument(releases[0].manifest).toJSON()).spec.values;
  const rendered = type('Record<string,unknown>')(indexed[owner]);
  if (rendered instanceof type.errors)
    throw new Error('Observability exporter output owner absent');
  for (const [role, kind, name, container] of [
    [
      'kube-state-metrics',
      'Deployment',
      'kube-prometheus-stack-kube-state-metrics',
      'kube-state-metrics',
    ],
    [
      'prometheus-node-exporter',
      'DaemonSet',
      'kube-prometheus-stack-prometheus-node-exporter',
      'node-exporter',
    ],
  ] as const) {
    const expected = assertCandidatePodResources(values[role].resources);
    const workload = type({
      spec: {
        template: {
          spec: {
            containers: type({ name: 'string', resources: 'unknown' }).array(),
            'initContainers?': 'unknown[]',
            'ephemeralContainers?': 'unknown[]',
          },
        },
      },
    })(rendered[`${kind}:observability:${name}`]);
    if (workload instanceof type.errors) throw new Error('Observability exporter output absent');
    const pod = workload.spec.template.spec;
    // Proof: Task25c3f exporter-role/init/ephemeral bypasses admitted renamed app and extra output roles.
    if (
      !isDeepStrictEqual(
        pod.containers.map((container) => container.name),
        [container],
      ) ||
      (pod.initContainers !== undefined && pod.initContainers.length !== 0) ||
      (pod.ephemeralContainers !== undefined && pod.ephemeralContainers.length !== 0)
    )
      throw new Error('Observability exporter role closure differs');
    const actual = assertCandidatePodResources(pod.containers[0].resources);
    // Proof: Task25c3f exporter-correspondence bypass admitted a valid but wrongly propagated 128Mi output limit.
    if (!isDeepStrictEqual(actual, expected))
      throw new Error('Observability exporter resources differ from source');
  }
}

/** Bind retained DaemonSets to current owning values and pinned host mounts.
 * This validates authored ephemeral policy, never persistent host-path growth or runtime sufficiency.
 * The worker otel-agent is outside this retained source graph.
 */
export function assertObservabilityAgentResources(
  release: ObservabilityRenderRelease,
  rendered: unknown,
): void {
  const refuse = (): never => {
    throw new Error('Observability retained agent source correspondence differs');
  };
  // Proof: Task66 unsupported-owner bypass admitted a foreign selected release in propagation negatives.
  if (!['observability/otel-collector', 'puni-backup/velero'].includes(release.owner)) refuse();
  const name = release.owner === 'puni-backup/velero' ? 'node-agent' : 'opentelemetry-collector';
  const values = type({ spec: { values: 'Record<string,unknown>' } }).assert(
    parseDocument(release.manifest).toJSON(),
  ).spec.values;
  const isVelero = name === 'node-agent';
  if (isVelero) assertVeleroCandidate(values);
  const agent = isVelero ? type('Record<string,unknown>').assert(values['nodeAgent']) : values;
  const expected = assertCandidatePodResources(agent['resources']);
  const workload = type({
    spec: {
      template: {
        spec: {
          containers: type({
            name: 'string',
            resources: 'unknown',
            volumeMounts: 'unknown[]',
          }).array(),
          'initContainers?': 'unknown[]',
          'ephemeralContainers?': 'unknown[]',
          volumes: 'unknown[]',
        },
      },
    },
  })(rendered);
  // Proof: Task66 agent-workload bypass admitted a missing retained DaemonSet in propagation negatives.
  if (workload instanceof type.errors) return refuse();
  const pod = workload.spec.template.spec;
  // Proof: Task66 agent-role bypass admitted renamed apps and extra app/init/ephemeral roles in propagation negatives.
  if (
    !isDeepStrictEqual(
      pod.containers.map((container) => container.name),
      [name],
    ) ||
    (pod.initContainers !== undefined && pod.initContainers.length !== 0) ||
    (pod.ephemeralContainers !== undefined && pod.ephemeralContainers.length !== 0)
  )
    refuse();
  // Proof: Task66 agent-map bypass admitted missing rendered disk policy in propagation negatives.
  const actual = assertCandidatePodResources(pod.containers[0].resources);
  // Proof: Task66 agent-resource-equality bypass admitted valid changed rendered budgets in propagation negatives.
  if (!isDeepStrictEqual(actual, expected)) refuse();
  const volumes = type({ name: 'string', 'hostPath?': 'unknown', 'emptyDir?': 'unknown' })
    .array()
    .assert(pod.volumes);
  const mounts = type({ name: 'string', mountPath: 'string' })
    .array()
    .assert(pod.containers[0].volumeMounts);
  const hostVolumes = isVelero
    ? [
        { name: 'host-pods', hostPath: { path: '/var/lib/kubelet/pods' } },
        { name: 'host-plugins', hostPath: { path: '/var/lib/kubelet/plugins' } },
      ]
    : type({ name: 'string', 'hostPath?': 'unknown' })
        .array()
        .assert(values['extraVolumes'])
        .filter((volume) => volume.hostPath !== undefined);
  const hostNames = hostVolumes.map((volume) => volume.name);
  const hostMounts = isVelero
    ? [
        { name: 'host-pods', mountPath: '/host_pods', mountPropagation: 'HostToContainer' },
        { name: 'host-plugins', mountPath: '/host_plugins', mountPropagation: 'HostToContainer' },
      ]
    : type({ name: 'string', mountPath: 'string' })
        .array()
        .assert(values['extraVolumeMounts'])
        .filter((mount) => hostNames.includes(mount.name));
  // Proof: Task66 agent-host-volume/mount bypasses admitted altered writable host identity, mount propagation and colliding host mounts in propagation negatives.
  if (
    !isDeepStrictEqual(
      volumes.filter((volume) => volume.hostPath !== undefined),
      hostVolumes,
    ) ||
    !isDeepStrictEqual(
      mounts.filter(
        (mount) =>
          hostNames.includes(mount.name) ||
          hostMounts.some((host) => host.mountPath === mount.mountPath),
      ),
      hostMounts,
    )
  )
    refuse();
  if (isVelero) {
    // Proof: Task66 agent-scratch-volume/mount bypasses admitted changed/duplicate scratch including another volume type and wrong mount paths in propagation negatives.
    if (
      !isDeepStrictEqual(
        volumes.filter((volume) => volume.emptyDir !== undefined || volume.name === 'scratch'),
        agent['extraVolumes'],
      ) ||
      !isDeepStrictEqual(
        mounts.filter((mount) => mount.name === 'scratch' || mount.mountPath === '/scratch'),
        agent['extraVolumeMounts'],
      )
    )
      refuse();
  }
}

/** The complete service graph retains the collector only; backup is separately selected by the authenticated renderer. */
export function assertObservabilityCollectorResources(
  source: Pick<ObservabilitySource, 'releases'>,
  indexed: ObservabilitySourceIndex,
): void {
  const owner = 'observability/otel-collector';
  const releases = source.releases.filter((release) => release.owner === owner);
  // Proof: Task66 collector-owner bypass admitted duplicate/missing selected owners in propagation negatives.
  if (releases.length !== 1) throw new Error('Observability retained agent owner differs');
  assertObservabilityAgentResources(
    releases[0],
    indexed[owner]['DaemonSet:observability:otel-collector-agent'],
  );
}
