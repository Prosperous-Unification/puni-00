import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { parse, parseAllDocuments } from 'yaml';

import { readToolchain } from './contracts';

const PlatformIdentity = type({
  apiVersion: "'v1'",
  kind: "'ConfigMap'",
  metadata: { name: "'puni-cluster-identity'", namespace: "'flux-system'" },
  data: { 'puni.dev/cluster-id': 'string>0', '+': 'reject' },
  '+': 'reject',
});

const FluxStage = type({
  apiVersion: "'kustomize.toolkit.fluxcd.io/v1'",
  kind: "'Kustomization'",
  metadata: { name: 'string>0', namespace: "'flux-system'" },
  spec: {
    path: 'string>0',
    kubeConfig: { secretRef: { name: 'string>0' } },
    decryption: { provider: "'sops'", secretRef: { name: 'string>0' } },
    'dependsOn?': type({ name: 'string>0' }).array().atLeastLength(1),
    '+': 'delete',
  },
  '+': 'delete',
});

const HelmRelease = type({
  apiVersion: "'helm.toolkit.fluxcd.io/v2'",
  kind: "'HelmRelease'",
  metadata: { name: 'string>0', namespace: 'string>0' },
  spec: {
    chart: {
      spec: {
        chart: 'string>0',
        version: 'string>0',
        sourceRef: { kind: "'HelmRepository'", name: 'string>0', namespace: "'flux-system'" },
        '+': 'delete',
      },
      '+': 'delete',
    },
    '+': 'delete',
  },
  '+': 'delete',
});

const RegistryDeployment = type({
  apiVersion: "'apps/v1'",
  kind: "'Deployment'",
  metadata: { name: "'registry'", namespace: "'puni-registry'" },
  spec: {
    template: {
      spec: {
        automountServiceAccountToken: 'false',
        containers: type({ name: "'registry'", image: 'string>0', '+': 'delete' })
          .array()
          .atLeastLength(1),
        '+': 'delete',
      },
      '+': 'delete',
    },
    '+': 'delete',
  },
  '+': 'delete',
});

export interface TrustedWorkloadPolicy {
  readonly namespace: string;
  readonly serviceAccount: string;
  readonly controller: string;
  readonly image: string;
  readonly hostPath: string;
  readonly nodeCapability: string;
}

export interface TrustedWorkload {
  readonly namespace: string;
  readonly serviceAccount: string;
  readonly controller: string;
  readonly image: string;
  readonly hostPaths: readonly string[];
  readonly nodeSelector: Readonly<Record<string, string>>;
  readonly privileged: boolean;
  readonly allowPrivilegeEscalation: boolean;
  readonly hostNetwork: boolean;
  readonly hostPid: boolean;
  readonly automountServiceAccountToken: boolean;
}

/** Require the exact narrow boundary granted to a trusted host-path workload. */
export function assertTrustedWorkload(
  policy: TrustedWorkloadPolicy,
  workload: TrustedWorkload,
): void {
  if (workload.namespace !== policy.namespace) {
    // Proof: removing this guard made the wrong-namespace production negative stop throwing on
    // 2026-09-17.
    throw new Error('Trusted namespace does not match');
  }
  if (workload.serviceAccount !== policy.serviceAccount) {
    // Proof: removing this guard made the default-service-account production negative stop
    // throwing on 2026-09-17.
    throw new Error('Trusted service account does not match');
  }
  if (workload.controller !== policy.controller) {
    // Proof: removing this guard made the manual-controller production negative stop throwing on
    // 2026-09-17.
    throw new Error('Trusted controller does not match');
  }
  if (workload.image !== policy.image) {
    // Proof: removing this guard made the changed-image-digest production negative stop throwing
    // on 2026-09-17.
    throw new Error('Trusted image digest does not match');
  }
  if (workload.hostPaths.length !== 1 || workload.hostPaths[0] !== policy.hostPath) {
    // Proof: removing this guard made the broader-parent production negative stop throwing on
    // 2026-09-17.
    throw new Error('Trusted workload must use the exact host path');
  }
  if (workload.nodeSelector[policy.nodeCapability] !== 'true') {
    // Proof: removing this guard made the missing-node-capability production negative stop
    // throwing on 2026-09-17.
    throw new Error('Trusted workload is not bound to its required node capability');
  }
  if (
    workload.privileged ||
    workload.allowPrivilegeEscalation ||
    workload.hostNetwork ||
    workload.hostPid
  ) {
    // Proof: removing this guard made the privilege-escalation production negative stop throwing
    // on 2026-09-17.
    throw new Error('Trusted workload requests privilege escalation or host isolation bypass');
  }
  if (workload.automountServiceAccountToken) {
    // Proof: removing this guard made the automounted-token production negative stop throwing on
    // 2026-09-17.
    throw new Error('Trusted workload must not automount an API credential');
  }
}

async function readYaml(path: string): Promise<unknown> {
  try {
    return parse(await readFile(path, 'utf8'));
  } catch (cause) {
    throw new Error(`Cannot read platform manifest ${path}`, { cause });
  }
}

async function readYamlDocuments(path: string): Promise<unknown[]> {
  try {
    return parseAllDocuments(await readFile(path, 'utf8')).map((document) => {
      const encoded = JSON.stringify(document.toJSON());
      const decoded: unknown = JSON.parse(encoded);
      return decoded;
    });
  } catch (cause) {
    throw new Error(`Cannot read platform manifest ${path}`, { cause });
  }
}

