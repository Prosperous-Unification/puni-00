import { type CapacityMode, SUPPORTED_CAPACITY_MODES } from '@wbs/domain';
import { asc, eq, sql } from 'drizzle-orm';

import { auditOnUpdate } from './audit';
import { type Drizzle, openReadOnlyConnection } from './db';
import {
  readSavedProjectRanks,
  restoreProjectRanks,
  type SavedProjectRank,
  saveProjectRanks,
} from './project-rank-rollback';
import { organization, projectRank } from './schema';
import { decodeSharedPeople } from './shared-people-mode';

type Reader = Pick<Drizzle, 'select'>;
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

const compareIds = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
function invalid(): never {
  throw new Error('invalid shared people save');
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates the complete external backup once, retaining its deterministic canonical field order. */
function readSaved(saved: unknown): SavedSharedPeople {
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
  return { format: 'shared-people-save', version: 1, organizations, ranks };
}

function currentState(db: Reader): SavedSharedPeople {
  const organizations = db
    .select({ organizationId: organization.id, sharedPeople: organization.sharedPeople })
    .from(organization)
    .orderBy(asc(organization.id))
    .all()
    .map((each) => ({
      organizationId: each.organizationId,
      mode:
        decodeSharedPeople(each.sharedPeople) === 0 ? ('isolated' as const) : ('shared' as const),
    }));
  return {
    format: 'shared-people-save',
    version: 1,
    organizations,
    ranks: saveProjectRanks(db).ranks,
  };
}

/** Captures all modes and ranks on a dedicated read-only snapshot; closes on success and throw. */
export function saveSharedPeople(dbPath: string): SavedSharedPeople {
  // Proof: a mutable opener permits the injected write; removing the transaction tears concurrent mode/rank capture.
  const connection = openReadOnlyConnection(dbPath);
  try {
    return connection.db.transaction((tx) => currentState(tx), { behavior: 'deferred' });
  } finally {
    // Proof: removing close fails the injected rank-read exception lifecycle test.
    connection.close();
  }
}

/**
 * Clears both facts atomically only when the complete backup still matches; stale input throws before writes.
 * Partial organization updates stamp the supplied instant; all audit fields roll back on failure.
 */
export function removeSharedPeople(db: Drizzle, backup: unknown, at: number) {
  const saved = readSaved(backup);
  // Proof: removing this transaction leaves partial state after the late remove-write failure.
  return db.transaction(
    (tx) => {
      const current = currentState(tx);
      // Proof: bypassing equality makes each stale mode/rank/organization test mutate state.
      if (JSON.stringify(current) !== JSON.stringify(saved))
        throw new Error(
          'shared people save does not match current modes and ranks; save again first',
        );
      tx.delete(projectRank)
        .where(sql`1`)
        .run();
      // Proof: removing this audit stamp fails the fixed-instant partial recovery test.
      for (const each of current.organizations)
        tx.update(organization)
          .set({ sharedPeople: 0, ...auditOnUpdate({ at }) })
          .where(eq(organization.id, each.organizationId))
          .run();
      return { organizations: current.organizations.length, ranks: current.ranks.length };
    },
    { behavior: 'immediate' },
  );
}

/**
 * Restores into isolated, unranked existing saved organizations; extra isolated organizations
 * stay untouched. Release capability is checked before any mutation; SQLite encoding alone
 * never grants shared runtime support.
 * Partial organization updates are stamped at the supplied instant; rank audit fields stay historical.
 * Rank ownership/authors are checked by the existing rank recovery within this immediate transaction.
 */
export function restoreSharedPeople(db: Drizzle, backup: unknown, at: number) {
  const saved = readSaved(backup);
  for (const each of saved.organizations) {
    const mode = each.mode;
    // Proof: bypassing capability validation reaches the injected first-write trap for shared restoration.
    if (!SUPPORTED_CAPACITY_MODES.includes(mode))
      throw new Error(`unsupported capacity mode ${mode}; restore requires a compatible release`);
  }
  // Proof: removing the outer immediate transaction lets the concurrent eligibility write commit.
  return db.transaction(
    (tx) => {
      const current = currentState(tx);
      const existing = new Set(current.organizations.map((each) => each.organizationId));
      for (const each of saved.organizations) {
        // Proof: bypassing existence loses the named missing-saved-organization refusal.
        if (!existing.has(each.organizationId))
          throw new Error(`saved organization ${each.organizationId} is missing`);
      }
      // Proof: each clause independently prevents restoring over existing ranks or an extra shared organization.
      if (
        current.ranks.length !== 0 ||
        current.organizations.some((each) => each.mode !== 'isolated')
      )
        throw new Error('restore requires isolated modes and no ranks');
      // Proof: independently removing the restore stamp fails the fixed-instant recovery test.
      for (const each of saved.organizations)
        tx.update(organization)
          .set({ sharedPeople: each.mode === 'isolated' ? 0 : 1, ...auditOnUpdate({ at }) })
          .where(eq(organization.id, each.organizationId))
          .run();
      restoreProjectRanks(tx, { format: 'project-rank-save', version: 1, ranks: saved.ranks });
      return { organizations: saved.organizations.length, ranks: saved.ranks.length };
    },
    { behavior: 'immediate' },
  );
}
