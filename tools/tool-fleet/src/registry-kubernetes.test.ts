import { readFile } from 'node:fs/promises';

import { expect, it } from 'bun:test';
import { parse } from 'yaml';

import { kubernetesImageReferences } from './registry-kubernetes';

const image = (letter: string) => `registry.test/wbs/backend@sha256:${letter.repeat(64)}`;
it('includes scaled-to-zero workload templates, jobs and every pod image field', () => {
  const pod = {
    containers: [{ name: 'backend', image: image('a') }],
    initContainers: [{ name: 'init', image: image('b') }],
    ephemeralContainers: [{ name: 'debug', image: image('c') }],
    volumes: [{ name: 'content', image: { reference: image('d') } }],
  };
  const references = kubernetesImageReferences([
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'zero' },
      spec: { replicas: 0, template: { spec: pod } },
    },
    {
      apiVersion: 'batch/v1',
      kind: 'CronJob',
      metadata: { name: 'nightly' },
      spec: {
        jobTemplate: {
          spec: { template: { spec: { containers: [{ name: 'backup', image: image('e') }] } } },
        },
      },
    },
    {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name: 'finished' },
      spec: { template: { spec: { containers: [{ name: 'job', image: image('f') }] } } },
    },
  ]);
  expect(references.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'].map(image));
});
it('refuses unknown resource selectors and incomplete workload pod templates', () => {
  expect(() =>
    kubernetesImageReferences([
      {
        apiVersion: 'foreign/v1',
        kind: 'ImageRunner',
        metadata: { name: 'foreign' },
        spec: { image: image('a') },
      },
    ]),
  ).toThrow('Unknown');
  expect(() =>
    kubernetesImageReferences([
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'missing' },
        spec: { replicas: 0 },
      },
    ]),
  ).toThrow();
  expect(() =>
    kubernetesImageReferences([
      {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: 'missing' },
        spec: { containers: [{ name: 'missing' }] },
      },
    ]),
  ).toThrow();
});

it('refuses Helm value and render overrides or a substituted chart behind a known release name', async () => {
  const release = parse(
    await readFile(
      new URL('../../../infra/platform/networking/traefik.yaml', import.meta.url),
      'utf8',
    ),
  ) as { spec: Record<string, unknown> };
  expect(kubernetesImageReferences([release])).toHaveLength(1);
  for (const extra of [
    { valuesFrom: [{ kind: 'ConfigMap', name: 'images' }] },
    { postRenderers: [{ kustomize: { images: [{ name: 'traefik', newName: 'foreign' }] } }] },
    { chartRef: { kind: 'OCIRepository', name: 'foreign' } },
    {
      chart: {
        spec: {
          chart: 'foreign',
          version: '1',
          sourceRef: { kind: 'HelmRepository', name: 'foreign' },
        },
      },
    },
  ]) {
    expect(() =>
      kubernetesImageReferences([{ ...release, spec: { ...release.spec, ...extra } }]),
    ).toThrow('Helm');
  }
});
