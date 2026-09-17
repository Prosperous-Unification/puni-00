import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { readToolchain } from './contracts';

const sha256 = 'a'.repeat(64);
const image = (role: string) => ({ role, name: `${role}:1.0.0`, digest: `sha256:${sha256}` });
const chart = (roles: readonly string[]) => ({
  version: '1.0.0',
  url: 'https://example.test/chart.tgz',
  sha256,
  images: roles.map(image),
  disabledComponents: [],
});

const validToolchain = {
  schemaVersion: 1,
  supportedHosts: [{ distribution: 'ubuntu', version: '24.04', arch: 'amd64' }],
  binaries: {
    terragrunt: {
      version: '1.1.5',
      url: 'https://example.test/terragrunt',
      sha256,
      os: 'linux',
      arch: 'amd64',
    },
    terraform: {
      version: '1.0.0',
      url: 'https://example.test/terraform',
      sha256,
      executableSha256: sha256,
      os: 'linux',
      arch: 'amd64',
    },
    k3s: {
      version: 'v1.0.0+k3s1',
      url: 'https://example.test/k3s',
      sha256,
      os: 'linux',
      arch: 'amd64',
    },
    k3d: { version: 'v1.0.0', url: 'https://example.test/k3d', sha256, os: 'linux', arch: 'amd64' },
    flux: {
      version: 'v1.0.0',
      url: 'https://example.test/flux',
      sha256,
      os: 'linux',
      arch: 'amd64',
    },
    kubectl: {
      version: 'v1.0.0',
      url: 'https://example.test/kubectl',
      sha256,
      os: 'linux',
      arch: 'amd64',
    },
    helm: {
      version: 'v1.0.0',
      url: 'https://example.test/helm',
      sha256,
      os: 'linux',
      arch: 'amd64',
    },
    multipass: {
      version: '1.0.0',
      url: 'https://example.test/multipass',
      sha256,
      os: 'linux',
      arch: 'amd64',
    },
  },
  terraform: {
    hcloudProvider: {
      version: '1.0.0',
      source: 'registry.terraform.io/hetznercloud/hcloud',
      url: 'https://example.test/hcloud.zip',
      sha256,
      os: 'linux',
      arch: 'amd64',
    },
  },
  runtimeImages: { k3dNode: image('node'), registry: image('registry') },
  controller: {
    image: 'registry.example.test/puni/fleet-controller:1.0.0',
    digest: `sha256:${sha256}`,
    python: '3.12.0',
    pythonPackages: {
      certifi: '2026.7.22',
      charsetNormalizer: '3.5.1',
      idna: '3.19',
      pythonDateutil: '2.9.0.post0',
      requests: '2.34.2',
      six: '1.17.0',
      urllib3: '2.8.0',
    },
    ansibleCore: '2.18.0',
    collections: { communityGeneral: '10.0.0', hetznerHcloud: '4.0.0', kubernetesCore: '5.0.0' },
  },
  charts: {
    hcloudCcm: chart(['controller']),
    hcloudCsi: chart([
      'controller',
      'csiAttacher',
      'csiNodeDriverRegistrar',
      'csiProvisioner',
      'csiResizer',
      'livenessProbe',
    ]),
    traefik: chart(['controller']),
    certManager: chart(['acmeSolver', 'caInjector', 'controller', 'startupApiCheck', 'webhook']),
    eckOperator: chart(['operator']),
    elasticsearch: chart(['node']),
    kibana: chart(['node']),
    kubePrometheusStack: chart([
      'admissionWebhook',
      'admissionWebhookCertgen',
      'alertmanager',
      'configReloader',
      'kubeStateMetrics',
      'nodeExporter',
      'operator',
      'prometheus',
    ]),
    opentelemetryCollector: chart(['collector']),
    velero: chart(['server']),
  },
};

async function writeToolchain(value: unknown): Promise<string> {
  const directory = await scratchAsync('tool-fleet-contract-');
  const path = join(directory, 'toolchain.json');
  await writeFile(path, JSON.stringify(value));
  return path;
}

