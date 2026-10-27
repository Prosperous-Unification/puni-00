import { type } from 'arktype';
import { expect } from 'bun:test';

import type { RehearsalStageBuild } from './observability-parity-rehearsal';
import type { inventoryObservabilityRehearsal } from './observability-rehearsal-inventory';
import { podSpecOf } from './platform-manifests';
import { decodeRenderedResources } from './rendered-resources';

/** Exact declared policy in one retained canonical output; this grants no runtime or whole-attempt authority. */
export function assertCommonCapture(
  stages: readonly RehearsalStageBuild[],
  expansions: Record<string, string>,
  receipt?: Awaited<ReturnType<typeof inventoryObservabilityRehearsal>>,
) {
  const documents = [...stages.map((stage) => stage.bytes), ...Object.values(expansions)].flatMap(
    decodeRenderedResources,
  );
  const expected = [
    ['Deployment', 'puni-registry', 'registry', 'registry', '32Mi', '256Mi'],
    ['Deployment', 'observability', 'blackbox-exporter', 'blackbox-exporter', '16Mi', '64Mi'],
    ['Deployment', 'puni-backup', 'object-store', 'minio', '32Mi', '256Mi'],
    ['Job', 'puni-backup', 'object-store-buckets', 'buckets', '16Mi', '64Mi'],
    ['Job', 'observability', 'elastic-snapshots', 'apply', '16Mi', '64Mi'],
    ['CronJob', 'observability', 'elastic-snapshot-check', 'apply', '16Mi', '64Mi'],
    [
      'Deployment',
      'observability',
      'kube-prometheus-stack-kube-state-metrics',
      'kube-state-metrics',
      '16Mi',
      '64Mi',
    ],
    [
      'DaemonSet',
      'observability',
      'kube-prometheus-stack-prometheus-node-exporter',
      'node-exporter',
      '16Mi',
      '64Mi',
    ],
    ...['observability', 'observability-dev'].flatMap((namespace) => [
      ['StatefulSet', namespace, 'signal-collector', 'collector', '64Mi', '256Mi'],
      ['StatefulSet', namespace, 'signal-gateway', 'gateway', '64Mi', '256Mi'],
      ['Deployment', namespace, 'signal-metrics', 'proxy', '16Mi', '64Mi'],
      ['Job', namespace, 'elastic-settings', 'apply', '16Mi', '64Mi'],
      ['Job', namespace, 'kibana-objects', 'apply', '16Mi', '64Mi'],
    ]),
  ];
  for (const [kind, namespace, name, container, request, limit] of expected) {
    const matches = documents.filter(
      ({ identity }) =>
        identity.kind === kind &&
        identity.metadata.namespace === namespace &&
        identity.metadata.name === name,
    );
    expect(matches).toHaveLength(1);
    const workload = type({ kind: 'string', spec: 'object' }).assert(matches[0].manifest);
    const pod = type({
      containers: type({
        name: 'string',
        resources: {
          requests: 'Record<string,string|number>',
          limits: 'Record<string,string|number>',
        },
      }).array(),
      'initContainers?': 'unknown[]',
    }).assert(podSpecOf(workload));
    expect(pod.containers.map((container) => container.name)).toEqual([container]);
    expect(pod.initContainers ?? []).toEqual([]);
    expect(pod.containers[0].resources.requests['ephemeral-storage']).toBe(request);
    expect(pod.containers[0].resources.limits['ephemeral-storage']).toBe(limit);
    if (name === 'object-store-buckets') {
      const scratch = type({
        volumes: type({ name: 'string', 'emptyDir?': 'unknown' }).array(),
      }).assert(pod);
      expect(scratch.volumes.filter((volume) => volume.name === 'tmp')).toEqual([
        { name: 'tmp', emptyDir: { sizeLimit: '16Mi' } },
      ]);
    }
    if (receipt !== undefined) {
      const facts = receipt.entries.filter(
        (entry) => entry.kind === kind && entry.namespace === namespace && entry.name === name,
      );
      expect(facts).toHaveLength(1);
      expect(facts[0].sourceRequests.map((entry) => entry.quantities['ephemeral-storage'])).toEqual(
        [request],
      );
      expect(facts[0].sourceLimits.map((entry) => entry.quantities['ephemeral-storage'])).toEqual([
        limit,
      ]);
    }
  }
  return expected.map(([kind, namespace, name]) => `${kind}:${namespace}:${name}`);
}
