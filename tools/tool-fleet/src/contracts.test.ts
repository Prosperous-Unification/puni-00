import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { decodeRetainedToolchain, readToolchain } from './contracts';
import { selectedHelpers } from './k3d-helper-images.fixture.test';

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
  k3dHelpers: selectedHelpers,
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
    k3d: { version: 'v5.9.0', url: 'https://example.test/k3d', sha256, os: 'linux', arch: 'amd64' },
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
    sops: {
      version: 'v1.0.0',
      url: 'https://example.test/sops',
      sha256,
      os: 'linux',
      arch: 'amd64',
    },
    age: { version: 'v1.0.0', url: 'https://example.test/age', sha256, os: 'linux', arch: 'amd64' },
    solverBun: {
      version: '1.4.2',
      url: 'https://example.test/bun',
      sha256,
      os: 'linux',
      arch: 'amd64',
    },
    gateNode: {
      version: '24.18.1',
      url: 'https://example.test/node',
      sha256,
      os: 'linux',
      arch: 'amd64',
    },
    gateGh: {
      version: '2.102.1',
      url: 'https://example.test/gh.deb',
      sha256,
      os: 'linux',
      arch: 'amd64',
    },
    crane: {
      version: 'v0.22.1',
      url: 'https://example.test/crane.tar.gz',
      sha256,
      executableSha256: sha256,
      os: 'linux',
      arch: 'amd64',
    },
  },
  hostPackages: { dockerIo: '29.1.3-0ubuntu3~24.04.2' },
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
  runtimeImages: {
    k3dNode: image('node'),
    registry: image('registry'),
    networkProbe: image('network-probe'),
    fluxHelmController: image('flux-helm-controller'),
    fluxKustomizeController: image('flux-kustomize-controller'),
    fluxNotificationController: image('flux-notification-controller'),
    fluxSourceController: image('flux-source-controller'),
    objectStore: image('object-store'),
    sqliteBackup: image('sqlite-backup'),
    blackboxExporter: image('blackbox-exporter'),
    elasticGateway: image('gateway'),
  },
  manifests: { fluxInstall: { sha256 } },
  controller: {
    image: 'registry.example.test/puni/fleet-controller:1.0.0',
    digest: `sha256:${sha256}`,
    builder: image('buildkit'),
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
    velero: chart(['pluginAws', 'server']),
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
      { distribution: 'ubuntu', version: '26.04', arch: 'amd64' },
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

  it('rejects a missing SOPS binary lock', async () => {
    const { sops: _removed, ...binaries } = validToolchain.binaries;
    expect(readToolchain(await writeToolchain({ ...validToolchain, binaries }))).rejects.toThrow(
      /sops/,
    );
  });

  it('rejects a missing gate Node lock', async () => {
    // Proof: making gateNode optional in the schema made this resolve (2026-10-21).
    const { gateNode: _removed, ...binaries } = validToolchain.binaries;
    expect(readToolchain(await writeToolchain({ ...validToolchain, binaries }))).rejects.toThrow(
      /gateNode/,
    );
  });

  it('rejects a missing gate gh lock', async () => {
    // Proof: making gateGh optional in the schema made this resolve (2026-10-21).
    const { gateGh: _removed, ...binaries } = validToolchain.binaries;
    expect(readToolchain(await writeToolchain({ ...validToolchain, binaries }))).rejects.toThrow(
      /gateGh/,
    );
  });

  it('rejects a missing crane lock', async () => {
    const { crane: _removed, ...binaries } = validToolchain.binaries;
    expect(readToolchain(await writeToolchain({ ...validToolchain, binaries }))).rejects.toThrow(
      /crane/,
    );
  });

  it('requires a separately locked crane executable digest', async () => {
    const { executableSha256: _removed, ...crane } = validToolchain.binaries.crane;
    const path = await writeToolchain({
      ...validToolchain,
      binaries: { ...validToolchain.binaries, crane },
    });
    expect(readToolchain(path)).rejects.toThrow(/executableSha256/);
  });

  it('reads the committed crane pin', async () => {
    const path = join(import.meta.dir, '../../../infra/versions/toolchain.json');
    expect((await readToolchain(path)).binaries.crane).toEqual({
      version: 'v0.22.1',
      url: 'https://github.com/google/go-containerregistry/releases/download/v0.22.1/go-containerregistry_Linux_x86_64.tar.gz',
      sha256: '0ab7a1d6932a213aed964ce97666c3077fe691c8606413674a8b3e0b9ec4cda0',
      executableSha256: '8e75c326adb43b053cfd78b9b987663f8f4fe4557f4d3915905643f25c730992',
      os: 'linux',
      arch: 'amd64',
    });
  });

  it('rejects a missing solver Bun lock and an unpinned host package', async () => {
    const { solverBun: _removed, ...binaries } = validToolchain.binaries;
    expect(readToolchain(await writeToolchain({ ...validToolchain, binaries }))).rejects.toThrow(
      /solverBun/,
    );
    const { hostPackages: _packages, ...withoutPackages } = validToolchain;
    expect(readToolchain(await writeToolchain(withoutPackages))).rejects.toThrow(/hostPackages/);
    expect(
      readToolchain(
        await writeToolchain({ ...validToolchain, hostPackages: { dockerIo: 'latest' } }),
      ),
    ).rejects.toThrow(/dockerIo/);
  });

  it('rejects a missing SQLite backup runner image lock', async () => {
    const { sqliteBackup: _removed, ...runtimeImages } = validToolchain.runtimeImages;
    expect(
      readToolchain(await writeToolchain({ ...validToolchain, runtimeImages })),
    ).rejects.toThrow(/sqliteBackup/);
  });

  it('rejects a missing registry image lock', async () => {
    const { registry: _removed, ...runtimeImages } = validToolchain.runtimeImages;
    expect(
      readToolchain(await writeToolchain({ ...validToolchain, runtimeImages })),
    ).rejects.toThrow(/registry/);
  });

  it('rejects a missing network probe image lock', async () => {
    const { networkProbe: _removed, ...runtimeImages } = validToolchain.runtimeImages;
    expect(
      readToolchain(await writeToolchain({ ...validToolchain, runtimeImages })),
    ).rejects.toThrow(/networkProbe/);
  });

  it('rejects a missing Flux controller image lock', async () => {
    const { fluxSourceController: _removed, ...runtimeImages } = validToolchain.runtimeImages;
    expect(
      readToolchain(await writeToolchain({ ...validToolchain, runtimeImages })),
    ).rejects.toThrow(/fluxSourceController/);
  });

  it('rejects a missing Flux install manifest lock', async () => {
    const { manifests: _removed, ...toolchain } = validToolchain;
    expect(readToolchain(await writeToolchain(toolchain))).rejects.toThrow(/manifests/);
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

  it('rejects a missing controller builder lock', async () => {
    const { builder: _removed, ...controller } = validToolchain.controller;
    const path = await writeToolchain({ ...validToolchain, controller });
    expect(readToolchain(path)).rejects.toThrow(/builder/);
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

describe('decodeRetainedToolchain', () => {
  // Exact bytes of infra/versions/toolchain.json at 1b94e080b (the last main revision before the
  // crane pin: k3dHelpers, no crane) and at 6a374c83a (before the k3d helper selection). Files on
  // disk rather than `git show`, so a depth-1 checkout runs these tests too.
  const helperLock = {
    file: 'toolchain-k3d-helpers-without-crane.json',
    sha256: '5fa350e57fca1228287d101f41c8156f3845cb262f690cc29eb743bb3c31d31e',
  };
  const historicalLock = {
    file: 'toolchain-historical.json',
    sha256: '4a5353e0b60d6cb9720d48cb695ea81766e198daff0beb64707925558ad6bc05',
  };

  async function readRetainedBytes(lock: { file: string; sha256: string }): Promise<Uint8Array> {
    const bytes = await Bun.file(join(import.meta.dir, 'fixtures', lock.file)).bytes();
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(lock.sha256);
    return bytes;
  }

  function sealed(value: unknown): { bytes: Uint8Array; sha256: string } {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
  }

  it('still decodes a retained k3dHelpers lock committed before the crane pin', async () => {
    const bytes = await readRetainedBytes(helperLock);
    const lock = decodeRetainedToolchain(bytes, helperLock.sha256);
    expect('k3dHelpers' in lock).toBe(true);
    expect(lock.binaries).not.toHaveProperty('crane');
    const path = await writeToolchain(JSON.parse(Buffer.from(bytes).toString('utf8')));
    expect(readToolchain(path)).rejects.toThrow(/crane/);
  });

  it('still checks k3d agreement on a retained k3dHelpers lock', async () => {
    const lock = JSON.parse(Buffer.from(await readRetainedBytes(helperLock)).toString('utf8')) as {
      binaries: { k3d: { version: string } };
    };
    lock.binaries.k3d.version = 'v5.9.1';
    const { bytes, sha256: lockSha256 } = sealed(lock);
    expect(() => decodeRetainedToolchain(bytes, lockSha256)).toThrow(/k3d binary version differs/);
  });

  it('decodes a retained historical lock and the current lock', async () => {
    const historical = decodeRetainedToolchain(
      await readRetainedBytes(historicalLock),
      historicalLock.sha256,
    );
    expect(historical).not.toHaveProperty('k3dHelpers');
    const current = sealed(validToolchain);
    expect(decodeRetainedToolchain(current.bytes, current.sha256).binaries).toHaveProperty('crane');
  });

  it('refuses a retained lock that has crane but no k3d helper selection', () => {
    const { k3dHelpers: _removed, ...withoutHelpers } = validToolchain;
    const { bytes, sha256: lockSha256 } = sealed(withoutHelpers);
    // Proof: adding a historical variant that also admits crane (HistoricalToolchainSchema with
    // an optional crane) made this resolve instead of throw (2026-11-17).
    expect(() => decodeRetainedToolchain(bytes, lockSha256)).toThrow(
      /k3dHelpers must be an object \(was missing\) or binaries\.crane must be removed/,
    );
  });

  it('pins the same crane executable in the registry client and its install role', async () => {
    const root = join(import.meta.dir, '../../..');
    const { executableSha256 } = (await readToolchain(join(root, 'infra/versions/toolchain.json')))
      .binaries.crane;
    // The lifecycle code keeps its own literal digests; this ties them to the lock.
    // Proof: changing binaries.crane.executableSha256 in the committed lock to 64 `d`s made this
    // test fail on the registry-client-software.ts pin (2026-11-17).
    const software = await Bun.file(join(import.meta.dir, 'registry-client-software.ts')).text();
    expect(/x64: '([0-9a-f]{64})'/.exec(software)?.[1]).toBe(executableSha256);
    const role = await Bun.file(
      join(root, 'infra/ansible/roles/registry_storage/tasks/client-source.yml'),
    ).text();
    expect(/stat\.checksum == '([0-9a-f]{64})'/.exec(role)?.[1]).toBe(executableSha256);
  });
});
