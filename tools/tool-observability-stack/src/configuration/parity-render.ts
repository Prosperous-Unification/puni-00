import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { type } from 'arktype';
import { parseAllDocuments } from 'yaml';

import { type ParityInput, parseParityInput } from './parity';

const Lock = type({
  binaries: { kubectl: { version: 'string', sha256: 'string' }, helm: { version: 'string' } },
  charts: { '[string]': { version: 'string', sha256: 'string', url: 'string' } },
});
const Release = type({
  kind: "'HelmRelease'",
  metadata: { name: 'string', namespace: 'string' },
  spec: {
    chart: { spec: { chart: 'string', version: 'string' } },
    values: 'Record<string, unknown>',
  },
});

/** The explicit tool directory is required. Every process is bounded, checked and free of shell interpolation. */
function execute(path: string, arguments_: string[]): string {
  const child = Bun.spawnSync([path, ...arguments_], {
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  // Proof: missing renderer tool, wrong-version and failed-render CLI negatives exercise process failure instead of a skipped comparison.
  if (child.exitCode !== 0)
    throw new Error(
      `renderer tool failed: ${path} ${arguments_.join(' ')}: ${child.stderr.toString()}`,
    );
  return child.stdout.toString();
}
/** Renders current Kustomize overlays and every HelmRelease with locked tools/charts. Temporary values never contain resolved Secret contents. */
export async function renderParityInput(rootPath: string, toolsPath: string): Promise<ParityInput> {
  const root = resolve(rootPath),
    tools = resolve(toolsPath);
  const lockText = await readFile(join(root, 'infra/versions/toolchain.json'), 'utf8');
  let lock: typeof Lock.infer;
  try {
    // Proof: bypassing this schema loses the malformed-lock required-field/type CLI diagnostics; malformed JSON also refuses here.
    lock = Lock.assert(JSON.parse(lockText));
  } catch (failure) {
    throw new Error('malformed renderer lock', { cause: failure });
  }
  const kubectl = join(tools, 'kubectl'),
    helm = join(tools, 'helm');
  let kubectlBytes: Buffer;
  try {
    kubectlBytes = await readFile(kubectl);
  } catch (failure) {
    throw new Error(`renderer tool unreadable: ${kubectl}`, { cause: failure });
  }
  // Proof: executable-hash negative rejects a replaced kubectl even when it advertises the expected version.
  if (createHash('sha256').update(kubectlBytes).digest('hex') !== lock.binaries.kubectl.sha256)
    throw new Error('renderer tool kubectl hash differs');
  const version = type({ clientVersion: { gitVersion: 'string' } }).assert(
    JSON.parse(execute(kubectl, ['version', '--client', '-o', 'json'])),
  );
  // Proof: removing either version comparison loses its independently controlled kubectl/Helm CLI negative.
  if (
    version.clientVersion.gitVersion !== lock.binaries.kubectl.version ||
    execute(helm, ['version', '--template', '{{.Version}}']).trim() !== lock.binaries.helm.version
  )
    throw new Error('renderer tool version differs');
  const directory = await mkdtemp(join(tmpdir(), 'observability-parity-render-'));
  try {
    const candidates: ParityInput['candidates'] = {
      local: { rendered: '', effective: {} },
      production: { rendered: '', effective: {} },
    };
    for (const environment of ['local', 'production'] as const) {
      const rendered = execute(kubectl, [
        'kustomize',
        join(root, 'infra/platform/observability', environment),
      ]);
      const effective: Record<string, string> = {};
      for (const document of parseAllDocuments(rendered)) {
        if (document.errors.length) throw new Error('malformed Kustomize output');
        const manifest: unknown = document.toJSON();
        if (type({ kind: 'string' }).assert(manifest).kind !== 'HelmRelease') continue;
        const release = Release.assert(manifest);
        const chart = resolve(root, release.spec.chart.spec.chart);
        const pins = Object.values(lock.charts).filter(
          (pin) => basename(pin.url) === basename(chart),
        );
        // Proof: chart-path/version/hash CLI negatives reject untrusted render inputs before Helm is invoked.
        if (
          !chart.startsWith(join(root, 'infra/platform/charts') + '/') ||
          pins.length !== 1 ||
          pins[0].version !== release.spec.chart.spec.version
        )
          throw new Error(`renderer chart identity differs: ${release.metadata.name}`);
        if (
          createHash('sha256')
            .update(await readFile(chart))
            .digest('hex') !== pins[0].sha256
        )
          throw new Error(`renderer chart hash differs: ${release.metadata.name}`);
        const values = join(directory, `${environment}-${release.metadata.name}.json`);
        await writeFile(values, JSON.stringify(release.spec.values));
        // Proof: removing this guard loses the duplicate-HelmRelease CLI diagnostic before semantic comparison.
        if (Object.hasOwn(effective, release.metadata.name))
          throw new Error('duplicate rendered HelmRelease');
        effective[release.metadata.name] = execute(helm, [
          'template',
          release.metadata.name,
          chart,
          '--namespace',
          release.metadata.namespace,
          '--include-crds',
          '--values',
          values,
        ]);
      }
      candidates[environment] = { rendered, effective };
    }
    const differences: unknown = JSON.parse(
      await readFile(join(import.meta.dir, 'reviewed-differences.json'), 'utf8'),
    );
    return parseParityInput(JSON.stringify({ candidates, differences }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
