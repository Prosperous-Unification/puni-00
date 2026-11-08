import { execFileSync } from 'node:child_process';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { readToolchain } from './contracts';
import { provisionObservabilityTools } from './observability-tools.fixture';
import { readFluxConsumers } from './registry-flux-reader';

const tools = await provisionObservabilityTools();
const rendererPath = await realpath(join(tools, 'kubectl'));
const lock = await readToolchain(join(import.meta.dir, '../../../infra/versions/toolchain.json'));
const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
async function fixture(transform: Record<string, unknown> = {}) {
  const checkout = await scratchAsync('registry-flux-transform-');
  for (const directory of ['root', 'child', 'component']) await mkdir(join(checkout, directory));
  await writeFile(join(checkout, 'root/kustomization.yaml'), 'resources: [child.yaml]\n');
  await writeFile(
    join(checkout, 'root/child.yaml'),
    JSON.stringify({
      apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
      kind: 'Kustomization',
      metadata: { name: 'child', namespace: 'flux-system' },
      spec: {
        path: './child',
        sourceRef: { kind: 'GitRepository', name: 'fixture' },
        interval: '1m',
        prune: true,
        retryInterval: '1m',
        timeout: '30s',
        deletionPolicy: 'Orphan',
        dependsOn: [{ name: 'dependency' }],
        force: false,
        healthCheckExprs: [{ apiVersion: 'apps/v1', kind: 'Deployment', current: 'true' }],
        healthChecks: [{ kind: 'Deployment', name: 'dependency' }],
        serviceAccountName: 'reader',
        suspend: false,
        wait: true,
        images: [{ name: 'registry.test/be', digest: digest('b') }],
        patches: [
          {
            target: { kind: 'Deployment', name: 'scaled-zero' },
            patch: JSON.stringify([
              {
                op: 'replace',
                path: '/spec/template/spec/initContainers/0/image',
                value: `registry.test/init@${digest('d')}`,
              },
            ]),
          },
        ],
        ...transform,
      },
    }),
  );
  await writeFile(join(checkout, 'child/kustomization.yaml'), 'resources: [deployment.yaml]\n');
  await writeFile(
    join(checkout, 'child/deployment.yaml'),
    JSON.stringify({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'scaled-zero' },
      spec: {
        replicas: 0,
        template: {
          spec: {
            containers: [{ name: 'be', image: `registry.test/be@${digest('a')}` }],
            initContainers: [{ name: 'init', image: `registry.test/init@${digest('c')}` }],
          },
        },
      },
    }),
  );
  await writeFile(
    join(checkout, 'component/kustomization.yaml'),
    'apiVersion: kustomize.config.k8s.io/v1alpha1\nkind: Component\nresources: [pod.yaml]\n',
  );
  await writeFile(
    join(checkout, 'component/pod.yaml'),
    JSON.stringify({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'component-consumer' },
      spec: { containers: [{ name: 'extra', image: `registry.test/extra@${digest('e')}` }] },
    }),
  );
  const git = (...argv: string[]) =>
    execFileSync('/usr/bin/git', ['-C', checkout, ...argv], { encoding: 'utf8' }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('remote', 'add', 'origin', 'https://fixture.invalid/source.git');
  git('add', '.');
  git('commit', '-qm', 'fixture');
  return {
    checkout,
    reference: 'refs/heads/main',
    origin: 'https://fixture.invalid/source.git',
    source: { name: 'fixture', namespace: 'flux-system' },
    roots: ['root'],
    registryUrl: 'https://registry.test',
    renderer: { path: rendererPath, sha256: lock.binaries.kubectl.sha256 },
  };
}

test('Flux inventory preserves supported images and patches and operational scheduling fields', async () => {
  const inventory = await readFluxConsumers(await fixture());
  expect(inventory.references).toEqual([
    { repository: 'be', digest: digest('b') },
    { repository: 'init', digest: digest('d') },
  ]);
});
for (const [field, value] of Object.entries({
  components: ['../component'],
  ignoreMissingComponents: true,
  namePrefix: 'changed-',
  nameSuffix: '-changed',
  commonMetadata: { labels: { changed: 'true' } },
  buildMetadata: ['transformerAnnotations'],
  targetNamespace: 'foreign-source',
  ignore: [{ paths: ['/spec/template/spec/containers/0/image'] }],
  postBuild: { substitute: { IMAGE: 'foreign' } },
  decryption: { provider: 'sops' },
  kubeConfig: { secretRef: { name: 'foreign' } },
  unknownFutureTransform: { images: [] },
})) {
  test('Flux inventory refuses unsupported child field ' + field, async () => {
    const observed = await readFluxConsumers(await fixture({ [field]: value })).then(
      () => 'ACCEPTED',
      (cause: unknown) => String(cause),
    );
    expect(observed).toContain('Unsupported Flux transformation');
  });
}
