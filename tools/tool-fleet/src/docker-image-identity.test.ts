import { rejects } from 'node:assert/strict';

import { expect, it } from 'bun:test';

import {
  captureDockerImageCapabilities,
  inspectDockerImage,
  observeDockerContainerImage,
  requireDockerImageBinding,
  requireDockerRuntimeImage,
} from './docker-image-identity';
import { selectedHelpers } from './k3d-helper-images.fixture.test';

export const capabilities = {
  daemonId: 'daemon-1',
  engineVersion: '29.7.2',
  serverApi: '1.55',
  minimumApi: '1.40',
  requestApi: '1.55',
  os: 'linux',
  arch: 'amd64',
  driver: 'overlayfs',
  driverType: 'io.containerd.snapshotter.v1',
} as const;
export const manifestDescriptor = {
  mediaType: 'application/vnd.oci.image.manifest.v1+json',
  digest: selectedHelpers.tools.manifestDigest,
  size: 610,
  platform: { os: 'linux', architecture: 'amd64' },
};
// Safe identities/descriptors from the retained Task43 BusyBox protocol, with a fixture daemon binding.
const runtimeManifestDescriptor = {
  ...manifestDescriptor,
  digest: 'sha256:b7f3d86d6e84fc17718c48bcde1450807faa2d56704205c697b4bd5df7b9e29f',
};
export const helperExpectation = {
  kind: 'helper',
  selection: {
    reference: `${selectedHelpers.tools.name}@${selectedHelpers.tools.manifestDigest}`,
    indexDigest: selectedHelpers.tools.indexDigest,
    manifestDigest: selectedHelpers.tools.manifestDigest,
    configDigest: selectedHelpers.tools.configDigest,
    os: 'linux',
    arch: 'amd64',
  },
} as const;
export function protocol(fault = '', runtime = false) {
  const root = runtime
    ? 'sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662'
    : selectedHelpers.tools.manifestDigest;
  return (arguments_: readonly string[]): Promise<string> => {
    if (arguments_[0] === 'version')
      return Promise.resolve(
        JSON.stringify({
          engineVersion: fault === 'engine' ? '28.0.0' : '29.7.2',
          serverApi: '1.55',
          minimumApi: fault === 'api' ? '1.56' : '1.40',
        }),
      );
    if (arguments_[0] === 'info' && arguments_.at(-1) === '{{.ID}}')
      return Promise.resolve(fault === 'image-daemon' ? 'foreign' : 'daemon-1');
    if (arguments_[0] === 'info')
      return Promise.resolve(
        JSON.stringify({
          daemonId: fault === 'daemon' ? 'foreign' : 'daemon-1',
          os: 'linux',
          arch: 'x86_64',
          driver: fault === 'store' ? 'overlay2' : 'overlayfs',
          driverStatus:
            fault === 'missing-store'
              ? []
              : [
                  [
                    'driver-type',
                    fault === 'foreign-store'
                      ? 'foreign.snapshotter'
                      : 'io.containerd.snapshotter.v1',
                  ],
                  ...(fault === 'duplicate-store'
                    ? [['driver-type', 'io.containerd.snapshotter.v1']]
                    : []),
                ],
        }),
      );
    if (arguments_[0] !== 'image' || arguments_[1] !== 'inspect')
      throw new Error('Unexpected protocol command');
    const platform = arguments_.includes('--platform');
    if (fault === 'platform-failure' && platform)
      return Promise.reject(new Error('Platform projection failed'));
    const descriptor =
      platform || !runtime
        ? {
            ...(runtime ? runtimeManifestDescriptor : manifestDescriptor),
            ...(fault === 'missing-platform' ? { platform: undefined } : {}),
            ...(fault === 'variant'
              ? { platform: { os: 'linux', architecture: 'amd64', variant: 'v2' } }
              : {}),
            ...(fault === 'root-platform' && !platform
              ? { platform: { os: 'linux', architecture: 'arm64' } }
              : {}),
            ...(fault === 'ambiguous-child' && platform ? { digest: root } : {}),
            ...(fault === 'platform' ? { platform: { os: 'linux', architecture: 'arm64' } } : {}),
            ...(fault === 'descriptor' ? { digest: `sha256:${'9'.repeat(64)}` } : {}),
          }
        : { mediaType: 'application/vnd.oci.image.index.v1+json', digest: root, size: 9535 };
    return Promise.resolve(
      JSON.stringify({
        id: fault === 'object' ? `sha256:${'9'.repeat(64)}` : descriptor.digest,
        descriptor: fault === 'missing-descriptor' ? null : descriptor,
        os: 'linux',
        arch: 'amd64',
        repoDigests:
          fault === 'repository'
            ? [`foreign/tools@${root}`]
            : [runtime ? `busybox@${root}` : helperExpectation.selection.reference],
        volumes: fault === 'volume-projection' && platform ? { '/extra': {} } : null,
      }),
    );
  };
}
export const runtimeExpectation = {
  kind: 'runtime-pin',
  pin: {
    role: 'node',
    name: 'docker.io/library/busybox:1.36.1',
    digest: 'sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662',
  },
  config: { state: 'unobserved' },
} as const;
export async function helperBinding() {
  return inspectDockerImage(
    helperExpectation,
    helperExpectation.selection.reference,
    { os: 'linux', arch: 'amd64' },
    structuredClone(capabilities),
    protocol(),
  );
}

