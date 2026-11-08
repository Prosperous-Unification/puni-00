import { type } from 'arktype';

const Digest = type(/^sha256:[a-f0-9]{64}$/);
const Repository = type(
  /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*$/,
);
const Timestamp = type('string').narrow(
  (stamp) => Number.isFinite(Date.parse(stamp)) && new Date(stamp).toISOString() === stamp,
);
const UploadId = type(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
/** Immutable verified content identities, distinct from image roots and archive paths/offsets. Declaration alone never proves stored bytes. */
export const RegistryContentDeclaration = type({
  repository: Repository,
  digest: Digest,
  size: 'number.safe >= 0',
  mediaType: '0 < string <= 256',
  isManifest: 'boolean',
  dependencies: Digest.array().atMostLength(2048),
  '+': 'reject',
});
export type RegistryContentDeclaration = typeof RegistryContentDeclaration.infer;
/** Exact manifest intent or acknowledged blob-upload UUID is durable before sending its body. A lost POST response has no such ownership and remains unknown. */
export const RegistryPublicationWrite = type({
  repository: Repository,
  digest: Digest,
  uploadId: UploadId.or('null'),
  phase: "'writing'|'stored'",
  '+': 'reject',
});
export type RegistryPublicationWrite = typeof RegistryPublicationWrite.infer;
export const RegistryPublicationEvidence = type({
  operationId: '0 < string <= 256',
  declaredAt: Timestamp,
  contents: RegistryContentDeclaration.array().atLeastLength(1).atMostLength(2048),
  writes: type({
    repository: Repository,
    digest: Digest,
    uploadId: UploadId.or('null'),
    phase: "'writing'|'stored'",
    at: Timestamp,
    '+': 'reject',
  })
    .array()
    .atMostLength(2048),
  '+': 'reject',
});
export type RegistryPublicationEvidence = typeof RegistryPublicationEvidence.infer;
const key = (content: { repository: string; digest: string }) =>
  `${content.repository}@${content.digest}`;
const manifestTypes = new Set([
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
]);

/** Require exactly the declared manifest/index closure. Extra unrelated content cannot become owned through an adopt-orphan request. */
export function validateRegistryDeclaration(
  input: unknown,
  references: readonly { repository: string; digest: string }[],
): RegistryContentDeclaration[] {
  const contents = RegistryContentDeclaration.array()
    .atLeastLength(1)
    .atMostLength(2048)
    .assert(input);
  const declared = new Map(contents.map((content) => [key(content), content]));
  if (declared.size !== contents.length)
    throw new Error('Duplicate publication content declaration');
  const physical = new Map<string, string>();
  for (const content of contents) {
    if (
      content.isManifest !== manifestTypes.has(content.mediaType) ||
      (!content.isManifest && content.dependencies.length !== 0) ||
      new Set(content.dependencies).size !== content.dependencies.length
    )
      throw new Error('Contradictory publication content kind/dependencies');
    const identity = JSON.stringify({ ...content, repository: undefined });
    const previous = physical.get(content.digest);
    if (previous !== undefined && previous !== identity)
      throw new Error('Contradictory shared content declaration');
    physical.set(content.digest, identity);
  }
  const visited = new Set<string>();
  const visit = (
    reference: { repository: string; digest: string },
    parents = new Set<string>(),
  ) => {
    const identity = key(reference);
    if (parents.has(identity)) throw new Error('Cyclic publication declaration');
    if (visited.has(identity)) return;
    const content = declared.get(identity);
    if (content === undefined) throw new Error('Incomplete publication declaration closure');
    visited.add(identity);
    for (const digest of content.dependencies)
      visit({ repository: reference.repository, digest }, new Set([...parents, identity]));
  };
  for (const reference of references) {
    if (declared.get(key(reference))?.isManifest !== true)
      throw new Error('Publication root is not a declared manifest');
    visit(reference);
  }
  // Proof: extra, missing, duplicate, cycle, traversal, blob-root and archive-path negatives refuse this production boundary.
  if (visited.size !== contents.length)
    throw new Error('Publication declares content outside its exact image closure');
  return contents;
}

/** Validate persisted ownership without inventing missing legacy declarations or treating write intent as completion.
 * Journal schemas validate all timestamps as finite canonical ISO instants before either caller reaches this boundary;
 * numeric comparisons preserve accepted expanded years and original stored strings.
 */
export function validateRegistryPublicationEvidence(
  evidence: RegistryPublicationEvidence,
  references: readonly { repository: string; digest: string }[],
  receipt: { state: string; at: string },
  updatedAt: string,
): void {
  validateRegistryDeclaration(evidence.contents, references);
  // Proof: bypassing this chronological bound admits future expanded-year evidence through canonical journal read.
  if (
    Date.parse(evidence.declaredAt) > Date.parse(receipt.at) ||
    new Set(evidence.writes.map(key)).size !== evidence.writes.length
  )
    throw new Error('Invalid publication evidence chronology or duplicate write');
  const uploads = evidence.writes.flatMap((write) =>
    write.uploadId === null ? [] : [write.uploadId],
  );
  if (new Set(uploads).size !== uploads.length)
    throw new Error('Publication upload UUID has multiple content owners');
  for (const write of evidence.writes) {
    const declared = evidence.contents.find((content) => key(content) === key(write));
    // Proof: blob-as-manifest, manifest-as-blob and undeclared writes fail this persisted-state boundary in registry-publication-evidence.test.ts; dropped Boolean grouping admits them.
    // Proof: independently removing each chronological bound admits its write-before-declaration, write-after-journal, or write-after-completed-receipt negative.
    if (
      declared?.isManifest !== (write.uploadId === null) ||
      Date.parse(write.at) < Date.parse(evidence.declaredAt) ||
      Date.parse(write.at) > Date.parse(updatedAt) ||
      (receipt.state !== 'unfinished' && Date.parse(write.at) > Date.parse(receipt.at))
    )
      throw new Error('Publication write lacks exact declared ownership');
  }
  if (
    ['completed', 'promoted'].includes(receipt.state) &&
    evidence.contents.some(
      (content) =>
        !evidence.writes.some((write) => key(write) === key(content) && write.phase === 'stored'),
    )
  )
    throw new Error('Completed publication lacks acknowledged stored content');
}
