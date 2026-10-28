import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { expect, test } from 'bun:test';
import { parseDocument } from 'yaml';

import { type ObservabilitySourceIndex } from './observability-source-render';
import {
  assertObservabilityAgentResources,
  assertObservabilityCollectorResources,
  assertObservabilityExporterResources,
} from './observability-source-resources';

const root = join(import.meta.dir, '../../..');
const owner = 'observability/kube-prometheus-stack';
const identity = 'Deployment:observability:kube-prometheus-stack-kube-state-metrics';
async function fixture() {
  const source = {
    releases: [
      {
        owner,
        chart: 'kubePrometheusStack' as const,
        manifest: await readFile(
          join(root, 'infra/platform/observability/prometheus/kube-prometheus-stack.yaml'),
          'utf8',
        ),
      },
    ],
  };
  const indexed: ObservabilitySourceIndex = {
    [owner]: {
      [identity]: {
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: 'kube-state-metrics',
                  resources: {
                    requests: { cpu: '10m', memory: '64Mi', 'ephemeral-storage': '16Mi' },
                    limits: { cpu: '200m', memory: '256Mi', 'ephemeral-storage': '64Mi' },
                  },
                },
              ],
            },
          },
        },
      },
      'DaemonSet:observability:kube-prometheus-stack-prometheus-node-exporter': {
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: 'node-exporter',
                  resources: {
                    requests: { cpu: '10m', memory: '32Mi', 'ephemeral-storage': '16Mi' },
                    limits: { cpu: '200m', memory: '64Mi', 'ephemeral-storage': '64Mi' },
                  },
                },
              ],
            },
          },
        },
      },
    },
  };
  return { source, indexed };
}
test('Task25c3f exporter output accepts complete source-corresponding maps', async () => {
  const { source, indexed } = await fixture();
  expect(() => {
    assertObservabilityExporterResources(source, indexed);
  }).not.toThrow();
});
test.each([
  'missing resource',
  'wrong resource',
  'missing map',
  'ignored value',
  'different valid quantity',
  'missing role',
  'extra app',
  'extra init',
  'extra ephemeral',
] as const)('Task25c3f exporter output refuses %s', async (fault) => {
  const { source, indexed } = await fixture();
  const manifest = indexed[owner][identity] as {
    spec: {
      template: {
        spec: {
          containers: {
            name: string;
            resources?: { requests: Record<string, string>; limits: Record<string, string> };
          }[];
          initContainers?: unknown[];
          ephemeralContainers?: unknown[];
        };
      };
    };
  };
  const pod = manifest.spec.template.spec;
  if (fault === 'missing resource') Reflect.deleteProperty(indexed[owner], identity);
  if (fault === 'wrong resource') {
    indexed[owner]['Deployment:observability:foreign'] = manifest;
    Reflect.deleteProperty(indexed[owner], identity);
  }
  if (fault === 'missing map') delete pod.containers[0].resources;
  if (fault === 'ignored value') delete pod.containers[0].resources!.requests['ephemeral-storage'];
  if (fault === 'different valid quantity')
    pod.containers[0].resources!.limits['ephemeral-storage'] = '128Mi';
  if (fault === 'missing role') pod.containers[0].name = 'foreign';
  if (fault === 'extra app') pod.containers.push({ name: 'sidecar' });
  if (fault === 'extra ephemeral') pod.ephemeralContainers = [{ name: 'debug' }];
  if (fault === 'extra init') pod.initContainers = [{ name: 'init' }];
  expect(() => {
    assertObservabilityExporterResources(source, indexed);
  }).toThrow(/exporter|common candidate/);
});

