import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { type } from 'arktype';
import { parseAllDocuments } from 'yaml';

import type { Toolchain } from './contracts';

/** A decoded YAML document and the platform-relative file it came from. */
export interface PlatformManifest {
  readonly path: string;
  readonly document: unknown;
}

// Charts are hashed, the Flux install is hashed, and conformance fixtures deliberately name
// unapproved images; every other platform manifest is a reconciled input.
const unscannedDirectories = new Set(['charts', 'conformance', 'flux']);

async function listYaml(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await listYaml(path)));
    else if (entry.name.endsWith('.yaml')) paths.push(path);
  }
  return paths;
}

/** Read every reconciled YAML document under `infra/platform`. Unreadable or malformed files throw. */
export async function readPlatformManifests(root: string): Promise<PlatformManifest[]> {
  const platformRoot = join(root, 'infra/platform');
  const manifests: PlatformManifest[] = [];
  for (const entry of await readdir(platformRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || unscannedDirectories.has(entry.name)) continue;
    for (const path of await listYaml(join(platformRoot, entry.name))) {
      let source: string;
      try {
        source = await readFile(path, 'utf8');
      } catch (cause) {
        throw new Error(`Cannot read platform manifest ${path}`, { cause });
      }
      for (const document of parseAllDocuments(source)) {
        if (document.errors.length > 0) {
          throw new Error(`${path} is not valid YAML: ${document.errors[0]?.message ?? ''}`);
        }
        const decoded: unknown = JSON.parse(JSON.stringify(document.toJSON()));
        manifests.push({ path: relative(platformRoot, path), document: decoded });
      }
    }
  }
  return manifests;
}

const Container = type({ name: 'string>0', image: 'string>0' });
const PodSpec = type({
  containers: Container.array().atLeastLength(1),
  'initContainers?': Container.array(),
  'ephemeralContainers?': Container.array(),
  'volumes?': type({ name: 'string>0' }).array(),
});
const Workload = type({
  kind: "'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Job' | 'CronJob' | 'Pod'",
  metadata: { name: 'string>0' },
  spec: 'object',
});

function podSpecOf(workload: typeof Workload.infer): unknown {
  const spec: Record<string, unknown> = { ...workload.spec };
  if (workload.kind === 'Pod') return spec;
  if (workload.kind === 'CronJob') {
    const jobTemplate = spec['jobTemplate'];
    const jobSpec =
      typeof jobTemplate === 'object' && jobTemplate !== null && 'spec' in jobTemplate
        ? jobTemplate.spec
        : undefined;
    const template =
      typeof jobSpec === 'object' && jobSpec !== null && 'template' in jobSpec
        ? jobSpec.template
        : undefined;
    return typeof template === 'object' && template !== null && 'spec' in template
      ? template.spec
      : undefined;
  }
  const template = spec['template'];
  return typeof template === 'object' && template !== null && 'spec' in template
    ? template.spec
    : undefined;
}

/** Every exact image reference the toolchain lock approves for any platform workload. */
export function lockedImageReferences(toolchain: Toolchain): ReadonlySet<string> {
  const references = new Set<string>();
  for (const image of Object.values(toolchain.runtimeImages)) {
    references.add(`${image.name}@${image.digest}`);
  }
  for (const chart of Object.values(toolchain.charts)) {
    for (const image of chart.images) references.add(`${image.name}@${image.digest}`);
  }
  return references;
}

/**
 * Require every container in every plain platform workload to use a locked image.
 *
 * Covers regular, init and ephemeral containers of Deployments, StatefulSets,
 * DaemonSets, Jobs, CronJobs and Pods, and rejects OCI `image` volumes, which
 * would mount unlocked image content without a container reference.
 */
