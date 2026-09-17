import { type } from '@shared/validation';

import { serializeCanonical } from '../evidence/content-manifest';

export const packageVersion = '0.1.0';

/** The installed package identity that binds its executable to one reviewed toolkit. */
export const PackageManifest = type({
  packageVersion: `'${packageVersion}'`,
  schemaVersion: '1',
  sourceRevision: /^[0-9a-f]{40}$/,
  toolkitIdentity: /^[0-9a-f]{64}$/,
}).onUndeclaredKey('reject');

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
