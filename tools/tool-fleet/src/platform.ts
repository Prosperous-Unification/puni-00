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
        sourceRef: { kind: "'GitRepository'", name: "'puni-platform'", namespace: "'flux-system'" },
        '+': 'delete',
      },
      '+': 'delete',
    },
    values: 'unknown',
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
  [
    'cert-manager',
    'certManager',
    'networking/cert-manager.yaml',
    'charts/cert-manager-v1.21.2.tgz',
  ],
  [
    'hcloud-ccm',
    'hcloudCcm',
    'storage/production/hcloud-ccm.yaml',
    'charts/hcloud-cloud-controller-manager-1.37.0.tgz',
  ],
  ['hcloud-csi', 'hcloudCsi', 'storage/production/hcloud-csi.yaml', 'charts/hcloud-csi-2.23.0.tgz'],
  ['traefik', 'traefik', 'networking/traefik.yaml', 'charts/traefik-41.6.0.tgz'],
] as const;

const ImageValues = type({
  repository: 'string>0',
  tag: 'string>0',
  digest: 'string>0',
  '+': 'delete',
});
const TraefikValues = type({
  image: {
    registry: 'string>0',
    repository: 'string>0',
    tag: 'string>0',
    digest: 'string>0',
    '+': 'delete',
  },
  '+': 'delete',
});
const CertManagerValues = type({
  image: ImageValues,
  webhook: { image: ImageValues, '+': 'delete' },
  cainjector: { image: ImageValues, '+': 'delete' },
  acmesolver: { image: ImageValues, '+': 'delete' },
  startupapicheck: { image: ImageValues, '+': 'delete' },
  '+': 'delete',
});
const HcloudCcmValues = type({
  image: { repository: 'string>0', tag: 'string>0', '+': 'delete' },
  '+': 'delete',
});
const HcloudCsiImage = type({ name: 'string>0', tag: "''", '+': 'delete' });
const HcloudCsiValues = type({
  controller: {
    image: {
      csiAttacher: HcloudCsiImage,
      csiResizer: HcloudCsiImage,
      csiProvisioner: HcloudCsiImage,
      livenessProbe: HcloudCsiImage,
      hcloudCSIDriver: HcloudCsiImage,
      '+': 'delete',
    },
    '+': 'delete',
  },
  node: {
    image: {
      csiNodeDriverRegistrar: HcloudCsiImage,
      livenessProbe: HcloudCsiImage,
      hcloudCSIDriver: HcloudCsiImage,
      '+': 'delete',
    },
    '+': 'delete',
  },
  '+': 'delete',
});

function imageReference(repository: string, tag: string, digest: string): string {
  return `${repository}:${tag}@${digest}`;
}