const clusters = ['platform-local', 'platform-production', 'workers-local', 'workers-production'];
const clusterPaths = [
  ['platform', 'local'],
  ['platform', 'production'],
  ['workers', 'local'],
  ['workers', 'production'],
] as const;

const releases = [
  ['cert-manager', 'certManager', 'networking/cert-manager.yaml'],
  ['hcloud-ccm', 'hcloudCcm', 'storage/production/hcloud-ccm.yaml'],
  ['hcloud-csi', 'hcloudCsi', 'storage/production/hcloud-csi.yaml'],
  ['traefik', 'traefik', 'networking/traefik.yaml'],
] as const;

const stageDependencies = {
  controllers: '',
  storage: 'controllers',
  policy: 'controllers',
  platform: 'storage,policy',
} as const;

/** Validate the checked-in cluster identities and locked Flux platform graph. */
export async function validatePlatform(
  root: string,
): Promise<{ readonly clusters: readonly string[]; readonly releases: readonly string[] }> {
  const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  for (const [index, [cluster, environment]] of clusterPaths.entries()) {
    const expectedCluster = clusters[index];
    const clusterRoot = join(root, 'infra/clusters', cluster, environment);
    const identity = PlatformIdentity(await readYaml(join(clusterRoot, 'identity.yaml')));
    if (identity instanceof type.errors) {
      throw new Error(`${expectedCluster} cluster identity is invalid: ${identity.summary}`);
    }
    if (identity.data['puni.dev/cluster-id'] !== expectedCluster) {
      // Proof: removing this guard made the substituted cluster-identity production negative
      // resolve instead of reject on 2026-09-17.
      throw new Error(`${expectedCluster} cluster identity does not match its overlay`);
    }

    for (const [stageName, expectedDependencies] of Object.entries(stageDependencies)) {
      const stage = FluxStage(await readYaml(join(clusterRoot, `${stageName}.yaml`)));
      if (stage instanceof type.errors) {
        throw new Error(`${expectedCluster} Flux ${stageName} graph is invalid: ${stage.summary}`);
      }
      if (stage.metadata.name !== stageName) {
        throw new Error(`${expectedCluster} Flux stage name does not match ${stageName}`);
      }
      if (stage.spec.kubeConfig.secretRef.name !== `${expectedCluster}-kubeconfig`) {
        // Proof: removing this guard made the cross-cluster-kubeconfig production negative resolve
        // instead of reject on 2026-09-17.
        throw new Error(`${expectedCluster} Flux graph uses the wrong cluster kubeconfig`);
      }
      if (stage.spec.decryption.secretRef.name !== 'sops-age') {
        // Proof: removing this guard made the missing-decryption-key production negative resolve
        // instead of reject on 2026-09-17.
        throw new Error(`${expectedCluster} SOPS decryption must use sops-age`);
      }
      const dependencies = (stage.spec.dependsOn ?? []).map(({ name }) => name).join(',');
      if (dependencies !== expectedDependencies) {
        throw new Error(`${expectedCluster} ${stageName} dependency order is invalid`);
      }
    }
  }

  const releaseNames: string[] = [];
  for (const [releaseName, lockName, relativePath] of releases) {
    const releasePath = join(root, 'infra/platform', relativePath);
    const releaseSource = await readFile(releasePath, 'utf8');
    const release = HelmRelease(parse(releaseSource));
    if (release instanceof type.errors) {
      throw new Error(`${releaseName} HelmRelease is invalid: ${release.summary}`);
    }
    if (release.metadata.name !== releaseName) throw new Error(`${releaseName} name is invalid`);
    if (release.spec.chart.spec.version !== toolchain.charts[lockName].version) {
      // Proof: removing this guard made the changed-chart-version production negative resolve
      // instead of reject on 2026-09-17.
      throw new Error(`${releaseName} chart version differs from the toolchain lock`);
    }
    for (const image of toolchain.charts[lockName].images) {
      if (!releaseSource.includes(image.digest)) {
        // Proof: removing this guard made the changed-Traefik-image production negative resolve
        // instead of reject on 2026-09-17.
        throw new Error(`${releaseName} omits locked ${image.role} image digest`);
      }
    }
    releaseNames.push(releaseName);
  }

  const registryDocuments = await readYamlDocuments(
    join(root, 'infra/platform/registry/registry.yaml'),
  );
  const registry = registryDocuments
    .map((document) => RegistryDeployment(document))
    .find((document) => !(document instanceof type.errors));
  if (registry === undefined || registry instanceof type.errors) {
    throw new Error('Registry deployment is absent or invalid');
  }
  const registryImage = registry.spec.template.spec.containers[0]?.image;
  const expectedRegistryImage = `${toolchain.runtimeImages.registry.name}@${toolchain.runtimeImages.registry.digest}`;
  if (registryImage !== expectedRegistryImage) {
    // Proof: removing this guard made the changed-registry-digest production negative resolve
    // instead of reject on 2026-09-17.
    throw new Error('Registry image differs from the toolchain lock');
  }

  const fluxInstall = await readFile(join(root, 'infra/platform/flux/install.yaml'));
  const fluxInstallSha256 = createHash('sha256').update(fluxInstall).digest('hex');
  if (fluxInstallSha256 !== toolchain.manifests.fluxInstall.sha256) {
    // Proof: removing this guard made the changed-Flux-install production negative resolve instead
    // of reject on 2026-09-17.
    throw new Error('Flux install manifest differs from the toolchain lock');
  }
  return { clusters, releases: releaseNames };
}
