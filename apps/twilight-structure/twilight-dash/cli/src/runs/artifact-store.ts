import type { ArtifactRef } from './records';

export type ArtifactRetention =
  | { readonly kind: 'retained'; readonly reference: ArtifactRef }
  | { readonly kind: 'refused'; readonly reason: 'metadata_conflict' };
/** Immutable retained bytes. Missing, unreadable or corrupt content throws; returned arrays never alias storage. */
export interface ArtifactStore {
  /** Verifies existing content before returning either retained or metadata_conflict. */
  retainArtifact(content: Uint8Array, mediaType: string): Promise<ArtifactRetention>;
  /** Returns copied bytes only after verifying retained digest, length and metadata; absence or integrity failure throws. */
  readArtifact(reference: ArtifactRef): Promise<Uint8Array>;
}
