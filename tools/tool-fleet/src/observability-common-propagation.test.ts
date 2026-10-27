import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { type ObservabilitySourceIndex } from './observability-source-render';
import { assertObservabilityExporterResources } from './observability-source-resources';

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
