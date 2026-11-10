import { parseOrThrow, type } from '@shared/validation';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';

/** Current format2 role order, shared by descriptor and checksum planning. */
export const bunToolkitRoles = [
  // Proof: bun-plan-roster; `plans exactly the current Bun roster and original-byte identity consumable by the strict reader` failed under the recorded production fault and passed after restoration.
  'launcher.mjs',
  'snapshotter.ts',
  'validator.mjs',
  'prepare-activation.mjs',
  'prepare-relocation-activation.mjs',
] as const;

export type BunToolkitRole = (typeof bunToolkitRoles)[number];

/**
 * Claimed current release metadata validated once at the planning boundary.
 */
const Metadata = type({
  // Proof: bun-plan-current-tag; `refuses current release tag "wiki-v0.3.0" before producing descriptors` failed under the recorded production fault and passed after restoration.
  // Proof: bun-plan-tag-components; `refuses current release tag "puni-v01.2.3" before producing descriptors` failed under the recorded production fault and passed after restoration.
  // Proof: bun-plan-tag-end; `refuses current release tag "puni-v1.2.3-beta" before producing descriptors` failed under the recorded production fault and passed after restoration.
  tag: /^puni-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u,
  // Proof: bun-plan-source-metadata; `refuses invalid current toolkit sourceRevision before producing descriptors` failed under the recorded production fault and passed after restoration.
  sourceRevision: /^[0-9a-f]{40}$/u,
  // Proof: bun-plan-runtime-metadata; `refuses invalid current toolkit bunVersion before producing descriptors` failed under the recorded production fault and passed after restoration.
  bunVersion: 'string > 0',
  // Proof: bun-plan-module-members; `refuses malformed-member dependency names at the claimed metadata boundary` failed under the recorded production fault and passed after restoration.
  trustedNodeModules: 'string[]',
  // Proof: bun-plan-closure-metadata; `refuses invalid current toolkit trustedNodeModulesIdentity before producing descriptors` failed under the recorded production fault and passed after restoration.
  trustedNodeModulesIdentity: /^[0-9a-f]{64}$/u,
});

/** Source/runtime identity and already assembled role/closure bytes; no release provenance implied. */
export interface BunToolkitRequest {
  readonly tag: string;
  readonly sourceRevision: string;
  readonly bunVersion: string;
  readonly roleBytes: Readonly<Record<BunToolkitRole, Uint8Array>>;
  readonly trustedNodeModules: readonly string[];
  readonly trustedNodeModulesIdentity: string;
}

/** Canonical current descriptor and ordered checksum bytes; planning neither builds nor publishes. */
export interface BunToolkitPlan {
  readonly descriptor: Uint8Array;
  readonly checksums: Uint8Array;
  readonly digests: Readonly<Record<BunToolkitRole, string>>;
}

/**
 * Plan toolkit2 metadata deterministically without changing legacy producers or defaults.
 * Source freshness, role behavior, copied closure authority and release admission belong to
 * the eventual builder/caller; these bytes alone do not establish a usable current toolkit.
 * @throws when claimed current release metadata is malformed or required role bytes are absent.
 */
export function planBunToolkit(request: BunToolkitRequest): BunToolkitPlan {
  // Proof: bun-plan-metadata-admission; `refuses current release tag "wiki-v0.3.0" before producing descriptors` failed under the recorded production fault and passed after restoration.
  const metadata = parseOrThrow(Metadata, {
    tag: request.tag,
    sourceRevision: request.sourceRevision,
    bunVersion: request.bunVersion,
    // Proof: bun-plan-module-container; `refuses non-array dependency names at the claimed metadata boundary` failed under the recorded production fault and passed after restoration.
    trustedNodeModules: request.trustedNodeModules,
    trustedNodeModulesIdentity: request.trustedNodeModulesIdentity,
  });
  // Object.fromEntries widens its keys; this literal roster maps every BunToolkitRole exactly once.
  const digests = Object.fromEntries(
    // Proof: bun-plan-role-hash; `plans exactly the current Bun roster and original-byte identity consumable by the strict reader` failed under the recorded production fault and passed after restoration.
    bunToolkitRoles.map((role) => [role, hashBytes(request.roleBytes[role])]),
  ) as Record<BunToolkitRole, string>;
  const descriptor = new TextEncoder().encode(
    serializeCanonical({
      ...metadata,
      // Proof: bun-plan-schema; `plans exactly the current Bun roster and original-byte identity consumable by the strict reader` failed under the recorded production fault and passed after restoration.
      // Proof: bun-plan-emitted-runtime; `plans exactly the current Bun roster and original-byte identity consumable by the strict reader` failed under the recorded production fault and passed after restoration.
      // Proof: bun-plan-emitted-source; `plans exactly the current Bun roster and original-byte identity consumable by the strict reader` failed under the recorded production fault and passed after restoration.
      // Proof: bun-plan-emitted-closure; `plans exactly the current Bun roster and original-byte identity consumable by the strict reader` failed under the recorded production fault and passed after restoration.
      schemaVersion: 2,
      roles: digests,
      // Proof: bun-plan-module-order; `canonicalizes unordered metadata and changes identity for every changed role` failed under the recorded production fault and passed after restoration.
      trustedNodeModules: [...metadata.trustedNodeModules].sort(),
    }),
  );
  const lines = [
    // Proof: bun-plan-role-checksum; `plans exactly the current Bun roster and original-byte identity consumable by the strict reader` failed under the recorded production fault and passed after restoration.
    ...bunToolkitRoles.map((role) => digests[role] + '  ./' + role),
    // Proof: bun-plan-descriptor-checksum; `plans exactly the current Bun roster and original-byte identity consumable by the strict reader` failed under the recorded production fault and passed after restoration.
    hashBytes(descriptor) + '  ./toolkit.json',
  ];
  // Proof: bun-plan-final-lf; `plans exactly the current Bun roster and original-byte identity consumable by the strict reader` failed under the recorded production fault and passed after restoration.
  return { descriptor, checksums: new TextEncoder().encode(lines.join('\n') + '\n'), digests };
}
