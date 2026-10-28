import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parseDocument } from 'yaml';

import { runChecked } from './check-cli';
import { authenticatePreparedHelm } from './check-provision';
import { decodeRetainedToolchain, type Toolchain } from './contracts';
import { readMemoryMiB } from './observability-capacity';
import {
  type RehearsalStageBuild,
  validateObservabilityRehearsalBuilds,
} from './observability-parity-rehearsal';
import { assertPodResources } from './observability-pod-resources';
import {
  linkRehearsalImage,
  readRehearsalObligations,
} from './observability-rehearsal-obligations';
import {
  buildRehearsalBootstrap,
  type RehearsalBootstrapBuild,
  type RehearsalSource,
} from './observability-rehearsal-sources';
import {
  observabilityRenderCapabilities,
  renderAuthenticatedObservabilityReleases,
} from './observability-render';
import { lockedImageReferences, podSpecOf } from './platform-manifests';
import { decodeRenderedResources } from './rendered-resources';

const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const Mapping = type('Record<string,unknown>');
const Text = type('string>0');
// Proof: Task25c2a container-image weakening admitted the empty native image negative.
const Container = type({
  name: 'string>0',
  image: 'string>0',
  // Optional absence/null stay source facts; supplied maps enter the shared strict boundary.
  'resources?': 'unknown',
});
// Proof: Task25c2a pod-required weakening admitted the missing native containers negative.
const Pod = type({
  containers: Container.array().atLeastLength(1),
  'initContainers?': Container.array(),
  'ephemeralContainers?': Container.array(),
  'volumes?': 'unknown[]',
});
// Proof: Task25c2a claim-template weakening originally admitted empty storage;
// after adding quantity validation, combined claim-shape-reader faults admitted that same negative.
const Claim = type({ resources: { requests: { storage: 'string>0' } } });
const nativeAPIs: Partial<Record<string, string>> = {
  Pod: 'v1',
  Deployment: 'apps/v1',
  StatefulSet: 'apps/v1',
  DaemonSet: 'apps/v1',
  Job: 'batch/v1',
  CronJob: 'batch/v1',
};
const clusterAPIs: Partial<Record<string, readonly string[]>> = {
  v1: ['Namespace', 'Node', 'PersistentVolume'],
  'rbac.authorization.k8s.io/v1': ['ClusterRole', 'ClusterRoleBinding'],
  'apiextensions.k8s.io/v1': ['CustomResourceDefinition'],
  'admissionregistration.k8s.io/v1': [
    'MutatingWebhookConfiguration',
    'ValidatingWebhookConfiguration',
    'ValidatingAdmissionPolicy',
    'ValidatingAdmissionPolicyBinding',
  ],
  'storage.k8s.io/v1': ['StorageClass', 'CSIDriver', 'VolumeAttachment'],
  'scheduling.k8s.io/v1': ['PriorityClass'],
};
const namespacedAPIs: Partial<Record<string, readonly string[]>> = {
  v1: [
    'Pod',
    'ConfigMap',
    'Secret',
    'Service',
    'ServiceAccount',
    'PersistentVolumeClaim',
    'Endpoints',
    'ResourceQuota',
    'LimitRange',
  ],
  'apps/v1': ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet'],
  'batch/v1': ['Job', 'CronJob'],
  'rbac.authorization.k8s.io/v1': ['Role', 'RoleBinding'],
  'networking.k8s.io/v1': ['NetworkPolicy', 'Ingress'],
  'policy/v1': ['PodDisruptionBudget'],
  'autoscaling/v2': ['HorizontalPodAutoscaler'],
  'helm.toolkit.fluxcd.io/v2': ['HelmRelease'],
  'kustomize.toolkit.fluxcd.io/v1': ['Kustomization'],
  'source.toolkit.fluxcd.io/v1': ['GitRepository', 'HelmRepository', 'HelmChart'],
};
type SourceFrame = {
  owner: string;
  bytes: string;
  releaseOwner: string | null;
  namespace: string | null;
} & (
  | { stage: RehearsalStageBuild; bootstrap: null }
  | { stage: null; bootstrap: RehearsalBootstrapBuild }
);
export interface FrameContract {
  owner: string;
  sha256: string;
  resources: string[];
}
/** A separate immutable contract permits repeated field/fault checks without rerendering charts. */
export interface RehearsalFrameContract {
  stages: {
    stage: string;
    path: string;
    declarationPath: string;
    sourceSHA256: string;
    sha256: string;
  }[];
  frames: FrameContract[];
  bootstrap: Omit<RehearsalBootstrapBuild, 'bytes'>[];
}
function collectSourceFrames(
  stages: readonly RehearsalStageBuild[],
  expansions: Readonly<Record<string, string>>,
  bootstrap: readonly RehearsalBootstrapBuild[],
): SourceFrame[] {
  const frames: SourceFrame[] = [];
  // Proof: Task25c2a expansion-owner removal failed the omitted expansion negative.
  const releases = stages.flatMap((stage) => stage.releases);
  if (
    new Set(releases.map((release) => release.owner)).size !== releases.length ||
    !isDeepStrictEqual(
      Object.keys(expansions).sort(),
      releases.map((release) => release.owner).sort(),
    )
  )
    throw new Error('Rehearsal expansion owner closure differs');
  for (const stage of stages) {
    frames.push({
      owner: `stage/${stage.stage}`,
      bytes: stage.bytes,
      stage,
      bootstrap: null,
      releaseOwner: null,
      namespace: null,
    });
    for (const release of stage.releases) {
      const identity = type({ metadata: { name: 'string>0', namespace: 'string>0' } }).assert(
        parseDocument(release.manifest).toJSON(),
      );
      // Proof: Task25c2a release-identity removal failed the wrong declaration identity negative.
      if (release.owner !== `${identity.metadata.namespace}/${identity.metadata.name}`)
        throw new Error('Rehearsal release identity differs');
      frames.push({
        owner: `release/${release.owner}`,
        bytes: expansions[release.owner],
        stage,
        bootstrap: null,
        releaseOwner: release.owner,
        namespace: identity.metadata.namespace,
      });
    }
  }
  // Proof: Task25c2b bootstrap-native omission lost the native Flux Deployment and both policy origins.
  for (const build of bootstrap)
    frames.push({
      owner: `bootstrap/${build.bootstrap}`,
      bytes: build.bytes,
      stage: null,
      bootstrap: build,
      releaseOwner: null,
      namespace: null,
    });
  return frames;
}
function readResourceKeys(bytes: string): string[] {
  return decodeRenderedResources(bytes).map(
    ({ identity, pointer }) =>
      `${pointer}:${identity.apiVersion}:${identity.kind}:${identity.metadata.namespace ?? '_'}:${identity.metadata.name}`,
  );
}
/** Capture validated raw outputs at their producer boundary, before callers select or mutate objects. */
export function captureRehearsalFrames(
  stages: readonly RehearsalStageBuild[],
  expansions: Readonly<Record<string, string>>,
  bootstrap: readonly RehearsalBootstrapBuild[] = [],
): RehearsalFrameContract {
  return {
    stages: stages.map(({ stage, path, declarationPath, sourceSHA256, sha256 }) => ({
      stage,
      path,
      declarationPath,
      sourceSHA256,
      sha256,
    })),
    // Proof: Task25c2b immutable-origins removal let input mutation rewrite its independent contract.
    bootstrap: structuredClone(bootstrap.map(({ bytes: _bytes, ...origin }) => origin)),
    frames: collectSourceFrames(stages, expansions, bootstrap).map(({ owner, bytes }) => ({
      owner,
      sha256: hash(bytes),
      resources: readResourceKeys(bytes),
    })),
  };
}
/** Validate the known claim quantity through the shared reader, retaining its exact source string. */
function readClaimStorage(input: unknown): string {
  const storage = Claim.assert(input).resources.requests.storage;
  // Proof: Task25c2a claim-quantity-reader substitution admitted invalid, negative and overflowing source strings.
  const amount = readMemoryMiB(storage, () => {
    throw new Error('Rehearsal claim storage differs');
  });
  // Proof: Task25c2a claim-positive removal admitted the zero-size claim negative.
  if (amount <= 0) throw new Error('Rehearsal claim storage differs');
  return storage;
}
export interface ImageReference {
  pointer: string;
  name: string;
  image: string;
  role: string;
  pin: 'locked' | 'unresolved';
  locks: ReturnType<typeof linkRehearsalImage>;
  resourceSource: 'absent' | 'null' | 'map';
  requestSource: 'absent' | 'null' | 'map';
  limitSource: 'absent' | 'null' | 'map';
}
export interface ClaimReference {
  pointer: string;
  kind: 'reference' | 'template' | 'claim';
  name: string;
  storage?: string;
}
/** Namespace uncertainty is explicit and never borrows a stage owner or release namespace. */
type Namespace =
  | { scope: 'Cluster'; namespace: null; namespaceOrigin: 'api' | 'crd' }
  | { scope: 'Namespaced'; namespace: string; namespaceOrigin: 'metadata' | 'release' }
  | { scope: 'unresolved'; namespace: null; namespaceOrigin: 'unresolved' };
