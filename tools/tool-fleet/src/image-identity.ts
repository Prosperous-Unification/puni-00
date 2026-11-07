import { type } from 'arktype';

const digest = /^sha256:[a-f0-9]{64}$/;
export const ImageObject = type({ role: "'index'|'manifest'|'config'", digest, '+': 'reject' });
export type ImageObject = typeof ImageObject.infer;
export const ImagePlatform = type({ os: 'string>0', arch: 'string>0', '+': 'reject' });
export const ManifestDescriptor = type({
  digest,
  mediaType:
    "'application/vnd.oci.image.manifest.v1+json'|'application/vnd.docker.distribution.manifest.v2+json'",
  size: 'number.integer>0',
  platform: ImagePlatform,
  '+': 'reject',
});
export type ManifestDescriptor = typeof ManifestDescriptor.infer;
// Proof: Task44 widening config-kind roles accepted a coherent index object; neutral-role-discrimination failed.
const ConfigIdentity = type({
  kind: "'config-object'",
  object: { role: "'config'", digest, '+': 'reject' },
  platform: ImagePlatform,
  '+': 'reject',
});
const ManifestIdentity = type({
  kind: "'manifest-object'",
  object: { role: "'manifest'", digest, '+': 'reject' },
  manifest: ManifestDescriptor,
  '+': 'reject',
});
const IndexIdentity = type({
  kind: "'index-object'",
  object: { role: "'index'", digest, '+': 'reject' },
  manifest: ManifestDescriptor,
  '+': 'reject',
});
/** Object roles describe observations; a selected manifest binds its config through source provenance. */
export const ImageIdentity = ConfigIdentity.or(ManifestIdentity).or(IndexIdentity);
export type ImageIdentity = typeof ImageIdentity.infer;
export const SelectedImage = type({
  reference: 'string>0',
  indexDigest: digest,
  manifestDigest: digest,
  configDigest: digest,
  os: 'string>0',
  arch: 'string>0',
  '+': 'reject',
});
export const ImageExpectation = type({
  kind: "'helper'",
  selection: SelectedImage,
  '+': 'reject',
}).or(
  type({
    kind: "'runtime-pin'",
    pin: { role: 'string>0', name: 'string>0', digest, '+': 'reject' },
    config: { state: "'unobserved'", '+': 'reject' },
    '+': 'reject',
  }),
);
export type ImageExpectation = typeof ImageExpectation.infer;

/** Validate the role-specific source identity; runtime pins require an independently bound root. */
export function requireSelectedImage(
  input: unknown,
  observation: unknown,
  root?: ImageObject,
): void {
  const expectation = ImageExpectation.assert(input);
  const identity = ImageIdentity.assert(observation);
  if (identity.kind === 'manifest-object' && identity.object.digest !== identity.manifest.digest)
    throw new Error('Image object contradicts its manifest descriptor');
  const platform =
    identity.kind === 'config-object' ? identity.platform : identity.manifest.platform;
  if (expectation.kind === 'helper') {
    const selected = expectation.selection;
    const selectedDigest = {
      index: selected.indexDigest,
      manifest: selected.manifestDigest,
      config: selected.configDigest,
    }[identity.object.role];
    if (
      identity.object.digest !== selectedDigest ||
      platform.os !== selected.os ||
      platform.arch !== selected.arch ||
      (identity.kind !== 'config-object' && identity.manifest.digest !== selected.manifestDigest)
    )
      // Proof: Task44 removing this guard accepted foreign helper configs/platforms; neutral-helper-config and neutral-source-platform failed.
      throw new Error('Selected image graph or platform differs');
    return;
  }
  if (
    root === undefined ||
    root.role === 'config' ||
    root.digest !== expectation.pin.digest ||
    identity.kind === 'config-object' ||
    (identity.kind === 'index-object' && identity.object.digest !== root.digest) ||
    (root.role === 'manifest' && identity.manifest.digest !== root.digest)
  )
    // Proof: Task44 removing this guard accepted unbound roots/config claims; neutral-runtime-root failed.
    throw new Error('Runtime image source root differs');
}

/** Compare proven content independently of the provider's choice of object role. */
export function requireRuntimeImage(expectedInput: unknown, observedInput: unknown): void {
  const expected = ImageIdentity.assert(expectedInput);
  const observed = ImageIdentity.assert(observedInput);
  if (expected.kind === 'config-object' || observed.kind === 'config-object') {
    if (
      expected.kind !== 'config-object' ||
      observed.kind !== 'config-object' ||
      expected.object.digest !== observed.object.digest ||
      expected.platform.os !== observed.platform.os ||
      expected.platform.arch !== observed.platform.arch
    )
      // Proof: Task44 removing this guard accepted changed config IDs and mixed roles; neutral-config-equality failed.
      throw new Error('Runtime image config identity differs');
    return;
  }
  if (
    (expected.kind === 'manifest-object' && expected.object.digest !== expected.manifest.digest) ||
    (observed.kind === 'manifest-object' && observed.object.digest !== observed.manifest.digest) ||
    expected.manifest.digest !== observed.manifest.digest ||
    expected.manifest.mediaType !== observed.manifest.mediaType ||
    expected.manifest.size !== observed.manifest.size ||
    expected.manifest.platform.os !== observed.manifest.platform.os ||
    expected.manifest.platform.arch !== observed.manifest.platform.arch
  )
    // Proof: Task44 removing this guard accepted observed/retained descriptor size and platform changes; neutral-runtime-descriptor failed four negatives.
    throw new Error('Runtime image manifest identity differs');
}
