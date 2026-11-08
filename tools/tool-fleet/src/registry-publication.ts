import { randomUUID } from 'node:crypto';

import type { RegistryArtifact } from './registry-artifact';
import type { RegistryCommand, RegistryCommandResponse } from './registry-managed-journal';
import type { RegistryPublicationWrite } from './registry-publication-evidence';

/** Managed schema4 uploaders acknowledge exact write/session ownership before sending bodies; schema3 has no such evidence capability. */
export type RegistryUploadOwnership = (write: RegistryPublicationWrite) => Promise<void>;

export interface PublicationEnrollment {
  readonly registryId: string;
  readonly owner: string;
  readonly product: string;
  readonly requiredRepositories: readonly string[];
}
export type RegistryAuthority = (request: RegistryCommand) => Promise<RegistryCommandResponse>;
/**
 * Worst-case 64 KiB allocation units, two content copies for upload staging, and 64
 * metadata blocks/inodes per object plus 128 per repository. No deduplication credit.
 */
export function publicationEnvelope(artifacts: readonly RegistryArtifact[]) {
  const unit = 65536;
  let bytes = artifacts.length * 128 * unit;
  let inodes = artifacts.length * 128;
  for (const artifact of artifacts)
    for (const content of artifact.contents) {
      if (!Number.isSafeInteger(content.size) || content.size < 0)
        // Proof: removing validation admitted a negative content size in the production envelope planner.
        throw new Error('Unknown content envelope');
      bytes += 2 * Math.ceil(content.size / unit) * unit + 64 * unit;
      inodes += 64;
    }
  if (!Number.isSafeInteger(bytes) || !Number.isSafeInteger(inodes))
    // Proof: removing this bound returned an inexact overflowed physical envelope.
    throw new Error('Unsafe publication envelope');
  return { bytes, inodes };
}

/**
 * The trusted required repository set is independent of the caller's selected tiers.
 * One authority reservation protects all roots before the first registry write.
 * Proof: native removal uploaded all three complete tiers with durable bundle count zero.
 * Failed uploads keep their ownership and reservation. Only a durable complete receipt returns.
 */
