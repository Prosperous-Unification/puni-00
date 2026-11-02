import { createHash } from 'node:crypto';

import { decodeArtifactRef } from './record-codecs';
import type { ArtifactRef } from './records';

/** Hashes raw bytes, rather than the canonical JSON representation used by portable records. */
export function referenceArtifact(content: Uint8Array, mediaType: string): ArtifactRef {
  return decodeArtifactRef({
    version: 1,
    digest: createHash('sha256').update(content).digest('hex'),
    byteLength: content.byteLength,
    mediaType,
    retention: 'retain',
  });
}
/** Checks retained bytes against their immutable reference before any read or deduplication response. */
export function verifyArtifactContent(content: Uint8Array, reference: ArtifactRef): void {
  // Proof: bypassing artifact digest enforcement failed 'corrupt existing artifact bytes throws before retain or metadata conflict'.
  // Proof: bypassing artifact length enforcement failed 'corrupt existing artifact declared length throws before retain or metadata conflict'.
  if (
    content.byteLength !== reference.byteLength ||
    referenceArtifact(content, reference.mediaType).digest !== reference.digest
  )
    throw new Error('artifact integrity mismatch');
}

/** Copies an external byte request without coercing missing content into an empty artifact. */
export function snapshotArtifactContent(content: Uint8Array): Uint8Array {
  // Proof: bypassing artifact byte boundary enforcement failed 'memory artifacts > retains immutable bytes and refuses metadata collisions'.
  if (!(content instanceof Uint8Array)) throw new Error('artifact content must be bytes');
  return new Uint8Array(content);
}