export function assertLockedWorkloadImages(
  manifests: readonly PlatformManifest[],
  toolchain: Toolchain,
): number {
  const approved = lockedImageReferences(toolchain);
  let checked = 0;
  for (const { path, document } of manifests) {
    const workload = Workload(document);
    if (workload instanceof type.errors) continue;
    const pod = PodSpec(podSpecOf(workload));
    if (pod instanceof type.errors) {
      throw new Error(
        `${path} ${workload.kind}/${workload.metadata.name} has no readable pod spec`,
      );
    }
    const containers = [
      ...pod.containers,
      ...(pod.initContainers ?? []),
      ...(pod.ephemeralContainers ?? []),
    ];
    for (const container of containers) {
      if (!approved.has(container.image)) {
        // Proof: changing the registry Deployment digest made the production validator's
        // registry negative reject on 2026-09-18; removing this membership check made it resolve.
        throw new Error(
          `${path} ${workload.kind}/${workload.metadata.name} container ${container.name} image differs from the toolchain lock`,
        );
      }
      checked += 1;
    }
    for (const volume of pod.volumes ?? []) {
      if ('image' in volume) {
        throw new Error(`${path} ${workload.metadata.name} mounts an unlocked image volume`);
      }
    }
  }
  return checked;
}

const PlainSecret = type({ kind: "'Secret'", metadata: { name: 'string>0' } });
const SopsSecret = type({
  apiVersion: "'v1'",
  kind: "'Secret'",
  metadata: { name: 'string>0', namespace: 'string>0', '+': 'reject' },
  type: 'string>0',
  'data?': 'Record<string, string>',
  'stringData?': 'Record<string, string>',
  sops: {
    age: type({ recipient: /^age1[0-9a-z]+$/, enc: 'string>0' })
      .array()
      .atLeastLength(1),
    encrypted_regex: "'^(data|stringData)$'",
  },
  '+': 'reject',
});

/**
 * Require every Secret in the platform tree to be a SOPS file in its cluster's
 * secrets directory with every value encrypted to at least one age recipient.
 *
 * A plaintext Secret anywhere else, or one unencrypted value, throws: git never
 * carries a cleartext platform credential.
 */
export function assertEncryptedSecrets(manifests: readonly PlatformManifest[]): number {
  let checked = 0;
  for (const { path, document } of manifests) {
    const secret = PlainSecret(document);
    if (secret instanceof type.errors) continue;
    if (!/^secrets\/[a-z]+-[a-z]+\/[a-z0-9-]+\.sops\.yaml$/.test(path)) {
      // Proof: removing this location test let a plaintext registry Secret reach the weaker
      // encryption message instead of this rejection on 2026-09-18.
      throw new Error(`${path} Secret/${secret.metadata.name} is outside a SOPS secrets directory`);
    }
    const encrypted = SopsSecret(document);
    if (encrypted instanceof type.errors) {
      throw new Error(`${path} is not a SOPS age-encrypted Secret: ${encrypted.summary}`);
    }
    const values = [
      ...Object.values(encrypted.data ?? {}),
      ...Object.values(encrypted.stringData ?? {}),
    ];
    if (values.length === 0 || values.some((value) => !value.startsWith('ENC[AES256_GCM,'))) {
      // Proof: accepting a plaintext stringData value made the production validator's
      // plaintext-secret negative resolve on 2026-09-18.
      throw new Error(`${path} carries a plaintext Secret value`);
    }
    checked += 1;
  }
  return checked;
}

const RegistryDeployment = type({
  kind: "'Deployment'",
  metadata: { name: "'registry'", namespace: "'puni-registry'" },
  spec: {
    template: {
      spec: {
        automountServiceAccountToken: 'false',
        containers: type({
          name: "'registry'",
          env: type({ name: 'string>0', value: 'string' }).array(),
        })
          .array()
          .exactlyLength(1),
      },
    },
  },
});

const requiredRegistryEnvironment = {
  REGISTRY_HTTP_TLS_CERTIFICATE: '/certs/tls.crt',
  REGISTRY_HTTP_TLS_KEY: '/certs/tls.key',
  REGISTRY_AUTH: 'htpasswd',
  REGISTRY_AUTH_HTPASSWD_PATH: '/auth/htpasswd',
} as const;

/** Require the one platform registry Deployment to serve TLS and htpasswd authentication. */
export function assertRegistryTransport(manifests: readonly PlatformManifest[]): void {
  const registries = manifests.flatMap(({ document }) => {
    const registry = RegistryDeployment(document);
    return registry instanceof type.errors ? [] : [registry];
  });
  const [registry] = registries;
  if (registries.length !== 1) {
    throw new Error('Exactly one platform registry Deployment is required');
  }
  const environment = new Map(
    registry.spec.template.spec.containers[0].env.map(({ name, value }) => [name, value]),
  );
  for (const [name, value] of Object.entries(requiredRegistryEnvironment)) {
    if (environment.get(name) !== value) {
      // Proof: removing REGISTRY_AUTH made the production validator's unauthenticated-registry
      // negative reject on 2026-09-18; removing this comparison made it resolve.
      throw new Error(`Registry must set ${name}=${value} for TLS and authentication`);
    }
  }
}

