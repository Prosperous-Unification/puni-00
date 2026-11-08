import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';

const Labels = type('Record<string,string>');
const Service = type({
  metadata: { labels: Labels },
  spec: {
    selector: Labels,
    ports: type({
      name: 'string',
      port: 'number.integer',
      targetPort: 'string | number',
      'protocol?': 'string',
    }).array(),
  },
});
const Monitor = type({
  spec: {
    selector: { matchLabels: Labels },
    namespaceSelector: { matchNames: 'string[]' },
    endpoints: type({ port: 'string' }).array(),
  },
});
const Policy = type({
  spec: {
    podSelector: { matchLabels: Labels },
    policyTypes: 'string[]',
    ingress: 'object[]',
    egress: 'object[]',
  },
});
const peer = (namespace: string, labels: Record<string, string>) => ({
  namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': namespace } },
  podSelector: { matchLabels: labels },
});
const Flow = type({
  ports: type({ protocol: "'TCP' | 'UDP'", port: 'number.integer' }).array(),
  'from?': 'object[]',
  'to?': 'object[]',
});
function containsFlow(
  rules: readonly object[],
  direction: 'from' | 'to',
  endpoint: object,
  port: number,
): boolean {
  return rules.some((rule) => {
    const flow = Flow(rule);
    return (
      !(flow instanceof type.errors) &&
      isDeepStrictEqual(flow[direction], [endpoint]) &&
      flow.ports.some((binding) => binding.protocol === 'TCP' && binding.port === port)
    );
  });
}
/** Independently bind both pinned KPS self-monitor endpoints to their Service ports and namespace-local deny-policy permissions. The operator's reloader-web target is pinned to 8080; this source contract does not certify generated pods or CNI routing. */
export function assertObservabilitySelfScrapes(
  namespace: string,
  resources: Record<string, Record<string, unknown>>,
  security: Record<string, Record<string, unknown>>,
): void {
  const senderLabels = { 'operator.prometheus.io/name': 'kps-prometheus' };
  const sender = Policy(security[`NetworkPolicy:${namespace}:allow-prometheus`]);
  // Proof: removing this boundary changed the malformed-sender negative from its fixed scrape-policy refusal to a later contract refusal.
  if (sender instanceof type.errors)
    throw new Error('Observability source scrape policy malformed');
  for (const [role, label, mainPort] of [
    ['prometheus', 'operator.prometheus.io/name', 9090],
    ['alertmanager', 'alertmanager', 9093],
  ] as const) {
    const name = `kps-${role}`;
    const service = Service(resources[`Service:${namespace}:${name}`]);
    const monitor = Monitor(resources[`ServiceMonitor:${namespace}:${name}`]);
    const receiver = Policy(security[`NetworkPolicy:${namespace}:allow-${role}`]);
    // Proof: removing this boundary exposed a TypeError instead of the fixed malformed scrape-contract refusal in observability-source-render.test.ts.
    if (
      service instanceof type.errors ||
      monitor instanceof type.errors ||
      receiver instanceof type.errors
    )
      throw new Error('Observability source scrape contract malformed');
    const targetLabels = { [label]: name };
    const ports = [
      { name: 'http-web', port: mainPort, targetPort: mainPort },
      { name: 'reloader-web', port: 8080, targetPort: 'reloader-web' },
    ];
    // Proof: removing endpoint equality admitted changed monitor selectors/names and Service ports/targets/selectors in five independent production-render negatives.
    if (
      !isDeepStrictEqual(monitor.spec.selector, {
        matchLabels: {
          app: `kube-prometheus-stack-${role}`,
          release: 'kube-prometheus-stack',
          'self-monitor': 'true',
        },
      }) ||
      !isDeepStrictEqual(
        monitor.spec.endpoints.map((endpoint) => endpoint.port),
        ports.map((port) => port.name),
      ) ||
      !isDeepStrictEqual(monitor.spec.namespaceSelector.matchNames, [namespace]) ||
      !Object.entries(monitor.spec.selector.matchLabels).every(
        ([key, value]) => service.metadata.labels[key] === value,
      ) ||
      !isDeepStrictEqual(service.spec.selector, {
        'app.kubernetes.io/name': role,
        ...targetLabels,
      }) ||
      !isDeepStrictEqual(
        service.spec.ports.map((port) => ({
          name: port.name,
          port: port.port,
          targetPort: port.targetPort,
        })),
        ports,
      ) ||
      service.spec.ports.some((port) => port.protocol !== undefined && port.protocol !== 'TCP')
    )
      throw new Error('Observability source scrape endpoint contract differs');
    // Proof: with 8080 removed from the factory itself, regenerated source/security is rejected; removing this independent guard made both placement negatives accept the shared omission.
    if (
      !isDeepStrictEqual(sender.spec.podSelector.matchLabels, senderLabels) ||
      !isDeepStrictEqual(receiver.spec.podSelector.matchLabels, targetLabels) ||
      !sender.spec.policyTypes.includes('Egress') ||
      !receiver.spec.policyTypes.includes('Ingress') ||
      ports.some(
        (port) =>
          !containsFlow(sender.spec.egress, 'to', peer(namespace, targetLabels), port.port) ||
          !containsFlow(receiver.spec.ingress, 'from', peer(namespace, senderLabels), port.port),
      )
    )
      throw new Error('Observability source scrape flow absent');
  }
}
