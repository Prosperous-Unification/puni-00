import { createHash } from 'node:crypto';

import type { CapacityMode } from '@wbs/domain';

import {
  readSavedWorkPackageRanks,
  type SavedProjectRank,
  type SavedWorkPackageRank,
} from './work-package-rank-rollback';

interface SavedOrganizationMode {
  readonly organizationId: string;
  readonly mode: CapacityMode;
}

/** Published canonical generation; projectId spelling and field order retain offline approval identity. */
export interface SavedSharedPeopleV1 {
  readonly format: 'shared-people-save';
  readonly version: 1;
  readonly organizations: readonly SavedOrganizationMode[];
  readonly ranks: readonly SavedProjectRank[];
}

/** New current generation; equal facts intentionally have a different digest from version1. */
export interface SavedSharedPeopleV2 {
  readonly format: 'shared-people-save';
  readonly version: 2;
  readonly organizations: readonly SavedOrganizationMode[];
  readonly ranks: readonly SavedWorkPackageRank[];
}

export type SavedSharedPeople = SavedSharedPeopleV1 | SavedSharedPeopleV2;

/** Current semantic facts only; this projection grants no restore authority or digest equivalence. */
export interface SharedPeopleState {
  readonly organizations: readonly SavedOrganizationMode[];
  readonly ranks: readonly SavedWorkPackageRank[];
}

