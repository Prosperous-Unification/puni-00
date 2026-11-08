import { createHash } from 'node:crypto';
import { chmod, lstat, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { type } from 'arktype';
import { parseAllDocuments } from 'yaml';

import { kubernetesImageReferences } from './registry-kubernetes';
import { runRegistryProcess } from './registry-process';
import { managedImageReferences, serveRegistryReader } from './registry-reader';
import { readRegistrySource } from './registry-source';

const Text = type('string > 0');
const Input = type({
  checkout: Text.narrow(isAbsolute),
  reference: /^refs\/(heads|remotes)\/[a-zA-Z0-9._/-]+$/,
  origin: Text,
  source: { name: Text, namespace: Text, '+': 'reject' },
  roots: Text.array().atLeastLength(1),
  registryUrl: Text,
  renderer: { path: Text.narrow(isAbsolute), sha256: /^[0-9a-f]{64}$/, '+': 'reject' },
  '+': 'reject',
});
const Resource = type({
  apiVersion: Text,
  kind: Text,
  metadata: { name: Text, 'namespace?': Text },
  'spec?': 'unknown',
});
/** Only images and patches alter this reader's child build. Scheduling, apply and health
 * settings remain opaque because they do not change the desired resource/image closure.
 * All other fields, including future transforms, refuse completeness rather than disappearing.
 */
const Flux = type({
  path: Text,
  sourceRef: { kind: "'GitRepository'", name: Text, 'namespace?': Text },
  'images?': type({
    name: Text,
    'newName?': Text,
    'newTag?': Text,
    'digest?': Text,
    '+': 'reject',
  }).array(),
  'patches?': type({
    patch: Text,
    'target?': {
      'group?': Text,
      'version?': Text,
      'kind?': Text,
      'name?': Text,
      'namespace?': Text,
      'labelSelector?': Text,
      'annotationSelector?': Text,
      '+': 'reject',
    },
    '+': 'reject',
  }).array(),
  'postBuild?': 'unknown',
  'decryption?': 'unknown',
  'kubeConfig?': 'unknown',
  'interval?': 'unknown',
  'retryInterval?': 'unknown',
  'timeout?': 'unknown',
  'prune?': 'unknown',
  'deletionPolicy?': 'unknown',
  'dependsOn?': 'unknown',
  'force?': 'unknown',
  'healthCheckExprs?': 'unknown',
  'healthChecks?': 'unknown',
  'serviceAccountName?': 'unknown',
  'suspend?': 'unknown',
  'wait?': 'unknown',
  // Proof: removing this exact-field boundary lets actual-reader components, namespace/name/metadata transforms, drift-ignore and unknown-field negatives resolve with incomplete inventory.
  '+': 'reject',
});
const kustomizationKeys = new Set([
  'apiVersion',
  'kind',
  'resources',
  'bases',
  'components',
  'namespace',
  'namePrefix',
  'nameSuffix',
  'commonLabels',
  'labels',
  'commonAnnotations',
  'images',
  'replicas',
  'patches',
  'patchesStrategicMerge',
  'patchesJson6902',
  'configMapGenerator',
  'secretGenerator',
  'generatorOptions',
]);

function object(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error('Malformed source object');
  // Boundary: external YAML object fields remain unknown until their owning decoder validates them.
  return input as Record<string, unknown>;
}
function documents(text: string): unknown[] {
  return parseAllDocuments(text).map((document) => {
    if (document.errors.length) throw new Error('Malformed source YAML');
    return document.toJS() as unknown;
  });
}

/**
 * Read effective desired images from a clean checkout at its registered ref. Every renderer input
 * stays inside that tracked source. Same-source Flux children receive their image/patch transforms;
 * unsupported child fields (including components, name/metadata/namespace transforms and drift-ignore),
 * substitutions, decryption, foreign sources and execution plugins refuse completeness.
 */
export async function readFluxConsumers(input: unknown) {
  const configuration = Input(input);
  if (configuration instanceof type.errors) throw new Error('Malformed Flux reader configuration');
  const checkout = await realpath(configuration.checkout);
  if (checkout !== configuration.checkout) throw new Error('Flux checkout is not canonical');
  const git = (...argv: string[]) =>
    runRegistryProcess(['/usr/bin/git', '-C', checkout, ...argv], checkout);
  const assertCheckout = async () => {
    if ((await git('status', '--porcelain', '--untracked-files=all')).trim() !== '')
      throw new Error('Flux checkout is dirty');
    if ((await git('remote', 'get-url', 'origin')).trim() !== configuration.origin)
      throw new Error('Flux source origin differs');
    const head = (await git('rev-parse', '--verify', 'HEAD^{commit}')).trim();
    if (
      !/^[0-9a-f]{40}$/.test(head) ||
      head !== (await git('rev-parse', '--verify', `${configuration.reference}^{commit}`)).trim()
    )
      throw new Error('Flux checkout is stale or not at registered revision');
    return head;
  };
  const sourceRevision = await assertCheckout();
  const executable = await readRegistrySource(configuration.renderer.path, 128 * 1024 ** 2);
  if (createHash('sha256').update(executable.bytes).digest('hex') !== configuration.renderer.sha256)
    throw new Error('Flux renderer artifact digest mismatch');
  const scratch = await mkdtemp(join(tmpdir(), 'registry-flux-'));
  try {
    const renderer = join(scratch, 'kubectl');
    await writeFile(renderer, executable.bytes, { mode: 0o700 });
    await chmod(renderer, 0o700);
    const checked = new Set<string>();
    const checking = new Set<string>();
    const inside = async (path: string) => {
      const canonical = await realpath(path);
      const scoped = relative(checkout, canonical);
      if (canonical !== path || scoped === '..' || scoped.startsWith('../') || isAbsolute(scoped))
        throw new Error('Renderer input escapes configured source');
      return canonical;
    };
    const inputFile = async (path: string) => {
      await inside(path);
      await git('ls-files', '--error-unmatch', '--', relative(checkout, path));
      return readRegistrySource(path);
    };
    const local = (base: string, path: unknown) => {
      if (typeof path !== 'string' || path.length === 0 || isAbsolute(path) || /[?:#]/.test(path))
        throw new Error('External or malformed renderer input');
      return resolve(base, path);
    };
    const validate = async (path: string): Promise<void> => {
      await inside(path);
      if (checked.has(path)) return;
      if (checking.has(path)) throw new Error('Cyclic renderer source');
      checking.add(path);
      if ((await lstat(path)).isDirectory()) {
        const choices: string[] = [];
        for (const name of ['kustomization.yaml', 'kustomization.yml', 'Kustomization']) {
          try {
            await lstat(join(path, name));
            choices.push(join(path, name));
          } catch (cause) {
            if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'))
              throw cause;
          }
        }
        if (choices.length !== 1) throw new Error('Missing or ambiguous source kustomization');
        const parsed = documents((await inputFile(choices[0])).text);
        if (parsed.length !== 1) throw new Error('Malformed source kustomization');
        const manifest = object(parsed[0]);
        if (Object.keys(manifest).some((key) => !kustomizationKeys.has(key)))
          throw new Error('Unsupported external renderer input or plugin');
        for (const key of ['resources', 'bases', 'components']) {
          const paths = manifest[key];
          if (paths === undefined) continue;
          if (!Array.isArray(paths)) throw new Error('Malformed renderer resources');
          for (const child of paths) await validate(local(path, child));
        }
        for (const key of ['patches', 'patchesJson6902', 'patchesStrategicMerge']) {
          const patches = manifest[key];
          if (patches === undefined) continue;
          if (!Array.isArray(patches)) throw new Error('Malformed renderer patches');
          for (const patch of patches) {
            if (typeof patch === 'string') {
              if (!patch.includes('\n')) await inputFile(local(path, patch));
            } else {
              const fields = object(patch);
              if (fields['path'] !== undefined) await inputFile(local(path, fields['path']));
            }
          }
        }
        for (const key of ['configMapGenerator', 'secretGenerator']) {
          const generators = manifest[key];
          if (generators === undefined) continue;
          if (!Array.isArray(generators)) throw new Error('Malformed built-in generator');
          for (const generator of generators) {
            const fields = object(generator);
            for (const key of ['files', 'envs']) {
              const paths = fields[key];
              if (paths === undefined) continue;
              if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string'))
                throw new Error('Malformed generator source');
              for (const child of paths) {
                if (typeof child !== 'string') throw new Error('Malformed generator path');
                await inputFile(
                  local(path, key === 'files' ? child.slice(child.indexOf('=') + 1) : child),
                );
              }
            }
            if (fields['env'] !== undefined)
              throw new Error('Unsupported legacy external generator input');
          }
        }
      } else await inputFile(path);
      checking.delete(path);
      checked.add(path);
    };
    let transformIndex = 0;
    const images: string[] = [];
    const visiting = new Set<string>();
    const visit = async (path: string, transforms?: typeof Flux.infer): Promise<void> => {
      if (visiting.has(path)) throw new Error('Cyclic Flux source traversal');
      visiting.add(path);
      await validate(path);
      let rendered = await runRegistryProcess([renderer, 'kustomize', path], scratch);
      if (
        transforms !== undefined &&
        (transforms.images !== undefined || transforms.patches !== undefined)
      ) {
        const base = join(scratch, `effective-${String(transformIndex++)}.json`);
        await writeFile(
          base,
          JSON.stringify({ apiVersion: 'v1', kind: 'List', items: documents(rendered) }),
        );
        await writeFile(
          join(scratch, 'kustomization.yaml'),
          JSON.stringify({
            apiVersion: 'kustomize.config.k8s.io/v1beta1',
            kind: 'Kustomization',
            resources: [relative(scratch, base)],
            images: transforms.images,
            patches: transforms.patches,
          }),
        );
        rendered = await runRegistryProcess([renderer, 'kustomize', scratch], scratch);
      }
      for (const raw of documents(rendered)) {
        const resource = Resource(raw);
        if (resource instanceof type.errors) throw new Error('Malformed rendered source resource');
        if (
          resource.apiVersion === 'kustomize.toolkit.fluxcd.io/v1' &&
          resource.kind === 'Kustomization'
        ) {
          const child = Flux(resource.spec);
          if (
            child instanceof type.errors ||
            child.postBuild !== undefined ||
            child.decryption !== undefined ||
            child.kubeConfig !== undefined
          )
            throw new Error('Unsupported Flux transformation or malformed child');
          if (
            child.sourceRef.name !== configuration.source.name ||
            (child.sourceRef.namespace ?? resource.metadata.namespace ?? 'default') !==
              configuration.source.namespace
          )
            throw new Error('Foreign Flux source requires its own registered adapter');
          await visit(local(checkout, child.path), child);
        } else images.push(...kubernetesImageReferences([raw]));
      }
      visiting.delete(path);
    };
    for (const root of configuration.roots) await visit(local(checkout, root));
    if ((await assertCheckout()) !== sourceRevision)
      throw new Error('Flux source changed during inventory');
    return {
      sourceRevision,
      references: managedImageReferences(images, configuration.registryUrl),
    };
  } finally {
    await rm(scratch, { recursive: true });
  }
}

if (import.meta.main) await serveRegistryReader(readFluxConsumers);