const RunnerConfigMap = type({
  kind: "'ConfigMap'",
  metadata: { name: "'sqlite-backup-runner'", namespace: "'wbs'" },
  data: { 'backup-sqlite.ts': 'string', '+': 'reject' },
});

/** Require the SQLite backup ConfigMap to carry the reviewed runner byte for byte. */
export async function assertSqliteRunner(
  root: string,
  manifests: readonly PlatformManifest[],
): Promise<void> {
  const source = await readFile(join(root, 'tools/tool-fleet/src/backup-sqlite.ts'), 'utf8');
  const runners = manifests.flatMap(({ document }) => {
    const runner = RunnerConfigMap(document);
    return runner instanceof type.errors ? [] : [runner];
  });
  if (runners.length !== 1 || runners[0]?.data['backup-sqlite.ts'] !== source) {
    // Proof: appending one line to the ConfigMap copy made the production validator's runner
    // negative reject on 2026-09-18; removing this comparison made it resolve.
    throw new Error(
      'SQLite backup runner ConfigMap differs from tools/tool-fleet/src/backup-sqlite.ts',
    );
  }
}

const TrustedWorkloadImages = type({
  kind: "'ConfigMap'",
  metadata: {
    name: "'puni-trusted-workload'",
    namespace: "'wbs-solver'",
    'annotations?': 'Record<string, string>',
  },
  data: { solverImages: 'string', forgeImage: 'string', forgeWorktreeRoots: 'string' },
});
const pinnedImage = /^[a-z0-9.-]+(?::[0-9]+)?\/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$/;

/**
 * Require the trusted-workload admission parameters to name only digest-pinned images.
 *
 * `solverImages` is the candidate and optional rollback backend digest, comma separated,
 * which the admission policy matches by whole-entry membership.
 */
export function assertTrustedWorkloadImages(manifests: readonly PlatformManifest[]): void {
  const parameters = manifests.flatMap(({ document }) => {
    const configMap = TrustedWorkloadImages(document);
    return configMap instanceof type.errors ? [] : [configMap];
  });
  const [parameter] = parameters;
  if (parameters.length !== 1) {
    throw new Error('Exactly one puni-trusted-workload admission ConfigMap is required');
  }
  if (parameter.metadata.annotations?.['kustomize.toolkit.fluxcd.io/ssa'] !== 'IfNotPresent') {
    // Proof: without this annotation a live Flux reconcile reverted a coordinator-written
    // solverImages value on 2026-09-18; this guard made the missing-annotation negative reject.
    throw new Error(
      'puni-trusted-workload must be created once by Flux (ssa: IfNotPresent) and owned by the release coordinator',
    );
  }
  const solverImages = parameter.data.solverImages.split(',');
  if (
    solverImages.length < 1 ||
    solverImages.length > 2 ||
    new Set(solverImages).size !== solverImages.length ||
    ![...solverImages, parameter.data.forgeImage].every((image) => pinnedImage.test(image))
  ) {
    // Proof: accepting any entry made the tag-only solver image negative resolve on 2026-09-18.
    throw new Error('Trusted workload images must be one or two distinct digest-pinned references');
  }
}

const StageKustomization = type({ resources: type('string>0').array() });

/**
 * Read every document a Flux stage reconciles by following its native kustomization
 * resource lists. A resource is either a YAML file or a directory with its own
 * kustomization; anything else throws.
 */
export async function readStageManifests(
  root: string,
  stagePath: string,
): Promise<PlatformManifest[]> {
  const platformRoot = join(root, 'infra/platform');
  const visit = async (directory: string): Promise<PlatformManifest[]> => {
    const kustomizationPath = join(directory, 'kustomization.yaml');
    let source: string;
    try {
      source = await readFile(kustomizationPath, 'utf8');
    } catch (cause) {
      throw new Error(`Cannot read stage kustomization ${kustomizationPath}`, { cause });
    }
    const kustomization = StageKustomization(parseAllDocuments(source)[0]?.toJSON());
    if (kustomization instanceof type.errors) {
      throw new Error(`${kustomizationPath} is invalid: ${kustomization.summary}`);
    }
    const manifests: PlatformManifest[] = [];
    for (const resource of kustomization.resources) {
      const path = join(directory, resource);
      if (!resource.endsWith('.yaml')) {
        manifests.push(...(await visit(path)));
        continue;
      }
      for (const document of parseAllDocuments(await readFile(path, 'utf8'))) {
        const decoded: unknown = JSON.parse(JSON.stringify(document.toJSON()));
        manifests.push({ path: relative(platformRoot, path), document: decoded });
      }
    }
    return manifests;
  };
  return visit(join(root, stagePath));
}

