import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { validatePlatform } from './platform';

const repositoryRoot = join(import.meta.dir, '../../..');

async function mutablePlatform(): Promise<string> {
  const root = await scratchAsync('tool-fleet-platform-');
  await mkdir(join(root, 'infra'), { recursive: true });
  await cp(join(repositoryRoot, 'infra/versions'), join(root, 'infra/versions'), {
    recursive: true,
  });
  await cp(join(repositoryRoot, 'infra/clusters'), join(root, 'infra/clusters'), {
    recursive: true,
  });
  await cp(join(repositoryRoot, 'infra/platform'), join(root, 'infra/platform'), {
    recursive: true,
  });
  await mkdir(join(root, 'infra/ansible/playbooks'), { recursive: true });
  await cp(
    join(repositoryRoot, 'infra/ansible/playbooks/platform.yml'),
    join(root, 'infra/ansible/playbooks/platform.yml'),
  );
  await mkdir(join(root, 'tools/tool-fleet/src'), { recursive: true });
  await cp(
    join(repositoryRoot, 'tools/tool-fleet/src/backup-sqlite.ts'),
    join(root, 'tools/tool-fleet/src/backup-sqlite.ts'),
  );
  return root;
}

async function replaceManifestText(
  root: string,
  relativePath: string,
  before: string,
  after: string,
) {
  const path = join(root, relativePath);
  const source = await readFile(path, 'utf8');
  expect(source).toContain(before);
  await writeFile(path, source.replace(before, after));
}

async function removeExternalSecret(root: string, cluster: string, name: string) {
  const path = join(root, 'infra/platform/secrets', cluster, 'externally-provided.json');
  const declared: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(declared)) throw new Error(`${path} is not a list`);
  const kept = declared.filter(
    (entry: unknown) =>
      typeof entry !== 'object' || entry === null || Reflect.get(entry, 'name') !== name,
  );
  expect(kept.length).toBe(declared.length - 1);
  await writeFile(path, JSON.stringify(kept));
}