it('Task44 adapter selects supported capabilities from actual version and store fields', async () => {
  expect(await captureDockerImageCapabilities('daemon-1', protocol())).toEqual(capabilities);
});
for (const fault of [
  'engine',
  'api',
  'daemon',
  'store',
  'missing-store',
  'duplicate-store',
  'foreign-store',
])
  it(`Task44 adapter refuses capability ${fault}`, async () => {
    await rejects(captureDockerImageCapabilities('daemon-1', protocol(fault)));
  });
it('Task44 adapter infers helper config from its source manifest instead of Docker object ID', async () => {
  const binding = await helperBinding();
  expect(binding.preinspectIdentity.object).toEqual({
    role: 'manifest',
    digest: selectedHelpers.tools.manifestDigest,
  });
  expect(binding.reference).toBe(helperExpectation.selection.reference);
});
for (const fault of [
  'object',
  'descriptor',
  'missing-descriptor',
  'missing-platform',
  'platform',
  'repository',
  'platform-failure',
  'image-daemon',
  'variant',
  'root-platform',
  'volume-projection',
])
  it(`Task44 adapter refuses image ${fault}`, async () => {
    await rejects(
      inspectDockerImage(
        helperExpectation,
        helperExpectation.selection.reference,
        { os: 'linux', arch: 'amd64' },
        capabilities,
        protocol(fault),
      ),
    );
  });
it('Task44 adapter binds runtime root index and child manifest with DockerHub repository alias', async () => {
  const binding = await inspectDockerImage(
    runtimeExpectation,
    `${runtimeExpectation.pin.name}@${runtimeExpectation.pin.digest}`,
    { os: 'linux', arch: 'amd64' },
    capabilities,
    protocol('', true),
  );
  const observed = observeDockerContainerImage(
    {
      image: runtimeExpectation.pin.digest,
      configuredImage: binding.reference,
      manifest: runtimeManifestDescriptor,
    },
    binding,
    'daemon-1',
  );
  expect(observed.identity.object).toEqual({
    role: 'index',
    digest: runtimeExpectation.pin.digest,
  });
  expect(() => {
    requireDockerRuntimeImage(runtimeExpectation, binding, observed, 'daemon-1');
  }).not.toThrow();
  expect(runtimeExpectation.config.state).toBe('unobserved');
});
for (const fault of ['object', 'manifest', 'reference', 'daemon', 'size', 'platform', 'missing'])
  it(`Task44 adapter refuses runtime ${fault}`, async () => {
    const binding = await helperBinding();
    const manifest = {
      ...manifestDescriptor,
      ...(fault === 'manifest' ? { digest: `sha256:${'9'.repeat(64)}` } : {}),
      ...(fault === 'size' ? { size: 611 } : {}),
      ...(fault === 'platform' ? { platform: { os: 'linux', architecture: 'arm64' } } : {}),
    };
    expect(() =>
      observeDockerContainerImage(
        {
          image:
            fault === 'object' ? `sha256:${'9'.repeat(64)}` : selectedHelpers.tools.manifestDigest,
          configuredImage: fault === 'reference' ? 'foreign/tools' : binding.reference,
          manifest: fault === 'missing' ? null : manifest,
        },
        binding,
        fault === 'daemon' ? 'foreign' : 'daemon-1',
      ),
    ).toThrow();
  });

