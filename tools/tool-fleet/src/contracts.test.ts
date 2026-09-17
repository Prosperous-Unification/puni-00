import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { readToolchain } from './contracts';

const sha256 = 'a'.repeat(64);

const validToolchain = {
  schemaVersion: 1,
  supportedHosts: [{ distribution: 'ubuntu', version: '24.04', arch: 'amd64' }],
  binaries: {
    terraform: {
      version: '1.0.0',
      url: 'https://example.test/terraform',
      sha256,
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
  terraform: { hcloudProvider: '1.0.0' },
  controller: {
    image: 'registry.example.test/puni/fleet-controller:1.0.0',
    digest: `sha256:${sha256}`,
    python: '3.12.0',
    ansibleCore: '2.18.0',
    collections: { communityGeneral: '10.0.0', hetznerHcloud: '4.0.0', kubernetesCore: '5.0.0' },
  },
  charts: {
    hcloudCcm: {
      version: '1.0.0',
      url: 'https://charts.example.test/ccm.tgz',
      sha256,
      images: [{ name: 'ccm', digest: `sha256:${sha256}` }],
    },
    hcloudCsi: {
      version: '1.0.0',
      url: 'https://charts.example.test/csi.tgz',
      sha256,
      images: [{ name: 'csi', digest: `sha256:${sha256}` }],
    },
    traefik: {
      version: '1.0.0',
      url: 'https://charts.example.test/traefik.tgz',
      sha256,
      images: [{ name: 'traefik', digest: `sha256:${sha256}` }],
    },
    certManager: {
      version: '1.0.0',
      url: 'https://charts.example.test/cert-manager.tgz',
      sha256,
      images: [{ name: 'controller', digest: `sha256:${sha256}` }],
    },
    eckOperator: {
      version: '1.0.0',
      url: 'https://charts.example.test/eck.tgz',
      sha256,
      images: [{ name: 'operator', digest: `sha256:${sha256}` }],
    },
    elasticsearch: {
      version: '1.0.0',
      url: 'https://charts.example.test/elasticsearch.tgz',
      sha256,
      images: [{ name: 'elasticsearch', digest: `sha256:${sha256}` }],
    },
    kibana: {
      version: '1.0.0',
      url: 'https://charts.example.test/kibana.tgz',
      sha256,
      images: [{ name: 'kibana', digest: `sha256:${sha256}` }],
    },
    kubePrometheusStack: {
      version: '1.0.0',
      url: 'https://charts.example.test/prometheus.tgz',
      sha256,
      images: [{ name: 'prometheus', digest: `sha256:${sha256}` }],
    },
    opentelemetryCollector: {
      version: '1.0.0',
      url: 'https://charts.example.test/otel.tgz',
      sha256,
      images: [{ name: 'collector', digest: `sha256:${sha256}` }],
    },
    velero: {
      version: '1.0.0',
      url: 'https://charts.example.test/velero.tgz',
      sha256,
      images: [{ name: 'velero', digest: `sha256:${sha256}` }],
    },
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
    expect(toolchain.binaries.k3s.version).toBe('v1.37.0+k3s1');
  });

  it('reads the complete exact toolchain', async () => {
    const path = await writeToolchain(validToolchain);
    expect((await readToolchain(path)).binaries.k3s.version).toBe('v1.0.0+k3s1');
  });

  // Proof: deleting the k3s lock from the production input must refuse before
  // any installer can select an unpinned release channel.
  it('rejects a missing required binary lock', async () => {
    const { k3s: _removed, ...binaries } = validToolchain.binaries;
    const path = await writeToolchain({ ...validToolchain, binaries });
    expect(readToolchain(path)).rejects.toThrow(/k3s/);
  });

  // Proof: shortening the checksum to a non-SHA-256 value must refuse before
  // any downloader treats the artifact as verified.
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

  // Proof: adding an unknown lock key must refuse rather than allow an
  // operator typo to look configured while the required key stays unchanged.
  it('rejects unknown keys', async () => {
    const path = await writeToolchain({ ...validToolchain, releaseChannel: 'stable' });
    expect(readToolchain(path)).rejects.toThrow(/releaseChannel/);
  });

  it('rejects unreadable and malformed required state', async () => {
    const directory = await scratchAsync('tool-fleet-contract-');
    expect(readToolchain(join(directory, 'missing.json'))).rejects.toThrow(/toolchain/i);
    const path = join(directory, 'toolchain.json');
    await writeFile(path, '{');
    expect(readToolchain(path)).rejects.toThrow(/JSON/);
  });
});
