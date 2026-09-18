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
  metadata: { name: "'puni-trusted-workload'", namespace: "'wbs-solver'" },
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
