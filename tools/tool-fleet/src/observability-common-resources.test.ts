import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { expect, test } from 'bun:test';
import { parseAllDocuments, parseDocument } from 'yaml';

import { renderObservability } from './observability';
import { createObservabilityComposition } from './observability-composition';
import { podSpecOf } from './platform-manifests';

const root = join(import.meta.dir, '../../..');
const Workload = type({ kind: 'string', metadata: { name: 'string' }, spec: 'object' });
const Pod = type({
  containers: type({
    name: 'string',
    resources: { requests: 'Record<string,string|number>', limits: 'Record<string,string|number>' },
  }).array(),
});
function assertBounds(bytes: string, name: string, request: string, limit: string) {
  const document = parseAllDocuments(bytes).find(
    (document) =>
      document.getIn(['metadata', 'name']) === name &&
      ['Deployment', 'StatefulSet', 'Job', 'CronJob'].includes(String(document.get('kind'))),
  );
  if (document === undefined) throw new Error('Owned workload absent');
  const pod = Pod.assert(podSpecOf(Workload.assert(document.toJSON())));
  expect(pod.containers).toHaveLength(1);
  expect(pod.containers[0].resources.requests['ephemeral-storage']).toBe(request);
  expect(pod.containers[0].resources.limits['ephemeral-storage']).toBe(limit);
}
test('Task25c3f owning handwritten native sources emit exact ephemeral bounds', async () => {
  for (const [path, name, request, limit] of [
    ['registry/base/registry.yaml', 'registry', '32Mi', '256Mi'],
    ['observability/prometheus/blackbox-exporter.yaml', 'blackbox-exporter', '16Mi', '64Mi'],
    ['backup/local/object-store.yaml', 'object-store', '32Mi', '256Mi'],
    ['backup/local/object-store.yaml', 'object-store-buckets', '16Mi', '64Mi'],
    ['observability/kibana/objects/job.yaml', 'kibana-objects', '16Mi', '64Mi'],
    ['backup/elastic/snapshots.yaml', 'elastic-snapshots', '16Mi', '64Mi'],
    ['backup/elastic/snapshots.yaml', 'elastic-snapshot-check', '16Mi', '64Mi'],
  ])
    assertBounds(await readFile(join(root, 'infra/platform', path), 'utf8'), name, request, limit);
});
test('Task25c3f common builders and both instance copies emit exact bounds with generated equivalence', async () => {
  const generated = await renderObservability(root);
  for (const [path, name, request, limit] of [
    ['observability/base/signals.yaml', 'signal-collector', '64Mi', '256Mi'],
    ['observability/base/signals.yaml', 'signal-gateway', '64Mi', '256Mi'],
    ['observability/base/metrics.yaml', 'signal-metrics', '16Mi', '64Mi'],
    ['observability/elastic/settings/settings.yaml', 'elastic-settings', '16Mi', '64Mi'],
  ]) {
    assertBounds(generated[path], name, request, limit);
    expect(await readFile(join(root, 'infra/platform', path), 'utf8')).toBe(generated[path]);
  }
  const composition = await createObservabilityComposition(root, {
    placement: 'production',
    instances: [
      { environment: 'dev', namespace: 'observability-dev', policy: 'development' },
      { environment: 'prod', namespace: 'observability', policy: 'retained-production' },
    ],
  });
  for (const instance of composition.instances) {
    for (const [name, request, limit] of [
      ['signal-collector', '64Mi', '256Mi'],
      ['signal-gateway', '64Mi', '256Mi'],
      ['signal-metrics', '16Mi', '64Mi'],
      ['elastic-settings', '16Mi', '64Mi'],
      ['kibana-objects', '16Mi', '64Mi'],
    ])
      assertBounds(instance.native, name, request, limit);
  }
});
test('Task25c3f Helm owning values retain exact subchart bounds', async () => {
  const monitoring = parseDocument(
    await readFile(
      join(root, 'infra/platform/observability/prometheus/kube-prometheus-stack.yaml'),
      'utf8',
    ),
  );
  for (const role of ['kube-state-metrics', 'prometheus-node-exporter']) {
    expect(
      monitoring.getIn(['spec', 'values', role, 'resources', 'requests', 'ephemeral-storage']),
    ).toBe('16Mi');
    expect(
      monitoring.getIn(['spec', 'values', role, 'resources', 'limits', 'ephemeral-storage']),
    ).toBe('64Mi');
  }
});