// Proof: localeCompare failed the ordinal-ID case (Z/a/ä); reversing either array sort failed canonical ordering.
const compareIds = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
function invalid(): never {
  throw new Error('invalid shared people save');
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strictly decodes and canonicalizes the declared generation without erasing its version or owner key.
 * Returns detached complete facts; arrays use ordinal IDs and every historical canonical field is retained.
 * @throws on unknown/mixed formats, duplicate identities, invalid modes or ranks outside the organization set.
 */
export function readSharedPeopleBackup(saved: unknown): SavedSharedPeople {
  if (
    !isRecord(saved) ||
    // Proof: backup-shared-root-fields. Omitting the closed root field count accepts an undeclared root field in both generations.
    // Observed test: refuses legacy1 undeclared root fields.
    // Observed test: refuses current2 undeclared root fields.
    Object.keys(saved).length !== 4 ||
    saved['format'] !== 'shared-people-save' ||
    // Proof: backup-shared-closed-generation. One grouped root+delegated generation bypass accepts version3 at the fifth assertion; no later null case is credited.
    // Observed test: retained recovery backup wire identity > refuses shared backup mixed owner spelling and unknown declared generations.
    (saved['version'] !== 1 && saved['version'] !== 2) ||
    !Array.isArray(saved['organizations'])
  )
    invalid();
  const organizations: SavedOrganizationMode[] = saved['organizations']
    .map((candidate: unknown): SavedOrganizationMode => {
      // Proof: accepting an invalid semantic mode fails the malformed-backup test.
      if (
        !isRecord(candidate) ||
        // Proof: backup-organization-fields. Omitting the organization field count accepts undeclared fields in either generation.
        // Observed test: refuses legacy1 undeclared organization fields.
        // Observed test: refuses current2 undeclared organization fields.
        Object.keys(candidate).length !== 2 ||
        typeof candidate['organizationId'] !== 'string' ||
        candidate['organizationId'] === '' ||
        // Proof: backup-organization-mode. Omitting mode validation returns a digest for unsupported mode at the sixth assertion; later malformed ranks are not credited.
        // Observed test: canonical shared people backup > preserves v1 validation before producing any digest.
        (candidate['mode'] !== 'isolated' && candidate['mode'] !== 'shared')
      )
        invalid();
      // Proof: backup-organization-detachment. Returning caller organization rows aliases the retained organizationId after caller mutation in both generations.
      // Observed test: detaches legacy1 full canonical facts from caller aliases.
      // Observed test: detaches current2 full canonical facts from caller aliases.
      return { organizationId: candidate['organizationId'], mode: candidate['mode'] };
    })
    // Proof: backup-organization-order. Reversing organization order fails the selected ordinal array assertions; later digest assertions are not credited.
    // Observed test: canonical shared people backup > orders organization and work package IDs ordinally without locale-dependent collation.
    // Observed test: orders current2 organization and rank identities ordinally before canonical digest.
    .sort((left, right) => compareIds(left.organizationId, right.organizationId));
  const ranks = readSavedWorkPackageRanks({
    format: saved['version'] === 1 ? 'project-rank-save' : 'work-package-rank-save',
    // Proof: backup-shared-closed-generation. One grouped root+delegated generation bypass accepts version3 at the fifth assertion; no later null case is credited.
    // Observed test: retained recovery backup wire identity > refuses shared backup mixed owner spelling and unknown declared generations.
    version: saved['version'],
    ranks: saved['ranks'],
  });
  const ownerIds =
    ranks.version === 1
      ? ranks.ranks.map((rank) => rank.projectId)
      : ranks.ranks.map((rank) => rank.workPackageId);
  // Proof: independently bypassing either uniqueness clause fails its duplicate-backup refusal.
  if (
    // Proof: backup-organization-unique. Omitting organization uniqueness accepts duplicate organization identities in either generation.
    // Observed test: refuses legacy1 duplicate organization identities.
    // Observed test: refuses current2 duplicate organization identities.
    new Set(organizations.map((each) => each.organizationId)).size !== organizations.length ||
    // Proof: backup-rank-unique. Omitting owner uniqueness accepts duplicate rank identities in either generation.
    // Observed test: refuses legacy1 duplicate rank identities.
    // Observed test: refuses current2 duplicate rank identities.
    new Set(ownerIds).size !== ranks.ranks.length
  )
    invalid();
  const knownOrganizations = new Set(
    organizations.map((organization) => organization.organizationId),
  );
  // Proof: bypassing this relation made the real digest CLI print a digest for a rank outside the saved organization set.
  // Proof: backup-organization-membership. Omitting the saved-organization relation returns a digest in the library and exit0 in the actual CLI. Only those first refusal assertions are credited.
  // Observed test: canonical shared people backup > refuses a rank whose organization is absent from the complete backup.
  // Observed test: refuses current2 missing organization at the real digest CLI without output.
  if (ranks.ranks.some((rank) => !knownOrganizations.has(rank.organizationId)))
    throw new Error('rank organization is absent from shared people save');
  // Historical root/row canonical order is retained before digest, never replaced by current projection.
  return ranks.version === 1
    ? {
        format: 'shared-people-save',
        version: 1,
        organizations,
        // Proof: backup-legacy-rank-order. Reversing legacy owner order fails the selected ordinal rank array assertion.
        // Observed test: canonical shared people backup > orders organization and work package IDs ordinally without locale-dependent collation.
        ranks: ranks.ranks.sort((left, right) => compareIds(left.projectId, right.projectId)),
      }
    : {
        format: 'shared-people-save',
        version: 2,
        organizations,
        ranks: ranks.ranks.sort((left, right) =>
          // Proof: backup-current-rank-order. Reversing current owner order fails the selected ordinal rank array assertion.
          // Observed test: orders current2 organization and rank identities ordinally before canonical digest.
          compareIds(left.workPackageId, right.workPackageId),
        ),
      };
}

/** Projects validated complete facts without mutating or replacing their original versioned identity. */
export function projectSharedPeople(saved: SavedSharedPeople): SharedPeopleState {
  return {
    organizations: saved.organizations.map((organization) => ({ ...organization })),
    ranks:
      saved.version === 1
        ? // Proof: backup-shared-legacy-projection. Retargeting the projected legacy owner fails complete removal comparison and the approved owner foreign-owner check, not a permission bypass.
          // Observed test: removes and restores a validated legacy shared-save1 using complete current facts.
          // Observed test: commits historical ranks, personal mode audit, every owned work package event and bound receipt together.
          saved.ranks.map(({ projectId, ...facts }) => ({ workPackageId: projectId, ...facts }))
        : saved.ranks.map((rank) => ({ ...rank })),
  };
}

/**
 * SHA-256 of the declared generation's complete canonical UTF-8 JSON, after strict validation.
 * Version1 retains projectId first in each rank; version2 uses workPackageId in that position.
 * Both preserve organizationId/position/createdAt/updatedAt/createdBy and ordinal array ordering.
 * This hashes canonical values, not input whitespace/order, and never hashes the current-row projection.
 * @throws for any malformed generation or incomplete organization/rank relationship.
 */
export function digestSharedPeople(backup: unknown): string {
  // Proof: sha1 instead of sha256 failed the fixed-byte digest golden.
  return (
    createHash('sha256')
      // Proof: backup-original-wire-digest. Hashing the current-row projection changes both original version1 and current version2 fixed digests.
      // Observed test: retained recovery backup wire identity > retains published shared-save1 project-keyed canonical value and original digest.
      // Observed test: retained recovery backup wire identity > keeps renamed shared-save2 canonical identity distinct from equivalent version1.
      .update(JSON.stringify(readSharedPeopleBackup(backup)), 'utf8')
      .digest('hex')
  );
}
