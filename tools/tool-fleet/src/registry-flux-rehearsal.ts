import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readFluxConsumers } from './registry-flux-reader';
const rendererPath = process.argv.at(2);
const rendererSha256 = process.argv.at(3);
if (rendererPath === undefined || rendererSha256 === undefined)
  throw new Error('Usage: registry-flux-rehearsal.ts <kubectl-path> <sha256>');
const root = await mkdtemp('/tmp/task6-flux-');
const git = (...args: string[]) =>
  execFileSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
try {
  await mkdir(join(root, 'root'));
  await mkdir(join(root, 'child'));
  await writeFile(join(root, 'root/kustomization.yaml'), 'resources: [child.yaml]\n');
  const original = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: { name: 'child', namespace: 'flux-system' },
    spec: {
      path: './child',
      sourceRef: { kind: 'GitRepository', name: 'fixture' },
      images: [
        {
          name: 'registry.test/be',
          newName: 'registry.test/be',
          digest: `sha256:${'b'.repeat(64)}`,
        },
      ],
    },
  };
  await writeFile(join(root, 'root/child.yaml'), JSON.stringify(original));
  await writeFile(join(root, 'child/kustomization.yaml'), 'resources: [deployment.yaml]\n');
  await writeFile(
    join(root, 'child/deployment.yaml'),
    JSON.stringify({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'scaled-zero' },
      spec: {
        replicas: 0,
        template: {
          spec: {
            containers: [{ name: 'be', image: `registry.test/be@sha256:${'a'.repeat(64)}` }],
            initContainers: [
              { name: 'init', image: `registry.test/init@sha256:${'c'.repeat(64)}` },
            ],
          },
        },
      },
    }),
  );
  git('init', '-b', 'main');
  git('config', 'user.name', 'fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('remote', 'add', 'origin', 'https://fixture.invalid/source.git');
  git('add', '.');
  git('commit', '-qm', 'fixture');
  const configuration = {
    checkout: root,
    reference: 'refs/heads/main',
    origin: 'https://fixture.invalid/source.git',
    source: { name: 'fixture', namespace: 'flux-system' },
    roots: ['root'],
    registryUrl: 'https://registry.test',
    renderer: { path: rendererPath, sha256: rendererSha256 },
  };
  const inventory = await readFluxConsumers(configuration);
  if (
    !inventory.references.some(
      (ref) => ref.repository === 'be' && ref.digest === `sha256:${'b'.repeat(64)}`,
    )
  )
    throw new Error('effective child override missing');
  if (!inventory.references.some((ref) => ref.repository === 'init'))
    throw new Error('scaled-zero init missing');
  if (inventory.sourceRevision !== git('rev-parse', 'HEAD'))
    throw new Error('actual revision missing');
  console.log('native effective Flux reader PASS', inventory);
  const refuses = async (expected: string, input: unknown = configuration) => {
    const refusal = await readFluxConsumers(input).then(
      () => 'ACCEPTED',
      (cause: unknown) => String(cause),
    );
    if (!refusal.includes(expected)) throw new Error(`Expected ${expected}, observed ${refusal}`);
    console.log(`refusal ${expected}: ${refusal}`);
  };
  await writeFile(join(root, 'dirty'), 'untracked');
  await refuses('dirty');
  await rm(join(root, 'dirty'));
  await refuses('digest mismatch', {
    ...configuration,
    renderer: { ...configuration.renderer, sha256: '0'.repeat(64) },
  });
  const childPath = join(root, 'root/child.yaml');
  for (const [name, spec, expected] of [
    [
      'foreign',
      { ...original.spec, sourceRef: { kind: 'GitRepository', name: 'foreign' } },
      'Foreign Flux source',
    ],
    [
      'substitution',
      { ...original.spec, postBuild: { substitute: { IMAGE: 'foreign' } } },
      'Unsupported Flux transformation',
    ],
    ['missing', { ...original.spec, path: './absent' }, 'ENOENT'],
  ] as const) {
    await writeFile(childPath, JSON.stringify({ ...original, spec }));
    git('add', '.');
    git('commit', '-qm', name);
    await refuses(expected);
    await writeFile(childPath, JSON.stringify(original));
    git('add', '.');
    git('commit', '-qm', `restore-${name}`);
  }
  git('checkout', '--detach', 'HEAD~1');
  await refuses('stale');
  git('checkout', 'main');
  await writeFile(
    join(root, 'child/kustomization.yaml'),
    'resources: [https://example.invalid/remote]\n',
  );
  git('add', '.');
  git('commit', '-qm', 'remote');
  await refuses('External or malformed');
  console.log('native Flux reader negatives PASS');
} finally {
  await rm(root, { recursive: true });
}