function releaseImageReferences(
  releaseName: string,
  values: unknown,
): Readonly<Record<string, string>> {
  if (releaseName === 'traefik') {
    const parsed = TraefikValues(values);
    if (parsed instanceof type.errors)
      throw new Error(`traefik values are invalid: ${parsed.summary}`);
    return {
      controller: imageReference(
        `${parsed.image.registry}/${parsed.image.repository}`,
        parsed.image.tag,
        parsed.image.digest,
      ),
    };
  }
  if (releaseName === 'cert-manager') {
    const parsed = CertManagerValues(values);
    if (parsed instanceof type.errors) {
      throw new Error(`cert-manager values are invalid: ${parsed.summary}`);
    }
    return {
      controller: imageReference(parsed.image.repository, parsed.image.tag, parsed.image.digest),
      webhook: imageReference(
        parsed.webhook.image.repository,
        parsed.webhook.image.tag,
        parsed.webhook.image.digest,
      ),
      caInjector: imageReference(
        parsed.cainjector.image.repository,
        parsed.cainjector.image.tag,
        parsed.cainjector.image.digest,
      ),
      acmeSolver: imageReference(
        parsed.acmesolver.image.repository,
        parsed.acmesolver.image.tag,
        parsed.acmesolver.image.digest,
      ),
      startupApiCheck: imageReference(
        parsed.startupapicheck.image.repository,
        parsed.startupapicheck.image.tag,
        parsed.startupapicheck.image.digest,
      ),
    };
  }
  if (releaseName === 'hcloud-ccm') {
    const parsed = HcloudCcmValues(values);
    if (parsed instanceof type.errors) {
      throw new Error(`hcloud-ccm values are invalid: ${parsed.summary}`);
    }
    return { controller: `${parsed.image.repository}:${parsed.image.tag}` };
  }
  const parsed = HcloudCsiValues(values);
  if (parsed instanceof type.errors)
    throw new Error(`hcloud-csi values are invalid: ${parsed.summary}`);
  const controllerLiveness = parsed.controller.image.livenessProbe.name;
  const nodeLiveness = parsed.node.image.livenessProbe.name;
  if (controllerLiveness !== nodeLiveness) {
    throw new Error('hcloud-csi liveness probe digests differ between controller and node');
  }
  const controllerDriver = parsed.controller.image.hcloudCSIDriver.name;
  const nodeDriver = parsed.node.image.hcloudCSIDriver.name;
  if (controllerDriver !== nodeDriver) {
    throw new Error('hcloud-csi driver digests differ between controller and node');
  }
  return {
    controller: controllerDriver,
    csiAttacher: parsed.controller.image.csiAttacher.name,
    csiResizer: parsed.controller.image.csiResizer.name,
    csiProvisioner: parsed.controller.image.csiProvisioner.name,
    livenessProbe: controllerLiveness,
    csiNodeDriverRegistrar: parsed.node.image.csiNodeDriverRegistrar.name,
  };
}

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
  for (const [releaseName, lockName, relativePath, chartPath] of releases) {
    const releasePath = join(root, 'infra/platform', relativePath);
    const releaseSource = await readFile(releasePath, 'utf8');
    const release = HelmRelease(parse(releaseSource));
    if (release instanceof type.errors) {
      throw new Error(`${releaseName} HelmRelease is invalid: ${release.summary}`);
    }
    if (release.metadata.name !== releaseName) throw new Error(`${releaseName} name is invalid`);
    if (release.spec.chart.spec.chart !== `./infra/platform/${chartPath}`) {
      // Proof: removing this guard made the upstream-name Traefik source negative resolve instead
      // of requiring the vendored archive on 2026-09-17.
      throw new Error(`${releaseName} does not consume its vendored chart archive`);
    }
    if (release.spec.chart.spec.version !== toolchain.charts[lockName].version) {
      // Proof: removing this guard made the changed-chart-version production negative resolve
      // instead of reject on 2026-09-17.
      throw new Error(`${releaseName} chart version differs from the toolchain lock`);
    }
    const chart = await readFile(join(root, 'infra/platform', chartPath));
    const chartSha256 = createHash('sha256').update(chart).digest('hex');
    if (chartSha256 !== toolchain.charts[lockName].sha256) {
      // Proof: changing one byte of the vendored Traefik archive made the production platform
      // validator reject it on 2026-09-17.
      throw new Error(`${releaseName} chart archive differs from the toolchain lock`);
    }
    const configuredReferences = releaseImageReferences(releaseName, release.spec.values);
    for (const image of toolchain.charts[lockName].images) {
      if (configuredReferences[image.role] !== `${image.name}@${image.digest}`) {
        // Proof: moving the Traefik digest to ignored `image.unusedDigest` made the production
        // validator reject the missing effective value on 2026-09-17.
        // Proof: setting a CSI image tag to `v0` produced an invalid rendered reference before
        // the schema required the chart's tag suffix to remain empty on 2026-09-17.
        // Proof: substituting Traefik's repository while retaining its digest made the production
        // validator's repository negative fail on 2026-09-17.
        throw new Error(`${releaseName} differs from the locked ${image.role} image reference`);
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

  const platformPlaybook = await readFile(
    join(root, 'infra/ansible/playbooks/platform.yml'),
    'utf8',
  );
  if (
    !platformPlaybook.includes('server: https://kubernetes.default.svc:443') ||
    platformPlaybook.includes('--from-file=value.yaml=/etc/rancher/k3s/k3s.yaml') ||
    !platformPlaybook.includes('KUBECONFIG: /etc/rancher/k3s/k3s.yaml')
  ) {
    // Proof: restoring the raw node-local kubeconfig made the production validator's bootstrap
    // negative resolve before this controller-reachability guard was restored on 2026-09-17.
    throw new Error('Flux bootstrap must use a controller-reachable kubeconfig explicitly');
  }
  return { clusters, releases: releaseNames };
}
