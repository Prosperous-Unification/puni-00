import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { decodeFleet, decodeRetainedToolchain, readToolchain } from './contracts';
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
  hostPackages: { dockerIo: '29.1.3-0ubuntu3~24.04.2', tailscale: '1.104.7' },
  hostRepositories: {
    tailscale: {
      url: 'https://example.test/tailscale',
      keyring: { url: 'https://example.test/tailscale.gpg', sha256 },
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

  it('rejects a missing Tailscale package or repository lock', async () => {
    const { tailscale: _version, ...packagesWithoutTailscale } = validToolchain.hostPackages;
    expect(
      readToolchain(
        await writeToolchain({ ...validToolchain, hostPackages: packagesWithoutTailscale }),
      ),
    ).rejects.toThrow(/hostPackages\.tailscale/);
    const { hostRepositories: _repositories, ...withoutRepositories } = validToolchain;
    expect(readToolchain(await writeToolchain(withoutRepositories))).rejects.toThrow(
      /hostRepositories/,
    );
    expect(
      readToolchain(
        await writeToolchain({
          ...validToolchain,
          hostRepositories: {
            tailscale: {
              ...validToolchain.hostRepositories.tailscale,
              keyring: { url: 'https://example.test/k.gpg', sha256: 'abc' },
            },
          },
        }),
      ),
    ).rejects.toThrow(/sha256/);
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
  // At 7a0279c7d, the last main revision before Tailscale was locked.
  const craneLock = {
    file: 'toolchain-crane-without-tailscale.json',
    sha256: '05b5187b721799d5f78d40f121d130b69fd0311f7f4f5bbc45d7f2d9864da538',
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

  it('still decodes a retained crane lock committed before Tailscale was locked', async () => {
    const bytes = await readRetainedBytes(craneLock);
    const lock = decodeRetainedToolchain(bytes, craneLock.sha256);
    expect(lock.binaries).toHaveProperty('crane');
    expect(lock).not.toHaveProperty('hostRepositories');
    const path = await writeToolchain(JSON.parse(Buffer.from(bytes).toString('utf8')));
    expect(readToolchain(path)).rejects.toThrow(/hostRepositories|tailscale/);
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
    expect(() => decodeRetainedToolchain(bytes, lockSha256)).toThrow(/crane must be removed/);
  });
});

describe('crane digest copies', () => {
  const root = join(import.meta.dir, '../../..');
  // The lifecycle code keeps its own literal digests; each pattern must match exactly once.
  const copies = [
    { file: 'tools/tool-fleet/src/registry-client-software.ts', pattern: /x64: '([0-9a-f]{64})'/g },
    {
      file: 'infra/ansible/roles/registry_storage/tasks/client-source.yml',
      pattern: /stat\.checksum == '([0-9a-f]{64})'/g,
    },
    {
      file: 'tools/tool-fleet/src/registry-client-installation-role.native.py',
      pattern: /hash_file\(options\.crane\)!='([0-9a-f]{64})'/g,
    },
    {
      file: 'tools/tool-fleet/src/registry-client-role-worker.fixture.py',
      pattern: /'registry_client_source':\{'stat':\{'isreg':False,'checksum':'([0-9a-f]{64})'\}/g,
    },
  ];

  for (const { file, pattern } of copies) {
    it(`pins the locked crane executable in ${file}`, async () => {
      const { executableSha256 } = (
        await readToolchain(join(root, 'infra/versions/toolchain.json'))
      ).binaries.crane;
      // Proof: changing binaries.crane.executableSha256 in the committed lock to 64 `d`s made
      // all four cases fail (2026-11-17).
      const digests = [...(await Bun.file(join(root, file)).text()).matchAll(pattern)].map(
        (match) => match[1],
      );
      expect(digests).toEqual([executableSha256]);
    });
  }
});

describe('platform capabilities of the separated node roles', () => {
  const machineId = (digit: string) => digit.repeat(32);
  function fleetWith(
    platformNodes: readonly { id: string; capabilities: readonly string[] }[],
    floor: Record<string, number>,
    workerCapabilities: readonly string[] = ['execution'],
  ): Record<string, unknown> {
    return {
      schemaVersion: 1,
      revision: 'capabilities-test',
      clusters: [
        {
          id: 'platform-2',
          purpose: 'platform',
          apiEndpoint: 'https://10.10.1.11:6443',
          controlPlane: 'single',
          bootstrap: 'required',
          requiredCapabilities: floor,
        },
        {
          id: 'workers',
          purpose: 'workers',
          apiEndpoint: 'https://workers.example.invalid:6443',
          controlPlane: 'single',
          bootstrap: 'required',
          requiredCapabilities: {},
        },
      ],
      nodes: [
        ...platformNodes.map(({ id, capabilities }, index) => ({
          id,
          cluster: 'platform-2',
          capabilities,
          lifecycle: 'present',
          provider: {
            kind: 'ssh',
            machineId: machineId(String(index + 1)),
            address: `10.10.1.${String(11 + index)}`,
          },
        })),
        {
          id: 'w1',
          cluster: 'workers',
          capabilities: ['control-plane'],
          lifecycle: 'present',
          provider: { kind: 'hcloud', instanceId: '901' },
        },
        {
          id: 'w2',
          cluster: 'workers',
          capabilities: workerCapabilities,
          lifecycle: 'present',
          provider: { kind: 'hcloud', instanceId: '902' },
        },
      ],
    };
  }

  for (const capability of ['platform-services', 'nonproduction'] as const) {
    it(`accepts a platform node that carries ${capability}`, () => {
      const nodes =
        capability === 'platform-services'
          ? [{ id: 'm1plat1', capabilities: ['control-plane', 'platform-services'] }]
          : [
              { id: 'm1plat1', capabilities: ['control-plane', 'platform-services'] },
              { id: 'h7obs', capabilities: ['observability', 'nonproduction', 'ingress'] },
            ];
      const fleet = decodeFleet(fleetWith(nodes, { [capability]: 1 }));
      expect(fleet.nodes.some((node) => node.capabilities.includes(capability))).toBe(true);
    });

    it(`refuses a workers node that carries ${capability}`, () => {
      // Proof: adding each capability to purposeCapabilities.workers made this resolve instead of
      // throw, once for `platform-services` and once for `nonproduction` (2026-11-22).
      expect(() =>
        decodeFleet(
          fleetWith([{ id: 'm1plat1', capabilities: ['control-plane', 'platform-services'] }], {}, [
            'execution',
            capability,
          ]),
        ),
      ).toThrow(/Platform capability for w2 must belong to platform/);
    });

    it(`refuses a platform floor of ${capability} that the nodes do not provide`, () => {
      // The server of such a cluster must carry `platform-services`, so its floor is raised
      // past the one server instead.
      const floor = capability === 'platform-services' ? 2 : 1;
      const provided = floor - 1;
      expect(() =>
        decodeFleet(
          fleetWith([{ id: 'm1plat1', capabilities: ['control-plane', 'platform-services'] }], {
            [capability]: floor,
          }),
        ),
      ).toThrow(
        new RegExp(
          `platform-2 capability ${capability} requires ${String(floor)} but provides ${String(provided)}`,
        ),
      );
    });
  }
});

describe('trust classes of a platform cluster that requires platform-services', () => {
  interface Node {
    id: string;
    capabilities: readonly string[];
  }
  const server: Node = { id: 'm1plat1', capabilities: ['control-plane', 'platform-services'] };
  const apps: Node = { id: 'h6apps', capabilities: ['product', 'ingress'] };
  const observability: Node = {
    id: 'h7obs',
    capabilities: ['observability', 'nonproduction', 'ingress'],
  };
  function fleetOf(nodes: readonly Node[]): Record<string, unknown> {
    return {
      schemaVersion: 1,
      revision: 'trust-classes-test',
      clusters: [
        {
          id: 'platform-2',
          purpose: 'platform',
          apiEndpoint: 'https://10.10.1.11:6443',
          controlPlane: 'single',
          bootstrap: 'required',
          requiredCapabilities: { 'platform-services': 1 },
        },
      ],
      nodes: nodes.map(({ id, capabilities }, index) => ({
        id,
        cluster: 'platform-2',
        capabilities,
        lifecycle: 'present',
        provider: {
          kind: 'ssh',
          machineId: String(index + 1).repeat(32),
          address: `10.10.1.${String(11 + index)}`,
        },
      })),
    };
  }

  it('accepts the minimal profile, observability with nonproduction and ingress', () => {
    // Proof: splitting the monitoring class into `observability` and `nonproduction, ingress`
    // (refusing any node with two roles' capabilities) made this throw on h7obs (2026-11-22).
    const fleet = decodeFleet(fleetOf([server, apps, observability]));
    expect(fleet.nodes.map(({ id }) => id)).toEqual(['m1plat1', 'h6apps', 'h7obs']);
  });

  it('refuses a platform-services server that also carries product', () => {
    // Proof: dropping the server's capability comparison made this fail (2026-11-22).
    expect(() =>
      decodeFleet(fleetOf([{ ...server, capabilities: [...server.capabilities, 'product'] }])),
    ).toThrow(/Server m1plat1 of platform-2 carries product/);
  });

  it('refuses a platform-services server that also carries observability', () => {
    // Proof: comparing against the earlier list of product, nonproduction and ingress made this
    // fail (2026-11-22).
    expect(() =>
      decodeFleet(
        fleetOf([{ ...server, capabilities: [...server.capabilities, 'observability'] }]),
      ),
    ).toThrow(/Server m1plat1 of platform-2 carries observability/);
  });

  it('refuses a server without platform-services', () => {
    expect(() =>
      decodeFleet(fleetOf([{ ...server, capabilities: ['control-plane'] }, observability])),
    ).toThrow(/Server m1plat1 of platform-2 lacks platform-services/);
  });

  it('refuses an agent that carries product and nonproduction', () => {
    // Proof: checking the server only made this fail (2026-11-22).
    expect(() =>
      decodeFleet(
        fleetOf([server, { id: 'h6apps', capabilities: ['product', 'nonproduction', 'ingress'] }]),
      ),
    ).toThrow(/Node h6apps carries both product and nonproduction/);
  });

  it('refuses product and nonproduction on one node in every cluster', () => {
    const legacy = fleetOf([
      { id: 'h4claw', capabilities: ['control-plane', 'product', 'ingress'] },
      { id: 'h3mon', capabilities: ['observability', 'nonproduction', 'product'] },
    ]);
    const [cluster] = legacy['clusters'] as Record<string, unknown>[];
    cluster['requiredCapabilities'] = {};
    expect(() => decodeFleet(legacy)).toThrow(/Node h3mon carries both product and nonproduction/);
  });

  it('refuses a co-location no profile names', () => {
    expect(() =>
      decodeFleet(fleetOf([server, { id: 'h6apps', capabilities: ['product', 'observability'] }])),
    ).toThrow(/Node h6apps of platform-2 carries product, observability: no trust class/);
  });
});