/** Origin facts describe source/application intent, without observed workload or lifecycle authority. */
type FrameOrigin =
  | {
      kind: 'stage';
      stage: string;
      path: string;
      declarationPath: string;
      sourceSHA256: string;
      buildSHA256: string;
      frameSHA256: string;
      manifestSHA256: string;
    }
  | {
      kind: 'bootstrap';
      bootstrap: 'flux' | 'policy';
      sourcePath: string;
      path: string;
      sources: readonly RehearsalSource[];
      buildSHA256: string;
      frameSHA256: string;
      manifestSHA256: string;
    };
function readFrameOrigin(frame: SourceFrame, manifest: Record<string, unknown>): FrameOrigin {
  const hashes = {
    buildSHA256: frame.stage === null ? frame.bootstrap.sha256 : frame.stage.sha256,
    frameSHA256: hash(frame.bytes),
    manifestSHA256: hash(JSON.stringify(manifest)),
  };
  if (frame.stage !== null)
    return {
      kind: 'stage',
      stage: frame.stage.stage,
      path: frame.stage.path,
      declarationPath: frame.stage.declarationPath,
      sourceSHA256: frame.stage.sourceSHA256,
      ...hashes,
    };
  return {
    kind: 'bootstrap',
    bootstrap: frame.bootstrap.bootstrap,
    sourcePath: frame.bootstrap.sourcePath,
    path: frame.bootstrap.path,
    sources: frame.bootstrap.sources,
    ...hashes,
  };
}
type Entry = Namespace & {
  owner: string;
  pointer: string;
  apiVersion: string;
  apiGroup: string;
  kind: string;
  name: string;
  declaredNamespace: string | null;
  category: 'native-template' | 'claim' | 'declaration' | 'provider-input' | 'unclassified';
  source: FrameOrigin;
  lifecycleOrigins: {
    owner: string;
    pointer: string;
    source: FrameOrigin;
    releaseOwner: string | null;
  }[];
  releaseOwner: string | null;
  expansionOwner: string | null;
  release: {
    chart: keyof Toolchain['charts'];
    archiveSHA256: string;
    archivePath: string;
    version: string;
    declarationSHA256: string;
  } | null;
  images: ImageReference[];
  claims: ClaimReference[];
  sourceRequests: { pointer: string; quantities: Record<string, string | number> }[];
  sourceLimits: { pointer: string; quantities: Record<string, string | number> }[];
  annotationSource: 'absent' | 'null' | 'map';
  hooks: string[];
  schedulingObserved: false;
  cardinality: Record<string, unknown>;
};
function readChild(
  manifest: Record<string, unknown>,
  path: readonly string[],
): Record<string, unknown> {
  let selected = manifest;
  for (const key of path) selected = Mapping.assert(selected[key]);
  return selected;
}
function resolveNamespace(
  identity: ReturnType<typeof decodeRenderedResources>[number]['identity'],
  frame: SourceFrame,
  scopes: ReadonlyMap<string, 'Namespaced' | 'Cluster'>,
): Namespace {
  const { apiVersion, kind, metadata } = identity;
  const fromAPI = clusterAPIs[apiVersion]?.includes(kind)
    ? 'Cluster'
    : namespacedAPIs[apiVersion]?.includes(kind)
      ? 'Namespaced'
      : undefined;
  // Proof: Task25c2a crd-scope-resolution removal lost the independently declared provider scopes.
  const scope = fromAPI ?? scopes.get(`${apiVersion}:${kind}`);
  if (scope === 'Cluster') {
    // Proof: Task25c2a cluster-namespace removal admitted a namespaced Namespace declaration.
    if (metadata.namespace !== undefined)
      throw new Error('Rehearsal cluster namespace contradiction');
    return { scope, namespace: null, namespaceOrigin: fromAPI === undefined ? 'crd' : 'api' };
  }
  if (scope === 'Namespaced') {
    // Proof: Task25c2a metadata-precedence reversal lost the explicit cross-namespace chart fact.
    const namespace = metadata.namespace ?? frame.namespace;
    if (namespace === null)
      return { scope: 'unresolved', namespace: null, namespaceOrigin: 'unresolved' };
    return {
      scope,
      namespace,
      namespaceOrigin: metadata.namespace === undefined ? 'release' : 'metadata',
    };
  }
  // Proof: Task25c2a unknown-scope guessing failed the unfamiliar provider namespace assertions.
  return { scope: 'unresolved', namespace: null, namespaceOrigin: 'unresolved' };
}