const agentOwners = ['observability/otel-collector', 'puni-backup/velero'] as const;
async function agentFixture() {
  const releases = await Promise.all(
    [
      [
        'observability/otel-collector',
        'opentelemetryCollector',
        'observability/otel/collector.yaml',
      ],
      ['puni-backup/velero', 'velero', 'backup/velero/local/velero.yaml'],
    ].map(async ([owner, chart, path]) => ({
      owner,
      chart: chart as 'velero' | 'opentelemetryCollector',
      manifest: await readFile(join(root, 'infra/platform', path), 'utf8'),
    })),
  );
  const collector = type({
    spec: { values: { extraVolumeMounts: 'unknown[]', extraVolumes: 'unknown[]' } },
  }).assert(parseDocument(releases[0].manifest).toJSON()).spec.values;
  const indexed: ObservabilitySourceIndex = {
    'observability/otel-collector': {
      'DaemonSet:observability:otel-collector-agent': {
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: 'opentelemetry-collector',
                  resources: {
                    requests: { cpu: '100m', memory: '128Mi', 'ephemeral-storage': '16Mi' },
                    limits: { cpu: '1', memory: '320Mi', 'ephemeral-storage': '64Mi' },
                  },
                  volumeMounts: collector.extraVolumeMounts,
                },
              ],
              volumes: collector.extraVolumes,
            },
          },
        },
      },
    },
    'puni-backup/velero': {
      'DaemonSet:puni-backup:node-agent': {
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: 'node-agent',
                  resources: {
                    requests: { cpu: '100m', memory: '128Mi', 'ephemeral-storage': '256Mi' },
                    limits: { cpu: '1', memory: '1Gi', 'ephemeral-storage': '2Gi' },
                  },
                  volumeMounts: [
                    {
                      name: 'host-pods',
                      mountPath: '/host_pods',
                      mountPropagation: 'HostToContainer',
                    },
                    {
                      name: 'host-plugins',
                      mountPath: '/host_plugins',
                      mountPropagation: 'HostToContainer',
                    },
                    { name: 'scratch', mountPath: '/scratch' },
                  ],
                },
              ],
              volumes: [
                { name: 'host-pods', hostPath: { path: '/var/lib/kubelet/pods' } },
                { name: 'host-plugins', hostPath: { path: '/var/lib/kubelet/plugins' } },
                { name: 'scratch', emptyDir: { sizeLimit: '1Gi' } },
              ],
            },
          },
        },
      },
    },
  };
  return { source: { releases }, indexed };
}
test('Task66 retained agents accept complete corresponding output', async () => {
  const { source, indexed } = await agentFixture();
  expect(() => {
    assertObservabilityCollectorResources(source, indexed);
  }).not.toThrow();
  for (const release of source.releases)
    expect(() => {
      assertObservabilityAgentResources(release, Object.values(indexed[release.owner])[0]);
    }).not.toThrow();
});
for (const owner of agentOwners) {
  test.each([
    'workload absent',
    'wrong workload',
    'ignored resources',
    'ignored disk',
    'changed valid disk',
    'wrong role',
    'extra app',
    'extra init',
    'extra ephemeral',
    'host path',
    'host mount',
    'host overlay',
  ] as const)('Task66 ' + owner + ' rendered refuses %s', async (fault) => {
    const { source, indexed } = await agentFixture();
    const identity = Object.keys(indexed[owner])[0];
    const manifest = indexed[owner][identity] as {
      spec: {
        template: {
          spec: {
            containers: {
              name: string;
              resources?: { requests: Record<string, string>; limits: Record<string, string> };
              volumeMounts: Record<string, unknown>[];
            }[];
            volumes: Record<string, unknown>[];
            initContainers?: unknown[];
            ephemeralContainers?: unknown[];
          };
        };
      };
    };
    const pod = manifest.spec.template.spec;
    if (fault === 'workload absent') Reflect.deleteProperty(indexed[owner], identity);
    if (fault === 'wrong workload') {
      indexed[owner]['DaemonSet:foreign:foreign'] = manifest;
      Reflect.deleteProperty(indexed[owner], identity);
    }
    if (fault === 'ignored resources') delete pod.containers[0].resources;
    if (fault === 'ignored disk') delete pod.containers[0].resources!.requests['ephemeral-storage'];
    if (fault === 'changed valid disk')
      pod.containers[0].resources!.limits['ephemeral-storage'] = '4Gi';
    if (fault === 'wrong role') pod.containers[0].name = 'foreign';
    if (fault === 'extra app') pod.containers.push(structuredClone(pod.containers[0]));
    if (fault === 'extra init') pod.initContainers = [{ name: 'foreign' }];
    if (fault === 'extra ephemeral') pod.ephemeralContainers = [{ name: 'foreign' }];
    if (fault === 'host path') {
      const host = pod.volumes.find((volume) => volume['hostPath'] !== undefined)!;
      host['hostPath'] = { path: '/foreign' };
    }
    if (fault === 'host overlay')
      pod.containers[0].volumeMounts.push({
        name: 'foreign',
        mountPath: owner === 'puni-backup/velero' ? '/host_pods' : '/var/log/pods',
      });
    if (fault === 'host mount')
      pod.containers[0].volumeMounts.find((mount) =>
        ['pod-logs', 'host-pods'].includes(String(mount['name'])),
      )!['mountPath'] = '/foreign';
    expect(() => {
      assertObservabilityAgentResources(
        source.releases.find((release) => release.owner === owner)!,
        indexed[owner][identity],
      );
    }).toThrow(/agent|common candidate/);
  });
}
test.each([
  'absent',
  'duplicate',
  'size',
  'unbounded extra',
  'foreign scratch identity',
  'wrong mount',
  'duplicate mount',
  'readonly mount',
  'mount propagation',
] as const)('Task66 rendered scratch refuses %s', async (fault) => {
  const { source, indexed } = await agentFixture();
  const manifest = parseDocument(
    JSON.stringify(indexed['puni-backup/velero']['DaemonSet:puni-backup:node-agent']),
  );
  const pod = ['spec', 'template', 'spec'];
  if (fault === 'absent') manifest.deleteIn([...pod, 'volumes', 2]);
  if (fault === 'duplicate')
    manifest.addIn([...pod, 'volumes'], { name: 'scratch', emptyDir: { sizeLimit: '1Gi' } });
  if (fault === 'size') manifest.setIn([...pod, 'volumes', 2, 'emptyDir', 'sizeLimit'], '2Gi');
  if (fault === 'foreign scratch identity')
    manifest.addIn([...pod, 'volumes'], { name: 'scratch', secret: { secretName: 'foreign' } });
  if (fault === 'unbounded extra')
    manifest.addIn([...pod, 'volumes'], { name: 'foreign', emptyDir: {} });
  if (fault === 'wrong mount')
    manifest.setIn([...pod, 'containers', 0, 'volumeMounts', 2, 'mountPath'], '/foreign');
  if (fault === 'duplicate mount')
    manifest.addIn([...pod, 'containers', 0, 'volumeMounts'], {
      name: 'scratch',
      mountPath: '/scratch',
    });
  if (fault === 'readonly mount')
    manifest.setIn([...pod, 'containers', 0, 'volumeMounts', 2, 'readOnly'], true);
  if (fault === 'mount propagation')
    manifest.setIn(
      [...pod, 'containers', 0, 'volumeMounts', 0, 'mountPropagation'],
      'Bidirectional',
    );
  indexed['puni-backup/velero']['DaemonSet:puni-backup:node-agent'] = type(
    'Record<string,unknown>',
  ).assert(manifest.toJSON());
  expect(() => {
    assertObservabilityAgentResources(
      source.releases[1],
      indexed['puni-backup/velero']['DaemonSet:puni-backup:node-agent'],
    );
  }).toThrow(/agent/);
});

test.each(['missing', 'duplicate'] as const)(
  'Task66 collector selected owner refuses %s',
  async (fault) => {
    const { source, indexed } = await agentFixture();
    if (fault === 'missing')
      source.releases = source.releases.filter(
        (release) => release.owner !== 'observability/otel-collector',
      );
    else source.releases.push(source.releases[0]);
    expect(() => {
      assertObservabilityCollectorResources(source, indexed);
    }).toThrow(/agent owner/);
  },
);

test('Task66 retained correspondence refuses an unsupported owner', async () => {
  const { source, indexed } = await agentFixture();
  expect(() => {
    assertObservabilityAgentResources(
      { ...source.releases[0], owner: 'foreign/collector' },
      indexed['observability/otel-collector']['DaemonSet:observability:otel-collector-agent'],
    );
  }).toThrow(/agent/);
});
