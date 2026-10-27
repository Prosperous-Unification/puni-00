import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { type } from 'arktype';
import { parseAllDocuments, parseDocument } from 'yaml';

import type { Toolchain } from './contracts';
import { readObjectStoreLock } from './object-store-image';
import { decodeRenderedResources } from './rendered-resources';

const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const rehearsalBootstrapPaths = {
  flux: 'infra/platform/flux/install.yaml',
  topology: 'infra/local/platform.k3d.yaml',
  objectStore: 'infra/versions/object-store.json',
  policy: 'infra/platform/policy',
  retainedPolicy: 'infra/rehearsal/bootstrap/policy',
} as const;
/** Selected Git input coordinates are distinct from the packet's generated artifact coordinates. */
export interface RehearsalSource {
  readonly sourcePath: string;
  readonly artifactPath: string;
  readonly sha256: string;
}
function documents(bytes: string) {
  return parseAllDocuments(bytes)
    .map((document) => {
      if (document.errors.length) throw new Error('Rehearsal malformed YAML');
      return document;
    })
    .filter((document) => document.toJSON() !== null);
}
/** One collector serves stage inputs and relocated original bootstrap policy, before export deletion. */
export function createRehearsalCollector(exported: string, files: Map<string, Buffer>) {
  const visited = new Set<string>();
  const sources = new Map<string, RehearsalSource>();
  async function collect(
    path: string,
    relocation?: { source: string; artifact: string },
  ): Promise<void> {
    path = relative(exported, resolve(exported, path));
    if (!path.startsWith('infra/')) throw new Error('Rehearsal source path escapes infra');
    // Proof: Task25c2b policy-relocation-escape removal admitted the escaped original-policy reference.
    if (
      relocation !== undefined &&
      path !== relocation.source &&
      !path.startsWith(`${relocation.source}/`)
    )
      throw new Error('Rehearsal bootstrap policy reference escapes source');
    const artifactPath =
      relocation === undefined ? path : relocation.artifact + path.slice(relocation.source.length);
    if (visited.has(artifactPath)) return;
    visited.add(artifactPath);
    const generatedDirectory = relocation === undefined && files.has(`${path}/kustomization.yaml`);
    // Proof: Task25c2b original-policy substitution lost the independently retained source Namespace.
    const generated = relocation === undefined ? files.get(path) : undefined;
    const status =
      generated !== undefined || generatedDirectory ? undefined : await lstat(join(exported, path));
    if (status?.isSymbolicLink()) throw new Error('Rehearsal source symbolic file refused');
    if (generatedDirectory || status?.isDirectory()) {
      await collect(`${path}/kustomization.yaml`, relocation);
      return;
    }
    const bytes = generated ?? (await readFile(join(exported, path)));
    files.set(artifactPath, bytes);
    if (generated === undefined)
      sources.set(artifactPath, { sourcePath: path, artifactPath, sha256: hash(bytes) });
    if (!path.endsWith('.yaml')) return;
    for (const document of documents(bytes.toString())) {
      if (document.get('kind') === 'HelmRelease') {
        const chart = type('string').assert(document.getIn(['spec', 'chart', 'spec', 'chart']));
        await collect(chart, relocation);
      }
      if (
        document.get('kind') !== 'Kustomization' ||
        document.get('apiVersion') !== 'kustomize.config.k8s.io/v1beta1'
      )
        continue;
      const kustomization = type({
        resources: 'string[]',
        'configMapGenerator?': type({ files: 'string[]' }).array(),
      }).assert(document.toJSON());
      for (const resource of kustomization.resources)
        await collect(join(dirname(path), resource), relocation);
      for (const generator of kustomization.configMapGenerator ?? [])
        for (const filename of generator.files)
          await collect(join(dirname(path), filename.split('=').at(-1) ?? filename), relocation);
    }
  }
  return { collect, sources };
}
/** Capture the actual bootstrap input closure through the same recursive source collector. */
export async function collectRehearsalBootstrap(
  collector: ReturnType<typeof createRehearsalCollector>,
) {
  const paths = rehearsalBootstrapPaths;
  // Proof: Task25c2b collect-flux/topology/objectStore/policy omissions each failed the retained-input positive.
  await collector.collect(paths.flux);
  await collector.collect(paths.topology);
  await collector.collect(paths.objectStore);
  await collector.collect(paths.policy, { source: paths.policy, artifact: paths.retainedPolicy });
}
const Topology = type({
  apiVersion: "'k3d.io/v1alpha5'",
  kind: "'Simple'",
  metadata: { name: 'string>0' },
  servers: 'number.integer >= 0',
  agents: 'number.integer >= 0',
  image: 'string>0',
  network: 'string>0',
  kubeAPI: 'Record<string,unknown>',
  ports: 'unknown[]',
  volumes: 'unknown[]',
  registries: 'Record<string,unknown>',
  options: {
    k3d: 'Record<string,unknown>',
    k3s: 'Record<string,unknown>',
    kubeconfig: 'Record<string,unknown>',
    runtime: 'Record<string,unknown>',
  },
});
/** Read only retained packet inputs. Hash/lock closure precedes decoding; no runner-root fallback exists. */
export async function readRehearsalBootstrap(
  directory: string,
  sources: readonly RehearsalSource[],
  lock: Toolchain,
) {
  const paths = rehearsalBootstrapPaths;
  // Proof: Task25c2b source-closure removal lost the omitted-coordinate refusal.
  if (
    new Set(sources.map((source) => source.artifactPath)).size !== sources.length ||
    ![
      paths.flux,
      paths.topology,
      paths.objectStore,
      `${paths.retainedPolicy}/kustomization.yaml`,
    ].every((path) => sources.some((source) => source.artifactPath === path))
  )
    throw new Error('Rehearsal bootstrap source closure differs');
  const files = new Map<string, string>();
  for (const source of sources) {
    const expectedSource = source.artifactPath.startsWith(`${paths.retainedPolicy}/`)
      ? paths.policy + source.artifactPath.slice(paths.retainedPolicy.length)
      : source.artifactPath;
    // Proof: Task25c2b source-coordinate removal admitted a forged original input coordinate.
    if (source.sourcePath !== expectedSource)
      throw new Error('Rehearsal bootstrap source coordinates differ');
    // Proof: Task25c2b source-read substitution lost ENOENT/EACCES distinctions for all four required input classes.
    const bytes = await readFile(join(directory, source.artifactPath));
    // Proof: Task25c2b source-hash removal lost the independent retained-byte drift refusal.
    if (hash(bytes) !== source.sha256) throw new Error('Rehearsal bootstrap source hash differs');
    files.set(source.artifactPath, bytes.toString());
  }
  const flux = type('string>0').assert(files.get(paths.flux));
  // Proof: Task25c2b flux-lock removal admitted a wrong manifest lock with otherwise consistent bytes.
  if (hash(flux) !== lock.manifests.fluxInstall.sha256)
    throw new Error('Rehearsal Flux manifest lock differs');
  // Proof: Task25c2b flux-decoder omission admitted coherently hashed malformed Flux YAML.
  decodeRenderedResources(flux);
  const declaration = parseDocument(type('string>0').assert(files.get(paths.topology)));
  // Proof: Task25c2b topology-yaml omission admitted duplicate keys in a structurally valid declaration.
  if (declaration.errors.length) throw new Error('Rehearsal malformed topology');
  // Proof: Task25c2b topology-schema bypass admitted a nonnumeric server declaration.
  const topology = Topology.assert(declaration.toJSON());
  // Proof: Task25c2b memory-option removal admitted the forbidden serversMemory option.
  if (Object.keys(topology.options.k3d).some((name) => /memory|disableImageVolume/i.test(name)))
    throw new Error('Rehearsal unsupported k3d resource configuration');
  // Proof: Task25c2b object-lock-reader bypass admitted an empty coherently hashed object-store lock.
  const objectStore = await readObjectStoreLock(
    join(directory, paths.objectStore),
    lock.runtimeImages.objectStore,
  );
  return { sources, flux, topology, objectStore };
}

