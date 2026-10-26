import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { type } from 'arktype';
import { parseDocument } from 'yaml';

import { readToolchain, type Toolchain } from './contracts';

/** Supported default Flux release identity; explicit target/release overrides refuse before invocation. */
export interface ObservabilityRenderRelease {
  owner: string;
  chart: keyof Toolchain['charts'];
  manifest: string;
}
const Release = type({
  metadata: { name: 'string>0', namespace: 'string>0' },
  spec: { chart: { spec: { chart: 'string>0', version: 'string>0' } }, values: 'object' },
});
function execute(helm: string, arguments_: string[]): string {
  const child = Bun.spawnSync([helm, ...arguments_], {
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  // Proof: failed-render dependency refusal becomes a test assertion failure when this guard is removed.
  if (child.exitCode !== 0) throw new Error('Pinned Helm command failed');
  return child.stdout.toString();
}

/** Pinned chart rendering only; the fixed Kubernetes capability version is a source fixture, never an observed server version. */
export async function renderObservabilityReleases(
  root: string,
  tools: string,
  releases: readonly ObservabilityRenderRelease[],
): Promise<Record<string, string>> {
  // Proof: removing owner uniqueness let the duplicate-owner production renderer negative overwrite its first output.
  if (
    new Set(releases.map((release) => release.owner)).size !== releases.length ||
    releases.length === 0
  )
    throw new Error('Render owner closure differs');
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const helm = join(resolve(tools), 'helm');
  // Proof: removing this comparison admits a wrong-version Helm dependency in the production renderer test.
  if (
    execute(helm, ['version', '--template', '{{.Version}}']).trim() !== lock.binaries.helm.version
  )
    throw new Error('Projection Helm version differs from lock');
  const directory = await mkdtemp(join(tmpdir(), 'observability-projection-'));
  try {
    const rendered: Record<string, string> = {};
    for (const release of releases) {
      const document = parseDocument(release.manifest);
      if (document.errors.length) throw new Error('Malformed release YAML');
      const manifest = Release.assert(document.toJSON());
      // Proof: removing this boundary let explicit releaseName and targetNamespace negatives render incorrect Flux identities.
      if (
        document.hasIn(['spec', 'releaseName']) ||
        document.hasIn(['spec', 'targetNamespace']) ||
        release.owner !== `${manifest.metadata.namespace}/${manifest.metadata.name}`
      )
        throw new Error('Unsupported release identity');
      const chart = resolve(root, manifest.spec.chart.spec.chart);
      const pin = lock.charts[release.chart];
      // Proof: replacing the pinned ECK archive bytes fails the renderer test; removing this guard admits that dependency.
      if (
        chart !== join(resolve(root), 'infra/platform/charts', basename(pin.url)) ||
        manifest.spec.chart.spec.version !== pin.version ||
        createHash('sha256')
          .update(await readFile(chart))
          .digest('hex') !== pin.sha256
      )
        throw new Error(`Projection chart differs from lock: ${release.owner}`);
      const values = join(directory, 'values.json');
      await writeFile(values, JSON.stringify(manifest.spec.values));
      rendered[release.owner] = execute(helm, [
        'template',
        manifest.metadata.name,
        chart,
        '--namespace',
        manifest.metadata.namespace,
        '--include-crds',
        '--kube-version',
        '1.35.0',
        '--values',
        values,
      ]);
    }
    return rendered;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