for (const fault of [
  'daemon',
  'reference',
  'root',
  'root-role',
  'graph',
  'platform',
  'repository-alias',
  'root-size',
])
  it(`Task44 retained binding refuses ${fault}`, async () => {
    const binding = await helperBinding();
    if (fault === 'daemon') binding.capabilities.daemonId = 'foreign';
    if (fault === 'reference')
      binding.reference = 'foreign/tools@' + selectedHelpers.tools.manifestDigest;
    if (fault === 'root') {
      binding.rootObject.digest = 'sha256:' + '9'.repeat(64);
      binding.rootDescriptor.digest = binding.rootObject.digest;
    }
    if (fault === 'root-role') {
      binding.rootObject.role = 'index';
      binding.rootDescriptor.mediaType = 'application/vnd.oci.image.index.v1+json';
    }
    if (fault === 'graph' && binding.preinspectIdentity.kind === 'manifest-object') {
      binding.preinspectIdentity.object.digest = 'sha256:' + '9'.repeat(64);
      binding.preinspectIdentity.manifest.digest = binding.preinspectIdentity.object.digest;
    }
    if (fault === 'platform') binding.platform.arch = 'arm64';
    if (fault === 'repository-alias') {
      binding.repoDigests = ['docker.io/' + binding.reference];
      binding.platformRepoDigests = [...binding.repoDigests];
    }
    if (fault === 'root-size') binding.rootDescriptor.size++;
    expect(() => requireDockerImageBinding(helperExpectation, binding, 'daemon-1')).toThrow();
  });
for (const fault of ['daemon', 'reference', 'object', 'manifest', 'size', 'platform', 'kind'])
  it(`Task44 retained runtime refuses ${fault}`, async () => {
    const binding = await helperBinding();
    const observed = observeDockerContainerImage(
      {
        image: selectedHelpers.tools.manifestDigest,
        configuredImage: binding.reference,
        manifest: manifestDescriptor,
      },
      binding,
      'daemon-1',
    );
    if (fault === 'daemon') observed.daemonId = 'foreign';
    if (fault === 'reference') observed.reference = 'foreign/tools';
    if (fault === 'kind') Reflect.set(observed.identity, 'kind', 'config-object');
    if (fault === 'object') observed.identity.object.digest = 'sha256:' + '9'.repeat(64);
    if (observed.identity.kind !== 'config-object') {
      if (fault === 'manifest') observed.identity.manifest.digest = 'sha256:' + '9'.repeat(64);
      if (fault === 'size') observed.identity.manifest.size++;
      if (fault === 'platform') observed.identity.manifest.platform.arch = 'arm64';
    }
    expect(() => {
      requireDockerRuntimeImage(helperExpectation, binding, observed, 'daemon-1');
    }).toThrow();
  });

for (const fault of ['missing-version', 'malformed-version'])
  it(`Task44 adapter refuses ${fault} capability input`, async () => {
    const docker = protocol();
    await rejects(
      captureDockerImageCapabilities('daemon-1', (arguments_) =>
        arguments_[0] === 'version'
          ? Promise.resolve(
              fault === 'missing-version'
                ? JSON.stringify({ serverApi: '1.55', minimumApi: '1.40' })
                : 'malformed',
            )
          : docker(arguments_),
      ),
    );
  });

it('Task44 adapter refuses index and child with one ambiguous digest', async () => {
  await rejects(
    inspectDockerImage(
      runtimeExpectation,
      `${runtimeExpectation.pin.name}@${runtimeExpectation.pin.digest}`,
      { os: 'linux', arch: 'amd64' },
      capabilities,
      protocol('ambiguous-child', true),
    ),
  );
});