function collectCapabilitySelectors(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectCapabilitySelectors(entry, found);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const key of Object.keys(value)) {
    const entry: unknown = Reflect.get(value, key);
    if (key === 'nodeSelector' && typeof entry === 'object' && entry !== null) {
      for (const label of Object.keys(entry)) {
        const capability = /^puni\.dev\/capability-(.+)$/.exec(label)?.[1];
        if (capability !== undefined) found.add(capability);
      }
    }
    collectCapabilitySelectors(entry, found);
  }
}

/**
 * Require every capability a stage's workloads select, in plain pod specs or Helm
 * values, to be one the cluster purpose's nodes may carry.
 *
 * A selector no node can satisfy leaves the stage's `wait` pending forever, so the
 * graph would never converge.
 */
export function assertStagePlacement(
  cluster: string,
  stage: string,
  manifests: readonly PlatformManifest[],
  allowedCapabilities: readonly string[],
): void {
  for (const { path, document } of manifests) {
    const selected = new Set<string>();
    collectCapabilitySelectors(document, selected);
    for (const capability of selected) {
      if (!allowedCapabilities.includes(capability)) {
        // Proof: on 2026-09-18 this rejected traefik's ingress selector in the former nine-stage
        // workers graph, and disabling it made the platform-only-capability negative resolve.
        throw new Error(
          `${cluster} ${stage} stage selects capability ${capability} in ${path}, which its nodes cannot carry`,
        );
      }
    }
  }
}

/** Secrets that an operator or controller in the graph creates, not Git. */
const producedSecrets: Readonly<Record<string, readonly string[]>> = {
  // ECK writes the elastic user and the public HTTP CA for the `elasticsearch` cluster.
  observability: ['elasticsearch-es-elastic-user', 'elasticsearch-es-http-certs-public'],
};

/** Secrets a chart reads by a fixed name that its values never mention. */
const implicitSecretReferences: Readonly<Record<string, readonly string[]>> = {
  // Velero reads its Kopia repository password from this name in its own namespace.
  velero: ['velero-repo-credentials'],
};

const NamespacedDocument = type({
  kind: 'string>0',
  metadata: { name: 'string>0', 'namespace?': 'string>0' },
});

function collectSecretNames(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectSecretNames(entry, found);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const key of Object.keys(value)) {
    const entry: unknown = Reflect.get(value, key);
    if (
      (key === 'secretName' || key === 'existingSecret' || key === 'configSecret') &&
      typeof entry === 'string'
    ) {
      found.add(entry);
    } else if (
      (key === 'secretKeyRef' || key === 'secretRef') &&
      typeof entry === 'object' &&
      entry !== null &&
      'name' in entry &&
      typeof entry.name === 'string'
    ) {
      found.add(entry.name);
    } else {
      collectSecretNames(entry, found);
    }
  }
}

/**
 * Every Secret a cluster graph consumes and does not produce, as `namespace/name`.
 * Certificates and ACME issuers produce their Secrets; ECK produces the ones listed in
 * `producedSecrets`.
 */
export function referencedSecrets(manifests: readonly PlatformManifest[]): Set<string> {
  const produced = new Set<string>();
  const referenced = new Set<string>();
  for (const { path, document } of manifests) {
    const parsed = NamespacedDocument(document);
    if (parsed instanceof type.errors) continue;
    const namespace = parsed.metadata.namespace ?? '';
    for (const name of producedSecrets[namespace] ?? []) produced.add(`${namespace}/${name}`);
    const spec: unknown =
      typeof document === 'object' && document !== null ? Reflect.get(document, 'spec') : null;
    if (parsed.kind === 'Certificate') {
      const secretName: unknown =
        typeof spec === 'object' && spec !== null ? Reflect.get(spec, 'secretName') : undefined;
      if (typeof secretName !== 'string') throw new Error(`${path} Certificate has no secretName`);
      produced.add(`${namespace}/${secretName}`);
      continue;
    }
    if (parsed.kind === 'ClusterIssuer' || parsed.kind === 'Secret') continue;
    if (namespace === '') continue;
    const names = new Set<string>(implicitSecretReferences[parsed.metadata.name] ?? []);
    collectSecretNames(spec, names);
    for (const name of names) referenced.add(`${namespace}/${name}`);
  }
  return new Set([...referenced].filter((secret) => !produced.has(secret)));
}

