import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { isNode, parseDocument, stringify } from 'yaml';

import type { ObservabilitySource } from './observability-source';
import type { ObservabilitySourceIndex } from './observability-source-render';

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
function readPath(manifest: unknown, path: (string | number)[]): unknown {
  const node = parseDocument(stringify(manifest)).getIn(path);
  return isNode(node) ? node.toJSON() : node;
}
function requireSelected(condition: boolean): void {
  if (!condition) throw new Error('Observability source selected resource contract differs');
}
function requireContainers(input: unknown, names: string[]): void {
  const containers = Containers(input);
  // Proof: bypassing map decoding admitted missing Kibana init resources; its selected source negative failed.
  requireSelected(!(containers instanceof type.errors));
  if (containers instanceof type.errors) return;
  // Proof: removing role equality admitted the missing Kibana init role; its selected source negative failed.
  requireSelected(
    isDeepStrictEqual(containers.map((container) => container.name).sort(), names.toSorted()),
  );
}
function requireScratch(input: unknown, names: string[]): void {
  const volumes = Volumes(input);
  // Proof: bypassing scratch decoding admitted a zero Kibana emptyDir limit; its selected scratch negative failed.
  requireSelected(!(volumes instanceof type.errors));
  if (volumes instanceof type.errors) return;
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
/** Conservative selected provider inputs only, never effective Pods or enforcement evidence.
 * The role contract follows ECK 3.5.0 and Prometheus Operator 0.94.0; a provider upgrade requires fresh role review.
 * Throws when selected role maps, scratch, provider pins or shared reloader flags differ.
 * ECK named overrides preserve default commands/mounts; Prometheus extra volumes append rather than replace generated config-out.
 */
export function assertObservabilitySelectedResources(
  source: ObservabilitySource,
  indexed: ObservabilitySourceIndex,
): void {
  for (const [owner, version] of [
    ['observability/eck-operator', '3.5.0'],
    ['observability/prometheus-controller', '91.4.1'],
  ]) {
    const release = source.releases.find((release) => release.owner === owner);
    // Proof: removing provider pin binding admitted a changed provider version with obsolete role assumptions.
    requireSelected(
      release !== undefined &&
        readPath(parseDocument(release.manifest).toJSON(), ['spec', 'chart', 'spec', 'version']) ===
          version,
    );
  }
  for (const instance of source.instances) {
    const namespace = instance.namespace;
    const es = indexed[`${namespace}/elasticsearch`][`Elasticsearch:${namespace}:elasticsearch`];
    const pod = ['spec', 'nodeSets', 0, 'podTemplate', 'spec'];
    requireContainers(readPath(es, [...pod, 'containers']), ['elasticsearch']);
    requireContainers(readPath(es, [...pod, 'initContainers']), [
      'prepare-s3-trust',
      'elastic-internal-init-filesystem',
      'elastic-internal-init-keystore',
      'elastic-internal-suspend',
    ]);
    requireScratch(readPath(es, [...pod, 'volumes']), [
      's3-trust',
      'elastic-internal-elasticsearch-bin-local',
      'elastic-internal-elasticsearch-config-local',
      'elastic-internal-elasticsearch-plugins-local',
      'elasticsearch-logs',
      'tmp-volume',
    ]);
    const kibana = indexed[`${namespace}/kibana`][`Kibana:${namespace}:kibana`];
    requireContainers(readPath(kibana, ['spec', 'podTemplate', 'spec', 'containers']), ['kibana']);
    requireContainers(readPath(kibana, ['spec', 'podTemplate', 'spec', 'initContainers']), [
      'elastic-internal-init',
    ]);
    requireScratch(readPath(kibana, ['spec', 'podTemplate', 'spec', 'volumes']), [
      'kibana-data',
      'kibana-plugins',
      'elastic-internal-kibana-config-local',
      'kibana-logs',
      'temp-volume',
    ]);
    for (const [kind, name] of [
      ['Prometheus', 'prometheus'],
      ['Alertmanager', 'alertmanager'],
    ]) {
      const cr = indexed[`${namespace}/kube-prometheus-stack`][`${kind}:${namespace}:kps-${name}`];
      // Proof: removing primary map validation admitted missing Prometheus resources; its selected primary map negative failed.
      requireSelected(!(Resources(readPath(cr, ['spec', 'resources'])) instanceof type.errors));
      requireContainers(readPath(cr, ['spec', 'containers']), [name, 'config-reloader']);
      requireContainers(readPath(cr, ['spec', 'initContainers']), ['init-config-reloader']);
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
}
