import { serializeCanonical } from '../evidence/content-manifest';

export const packageVersion = '0.1.0';

/** Canonical package-level identity, separate from every consumer activation identity. */
export function packageManifestBytes(sourceRevision: string, toolkitIdentity: string): Uint8Array {
  return new TextEncoder().encode(
    serializeCanonical({
      packageVersion,
      schemaVersion: 1,
      sourceRevision,
      toolkitIdentity,
    }),
  );
}
