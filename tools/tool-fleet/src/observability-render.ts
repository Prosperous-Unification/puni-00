import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parseDocument, stringify } from 'yaml';

import { runChecked } from './check-cli';
import { authenticatePreparedHelm, authenticatePreparedKubectl } from './check-provision';
import { readToolchain, type Toolchain } from './contracts';
import {
  assertVeleroCandidate,
  PlatformHelmRelease,
  readVeleroImageReferences,
} from './platform-releases';
import { assertVeleroVolumes, readVeleroPatch, veleroPatchTarget } from './platform-velero-patch';
import { decodeRenderedResources } from './rendered-resources';

/** Supported default Flux release identity; explicit target/release overrides refuse before invocation. */
export interface ObservabilityRenderRelease {
  owner: string;
  chart: keyof Toolchain['charts'];
  manifest: string;
}
/** Fixed Helm source-fixture capabilities; this never describes an observed API server. */
export const observabilityRenderCapabilities = {
  kubernetesVersion: '1.35.0',
  observed: false,
} as const;
const Release = type({
  metadata: { name: 'string>0', namespace: 'string>0' },
  spec: {
    chart: { spec: { chart: 'string>0', version: 'string>0' } },
    values: 'object',
    'postRenderers?': 'unknown',
  },
});
function execute(helm: string, arguments_: string[]): string {
  const child = Bun.spawnSync([helm, ...arguments_], {
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  // Proof: failed-render dependency refusal becomes a test assertion failure when this guard is removed.
  if (child.exitCode !== 0)
    throw new Error(`Pinned ${basename(helm) === 'helm' ? 'Helm' : 'kubectl'} command failed`);
  return child.stdout.toString();
}

/** Pinned chart rendering only; the fixed Kubernetes capability version is a source fixture, never an observed server version. */
export async function renderAuthenticatedObservabilityReleases(
  root: string,
  tools: string,
  releases: readonly ObservabilityRenderRelease[],
  helmArchive?: string,
) {
  // Proof: removing owner uniqueness let the duplicate-owner production renderer negative overwrite its first output.
  if (
    new Set(releases.map((release) => release.owner)).size !== releases.length ||
    releases.length === 0
  )
    throw new Error('Render owner closure differs');
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  // Proof: Task25c3d helm-auth-call omission lost direct selected-archive and same-version substitute refusals.
  const helmIdentity = await authenticatePreparedHelm(root, tools, runChecked, helmArchive);
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
      // Proof: Task25c3d chart-integrity bypass admitted a substituted Velero archive in the direct renderer.
      // Earlier ECK archive substitution exercises the same unchanged pin boundary.
      if (
        chart !== join(resolve(root), 'infra/platform/charts', basename(pin.url)) ||
        manifest.spec.chart.spec.version !== pin.version ||
        createHash('sha256')
          .update(await readFile(chart))
          .digest('hex') !== pin.sha256
      )
        throw new Error(`Projection chart differs from lock: ${release.owner}`);
      let patch: ReturnType<typeof readVeleroPatch> | undefined;
      if (release.chart === 'velero') {
        // Proof: Task25c3d direct-source-schema weakening admitted a foreign Git sourceRef.
        const declaration = PlatformHelmRelease.assert(document.toJSON());
        // Proof: Task25c3d direct-namespace removal admitted a foreign owner/namespace pair.
        if (
          declaration.metadata.name !== 'velero' ||
          declaration.metadata.namespace !== 'puni-backup'
        )
          throw new Error('Unsupported Velero release identity');
        const references: Readonly<Record<string, string>> = readVeleroImageReferences(
          declaration.spec.values,
        );
        // Proof: Task25c3d direct-image-pins removal admitted a changed AWS plugin reference.
        if (
          !isDeepStrictEqual(
            Object.keys(references).sort(),
            pin.images.map((image) => image.role).sort(),
          ) ||
          pin.images.some((image) => references[image.role] !== `${image.name}@${image.digest}`)
        )
          throw new Error('Velero image references differ from lock');
        // Proof: Task25c3d direct-candidate omission admitted absent plugin resources.
        assertVeleroCandidate(declaration.spec.values);
        // Proof: Task25c3d direct-patch omission silently accepted missing policy.
        patch = readVeleroPatch(declaration.spec.postRenderers);
        // Proof: Task25c3d direct-other-policy removal admitted a post-renderer on Traefik.
      } else if (Object.hasOwn(manifest.spec, 'postRenderers')) {
        throw new Error('Unsupported release postRenderers');
      }
      const values = join(directory, 'values.json');
      await writeFile(values, JSON.stringify(manifest.spec.values));
      const bytes = execute(helm, [
        'template',
        manifest.metadata.name,
        chart,
        '--namespace',
        manifest.metadata.namespace,
        '--include-crds',
        '--kube-version',
        observabilityRenderCapabilities.kubernetesVersion,
        '--values',
        values,
      ]);
      rendered[release.owner] =
        patch === undefined ? bytes : await patchVelero(root, tools, directory, bytes, patch);
    }
    return { expansions: rendered, helm: helmIdentity };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Preserve the default renderer API while sharing authenticated execution with canonical inventory. */
export async function renderObservabilityReleases(
  root: string,
  tools: string,
  releases: readonly ObservabilityRenderRelease[],
  helmArchive?: string,
): Promise<Record<string, string>> {
  return (await renderAuthenticatedObservabilityReleases(root, tools, releases, helmArchive))
    .expansions;
}

function indexResources(bytes: string) {
  const indexed = new Map<string, ReturnType<typeof decodeRenderedResources>[number]>();
  for (const resource of decodeRenderedResources(bytes)) {
    const { apiVersion, kind, metadata } = resource.identity;
    const identity = JSON.stringify([apiVersion, kind, metadata.namespace ?? '', metadata.name]);
    // Proof: Task25c3d duplicate-identities removal lost the duplicate-target early refusal.
    if (indexed.has(identity)) throw new Error('Velero patch duplicate resource identity');
    indexed.set(identity, resource);
  }
  return indexed;
}
const Pod = type({ spec: { template: { spec: { volumes: 'unknown' } } } });
const PatchedPod = type({
  spec: {
    template: {
      spec: {
        volumes: type({
          'emptyDir?': { 'sizeLimit?': 'unknown' },
        }).array(),
      },
    },
  },
});
async function patchVelero(
  root: string,
  tools: string,
  directory: string,
  bytes: string,
  patch: ReturnType<typeof readVeleroPatch>,
) {
  const before = indexResources(bytes);
  const target = JSON.stringify(['apps/v1', 'Deployment', 'puni-backup', 'velero']);
  const deployment = before.get(target);
  // Proof: Task25c3d required-target removal lost the named missing-target refusal before kubectl.
  if (deployment === undefined) throw new Error('Velero patch target absent');
  const annotations = type({ metadata: { 'annotations?': 'Record<string,unknown>' } }).assert(
    deployment.manifest,
  ).metadata.annotations;
  // Proof: Task25c3d nonhook-target removal reached patching for an excluded Helm hook.
  if (annotations !== undefined && Object.hasOwn(annotations, 'helm.sh/hook'))
    throw new Error('Velero patch target is a hook');
  // Proof: Task25c3d render-volume-precondition omission reached kubectl with a preexisting limit.
  assertVeleroVolumes(Pod.assert(deployment.manifest).spec.template.spec.volumes);
  // Proof: Task25c3d kubectl-auth-call omission lost missing/unreadable/substituted tool refusals.
  await authenticatePreparedKubectl(root, tools, runChecked);
  await writeFile(join(directory, 'resources.yaml'), bytes, { mode: 0o600 });
  await writeFile(
    join(directory, 'kustomization.yaml'),
    stringify({
      apiVersion: 'kustomize.config.k8s.io/v1beta1',
      kind: 'Kustomization',
      resources: ['resources.yaml'],
      patches: [{ target: veleroPatchTarget, patch: patch.patch }],
    }),
    { mode: 0o600 },
  );
  const output = execute(join(resolve(tools), 'kubectl'), ['kustomize', directory]);
  const after = indexResources(output);
  // Proof: Task25c3d complete-closure removal accepted a missing Service.
  if (before.size !== after.size || [...before.keys()].some((identity) => !after.has(identity)))
    throw new Error('Velero patch resource closure differs');
  for (const [identity, resource] of after) {
    const manifest = structuredClone(resource.manifest);
    if (identity === target) {
      const volumes = PatchedPod.assert(manifest).spec.template.spec.volumes;
      // Proof: Task25c3d exact-sizes removal admitted ignored patches and wrong sizes.
      if (
        volumes[1]?.emptyDir?.sizeLimit !== patch.pluginsSizeLimit ||
        volumes[2]?.emptyDir?.sizeLimit !== patch.scratchSizeLimit
      )
        throw new Error('Velero patch intended sizes differ');
      delete volumes[1].emptyDir.sizeLimit;
      delete volumes[2].emptyDir.sizeLimit;
    }
    // Proof: Task25c3d complete-effects removal admitted changed images and credential references.
    if (!isDeepStrictEqual(before.get(identity)?.manifest, manifest))
      throw new Error('Velero patch unrelated semantic change');
  }
  return output;
}
