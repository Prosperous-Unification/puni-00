import { asc, eq, inArray, sql } from 'drizzle-orm';

import { auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import { organization, sharedPeopleAudit } from './schema';

type Reader = Pick<Drizzle, 'select'>;

/**
 * The file `shared-people-rollback-cli.ts save` writes before a rollback past
 * `20260929200000_add_shared_people`, whose `down.sql` refuses while any
 * organization is shared (docs/runbook-prod-deploy.md#shared-people-rollback):
 * the ids of the organizations in `shared` mode, in id order.
 */
export interface SavedSharedPeople {
  format: 'shared-people-save';
  version: 1;
  organizations: string[];
}

function invalid(): never {
  throw new Error('invalid shared people save');
}

/** Validates the versioned file at the CLI boundary, before any transaction. */
function readSaved(saved: unknown): SavedSharedPeople {
  if (
    typeof saved !== 'object' ||
    saved === null ||
    Array.isArray(saved) ||
    Object.keys(saved).length !== 3
  ) {
    invalid();
  }
  // The checks above prove a plain object; its fields are read as unknown.
  const { format, version, organizations } = saved as Record<string, unknown>;
  if (
    format !== 'shared-people-save' ||
    version !== 1 ||
    !Array.isArray(organizations) ||
    !organizations.every((id): id is string => typeof id === 'string' && id !== '')
  ) {
    invalid();
  }
  return { format, version, organizations: [...organizations].sort() };
}

/** The actor a switch made by this procedure is recorded under. */
export const ROLLBACK_ACTOR = 'shared-people-rollback-cli';

/**
 * How many switches `shared_people_audit` records, or null before
 * `20260929210000_add_shared_people_audit` is applied.
 */
function recordedSwitches(db: Pick<Drizzle, 'get'>): number | null {
  const table = db.get<{ name: string } | undefined>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'shared_people_audit'`,
  );
  if (table === undefined) return null;
  const counted = db.get<{ switches: number }>(
    sql`SELECT COUNT(*) AS switches FROM shared_people_audit`,
  );
  return counted.switches;
}

function sharedOrganizations(db: Reader): string[] {
  return db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.sharedPeople, true))
    .orderBy(asc(organization.id))
    .all()
    .map(({ id }) => id);
}

/** Captures every organization in `shared` mode. */
export function saveSharedPeople(db: Drizzle): SavedSharedPeople {
  return { format: 'shared-people-save', version: 1, organizations: sharedOrganizations(db) };
}

/**
 * Resets every saved organization to `isolated` at `at` in one transaction, refusing
 * unless the save still names exactly the shared ones: an organization
 * switched after the save would otherwise lose its mode with no copy. Answers
 * the number reset.
 *
 * **Only before any switch is recorded.** The reset prepares a rollback past
 * `20260929200000_add_shared_people`, which must first reverse
 * `20260929210000_add_shared_people_audit`, whose `down.sql` refuses while any
 * switch is recorded. Once one is, the rollback is closed and a reset would
 * move every date for nothing, so it refuses, naming the path that remains
 * (switch back through the route; code rollback only). It writes no audit row
 * of its own: one would close the rollback it prepares.
 *
 * Proof: the recorded-switch refusal removed made `refuses to reset once a
 * switch is recorded, changing nothing` (`shared-people-rollback.db.test.ts`)
 * reset the organization; watched 2026-09-29.
 *
 * Proof, observed 2026-09-29: reduced to comparing counts, `refuses to reset
 * a save that no longer matches, changing nothing` in
 * `shared-people-rollback.db.test.ts` reset both organizations instead of
 * throwing.
 */
export function removeSavedSharedPeople(db: Drizzle, saved: unknown, at: number): number {
  const { organizations } = readSaved(saved);
  return db.transaction(
    (tx) => {
      const recorded = recordedSwitches(tx);
      if (recorded !== null && recorded > 0) {
        throw new Error(
          'shared people switches are recorded, so the rollback past shared people is closed: switch organizations back with PATCH /api/organization and roll back code only; see docs/runbook-prod-deploy.md#shared-people-rollback',
        );
      }
      const current = sharedOrganizations(tx);
      if (
        current.length !== organizations.length ||
        current.some((id, index) => id !== organizations[index])
      ) {
        throw new Error('shared people save does not match the stored modes; save again first');
      }
      if (current.length > 0) {
        tx.update(organization)
          .set({ sharedPeople: false, ...auditOnUpdate({ at }) })
          .where(inArray(organization.id, current))
          .run();
      }
      return current.length;
    },
    { behavior: 'immediate' },
  );
}

/**
 * Switches the saved organizations back to `shared` after a later forward
 * migration, all or none, recording each switch under {@link ROLLBACK_ACTOR}
 * as the route records its own. An organization that no longer exists refuses
 * the whole restore, naming it; so does a database the audit migration has
 * not reached, where the switch could not be recorded.
 *
 * It publishes nothing: it runs outside be-01. Restart be-01 afterwards, so
 * no process keeps a load memo or fan-out record from before the restore.
 *
 * Proof: the audit insert removed made `saves, resets, rolls back, migrates
 * and restores every mode` (`shared-people-rollback.db.test.ts`) find no
 * record of the restore; watched 2026-09-29.
 */
export function restoreSharedPeople(db: Drizzle, saved: unknown, at: number): number {
  const { organizations } = readSaved(saved);
  return db.transaction(
    (tx) => {
      if (recordedSwitches(tx) === null) {
        throw new Error(
          'shared_people_audit does not exist: run the forward migrations before restoring',
        );
      }
      for (const id of organizations) {
        const found = tx
          .select({ id: organization.id })
          .from(organization)
          .where(eq(organization.id, id))
          .get();
        if (found === undefined) {
          throw new Error(`saved shared organization ${id} no longer exists`);
        }
        tx.update(organization)
          .set({ sharedPeople: true, ...auditOnUpdate({ at }) })
          .where(eq(organization.id, id))
          .run();
        tx.insert(sharedPeopleAudit)
          .values({
            id: crypto.randomUUID(),
            organizationId: id,
            actorId: ROLLBACK_ACTOR,
            sharedPeople: true,
            createdAt: at,
          })
          .run();
      }
      return organizations.length;
    },
    { behavior: 'immediate' },
  );
}