describe('validatePlatform', () => {
  it('accepts the locked ordered platform graph for every cluster overlay', async () => {
    const platform = await validatePlatform(repositoryRoot);
    expect(platform).toEqual({
      clusters: ['platform-local', 'platform-production', 'workers-local', 'workers-production'],
      releases: [
        'cert-manager',
        'hcloud-ccm',
        'hcloud-csi',
        'traefik',
        'eck-operator',
        'elasticsearch',
        'kibana',
        'kube-prometheus-stack',
        'otel-collector',
        'otel-agent',
        'velero',
      ],
      workloadImages: 11,
      secrets: 0,
    });
  });

  it('rejects a chart version that differs from the toolchain lock', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/networking/traefik.yaml',
      'version: 41.6.0',
      'version: 41.6.1',
    );
    expect(validatePlatform(root)).rejects.toThrow(/traefik.*version.*toolchain lock/i);
  });

  it('rejects a chart source that bypasses the vendored archive', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/networking/traefik.yaml',
      'chart: ./infra/platform/charts/traefik-41.6.0.tgz',
      'chart: traefik',
    );
    expect(validatePlatform(root)).rejects.toThrow(/traefik.*vendored chart archive/);
  });

  it('rejects a chart image digest that differs from the toolchain lock', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/networking/traefik.yaml',
      'digest: sha256:f86a2cab1b5c649070c49f883c743dd32d8485a56e3368c5f93b9e91f1e91259',
      'unusedDigest: sha256:f86a2cab1b5c649070c49f883c743dd32d8485a56e3368c5f93b9e91f1e91259',
    );
    expect(validatePlatform(root)).rejects.toThrow(/traefik values.*image\.digest/);
  });

  it('rejects a CSI tag that changes the rendered image reference', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/storage/production/hcloud-csi.yaml',
      "csiAttacher:\n          name: registry.k8s.io/sig-storage/csi-attacher:v4.11.0@sha256:b74b05b39501565022883fc128002b4cb857a7bb6c858606bcb3fdedba0b0b80\n          tag: ''",
      'csiAttacher:\n          name: registry.k8s.io/sig-storage/csi-attacher:v4.11.0@sha256:b74b05b39501565022883fc128002b4cb857a7bb6c858606bcb3fdedba0b0b80\n          tag: v0',
    );
    expect(validatePlatform(root)).rejects.toThrow(/hcloud-csi values.*csiAttacher\.tag/);
  });

  it('rejects an image repository that differs from the toolchain lock', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/networking/traefik.yaml',
      'repository: library/traefik',
      'repository: untrusted/traefik',
    );
    expect(validatePlatform(root)).rejects.toThrow(/traefik.*locked controller image reference/);
  });

  it('rejects an unmodeled chart branch that overrides the locked image', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/networking/traefik.yaml',
      '  values:\n    image:',
      '  values:\n    oci_meta:\n      enabled: true\n      repo: docker.io\n      images:\n        proxy:\n          image: library/traefik\n          tag: v3.7.13\n    image:',
    );
    expect(validatePlatform(root)).rejects.toThrow(/traefik values.*oci_meta.*must be removed/i);
  });

  it('rejects a Helm post-renderer that overrides the locked image', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/networking/traefik.yaml',
      '  interval: 30m\n  chart:',
      '  interval: 30m\n  postRenderers:\n    - kustomize:\n        patches: []\n  chart:',
    );
    expect(validatePlatform(root)).rejects.toThrow(/traefik HelmRelease.*postRenderers/i);
  });

  it('rejects a native Kustomize patch that overrides the locked image', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/networking/kustomization.yaml',
      'kind: Kustomization\nresources:',
      'kind: Kustomization\npatches: []\nresources:',
    );
    expect(validatePlatform(root)).rejects.toThrow(/networking.*native Kustomization.*patches/i);
  });

  it('rejects a substituted native Kustomize resource graph', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/networking/kustomization.yaml',
      '  - traefik.yaml',
      '  - namespaces.yaml',
    );
    expect(validatePlatform(root)).rejects.toThrow(
      /networking.*resources differ from the locked graph/i,
    );
  });

  it('rejects changed vendored chart bytes', async () => {
    const root = await mutablePlatform();
    const path = join(root, 'infra/platform/charts/traefik-41.6.0.tgz');
    const chart = await readFile(path);
    await writeFile(path, Buffer.concat([chart, Buffer.from([0])]));
    expect(validatePlatform(root)).rejects.toThrow(/traefik chart archive.*toolchain lock/);
  });

  it('rejects a registry image digest that differs from the toolchain lock', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/registry/base/registry.yaml',
      'sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
      `sha256:${'b'.repeat(64)}`,
    );
    expect(validatePlatform(root)).rejects.toThrow(
      /Deployment\/registry container registry image differs from the toolchain lock/,
    );
  });

  it('rejects changed Flux install bytes', async () => {
    const root = await mutablePlatform();
    const path = join(root, 'infra/platform/flux/install.yaml');
    await writeFile(path, `${await readFile(path, 'utf8')}\n`);
    expect(validatePlatform(root)).rejects.toThrow(/Flux install manifest.*toolchain lock/);
  });

  it('rejects a production reconciliation graph without the SOPS age key', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/clusters/platform/production/platform.yaml',
      'name: sops-age',
      'name: missing-age-key',
    );
    expect(validatePlatform(root)).rejects.toThrow(/SOPS.*sops-age/);
  });

  it('rejects an overlay bound to another cluster identity', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/clusters/workers/local/identity.yaml',
      'cluster-id: workers-local',
      'cluster-id: platform-local',
    );
    expect(validatePlatform(root)).rejects.toThrow(/workers-local.*cluster identity/);
  });

  it('rejects a stage using another cluster kubeconfig', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/clusters/workers/local/policy.yaml',
      'name: workers-local-kubeconfig',
      'name: platform-local-kubeconfig',
    );
    expect(validatePlatform(root)).rejects.toThrow(/workers-local.*wrong cluster kubeconfig/);
  });

  it('rejects a Flux stage that transforms reconciled images', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/clusters/platform/local/controllers.yaml',
      '  prune: true\n  sourceRef:',
      '  prune: true\n  images:\n    - name: docker.io/library/traefik\n      newTag: latest\n  sourceRef:',
    );
    expect(validatePlatform(root)).rejects.toThrow(
      /platform-local Flux controllers graph.*images/i,
    );
  });

  it('rejects a Flux stage that selects another platform path', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/clusters/platform/local/controllers.yaml',
      'path: ./infra/platform/networking',
      'path: ./infra/platform/registry',
    );
    expect(validatePlatform(root)).rejects.toThrow(
      /platform-local.*controllers.*wrong platform path/,
    );
  });

  it('rejects a Flux bootstrap that gives controllers a loopback kubeconfig', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/ansible/playbooks/platform.yml',
      'server: https://kubernetes.default.svc:443',
      'server: https://127.0.0.1:6443',
    );
    expect(validatePlatform(root)).rejects.toThrow(/controller-reachable kubeconfig/);
  });

  it('rejects a target stage that does not gate on its own cluster marker', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/clusters/workers/production/target.yaml',
      'name: puni-cluster-workers-production',
      'name: puni-cluster-platform-production',
    );
    expect(validatePlatform(root)).rejects.toThrow(
      /workers-production target must gate on its own cluster marker/,
    );
  });

  it('rejects a stage that waits instead of gating on the marker', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/clusters/platform/local/target.yaml',
      '  timeout: 2m',
      '  wait: true\n  timeout: 2m',
    );
    expect(validatePlatform(root)).rejects.toThrow(
      /platform-local target must gate on its own cluster marker/,
    );
  });

  it('accepts an age-encrypted Secret and rejects a plaintext value', async () => {
    const root = await mutablePlatform();
    const directory = join(root, 'infra/platform/secrets/platform-local');
    const encrypted = [
      'apiVersion: v1',
      'kind: Secret',
      'metadata:',
      '  name: registry-auth',
      '  namespace: puni-registry',
      'type: Opaque',
      'stringData:',
      '  htpasswd: ENC[AES256_GCM,data:abc=,iv:def=,tag:ghi=,type:str]',
      'sops:',
      '  age:',
      '    - recipient: age19s6nmqap08myaytgxzgwftjprftlz47k0huh8ng5khv9r59ycc0qydc4sk',
      '      enc: armored',
      '  encrypted_regex: ^(data|stringData)$',
      '',
    ].join('\n');
    await writeFile(join(directory, 'registry-auth.sops.yaml'), encrypted);
    await writeFile(
      join(directory, 'kustomization.yaml'),
      'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n  - registry-auth.sops.yaml\n',
    );
    await removeExternalSecret(root, 'platform-local', 'registry-auth');
    expect((await validatePlatform(root)).secrets).toBe(1);
    await writeFile(
      join(directory, 'registry-auth.sops.yaml'),
      encrypted.replace('ENC[AES256_GCM,data:abc=,iv:def=,tag:ghi=,type:str]', 'puni:plaintext'),
    );
    expect(validatePlatform(root)).rejects.toThrow(/carries a plaintext Secret value/);
  });

  it('rejects a Secret outside a SOPS secrets directory', async () => {
    const root = await mutablePlatform();
    const path = join(root, 'infra/platform/registry/base/registry.yaml');
    await writeFile(
      path,
      `${await readFile(path, 'utf8')}---\napiVersion: v1\nkind: Secret\nmetadata:\n  name: registry-auth\n  namespace: puni-registry\nstringData:\n  htpasswd: plain\n`,
    );
    expect(validatePlatform(root)).rejects.toThrow(/outside a SOPS secrets directory/);
  });

  it('rejects a secrets directory that lists a non-SOPS resource', async () => {
    const root = await mutablePlatform();
    await writeFile(
      join(root, 'infra/platform/secrets/workers-local/kustomization.yaml'),
      'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n  - plain.yaml\n',
    );
    expect(validatePlatform(root)).rejects.toThrow(/only sorted \*\.sops\.yaml Secrets/);
  });

  it('rejects a registry without authentication', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/registry/base/registry.yaml',
      '            - { name: REGISTRY_AUTH, value: htpasswd }\n',
      '',
    );
    expect(validatePlatform(root)).rejects.toThrow(/REGISTRY_AUTH=htpasswd/);
  });

  it('rejects a SQLite runner ConfigMap that differs from the reviewed source', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/backup/sqlite/runner.yaml',
      "    export const restoreProcedureVersion = 'sqlite-restore/1';",
      "    export const restoreProcedureVersion = 'sqlite-restore/1';\n    console.log('changed');",
    );
    expect(validatePlatform(root)).rejects.toThrow(/SQLite backup runner ConfigMap differs/);
  });

  it('rejects a plain workload image outside the toolchain lock', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/observability/prometheus/blackbox-exporter.yaml',
      'blackbox-exporter:v0.28.0@sha256:e753ff9f3fc458d02cca5eddab5a77e1c175eee484a8925ac7d524f04366c2fc',
      'blackbox-exporter:latest',
    );
    expect(validatePlatform(root)).rejects.toThrow(
      /Deployment\/blackbox-exporter container blackbox-exporter image differs/,
    );
  });

  it('rejects an unlocked init container in a backup job', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/backup/sqlite/cronjob.yaml',
      '          containers:\n',
      '          initContainers:\n            - { name: fetch, image: docker.io/library/alpine:3 }\n          containers:\n',
    );
    expect(validatePlatform(root)).rejects.toThrow(/CronJob\/sqlite-backup container fetch/);
  });

  it('rejects a changed Velero plugin image', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/backup/velero/production/velero.yaml',
      'velero-plugin-for-aws:v1.14.1@sha256:1493a0039cd5cb31004cfbb52f8a1990bc0ed81497ce72516bc76fa9e21506c1',
      'velero-plugin-for-aws:v1.14.1',
    );
    expect(validatePlatform(root)).rejects.toThrow(/velero differs from the locked pluginAws/);
  });

  it('rejects the unpinned kube-prometheus-stack CRD upgrade job', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/observability/prometheus/kube-prometheus-stack.yaml',
      '    crds:\n      enabled: true\n',
      '    crds:\n      enabled: true\n      upgradeJob:\n        enabled: true\n',
    );
    expect(validatePlatform(root)).rejects.toThrow(
      /kube-prometheus-stack values.*crds\.upgradeJob/,
    );
  });

  it('rejects an Elasticsearch version that differs from its image', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/observability/elastic/local/elasticsearch.yaml',
      'version: 9.3.8',
      'version: 9.5.0',
    );
    expect(validatePlatform(root)).rejects.toThrow(/elasticsearch version 9\.5\.0 differs/);
  });

  it('rejects an Elasticsearch pod template that overrides the container image', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/observability/elastic/production/elasticsearch.yaml',
      '              - name: elasticsearch\n',
      '              - name: elasticsearch\n                image: docker.elastic.co/elasticsearch/elasticsearch:9.5.0\n',
    );
    expect(validatePlatform(root)).rejects.toThrow(/elasticsearch values.*image/);
  });

  it('rejects a collector image volume', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/observability/otel/collector.yaml',
      '    extraVolumes:\n',
      '    extraVolumes:\n      - name: tools\n        image: { reference: docker.io/library/alpine:3 }\n',
    );
    expect(validatePlatform(root)).rejects.toThrow(/otel-collector values.*extraVolumes/);
  });

  it('rejects a Flux bootstrap without the target-cluster marker', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/ansible/playbooks/platform.yml',
      "combine({'immutable': true})",
      'combine({})',
    );
    expect(validatePlatform(root)).rejects.toThrow(/immutable target-cluster marker/);
  });

  it('rejects a trusted solver image that is not digest-pinned', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/policy/trusted-images.yaml',
      ',registry.puni.test/wbs-be@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      ',registry.puni.test/wbs-be:rollback',
    );
    expect(validatePlatform(root)).rejects.toThrow(/one or two distinct digest-pinned/);
  });

  it('rejects a workers stage that selects a platform-only capability', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/telemetry/agent/agent.yaml',
      '    tolerations:\n',
      "    nodeSelector:\n      puni.dev/capability-observability: 'true'\n    tolerations:\n",
    );
    expect(validatePlatform(root)).rejects.toThrow(
      /workers-local telemetry stage selects capability observability/,
    );
  });

  it('rejects a collector OTLP port bound on the host', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/observability/otel/collector.yaml',
      '      otlp:\n        enabled: true\n        hostPort: 0\n',
      '      otlp:\n        enabled: true\n',
    );
    expect(validatePlatform(root)).rejects.toThrow(/otel-collector values.*ports\.otlp\.hostPort/);
  });

  it('rejects a consumed Secret that is neither listed nor declared', async () => {
    const root = await mutablePlatform();
    await removeExternalSecret(root, 'platform-local', 'sqlite-backup-s3');
    expect(validatePlatform(root)).rejects.toThrow(
      /platform-local consumes Secret wbs\/sqlite-backup-s3, which is neither listed nor declared/,
    );
  });

  it('rejects a declared Secret that nothing consumes', async () => {
    const root = await mutablePlatform();
    await writeFile(
      join(root, 'infra/platform/secrets/workers-local/externally-provided.json'),
      JSON.stringify([{ namespace: 'wbs', name: 'sqlite-backup-s3', source: 'rehearsal' }]),
    );
    expect(validatePlatform(root)).rejects.toThrow(
      /workers-local provides Secret wbs\/sqlite-backup-s3, which nothing consumes/,
    );
  });

  it('rejects a trusted parameter ConfigMap that Flux would keep reverting', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/policy/trusted-images.yaml',
      'kustomize.toolkit.fluxcd.io/ssa: IfNotPresent',
      'kustomize.toolkit.fluxcd.io/ssa: Merge',
    );
    expect(validatePlatform(root)).rejects.toThrow(/ssa: IfNotPresent/);
  });

  it('rejects a trusted-hostpath policy that matches every namespace', async () => {
    const root = await mutablePlatform();
    await replaceManifestText(
      root,
      'infra/platform/policy/trusted-workloads.yaml',
      '    namespaceSelector:\n      matchExpressions:\n        - { key: puni.dev/trusted-hostpath, operator: Exists }\n',
      '',
    );
    expect(validatePlatform(root)).rejects.toThrow(/must match only namespaces labelled/);
  });
});
