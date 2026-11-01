import { type } from 'arktype';
import { stringify } from 'yaml';

// Proof: replacing this host parser with string admitted 0.0.0.0/0 in observability-source.test.ts (broad network binding negative).
const Host = type('string').narrow((address) => {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/32$/.exec(address);
  return (
    match !== null &&
    match.slice(1).every((octet) => Number(octet) <= 255) &&
    Number(match[1]) > 0 &&
    Number(match[1]) < 224
  );
});
const Hosts = Host.array().atLeastLength(1).atMostLength(16);
const Network = type({
  api: Hosts,
  observer: Hosts,
  grafana: Hosts,
  s3: Hosts,
  alertDelivery: Hosts,
  publicProbes: Hosts,
  '+': 'reject',
});
/** Explicit desired external host bindings, never resolved/live authority; unknown origins cannot default to a broad network. */
export type ObservabilitySourceNetwork = typeof Network.infer;
export function decodeObservabilitySourceNetwork(input: unknown): ObservabilitySourceNetwork {
  const network = Network(input);
  if (network instanceof type.errors)
    throw new Error('Observability source required network binding absent or invalid');
  // Proof: removing uniqueness admitted repeated S3 hosts in the duplicate network binding negative.
  for (const hosts of Object.values(network))
    if (new Set(hosts).size !== hosts.length)
      throw new Error('Observability source duplicate network binding');
  return network;
}
type Labels = Record<string, string>;
interface Pod {
  namespace: string;
  labels: Labels;
}
type Peer = { pod: Pod } | { host: string };
const labels = (name: string): Labels => ({ 'app.kubernetes.io/name': name });
const roles: Record<string, Labels> = {
  collector: labels('signal-collector'),
  gateway: labels('signal-gateway'),
  metrics: labels('signal-metrics'),
  elastic: { 'elasticsearch.k8s.elastic.co/cluster-name': 'elasticsearch' },
  kibana: { 'kibana.k8s.elastic.co/name': 'kibana' },
  prometheus: { 'operator.prometheus.io/name': 'kps-prometheus' },
  alertmanager: { alertmanager: 'kps-alertmanager' },
  settings: { 'job-name': 'elastic-settings' },
  objects: { 'job-name': 'kibana-objects' },
  eck: { 'control-plane': 'elastic-operator' },
  operator: { app: 'kube-prometheus-stack-operator', release: 'prometheus-controller' },
  admission: { app: 'kube-prometheus-stack-admission', release: 'prometheus-controller' },
  reader: { 'app.kubernetes.io/instance': 'otel-collector', component: 'agent-collector' },
  ksm: labels('kube-state-metrics'),
  node: labels('prometheus-node-exporter'),
  blackbox: labels('blackbox-exporter'),
  snapshots: { 'job-name': 'elastic-snapshots' },
  snapshotCheck: { 'puni.dev/observability-flow': 'snapshot-check' },
};
function peer(endpoint: Peer) {
  return 'host' in endpoint
    ? { ipBlock: { cidr: endpoint.host } }
    : {
        namespaceSelector: {
          matchLabels: { 'kubernetes.io/metadata.name': endpoint.pod.namespace },
        },
        podSelector: { matchLabels: endpoint.pod.labels },
      };
}
/** Namespace-wide deny plus exact workload/peer/port rules. Host-network and effective CNI interpretation require runtime witnesses. */
export function createObservabilityNetworkPolicies(
  namespace: string,
  network: ObservabilitySourceNetwork,
  enrolled: readonly string[],
): object[] {
  const rules = new Map<string, { ingress: object[]; egress: object[] }>();
  const pod = (role: string, scope = namespace): Peer => ({
    pod: { namespace: scope, labels: roles[role] },
  });
  function flow(from: Peer, to: Peer, ports: readonly number[], protocol: 'TCP' | 'UDP' = 'TCP') {
    const portRules = ports.map((port) => ({ protocol, port }));
    for (const [direction, endpoint, opposite] of [
      ['egress', from, to],
      ['ingress', to, from],
    ] as const) {
      if (!('pod' in endpoint) || endpoint.pod.namespace !== namespace) continue;
      const role = Object.keys(roles).find((name) => roles[name] === endpoint.pod.labels);
      if (role === undefined) throw new Error('Observability source unknown network role');
      const bound = rules.get(role) ?? { ingress: [], egress: [] };
      bound[direction].push(
        direction === 'ingress'
          ? { from: [peer(opposite)], ports: portRules }
          : { to: [peer(opposite)], ports: portRules },
      );
      rules.set(role, bound);
    }
  }
  flow(pod('collector'), pod('gateway'), [4317, 14317]);
  flow(pod('collector'), pod('metrics'), [8443]);
  flow(pod('metrics'), pod('prometheus'), [9090]);
  for (const role of ['gateway', 'kibana', 'settings']) flow(pod(role), pod('elastic'), [9200]);
  flow(pod('objects'), pod('kibana'), [5601]);
  flow(pod('elastic'), pod('elastic'), [9300]);
  flow(pod('prometheus'), pod('alertmanager'), [9093]);
  flow(pod('alertmanager'), pod('alertmanager'), [9094]);
  flow(pod('alertmanager'), pod('alertmanager'), [9094], 'UDP');
  for (const [role, ports] of [
    ['collector', [8888, 8889]],
    ['gateway', [8888]],
    // Proof: removing reloader 8080 failed the source flow control and the independent actual-render coverage check, even with the same broken factory used for expected policy.
    ['prometheus', [9090, 8080]],
    ['alertmanager', [9093, 8080]],
  ] as const)
    flow(pod('prometheus'), pod(role), ports);
  for (const host of network.observer) {
    flow({ host }, pod('collector'), [4318]);
    flow({ host }, pod('elastic'), [9200]);
    flow({ host }, pod('metrics'), [8443]);
  }
  for (const host of network.grafana) {
    flow({ host }, pod('elastic'), [9200]);
    flow({ host }, pod('metrics'), [8443]);
  }
  for (const host of network.s3) flow(pod('elastic'), { host }, [443, 9000]);
  for (const host of network.alertDelivery) flow(pod('alertmanager'), { host }, [443]);
  for (const host of network.api) flow(pod('prometheus'), { host }, [443, 6443]);
  flow(pod('eck', 'observability'), pod('elastic'), [9200]);
  flow(pod('eck', 'observability'), pod('kibana'), [5601]);
  if (namespace === 'observability') {
    for (const target of ['observability', 'observability-dev']) {
      flow(pod('eck'), pod('elastic', target), [9200]);
      flow(pod('eck'), pod('kibana', target), [5601]);
    }
    flow(pod('reader'), pod('elastic'), [9200]);
    flow(pod('reader'), pod('prometheus'), [9090]);
    for (const [role, ports] of [
      ['operator', [10250]],
      ['ksm', [8080]],
      ['node', [9101]],
      ['reader', [8888]],
      ['blackbox', [9115]],
    ] as const)
      flow(pod('prometheus'), pod(role), ports);
    flow(pod('snapshots'), pod('elastic'), [9200]);
    flow(pod('snapshotCheck'), pod('elastic'), [9200]);
    for (const host of enrolled) {
      // Proof: removing 4318 failed the enrolled HTTP flow source control in observability-source.test.ts.
      flow({ host }, pod('reader'), [4317, 4318, 14317, 13133]);
      flow(pod('prometheus'), { host }, [10250, 9101]);
    }
    for (const host of network.api) {
      for (const role of ['eck', 'operator', 'admission', 'ksm'])
        flow(pod(role), { host }, [443, 6443]);
      flow({ host }, pod('eck'), [9443]);
      flow({ host }, pod('operator'), [10250]);
      flow(pod('prometheus'), { host }, [443, 6443]);
    }
    for (const host of network.publicProbes) flow(pod('blackbox'), { host }, [443]);
    flow(
      pod('blackbox'),
      { pod: { namespace: 'puni-registry', labels: labels('registry') } },
      [5001],
    );
    flow(
      pod('prometheus'),
      { pod: { namespace: 'kube-system', labels: { 'k8s-app': 'kube-dns' } } },
      [9153],
    );
  }
  const policy = (name: string, spec: object) => ({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name, namespace },
    spec,
  });
  return [
    policy('default-deny', { podSelector: {}, policyTypes: ['Ingress', 'Egress'] }),
    policy('allow-dns', {
      podSelector: {},
      policyTypes: ['Egress'],
      egress: [
        {
          to: [
            {
              namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'kube-system' } },
              podSelector: { matchLabels: { 'k8s-app': 'kube-dns' } },
            },
          ],
          ports: [
            { protocol: 'UDP', port: 53 },
            { protocol: 'TCP', port: 53 },
          ],
        },
      ],
    }),
    ...Array.from(rules)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([role, bound]) =>
        policy(`allow-${role}`, {
          podSelector: { matchLabels: roles[role] },
          policyTypes: ['Ingress', 'Egress'],
          ...bound,
        }),
      ),
  ];
}
/** Namespaced discovery grants keep dev confined while retained production can discover its exact platform target namespaces. */
export function createObservabilityDiscovery(namespace: string): object[] {
  const namespaces =
    namespace === 'observability' ? ['observability', 'kube-system', 'default'] : [namespace];
  const manifests: object[] = namespaces.flatMap((scope) => [
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: { name: 'signal-discovery', namespace: scope },
      rules: [
        {
          apiGroups: [''],
          resources: ['services', 'endpoints', 'pods'],
          verbs: ['get', 'list', 'watch'],
        },
        {
          apiGroups: ['discovery.k8s.io'],
          resources: ['endpointslices'],
          verbs: ['get', 'list', 'watch'],
        },
      ],
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: { name: 'signal-discovery', namespace: scope },
      roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'signal-discovery' },
      subjects: [{ kind: 'ServiceAccount', name: 'kps-prometheus', namespace }],
    },
  ]);
  if (namespace === 'observability')
    manifests.push(
      {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRole',
        metadata: { name: 'signal-platform-metrics' },
        rules: [
          { apiGroups: [''], resources: ['nodes/metrics'], verbs: ['get'] },
          {
            nonResourceURLs: ['/metrics', '/metrics/cadvisor', '/metrics/resource'],
            verbs: ['get'],
          },
        ],
      },
      {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRoleBinding',
        metadata: { name: 'signal-platform-metrics' },
        roleRef: {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'ClusterRole',
          name: 'signal-platform-metrics',
        },
        subjects: [{ kind: 'ServiceAccount', name: 'kps-prometheus', namespace }],
      },
    );
  return manifests;
}
export const encodeObservabilitySource = (manifests: readonly object[]) =>
  manifests.map((manifest) => stringify(manifest)).join('---\n');
