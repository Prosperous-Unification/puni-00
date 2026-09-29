import { asc, eq, inArray } from 'drizzle-orm';

import { auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import { organization } from './schema';

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
 * Proof, observed 2026-09-29: reduced to comparing counts, `refuses to reset
 * a save that no longer matches, changing nothing` in
 * `shared-people-rollback.db.test.ts` reset both organizations instead of
 * throwing.
 */
export function removeSavedSharedPeople(db: Drizzle, saved: unknown, at: number): number {
  const { organizations } = readSaved(saved);
  return db.transaction(
    (tx) => {
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
 * migration, all or none. An organization that no longer exists refuses the
 * whole restore, naming it.
 */
export function restoreSharedPeople(db: Drizzle, saved: unknown, at: number): number {
  const { organizations } = readSaved(saved);
  return db.transaction(
    (tx) => {
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
      }
      return organizations.length;
    },
    { behavior: 'immediate' },
  );
}
