import { parseSecretsOrThrow, type } from '@shared/validation';

import { serializeCanonical } from '../evidence/content-manifest';

export const puniVersion = '0.3.0';

/** Current package profile is distinct from historical0.2.1; manifest schema remains1. */
export const PuniManifest = type({
  // Proof: c28-profile-old-version; injected fault failed `refuses an old package profile even when every current toolkit byte and join fact is otherwise valid`; restoration passed.
  packageVersion: `'${puniVersion}'`,
  // Proof: c28-profile-schema; injected fault failed `refuses package schema2 with all current toolkit and digest facts otherwise valid`; restoration passed.
  schemaVersion: '1',
  // Proof: c28-profile-source-grammar; Schema diagnostic/order: removing lexical admission may still meet the later source join, which must not stand in for malformed-field classification.; injected fault failed `refuses malformed current installed sourceRevision with every toolkit byte otherwise valid`; restoration passed.
  sourceRevision: /^[0-9a-f]{40}$/u,
  // Proof: c28-profile-digest-grammar; Schema diagnostic/order: removing lexical admission may still meet the later digest join.; injected fault failed `refuses malformed current installed toolkitIdentity with every toolkit byte otherwise valid`; restoration passed.
  toolkitIdentity: /^[0-9a-f]{64}$/u,
  // Proof: c28-profile-closed-keys; injected fault failed `refuses undeclared current package fields with an otherwise valid native toolkit`; restoration passed.
}).onUndeclaredKey('reject');

/** Serialize only validated current identity facts; this does not establish release provenance. */
export function createPuniManifest(sourceRevision: string, toolkitIdentity: string): Uint8Array {
  return new TextEncoder().encode(
    serializeCanonical(
      // Proof: c28-profile-serialize; injected fault failed `refuses malformed current serialization facts invalid/2222222222222222222222222222222222222222222222222222222222222222` and 1 additional named controls; restoration passed.
      parseSecretsOrThrow(PuniManifest, {
        packageVersion: puniVersion,
        schemaVersion: 1,
        sourceRevision,
        toolkitIdentity,
      }),
    ),
  );
}
