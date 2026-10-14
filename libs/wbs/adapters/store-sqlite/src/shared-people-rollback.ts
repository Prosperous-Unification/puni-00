import { SUPPORTED_CAPACITY_MODES } from '@wbs/domain';
import { asc, eq, sql } from 'drizzle-orm';

import { auditOnUpdate } from './audit';
import { type Drizzle, openReadOnlyConnection } from './db';
import { restoreProjectRanks, saveProjectRanks } from './project-rank-rollback';
import {
  organization,
  projectRank,
  sharedPeopleAudit,
  sharedPeopleRestoreApproval,
  sharedPeopleRestoreOperation,
} from './schema';
import { readSharedPeopleBackup, type SavedSharedPeople } from './shared-people-backup';
import { decodeSharedPeople } from './shared-people-mode';
export type { SavedSharedPeople } from './shared-people-backup';

type Reader = Pick<Drizzle, 'select'>;

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
 *
 * @throws once any capacity-mode switch, restore operation or restore approval is recorded:
 * their schema rollback refuses then, so the migrate-down this prepares is closed and clearing
 * modes or ranks would only lose them (docs/runbook-prod-deploy.md#shared-people-rollback).
 */
export function removeSharedPeople(db: Drizzle, backup: unknown, at: number) {
  const saved = readSharedPeopleBackup(backup);
  // Proof: removing this transaction leaves partial state after the late remove-write failure.
  return db.transaction(
    (tx) => {
      const switches = tx
        .select({ id: sharedPeopleAudit.id })
        .from(sharedPeopleAudit)
        .limit(1)
        .all();
      // Proof: removing this refusal made `refuses the shared-people remove once a switch is
      // recorded, changing nothing` (`shared-people-audit.db.test.ts`) fail; watched 2026-10-11.
      if (switches.length > 0)
        throw new Error(
          'shared people switches are recorded: the schema rollback is closed; see docs/runbook-prod-deploy.md#shared-people-rollback',
        );
      const operations = tx
        .select({ id: sharedPeopleRestoreOperation.id })
        .from(sharedPeopleRestoreOperation)
        .limit(1)
        .all();
      const approvals = tx
        .select({ id: sharedPeopleRestoreApproval.id })
        .from(sharedPeopleRestoreApproval)
        .limit(1)
        .all();
      // Proof: bypassing this guard failed both issued-approval=false/true recovery-state negatives:
      // the isolated rank vanished and organization updated_at changed before down.sql refused.
      if (operations.length > 0 || approvals.length > 0)
        throw new Error(
          'shared people restore evidence is recorded: the schema rollback is closed; see docs/runbook-prod-deploy.md#shared-people-rollback',
        );
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
 * stay untouched. Shared input always refuses here, regardless of release capability: only
 * the audited restore owner can consume personal approvals. Capability is checked before mutation.
 * Partial organization updates are stamped at the supplied instant; rank audit fields stay historical.
 * Rank ownership/authors are checked by the existing rank recovery within this immediate transaction.
 */
export function restoreSharedPeople(db: Drizzle, backup: unknown, at: number) {
  const saved = readSharedPeopleBackup(backup);
  for (const each of saved.organizations) {
    const mode = each.mode;
    // Proof: bypassing this guard restored shared mode with test-supported capability through the legacy path.
    if (mode === 'shared')
      throw new Error(
        'unsupported capacity mode shared; legacy restore cannot consume personal approvals',
      );
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
