import { type } from 'arktype';

const Descriptor = type({ digest: 'string' });
const Platform = type({ architecture: 'string', os: 'string' });
const Index = type({
  mediaType: 'string',
  manifests: Descriptor.merge({ platform: Platform }).array(),
});
const Manifest = type({ config: Descriptor, layers: Descriptor.array() });
const Configuration = type({
  architecture: 'string',
  os: 'string',
  rootfs: { type: 'string', diff_ids: 'string[]' },
  history: 'unknown[]',
});

/** Validate only the fields consumed by the deterministic fixture's index assertions. Additional OCI fields remain untouched; this is not a general OCI validator. Throws for absent or malformed required structure. */
export function parseRegistryFixtureIndex(input: unknown) {
  // Proof: bypassing this assertion admits null/missing/mistyped index fields in the fixture JSON refuses index cases.
  return Index.assert(input);
}

/** Validate config/layer digest fields before the deterministic fixture follows their closure. Throws for absent or malformed required structure; semantic identity remains checked against actual hashed content. */
export function parseRegistryFixtureManifest(input: unknown) {
  // Proof: bypassing this assertion admits null/missing/mistyped manifest fields in the fixture JSON refuses manifest cases.
  return Manifest.assert(input);
}

/** Validate the configuration fields consumed by platform/layer/history assertions, preserving additional fields. Throws for absent or malformed required structure. */
export function parseRegistryFixtureConfiguration(input: unknown) {
  // Proof: bypassing this assertion admits null/missing/mistyped configuration fields in the fixture JSON refuses configuration cases.
  return Configuration.assert(input);
}
