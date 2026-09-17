import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { assertTrustedWorkload, validatePlatform } from './platform';

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
});

describe('assertTrustedWorkload', () => {
  const policy = {
    namespace: 'wbs-solver',
    serviceAccount: 'wbs-backend',
    controller: 'Deployment/wbs-backend',
    image: `registry.puni.test/wbs-be@sha256:${'a'.repeat(64)}`,
    hostPath: '/run/puni/solver',
    nodeCapability: 'puni.dev/capability-product',
  } as const;

  const workload = {
    namespace: 'wbs-solver',
    serviceAccount: 'wbs-backend',
    controller: 'Deployment/wbs-backend',
    image: `registry.puni.test/wbs-be@sha256:${'a'.repeat(64)}`,
    hostPaths: ['/run/puni/solver'],
    nodeSelector: { 'puni.dev/capability-product': 'true' },
    privileged: false,
    allowPrivilegeEscalation: false,
    hostNetwork: false,
    hostPid: false,
    automountServiceAccountToken: false,
  } as const;

  it('accepts only the exact reviewed solver boundary', () => {
    expect(() => {
      assertTrustedWorkload(policy, workload);
    }).not.toThrow();
  });

  it('rejects an alternate host path before the workload runs', () => {
    expect(() => {
      assertTrustedWorkload(policy, { ...workload, hostPaths: ['/run/puni'] });
    }).toThrow(/exact host path/);
  });

  it('rejects an untrusted service account before the workload runs', () => {
    expect(() => {
      assertTrustedWorkload(policy, { ...workload, serviceAccount: 'default' });
    }).toThrow(/service account/);
  });

  it('rejects the wrong trusted namespace before the workload runs', () => {
    expect(() => {
      assertTrustedWorkload(policy, { ...workload, namespace: 'wbs' });
    }).toThrow(/namespace/);
  });

  it('rejects an untrusted controller before the workload runs', () => {
    expect(() => {
      assertTrustedWorkload(policy, { ...workload, controller: 'Pod/manual' });
    }).toThrow(/controller/);
  });

  it('rejects an unreviewed image before the workload runs', () => {
    expect(() => {
      assertTrustedWorkload(policy, {
        ...workload,
        image: `registry.puni.test/wbs-be@sha256:${'b'.repeat(64)}`,
      });
    }).toThrow(/image digest/);
  });

  it('rejects a workload outside its required capability before it runs', () => {
    expect(() => {
      assertTrustedWorkload(policy, { ...workload, nodeSelector: {} });
    }).toThrow(/node capability/);
  });

  it('rejects privilege escalation before the workload runs', () => {
    expect(() => {
      assertTrustedWorkload(policy, { ...workload, allowPrivilegeEscalation: true });
    }).toThrow(/privilege escalation/);
  });

  it('rejects an automounted API credential before the workload runs', () => {
    expect(() => {
      assertTrustedWorkload(policy, { ...workload, automountServiceAccountToken: true });
    }).toThrow(/API credential/);
  });
});