const ExternallyProvided = type({
  namespace: 'string>0',
  name: 'string>0',
  source: "'operator' | 'rehearsal'",
  '+': 'reject',
})
  .array()
  .atLeastLength(0);

/**
 * Require a cluster's SOPS listing plus its `externally-provided.json` declaration to equal
 * exactly the Secrets its graph consumes: nothing missing, nothing stale, nothing twice.
 */
export async function assertSecretClosure(
  root: string,
  cluster: string,
  consumed: ReadonlySet<string>,
): Promise<void> {
  const directory = join(root, 'infra/platform/secrets', cluster);
  const listed = new Set<string>();
  for (const { document } of await readStageManifests(root, `infra/platform/secrets/${cluster}`)) {
    const secret = NamespacedDocument(document);
    if (secret instanceof type.errors) throw new Error(`${cluster} lists a non-Secret document`);
    listed.add(`${secret.metadata.namespace ?? ''}/${secret.metadata.name}`);
  }
  let declared: unknown;
  try {
    declared = JSON.parse(await readFile(join(directory, 'externally-provided.json'), 'utf8'));
  } catch (cause) {
    throw new Error(`Cannot read ${cluster} externally-provided.json`, { cause });
  }
  const external = ExternallyProvided(declared);
  if (external instanceof type.errors) {
    throw new Error(`${cluster} externally-provided.json is invalid: ${external.summary}`);
  }
  const provided = new Set<string>(listed);
  for (const { namespace, name } of external) {
    const secret = `${namespace}/${name}`;
    if (provided.has(secret)) throw new Error(`${cluster} provides ${secret} twice`);
    provided.add(secret);
  }
  for (const secret of consumed) {
    if (!provided.has(secret)) {
      // Proof: removing sqlite-backup-s3 from platform-local's declaration made the production
      // validator's missing-secret negative reject on 2026-09-18; removing this loop let it pass.
      throw new Error(`${cluster} consumes Secret ${secret}, which is neither listed nor declared`);
    }
  }
  for (const secret of provided) {
    if (!consumed.has(secret)) {
      // Proof: removing this check made the unconsumed-declaration negative resolve on 2026-09-18.
      throw new Error(`${cluster} provides Secret ${secret}, which nothing consumes`);
    }
  }
}

const TrustedPolicy = type({
  kind: "'ValidatingAdmissionPolicy'",
  metadata: { name: "'puni-trusted-hostpath'" },
  spec: {
    matchConstraints: {
      namespaceSelector: {
        matchExpressions: type({ key: 'string', operator: 'string' }).array(),
      },
    },
  },
});

/**
 * Require the trusted-hostpath policy to match only labelled trusted namespaces. Its
 * binding denies when the parameter ConfigMap is absent, so an unscoped policy would
 * block every pod in the cluster, including kube-system and flux-system.
 */
export function assertTrustedPolicyScope(manifests: readonly PlatformManifest[]): void {
  const policies = manifests.flatMap(({ document }) => {
    const policy = TrustedPolicy(document);
    return policy instanceof type.errors ? [] : [policy];
  });
  const expressions = policies[0]?.spec.matchConstraints.namespaceSelector.matchExpressions ?? [];
  if (
    policies.length !== 1 ||
    expressions.length !== 1 ||
    expressions[0]?.key !== 'puni.dev/trusted-hostpath' ||
    expressions[0].operator !== 'Exists'
  ) {
    // Proof: deleting the namespaceSelector made the unscoped-policy negative reject on
    // 2026-09-18; live, the unscoped policy with its parameter deleted denied a kube-system pod.
    throw new Error(
      'puni-trusted-hostpath must match only namespaces labelled puni.dev/trusted-hostpath',
    );
  }
}