/** Internal views retain the decoded manifests from the same validated traversal; never serialize them as an inventory receipt. */
export function readRehearsalSource(
  stages: readonly RehearsalStageBuild[],
  expansions: Readonly<Record<string, string>>,
  contract: RehearsalFrameContract,
  lock: Toolchain,
  bootstrap: readonly RehearsalBootstrapBuild[] = [],
) {
  const frames = collectSourceFrames(stages, expansions, bootstrap);
  // Proof: Task25c2b bootstrap-contract and duplicate-origin removals lost coordinate/duplicate frame refusals.
  if (
    !isDeepStrictEqual(
      bootstrap.map(({ bytes: _bytes, ...origin }) => origin),
      contract.bootstrap,
    ) ||
    new Set(bootstrap.map((build) => build.bootstrap)).size !== bootstrap.length
  )
    throw new Error('Rehearsal bootstrap frame closure differs');
  // Proof: Task25c2a stage-contract removal admitted an altered immutable stage source identity.
  if (
    stages.length === 0 ||
    new Set(stages.map((stage) => stage.stage)).size !== stages.length ||
    !isDeepStrictEqual(
      stages.map(({ stage, path, declarationPath, sourceSHA256, sha256 }) => ({
        stage,
        path,
        declarationPath,
        sourceSHA256,
        sha256,
      })),
      contract.stages,
    )
  )
    throw new Error('Rehearsal stage closure differs');
  // Proof: Task25c2a frame-owner removal failed the independent frame-owner contract negative.
  if (
    !isDeepStrictEqual(
      frames.map((frame) => frame.owner),
      contract.frames.map((frame) => frame.owner),
    )
  )
    throw new Error('Rehearsal frame owner closure differs');
  for (const frame of frames) {
    const expected = contract.frames.find((candidate) => candidate.owner === frame.owner);
    // Proof: Task25c2a frame-hash removal admitted changed raw stage bytes;
    // removing hash and resource closure together admitted independently captured namespace drift.
    if (
      hash(frame.bytes) !== expected?.sha256 ||
      (frame.releaseOwner === null &&
        hash(frame.bytes) !== (frame.stage === null ? frame.bootstrap.sha256 : frame.stage.sha256))
    )
      throw new Error('Rehearsal frame hash differs');
    // Proof: Task25c2a resource-closure removal admitted an omitted hook after frame hash recomputation.
    // Proof: Task25c2b bootstrap-resource bypass admitted an omitted native workload after hash recomputation.
    if (!isDeepStrictEqual(readResourceKeys(frame.bytes), expected.resources))
      throw new Error('Rehearsal frame resource closure differs');
  }
  for (const stage of stages) {
    for (const release of stage.releases) {
      const declarations = decodeRenderedResources(stage.bytes).filter(
        ({ identity }) =>
          identity.apiVersion === 'helm.toolkit.fluxcd.io/v2' &&
          identity.kind === 'HelmRelease' &&
          `${identity.metadata.namespace ?? '_'}/${identity.metadata.name}` === release.owner,
      );
      // Proof: Task25c2a required-declaration removal admitted an expansion with no source declaration.
      if (declarations.length !== 1)
        throw new Error('Rehearsal release declaration closure differs');
      const pin = lock.charts[release.chart];
      const declared = type({
        spec: { chart: { spec: { chart: 'string>0', version: 'string>0' } } },
      }).assert(parseDocument(release.manifest).toJSON()).spec.chart.spec;
      // Proof: Task25c2a chart-pin removal admitted a coherently relabeled chart version.
      if (
        declared.chart !== `./infra/platform/charts/${basename(new URL(pin.url).pathname)}` ||
        declared.version !== pin.version
      )
        throw new Error('Rehearsal release chart pin differs');
    }
  }
  const decoded = frames.flatMap((frame) =>
    decodeRenderedResources(frame.bytes).map((resource) => ({ frame, ...resource })),
  );
  const scopes = new Map<string, 'Namespaced' | 'Cluster'>();
  for (const { identity, manifest } of decoded) {
    if (
      identity.apiVersion !== 'apiextensions.k8s.io/v1' ||
      identity.kind !== 'CustomResourceDefinition'
    )
      continue;
    // Proof: Task25c2a malformed-crd weakening admitted an invalid declared scope.
    const crd = type({
      spec: {
        group: 'string>0',
        names: { kind: 'string>0' },
        scope: "'Namespaced' | 'Cluster'",
        versions: type({ name: 'string>0' }).array().atLeastLength(1),
      },
    }).assert(manifest);
    for (const version of crd.spec.versions) {
      const key = `${crd.spec.group}/${version.name}:${crd.spec.names.kind}`;
      // Proof: Task25c2a duplicate-crd removal admitted two declarations of the same provider API scope.
      if (scopes.has(key)) throw new Error('Rehearsal duplicate CRD scope');
      scopes.set(key, crd.spec.scope);
    }
  }
  const entries: Entry[] = [];
  const releaseViews: (RehearsalStageBuild['releases'][number] & {
    declaration: Record<string, unknown>;
    entry: Entry;
  })[] = [];
  const seen = new Map<string, { entry: Entry; manifest: Record<string, unknown> }>();
  const approved = lockedImageReferences(lock);
  // Proof: Task25c2a helper-hidden removal lost the required explicit helper obligation.
  const unresolved = new Set<string>([
    bootstrap.length === 0
      ? 'bootstrap Flux/topology/policy source and lifecycle origins remain unresolved (25c2b)'
      : 'bootstrap source declarations are retained; actual runner-input equality and application remain unobserved',
    'k3d/system/registry/LB and serial tool processes remain unresolved',
    'cert-manager solver/startup, Velero restore/transfer and local-path helper roles remain unresolved',
    'provider effective Pods, concurrency and runtime capability equality remain unresolved',
  ]);
  for (const { frame, identity, manifest, pointer } of decoded) {
    const namespace = resolveNamespace(identity, frame, scopes);
    // Proof: Task25c2a group-owner substitution admitted two versions of one API group/kind owner.
    const apiGroup = identity.apiVersion.includes('/') ? identity.apiVersion.split('/')[0] : '';
    // Proof: Task25c2a mixed-scope-owner restored classification in this key and split one declared physical owner.
    const key = JSON.stringify([
      apiGroup,
      identity.kind,
      namespace.namespace ?? identity.metadata.namespace ?? null,
      identity.metadata.name,
    ]);
    // Proof: Task25c2a duplicate-object removal admitted duplicate actual expansion objects.
    const previous = seen.get(key);
    const source = readFrameOrigin(frame, manifest);
    const lifecycleOrigin = {
      owner: frame.owner,
      pointer,
      source,
      releaseOwner: frame.releaseOwner,
    };
    if (previous !== undefined) {
      // Proof: Task25c2b policy-coordinate weakening admitted an unrelated source as policy overlap.
      const policyOverlap =
        frame.bootstrap?.bootstrap === 'policy' &&
        frame.bootstrap.sourcePath === 'infra/platform/policy' &&
        frame.bootstrap.path === 'infra/rehearsal/bootstrap/policy' &&
        previous.entry.source.kind === 'stage' &&
        previous.entry.source.stage === 'policy' &&
        previous.entry.source.path.replace(/^\.\//, '') === 'infra/platform/policy' &&
        previous.entry.lifecycleOrigins.length === 1;
      // Proof: Task25c2b strict-other-origins removal admitted unrelated stage duplicates.
      if (!policyOverlap) throw new Error('Rehearsal duplicate object owner');
      // Proof: Task25c2b policy-equality removal admitted incompatible independently decoded definitions.
      if (!isDeepStrictEqual(previous.manifest, manifest))
        throw new Error('Rehearsal bootstrap policy definition conflict');
      // Proof: Task25c2b both-origins omission lost the second application origin on the shared object.
      previous.entry.lifecycleOrigins.push(lifecycleOrigin);
      continue;
    }
    // Proof: Task25c2a claim-api removal admitted a PVC under a foreign API.
    if (identity.kind === 'PersistentVolumeClaim' && identity.apiVersion !== 'v1')
      throw new Error('Rehearsal claim API differs');
    const nativeAPI = nativeAPIs[identity.kind];
    // Proof: Task25c2a native-api removal admitted a known native workload under a foreign API.
    if (nativeAPI !== undefined && identity.apiVersion !== nativeAPI)
      throw new Error('Rehearsal native API differs');
    const category =
      nativeAPI !== undefined
        ? 'native-template'
        : identity.kind === 'PersistentVolumeClaim' && identity.apiVersion === 'v1'
          ? 'claim'
          : identity.kind === 'HelmRelease'
            ? 'declaration'
            : namespacedAPIs[identity.apiVersion]?.includes(identity.kind) ||
                clusterAPIs[identity.apiVersion]?.includes(identity.kind)
              ? 'declaration'
              : scopes.has(`${identity.apiVersion}:${identity.kind}`)
                ? 'provider-input'
                : 'unclassified';
    // Proof: Task25c2a nullable-annotations removal rejected declared null source metadata;
    // annotation-maptype widening admitted number maps and null annotation values.
    const metadata = type({ metadata: { 'annotations?': 'Record<string,string>|null' } }).assert(
      manifest,
    ).metadata;
    // ArkType records accept arrays structurally at this external YAML boundary.
    // Proof: Task25c2a annotation-array removal admitted the malformed annotation array.
    if (Array.isArray(metadata.annotations)) throw new Error('Rehearsal annotation map differs');
    const entry: Entry = {
      owner: frame.owner,
      pointer,
      apiVersion: identity.apiVersion,
      apiGroup,
      kind: identity.kind,
      name: identity.metadata.name,
      ...namespace,
      declaredNamespace: identity.metadata.namespace ?? null,
      category,
      source,
      lifecycleOrigins: [lifecycleOrigin],
      releaseOwner: frame.releaseOwner,
      expansionOwner: null,
      release: null,
      images: [],
      claims: [],
      sourceRequests: [],
      sourceLimits: [],
      // Proof: Task25c2a annotation-state collapsing null to absent lost the declared metadata state.
      annotationSource:
        metadata.annotations === undefined
          ? 'absent'
          : metadata.annotations === null
            ? 'null'
            : 'map',
      hooks: [],
      schedulingObserved: false,
      cardinality: {},
    };
    // Proof: Task25c2a provider-hidden removal lost the unfamiliar provider's named obligation.
    if (
      namespace.scope === 'unresolved' ||
      category === 'provider-input' ||
      category === 'unclassified'
    )
      unresolved.add(
        `${frame.owner}${pointer} ${identity.apiVersion}/${identity.kind}/${identity.metadata.name}: scope/provider realization unresolved`,
      );
    const releases = frame.stage === null ? [] : frame.stage.releases;
    const origin = releases.find(
      (release) =>
        release.owner ===
        (frame.releaseOwner ?? `${identity.metadata.namespace ?? '_'}/${identity.metadata.name}`),
    );
    if (
      origin !== undefined &&
      (frame.releaseOwner !== null ||
        (category === 'declaration' && identity.kind === 'HelmRelease'))
    ) {
      const pin = lock.charts[origin.chart];
      entry.release = {
        chart: origin.chart,
        archiveSHA256: pin.sha256,
        archivePath: `infra/platform/charts/${basename(new URL(pin.url).pathname)}`,
        version: pin.version,
        declarationSHA256: hash(origin.manifest),
      };
    }
    const hook = metadata.annotations?.['helm.sh/hook'];
    // Proof: Task25c2a hook-required removal admitted a quoted empty hook annotation.
    if (hook !== undefined)
      entry.hooks = Text.assert(hook)
        .split(',')
        .map((phase) => Text.assert(phase.trim()));
    if (identity.kind === 'HelmRelease' && identity.apiVersion === 'helm.toolkit.fluxcd.io/v2') {
      const owner = `${identity.metadata.namespace ?? '_'}/${identity.metadata.name}`;
      const release = releases.find((release) => release.owner === owner);
      // Proof: Task25c2a declaration-equality removal admitted release values differing from the built declaration.
      if (
        frame.releaseOwner !== null ||
        release === undefined ||
        !isDeepStrictEqual(parseDocument(release.manifest).toJSON(), manifest)
      )
        throw new Error('Rehearsal release declaration closure differs');
      entry.expansionOwner = owner;
      // Proof: Task58 source-release-view omission lost the actual eight-trait production-reader contribution.
      releaseViews.push({ ...release, declaration: manifest, entry });
    }
    if (nativeAPI !== undefined) {
      const path =
        identity.kind === 'Pod'
          ? ['spec']
          : identity.kind === 'CronJob'
            ? ['spec', 'jobTemplate', 'spec', 'template', 'spec']
            : ['spec', 'template', 'spec'];
      const pod = Pod.assert(
        podSpecOf({ kind: identity.kind, spec: readChild(manifest, ['spec']) }),
      );
      const prefix = '/' + path.join('/');
      for (const role of ['containers', 'initContainers', 'ephemeralContainers'] as const) {
        for (const [index, container] of (pod[role] ?? []).entries()) {
          const at = `${prefix}/${role}/${String(index)}`;
          // Proof: Task25c2a nullable-resources removal rejected declared null; native-resource-validator bypass admitted malformed maps, quantities and contradictions.
          const declaredResources =
            container.resources === undefined || container.resources === null
              ? null
              : Mapping.assert(container.resources);
          // Proof: fix1 outer-map-kind removal let an array become empty supplied-map validation.
          if (Array.isArray(declaredResources)) throw new Error('Rehearsal resource map differs');
          const declarations = {
            requests: declaredResources?.['requests'],
            limits: declaredResources?.['limits'],
          };
          // Proof: fix1 request-null-selection/limit-null-selection removal rejected the modeled null inner maps.
          // Proof: fix1 supplied-map-validation bypass admitted malformed supplied maps and quantities.
          // Proof: fix1 no-fabricated-request-map inserted an undeclared empty quantity map.
          const resources =
            declaredResources === null
              ? null
              : assertPodResources({
                  ...(declarations.requests === undefined || declarations.requests === null
                    ? {}
                    : { requests: declarations.requests }),
                  ...(declarations.limits === undefined || declarations.limits === null
                    ? {}
                    : { limits: declarations.limits }),
                });
          // Proof: Task25c2a resource-state collapsing null to absent lost the declared source state.
          const resourceSource =
            container.resources === undefined
              ? 'absent'
              : container.resources === null
                ? 'null'
                : 'map';
          const locks = linkRehearsalImage(container.image, lock);
          const pin = approved.has(container.image) || locks.length > 0 ? 'locked' : 'unresolved';
          entry.images.push({
            pointer: `${at}/image`,
            role,
            name: container.name,
            image: container.image,
            pin,
            locks,
            resourceSource,
            // Proof: fix1 request-null-state collapsing null to absent lost the individual declared state.
            requestSource:
              declarations.requests === undefined
                ? 'absent'
                : declarations.requests === null
                  ? 'null'
                  : 'map',
            // Proof: fix1 limit-null-state collapsing null to absent lost the individual declared state.
            limitSource:
              declarations.limits === undefined
                ? 'absent'
                : declarations.limits === null
                  ? 'null'
                  : 'map',
          });
          if (pin === 'unresolved')
            unresolved.add(
              `${frame.owner}${pointer}${at}: image ${container.image} not mapped to a locked role`,
            );
          for (const field of ['requests', 'limits'] as const) {
            // Proof: Task25c2a resource-map-fabrication substituted an empty map for missing declarations;
            // missing-resource-maps removal hid their named request/limit obligations.
            const quantities = resources?.[field];
            // Proof: fix1 null-map-obligation collapsing null to absent lost the named null-map obligation.
            if (quantities === undefined)
              unresolved.add(
                `${frame.owner}${pointer}${at}/resources/${field}: ${role}/${container.name} declaration ${declarations[field] === null ? 'null' : 'absent'} (resources:${resourceSource})`,
              );
            else
              (field === 'requests' ? entry.sourceRequests : entry.sourceLimits).push({
                pointer: `${at}/resources/${field}`,
                quantities,
              });
          }
        }
      }
      for (const [index, volume] of (pod.volumes ?? []).entries()) {
        const selected = type({ name: 'string>0' }).assert(volume);
        // Proof: Task25c2a claim-reference weakening admitted an empty native claim reference.
        if ('persistentVolumeClaim' in selected)
          entry.claims.push({
            pointer: `${prefix}/volumes/${String(index)}/persistentVolumeClaim/claimName`,
            kind: 'reference',
            name: type({ persistentVolumeClaim: { claimName: 'string>0' } }).assert(selected)
              .persistentVolumeClaim.claimName,
          });
        if ('image' in selected)
          unresolved.add(
            `${frame.owner}${pointer}${prefix}/volumes/${String(index)}: image-volume helper demand unresolved`,
          );
      }
      const spec = readChild(manifest, ['spec']);
      for (const name of [
        'replicas',
        'parallelism',
        'completions',
        'strategy',
        'updateStrategy',
        'schedule',
        'concurrencyPolicy',
      ])
        if (Object.hasOwn(spec, name)) entry.cardinality[name] = spec[name];
      if (identity.kind === 'StatefulSet' && 'volumeClaimTemplates' in spec) {
        for (const [index, template] of type('unknown[]')
          .assert(spec['volumeClaimTemplates'])
          .entries()) {
          const selected = type({ metadata: { name: 'string>0' }, spec: 'unknown' }).assert(
            template,
          );
          entry.claims.push({
            pointer: `/spec/volumeClaimTemplates/${String(index)}`,
            kind: 'template',
            name: selected.metadata.name,
            storage: readClaimStorage(selected.spec),
          });
        }
      }
    }
    if (category === 'claim')
      entry.claims.push({
        pointer: '/spec',
        kind: 'claim',
        name: identity.metadata.name,
        storage: readClaimStorage(manifest['spec']),
      });
    entries.push(entry);
    seen.set(key, { entry, manifest });
  }
  // Proof: Task25c2a empty-expansion removal admitted a required release with no objects.
  for (const frame of frames.filter((frame) => frame.releaseOwner !== null))
    if (!entries.some((entry) => entry.owner === frame.owner))
      throw new Error('Rehearsal empty required expansion');
  const inventory = {
    scope: 'rehearsal-source-contributor-inventory' as const,
    entries,
    stages: contract.stages,
    bootstrap: contract.bootstrap,
    frames: contract.frames,
    unresolved: [...unresolved].sort(),
    // Proof: Task25c2b runtime-authority forgery failed source-only completeness/authority assertions.
    runnableClosure: 'incomplete' as const,
    creationAuthority: false as const,
    runtimeRehearsal: false as const,
    transportObserved: 'not-evaluated' as const,
  };
  return {
    inventory,
    native: [...seen.values()].filter(
      ({ entry }) => entry.category === 'native-template' || entry.category === 'claim',
    ),
    resources: [...seen.values()],
    releases: releaseViews,
  };
}

/** Consume all validated stage and chart frames; facts never aggregate into capacity or runtime claims. */
export function readRehearsalInventory(...input: Parameters<typeof readRehearsalSource>) {
  return readRehearsalSource(...input).inventory;
}

/** Preserve explicit archive selection and required-preparation failures for existing callers. */
export async function authenticateRehearsalHelm(root: string, tools: string, archive?: string) {
  return authenticatePreparedHelm(root, tools, runChecked, archive);
}

/**
 * One canonical validation/build pass and one pinned render per selected release.
 * `helmArchive` explicitly selects a prepared private archive; absent selection uses the existing
 * canonical tool cache. Missing, unreadable or invalid selected input throws without fallback/download.
 * No runtime, capacity or transport observation follows from this inventory.
 */
export async function prepareRehearsalInventory(
  root: string,
  tools: string,
  input: unknown,
  directory: string,
  helmArchive?: string,
) {
  const { receipt, stages, bootstrap } = await validateObservabilityRehearsalBuilds(
    root,
    tools,
    input,
    directory,
  );
  const releases = stages.flatMap((stage) => stage.releases);
  const { expansions, helm } = await renderAuthenticatedObservabilityReleases(
    directory,
    tools,
    releases,
    helmArchive,
  );
  const bootstrapFrames = buildRehearsalBootstrap(bootstrap, bootstrap.policyBytes);
  const contract = captureRehearsalFrames(stages, expansions, bootstrapFrames);
  const runtimeLock = await readFile(join(directory, 'infra/versions/toolchain.json'), 'utf8');
  const coordinates = receipt.files.filter((file) => file.path === 'infra/versions/toolchain.json');
  // Proof: Task58 prepared-coordinate removal admitted a duplicate packet toolchain entry; prepared-producer negative failed.
  if (coordinates.length !== 1) throw new Error('Rehearsal runtime lock coordinate differs');
  const lock = decodeRetainedToolchain(Buffer.from(runtimeLock), coordinates[0].sha256);
  const source = readRehearsalSource(stages, expansions, contract, lock, bootstrapFrames);
  const { inventory, native } = source;
  const obligations = readRehearsalObligations(lock, receipt);
  const provenance = {
    sourceRevision: receipt.sourceRevision,
    generator: receipt.generator,
    artifactSHA256: receipt.artifactSHA256,
    helm,
    kubectl: lock.binaries.kubectl,
    capabilities: observabilityRenderCapabilities,
  };
  const receiptInventory = {
    ...inventory,
    obligations,
    bootstrapSources: bootstrap.sources,
    topologyDeclaration: bootstrap.topology,
    runnerInputEquality: 'unobserved' as const,
    provenance,
    inventorySHA256: hash(
      JSON.stringify({
        ...inventory,
        obligations,
        bootstrapSources: bootstrap.sources,
        topologyDeclaration: bootstrap.topology,
        runnerInputEquality: 'unobserved',
        provenance,
      }),
    ),
  };
  return {
    inventory: receiptInventory,
    native,
    lock,
    // Proof: Task25c3g omitted-return-field fault produced only TS2339 at the native caller after a clean no-emit baseline; this proves typed handoff, not rendering.
    topologyEvidence: {
      ...bootstrap.topologyEvidence,
      selection: { sourceRevision: receipt.sourceRevision, artifactSHA256: receipt.artifactSHA256 },
    },
    capacityEvidence: {
      source,
      runtimeLock,
      packet: {
        sourceRevision: receipt.sourceRevision,
        artifactSHA256: receipt.artifactSHA256,
        files: receipt.files,
      },
    },
  };
}

/** Produce the existing source-only receipt through the shared canonical producer. */
export async function inventoryObservabilityRehearsal(
  ...input: Parameters<typeof prepareRehearsalInventory>
) {
  return (await prepareRehearsalInventory(...input)).inventory;
}