/** A bootstrap application has source coordinates and its own build, never an invented Flux stage. */
export interface RehearsalBootstrapBuild {
  readonly bootstrap: 'flux' | 'policy';
  readonly sourcePath: string;
  readonly path: string;
  readonly sources: readonly RehearsalSource[];
  readonly bytes: string;
  readonly sha256: string;
}
/** Preserve original policy build and locked native Flux bytes as independently decoded frames. */
export function buildRehearsalBootstrap(
  bootstrap: Awaited<ReturnType<typeof readRehearsalBootstrap>>,
  policyBytes: string,
): RehearsalBootstrapBuild[] {
  const paths = rehearsalBootstrapPaths;
  return [
    {
      bootstrap: 'flux',
      sourcePath: paths.flux,
      path: paths.flux,
      sources: bootstrap.sources.filter((source) => source.artifactPath === paths.flux),
      bytes: bootstrap.flux,
      sha256: hash(bootstrap.flux),
    },
    {
      bootstrap: 'policy',
      sourcePath: paths.policy,
      path: paths.retainedPolicy,
      sources: bootstrap.sources.filter((source) =>
        source.artifactPath.startsWith(`${paths.retainedPolicy}/`),
      ),
      bytes: policyBytes,
      sha256: hash(policyBytes),
    },
  ];
}
