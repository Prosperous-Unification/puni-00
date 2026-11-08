import { expect, it } from 'bun:test';

import { requireRuntimeImage, requireSelectedImage } from './image-identity';
import { selectedHelpers } from './k3d-helper-images.fixture.test';

const selected = {
  reference: `${selectedHelpers.tools.name}@${selectedHelpers.tools.manifestDigest}`,
  ...selectedHelpers.tools,
};
const selection = {
  kind: 'helper' as const,
  selection: {
    reference: selected.reference,
    indexDigest: selected.indexDigest,
    manifestDigest: selected.manifestDigest,
    configDigest: selected.configDigest,
    os: selected.os,
    arch: selected.arch,
  },
};
const manifest = {
  digest: selected.manifestDigest,
  mediaType: 'application/vnd.oci.image.manifest.v1+json' as const,
  size: 610,
  platform: { os: 'linux' as const, arch: 'amd64' as const },
};
const identities = [
  {
    kind: 'config-object' as const,
    object: { role: 'config' as const, digest: selected.configDigest },
    platform: manifest.platform,
  },
  {
    kind: 'manifest-object' as const,
    object: { role: 'manifest' as const, digest: selected.manifestDigest },
    manifest,
  },
  {
    kind: 'index-object' as const,
    object: { role: 'index' as const, digest: selected.indexDigest },
    manifest,
  },
] as const;
for (const identity of identities)
  it(`Task44 neutral accepts selected ${identity.object.role} without relabeling its digest`, () => {
    expect(() => {
      requireSelectedImage(selection, identity);
    }).not.toThrow();
  });
it('Task44 neutral binds different object roles through the same selected manifest', () => {
  expect(() => {
    requireRuntimeImage(identities[1], identities[2]);
  }).not.toThrow();
});
for (const fault of ['digest', 'platform', 'descriptor', 'role'])
  it(`Task44 neutral refuses selected ${fault}`, () => {
    const identity = structuredClone(identities[1]);
    if (fault === 'digest') Reflect.set(identity.object, 'digest', 'sha256:' + '9'.repeat(64));
    if (fault === 'platform')
      Reflect.set(Reflect.get(identity, 'manifest').platform, 'arch', 'arm64');
    if (fault === 'descriptor')
      Reflect.set(Reflect.get(identity, 'manifest'), 'digest', 'sha256:' + '9'.repeat(64));
    if (fault === 'role') Reflect.set(identity.object, 'role', 'index');
    expect(() => {
      requireSelectedImage(selection, identity);
    }).toThrow();
  });
it('Task44 neutral refuses unrelated runtime manifests', () => {
  const observed = structuredClone(identities[2]);
  Reflect.set(Reflect.get(observed, 'manifest'), 'digest', 'sha256:' + '9'.repeat(64));
  expect(() => {
    requireRuntimeImage(identities[1], observed);
  }).toThrow();
});

it('Task44 neutral config objects retain exact config equality', () => {
  expect(() => {
    requireRuntimeImage(identities[0], identities[0]);
  }).not.toThrow();
  const changed = structuredClone(identities[0]);
  Reflect.set(changed.object, 'digest', 'sha256:' + '9'.repeat(64));
  expect(() => {
    requireRuntimeImage(identities[0], changed);
  }).toThrow();
  expect(() => {
    requireRuntimeImage(identities[0], identities[1]);
  }).toThrow();
});
it('Task44 neutral refuses a helper config outside its source graph', () => {
  const changed = structuredClone(identities[0]);
  Reflect.set(changed.object, 'digest', 'sha256:' + '9'.repeat(64));
  expect(() => {
    requireSelectedImage(selection, changed);
  }).toThrow();
});
it('Task44 neutral runtime pin refuses an unbound root and config claim', () => {
  const expectation = {
    kind: 'runtime-pin',
    pin: {
      role: 'node',
      name: 'docker.io/library/busybox:1.36.1',
      digest: 'sha256:' + 'a'.repeat(64),
    },
    config: { state: 'unobserved' },
  };
  expect(() => {
    requireSelectedImage(expectation, identities[1]);
  }).toThrow();
  expect(() => {
    requireSelectedImage(expectation, identities[0], {
      role: 'manifest',
      digest: expectation.pin.digest,
    });
  }).toThrow();
});

it('Task44 neutral refuses a config kind carrying a coherent index object', () => {
  const identity = {
    kind: 'config-object',
    object: { role: 'index', digest: selectedHelpers.tools.indexDigest },
    platform: { os: 'linux', arch: 'amd64' },
  };
  expect(() => {
    requireSelectedImage(selection, identity);
  }).toThrow();
});