describe('readToolchain', () => {
  it('reads the committed fleet toolchain', async () => {
    const path = join(import.meta.dir, '../../../infra/versions/toolchain.json');
    const toolchain = await readToolchain(path);
    expect(toolchain.supportedHosts).toEqual([
      { distribution: 'ubuntu', version: '24.04', arch: 'amd64' },
    ]);
    expect(toolchain.binaries.k3s.version).toBe('v1.36.4+k3s1');
  });

  it('reads the complete exact toolchain', async () => {
    const path = await writeToolchain(validToolchain);
    expect((await readToolchain(path)).binaries.k3s.version).toBe('v1.0.0+k3s1');
  });

  it('rejects a missing required binary lock', async () => {
    const { k3s: _removed, ...binaries } = validToolchain.binaries;
    const path = await writeToolchain({ ...validToolchain, binaries });
    expect(readToolchain(path)).rejects.toThrow(/k3s/);
  });

  it('rejects a missing Terragrunt lock', async () => {
    const { terragrunt: _removed, ...binaries } = validToolchain.binaries;
    expect(readToolchain(await writeToolchain({ ...validToolchain, binaries }))).rejects.toThrow(
      /terragrunt/,
    );
  });

  it('rejects a missing registry image lock', async () => {
    const { registry: _removed, ...runtimeImages } = validToolchain.runtimeImages;
    expect(
      readToolchain(await writeToolchain({ ...validToolchain, runtimeImages })),
    ).rejects.toThrow(/registry/);
  });

  it('requires a separately locked Terraform executable digest', async () => {
    const { executableSha256: _removed, ...terraform } = validToolchain.binaries.terraform;
    const path = await writeToolchain({
      ...validToolchain,
      binaries: { ...validToolchain.binaries, terraform },
    });
    // Proof: using only the archive digest made the production runner compare the extracted
    // executable against unrelated ZIP bytes and reject every valid Terraform installation.
    expect(readToolchain(path)).rejects.toThrow(/executableSha256/);
  });

  it('rejects a missing controller Python dependency closure', async () => {
    const { pythonPackages: _removed, ...controller } = validToolchain.controller;
    const path = await writeToolchain({ ...validToolchain, controller });
    expect(readToolchain(path)).rejects.toThrow(/pythonPackages/);
  });

  it('rejects an invalid checksum', async () => {
    const path = await writeToolchain({
      ...validToolchain,
      binaries: {
        ...validToolchain.binaries,
        k3s: { ...validToolchain.binaries.k3s, sha256: 'abc' },
      },
    });
    expect(readToolchain(path)).rejects.toThrow(/sha256/);
  });

  it('rejects unknown keys', async () => {
    const path = await writeToolchain({ ...validToolchain, releaseChannel: 'stable' });
    expect(readToolchain(path)).rejects.toThrow(/releaseChannel/);
  });

  it('rejects a release channel in place of an exact version', async () => {
    const path = await writeToolchain({
      ...validToolchain,
      binaries: {
        ...validToolchain.binaries,
        k3s: { ...validToolchain.binaries.k3s, version: 'latest' },
      },
    });
    expect(readToolchain(path)).rejects.toThrow(/version/i);
  });

  it('rejects an artifact for an unsupported platform', async () => {
    const path = await writeToolchain({
      ...validToolchain,
      binaries: {
        ...validToolchain.binaries,
        k3s: { ...validToolchain.binaries.k3s, os: 'darwin', arch: 'arm64' },
      },
    });
    expect(readToolchain(path)).rejects.toThrow(/os|arch/i);
  });

  it('rejects an incomplete chart image closure', async () => {
    const path = await writeToolchain({
      ...validToolchain,
      charts: {
        ...validToolchain.charts,
        certManager: {
          ...validToolchain.charts.certManager,
          images: validToolchain.charts.certManager.images.filter(({ role }) => role !== 'webhook'),
        },
      },
    });
    expect(readToolchain(path)).rejects.toThrow(/certManager image roles/);
  });

  it('rejects image roles that use a delimiter to hide a missing role', async () => {
    const certManager = validToolchain.charts.certManager;
    const path = await writeToolchain({
      ...validToolchain,
      charts: {
        ...validToolchain.charts,
        certManager: {
          ...certManager,
          images: certManager.images
            .filter(({ role }) => role !== 'caInjector')
            .map((lock) =>
              lock.role === 'acmeSolver' ? { ...lock, role: 'acmeSolver\ncaInjector' } : lock,
            ),
        },
      },
    });
    expect(readToolchain(path)).rejects.toThrow(/certManager image roles/);
  });

  it('rejects absent, unreadable, and malformed required state', async () => {
    const directory = await scratchAsync('tool-fleet-contract-');
    expect(readToolchain(join(directory, 'missing.json'))).rejects.toThrow(/toolchain/i);
    expect(readToolchain(directory)).rejects.toThrow(/toolchain/i);
    const path = join(directory, 'toolchain.json');
    await writeFile(path, '{');
    expect(readToolchain(path)).rejects.toThrow(/required toolchain.*valid JSON/i);
  });
});