export async function publishArtifacts(
  enrollment: PublicationEnrollment,
  artifacts: readonly RegistryArtifact[],
  invoke: RegistryAuthority,
  upload: (
    artifact: RegistryArtifact,
    ownership: RegistryUploadOwnership | undefined,
  ) => Promise<void>,
) {
  const repositories = artifacts.map((artifact) => artifact.repository);
  if (
    enrollment.requiredRepositories.length === 0 ||
    new Set(repositories).size !== repositories.length ||
    repositories.length !== enrollment.requiredRepositories.length ||
    enrollment.requiredRepositories.some((repository) => !repositories.includes(repository))
  )
    // Proof: removing this refusal acknowledged a single tier as a complete multi-tier release.
    throw new Error('Publication does not contain the complete required repository set');
  const envelope = publicationEnvelope(artifacts);
  const initial = await invoke({ command: 'read' });
  if (initial.state.enrollment.registryId !== enrollment.registryId)
    // Proof: removing this refusal created candidate ownership on the foreign registry fixture.
    throw new Error('Authority registry identity mismatch');
  const operationId = randomUUID();
  const roots = [...new Set(artifacts.map((artifact) => artifact.digest))];
  const references = artifacts.map(({ repository, digest }) => ({ repository, digest }));
  const contents = artifacts.flatMap((artifact) =>
    artifact.contents.map((content) => ({
      repository: artifact.repository,
      digest: content.digest,
      size: content.size,
      mediaType: content.mediaType,
      isManifest: content.isManifest,
      dependencies: [...content.dependencies],
    })),
  );
  const admission = await invoke({
    command: 'reserve-publication',
    expectedRevision: initial.state.revision,
    operationId,
    owner: enrollment.owner,
    product: enrollment.product,
    roots,
    references,
    envelope,
    ...(initial.state.schemaVersion === 4 ? { contents } : {}),
  });
  const token = admission.token;
  if (token === undefined) throw new Error('Authority omitted publication capability');
  const assertOwned = (response: RegistryCommandResponse) => {
    const publication = response.state.publication;
    const reservation = response.state.reservations.find(
      (candidate) => candidate.operationId === operationId,
    );
    if (
      response.state.enrollment.registryId !== enrollment.registryId ||
      publication?.operationId !== operationId ||
      publication.owner !== enrollment.owner ||
      publication.token !== token ||
      publication.phase !== 'uploading' ||
      response.state.fenced ||
      reservation?.bytes !== envelope.bytes ||
      reservation.inodes !== envelope.inodes
    )
      throw new Error('Publication no longer owns its admitted capacity');
    if (
      initial.state.schemaVersion === 4 &&
      (response.state.schemaVersion !== 4 ||
        JSON.stringify(
          response.state.publicationEvidence.find(
            (evidence) => evidence.operationId === operationId,
          )?.contents,
        ) !== JSON.stringify(contents))
    )
      throw new Error('Publication lost its exact original content declaration');
  };
  const ownership: RegistryUploadOwnership | undefined =
    initial.state.schemaVersion === 4
      ? async (write) => {
          const fresh = await invoke({ command: 'check-capacity' });
          assertOwned(fresh);
          const acknowledged = await invoke({
            command: 'record-publication-write',
            expectedRevision: fresh.state.revision,
            operationId,
            owner: enrollment.owner,
            token,
            write,
          });
          assertOwned(acknowledged);
          if (
            acknowledged.state.schemaVersion !== 4 ||
            !acknowledged.state.publicationEvidence
              .find((evidence) => evidence.operationId === operationId)
              ?.writes.some(
                (recorded) =>
                  recorded.repository === write.repository &&
                  recorded.digest === write.digest &&
                  recorded.uploadId === write.uploadId &&
                  recorded.phase === write.phase,
              )
          )
            throw new Error('Authority omitted exact durable upload ownership');
        }
      : undefined;
  try {
    assertOwned(admission);
    for (const artifact of artifacts) {
      const fresh = await invoke({ command: 'check-capacity' });
      // Proof: removing boundary ownership checks continued uploads after actual pressure fenced the authority.
      assertOwned(fresh);
      await upload(artifact, ownership);
    }
    const fresh = await invoke({ command: 'check-capacity' });
    assertOwned(fresh);
    const completed = await invoke({
      command: 'finish-publication',
      expectedRevision: fresh.state.revision,
      operationId,
      owner: enrollment.owner,
      token,
      outcome: 'completed',
      reconciled: true,
    });
    const bundle = completed.state.bundles.find(
      (candidate) => candidate.operationId === operationId,
    );
    if (
      bundle?.receipt.state !== 'completed' ||
      bundle.owner !== enrollment.owner ||
      bundle.product !== enrollment.product ||
      JSON.stringify(bundle.references) !== JSON.stringify(references) ||
      completed.state.publication !== null ||
      completed.state.reservations.length !== 0
    )
      // Proof: removing this refusal returned success from a completion response with its bundle removed.
      throw new Error('Authority omitted complete durable publication receipt');
    return { registryId: enrollment.registryId, ...bundle };
  } catch (cause) {
    try {
      const current = await invoke({ command: 'read' });
      // Completion may have persisted before the response was lost. Never turn a completed
      // bundle into a new operation; an unresolved owner remains charged if failure recording fails.
      if (current.state.publication?.operationId === operationId)
        await invoke({
          command: 'finish-publication',
          expectedRevision: current.state.revision,
          operationId,
          owner: enrollment.owner,
          token,
          outcome: 'failed',
          reconciled: false,
          failure: (cause instanceof Error ? cause.message : String(cause)).slice(0, 1024),
        });
    } catch (failure) {
      throw new AggregateError(
        [cause, failure],
        'Publication failed and its failure receipt could not be recorded',
        { cause: failure },
      );
    }
    throw cause;
  }
}
