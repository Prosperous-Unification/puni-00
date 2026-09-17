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

describe('validatePlatform', () => {
  it('accepts the locked ordered platform graph for every cluster overlay', async () => {
    const platform = await validatePlatform(repositoryRoot);
    expect(platform).toEqual({
      clusters: ['platform-local', 'platform-production', 'workers-local', 'workers-production'],
      releases: ['cert-manager', 'hcloud-ccm', 'hcloud-csi', 'traefik'],
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
      'infra/platform/registry/registry.yaml',
      'sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
      `sha256:${'b'.repeat(64)}`,
    );
    expect(validatePlatform(root)).rejects.toThrow(/Registry image.*toolchain lock/);
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
      'puni.dev/cluster-id: workers-local',
      'puni.dev/cluster-id: platform-local',
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
});
