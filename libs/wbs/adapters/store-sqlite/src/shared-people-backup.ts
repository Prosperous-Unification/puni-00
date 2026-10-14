import { createHash } from 'node:crypto';

import type { CapacityMode } from '@wbs/domain';

import { readSavedProjectRanks, type SavedProjectRank } from './project-rank-rollback';

interface SavedOrganizationMode {
  readonly organizationId: string;
  readonly mode: CapacityMode;
}

/** Complete versioned mode/rank state; isolated organizations are included so stale backups cannot erase changes. */
export interface SavedSharedPeople {
  readonly format: 'shared-people-save';
  readonly version: 1;
  readonly organizations: readonly SavedOrganizationMode[];
  readonly ranks: readonly SavedProjectRank[];
}

// Proof: localeCompare failed the ordinal-ID case (Z/a/ä); reversing either array sort failed canonical ordering.
const compareIds = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
function invalid(): never {
  throw new Error('invalid shared people save');
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates the complete external backup once, retaining its deterministic canonical field order. */
export function readSharedPeopleBackup(saved: unknown): SavedSharedPeople {
  // Proof: accepting version 2 fails the malformed-backup production remove/restore test.
  if (
    !isRecord(saved) ||
    Object.keys(saved).length !== 4 ||
    saved['format'] !== 'shared-people-save' ||
    saved['version'] !== 1 ||
    !Array.isArray(saved['organizations'])
  )
    invalid();
  const organizations: SavedOrganizationMode[] = saved['organizations']
    .map((candidate: unknown): SavedOrganizationMode => {
      // Proof: accepting an invalid semantic mode fails the malformed-backup test.
      if (
        !isRecord(candidate) ||
        Object.keys(candidate).length !== 2 ||
        typeof candidate['organizationId'] !== 'string' ||
        candidate['organizationId'] === '' ||
        (candidate['mode'] !== 'isolated' && candidate['mode'] !== 'shared')
      )
        invalid();
      return { organizationId: candidate['organizationId'], mode: candidate['mode'] };
    })
    .sort((left, right) => compareIds(left.organizationId, right.organizationId));
  const ranks = readSavedProjectRanks({
    format: 'project-rank-save',
    version: 1,
    ranks: saved['ranks'],
  }).ranks.sort((left, right) => compareIds(left.projectId, right.projectId));
  // Proof: independently bypassing either uniqueness clause fails its duplicate-backup refusal.
  if (
    new Set(organizations.map((each) => each.organizationId)).size !== organizations.length ||
    new Set(ranks.map((each) => each.projectId)).size !== ranks.length
  )
    invalid();
  const knownOrganizations = new Set(
    organizations.map((organization) => organization.organizationId),
  );
  // Proof: bypassing this relation made the real digest CLI print a digest for a rank outside the saved organization set.
  if (ranks.some((rank) => !knownOrganizations.has(rank.organizationId)))
    throw new Error('rank organization is absent from shared people save');
  // Proof: reordering root/organization/rank fields or dropping any rank field failed the fixed-byte SHA-256 golden.
  return { format: 'shared-people-save', version: 1, organizations, ranks };
}

/**
 * Lowercase SHA-256 of UTF-8 JSON after {@link readSharedPeopleBackup} validates and canonicalizes it.
 * Root fields are format/version/organizations/ranks; organization fields are organizationId/mode;
 * rank fields are projectId/organizationId/position/createdAt/updatedAt/createdBy. Arrays sort by
 * ordinal organization/project ID, preserving every saved field and never using locale collation.
 *
 * @throws for any invalid v1 backup, including a rank outside its saved organization set.
 */
export function digestSharedPeople(backup: unknown): string {
  // Proof: sha1 instead of sha256 failed the fixed-byte digest golden.
  return createHash('sha256')
    .update(JSON.stringify(readSharedPeopleBackup(backup)), 'utf8')
    .digest('hex');
}
