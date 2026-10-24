// Proof: the contracts barrel made the rollback memory regression peak at 860340 KiB;
// the schema Job has 512 MiB for its parent and CLI together (2026-10-23).
import {
  type DependencyActivation,
  type DependencyActivationReceipt,
  parseDependencyReceipt,
} from '@wbs/contracts/dependency-runtime';
import type { ExternalDependencyAuthoring } from '@wbs/core';
import { sql } from 'drizzle-orm';

import { type Drizzle, openExistingConnection } from './db';
import { readMigrationFolders } from './migrate-down';

const MIGRATION = '20261022212000_add_cross_project_dependency_activation';
const MARKER = `CREATE TABLE cross_project_dependency_activation (
 id INTEGER PRIMARY KEY NOT NULL CONSTRAINT "external dependencies precede activation authority" CHECK (id = 1),
 state TEXT NOT NULL CHECK (state IN ('DISABLED','ENABLED'))
)`;
const RECEIPT = `CREATE TABLE cross_project_dependency_activation_receipt (
 id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
 receipt TEXT NOT NULL CHECK (json_valid(receipt))
)`;
const ACTIONS = ['insert', 'update', 'delete'] as const;

function triggerSql(action: (typeof ACTIONS)[number]): string {
  // Proof: removing each action's numeric JSON type predicate admitted true in its repository negative (2026-10-22, Astra P2).
  return `CREATE TRIGGER external_dependency_admit_${action}
BEFORE ${action.toUpperCase()} ON external_dependency
WHEN (SELECT count(*) FROM cross_project_dependency_activation) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_project_dependency_activation WHERE id = 1 AND state = 'ENABLED')
 OR (SELECT count(*) FROM cross_project_dependency_activation_receipt) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_project_dependency_activation_receipt WHERE id = 1 AND json_valid(receipt) AND json_extract(receipt,'$.protocol') = 'wbs-dependency-activation' AND json_type(receipt,'$.version') IN ('integer','real') AND json_extract(receipt,'$.version') = 1)
BEGIN
 SELECT RAISE(ABORT, 'external_dependencies_inactive');
END`;
}
function normalizeSql(statement: string): string {
  return statement.replace(/\s+/g, ' ').trim().replace(/;$/, '');
}

/**
 * Validates persisted semantic authority, its constrained tables, exact admission triggers
 * and migration ledger. Missing, unreadable or malformed trusted state throws.
 * Reading never activates authoring or infers compatibility from an empty edge table.
 */
export function inspectDependencyActivation(db: Drizzle): DependencyActivation {
  const ledger = db.all(sql`SELECT name FROM __drizzle_migrations WHERE name = ${MIGRATION}`);
  // Proof: removing this check admitted the deleted-ledger inspection negative (2026-10-22).
  if (ledger.length !== 1) throw new Error('missing dependency activation migration');
  for (const [name, expected] of [
    ['cross_project_dependency_activation', MARKER],
    ['cross_project_dependency_activation_receipt', RECEIPT],
  ]) {
    const schemas = db.all<{ sql: unknown }>(
      sql`SELECT sql FROM sqlite_master WHERE type='table' AND name=${name}`,
    );
    const definition = schemas.at(0)?.sql;
    // Proof: removing exact schema inspection admitted unconstrained replacement tables (2026-10-22).
    if (
      schemas.length !== 1 ||
      typeof definition !== 'string' ||
      normalizeSql(definition) !== normalizeSql(expected)
    )
      throw new Error('invalid dependency activation schema');
  }
  const markers = db.all<{ id: unknown; state: unknown }>(
    'SELECT id,state FROM cross_project_dependency_activation',
  );
  const marker = markers.at(0);
  // Proof: removing marker validation admitted wrong-ID authority; removing state validation admitted UNKNOWN with an exact receipt (2026-10-22).
  if (
    markers.length !== 1 ||
    marker?.id !== 1 ||
    (marker.state !== 'DISABLED' && marker.state !== 'ENABLED')
  )
    throw new Error('invalid dependency activation marker');
  const triggers = db.all<{ name: string; sql: unknown }>(
    "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='external_dependency' AND name IN ('external_dependency_admit_insert','external_dependency_admit_update','external_dependency_admit_delete')",
  );
  // Proof: removing this check admitted each missing/altered INSERT, UPDATE and DELETE trigger (2026-10-22).
  if (
    triggers.length !== ACTIONS.length ||
    ACTIONS.some((action) => {
      const definition = triggers.find(
        (candidate) => candidate.name === `external_dependency_admit_${action}`,
      )?.sql;
      return (
        typeof definition !== 'string' ||
        normalizeSql(definition) !== normalizeSql(triggerSql(action))
      );
    })
  )
    throw new Error('invalid dependency activation triggers');
  const receipts = db.all<{ id: unknown; receipt: unknown }>(
    'SELECT id,receipt FROM cross_project_dependency_activation_receipt',
  );
  if (marker.state === 'DISABLED') {
    // Proof: removing this check admitted DISABLED with a receipt (2026-10-22).
    if (receipts.length !== 0) throw new Error('disabled dependency authority has a receipt');
    return { state: 'DISABLED', receipt: null };
  }
  const stored = receipts.at(0);
  // Proof: removing exact receipt-row validation admitted a wrong-ID receipt (2026-10-22).
  if (receipts.length !== 1 || stored?.id !== 1 || typeof stored.receipt !== 'string')
    throw new Error('enabled dependency authority has no exact receipt');
  return { state: 'ENABLED', receipt: parseDependencyReceipt(JSON.parse(stored.receipt)) };
}

/** Reads durable authority on every access, on the connection owning the admitted command. */
export function readDependencyAuthoring(db: Drizzle): ExternalDependencyAuthoring {
  return {
    get state() {
      // Proof: returning cached inactive state hid deleted authority on the second access (2026-10-22).
      return inspectDependencyActivation(db).state === 'ENABLED' ? 'active' : 'inactive';
    },
  };
}

/**
 * Persists already validated exact owner attribution and ENABLED authority atomically.
 * Owns an existing-only connection and BEGIN IMMEDIATE; never nests a caller transaction,
 * creates a database, disables authority or dispatches deployment work. Identical retries
 * return the same durable authority; conflicting attribution and corrupt trusted state throw.
 * The supplied migration folder must be the owner's pinned candidate migration artifact.
 *
 * Only the deployment owner may dispatch this after actual complete continuous participant
 * fencing and durable activation intent. This storage primitive grants no participant-proof,
 * adoption or activation permission. Its readback is inside the write transaction; the owner
 * must independently inspect committed authority after dispatch while retaining all fences.
 */
export function activateDependencies(
  dbPath: string,
  migrationsFolder: string,
  receipt: DependencyActivationReceipt,
): Extract<DependencyActivation, { state: 'ENABLED' }> {
  // Proof: substituting a creating connection made the absent-database negative create a file (2026-10-23).
  const connection = openExistingConnection(dbPath);
  try {
    const { db } = connection;
    // Proof: removing transaction controls left a receipt after the injected marker-flip failure (2026-10-23).
    db.run('BEGIN IMMEDIATE');
    try {
      const migrations = readMigrationFolders(migrationsFolder);
      const ledger = db.all<{ name: unknown; hash: unknown }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      );
      // Proof: removing this guard admitted edited/missing/duplicate/unknown ledger identities;
      // removing external identity membership admitted omission from both artifact and ledger (2026-10-23).
      if (
        !migrations.some(
          (migration) => migration.name === '20261022211000_add_external_dependencies',
        ) ||
        ledger.length !== migrations.length ||
        migrations.some(
          (migration, index) =>
            migration.name !== ledger[index]?.name || migration.hash !== ledger[index]?.hash,
        )
      )
        throw new Error('dependency activation migration identities differ');
      const authority = inspectDependencyActivation(db);
      // The owner has already validated receipt; field order comes from the shared decoder.
      const serialized = JSON.stringify(parseDependencyReceipt(receipt));
      if (authority.state === 'ENABLED') {
        // Proof: removing equality admitted the conflicting activationId negative (2026-10-23).
        if (JSON.stringify(authority.receipt) !== serialized)
          throw new Error('conflicting dependency activation receipt');
        db.run('COMMIT');
        return authority;
      }
      db.run(
        sql`INSERT INTO cross_project_dependency_activation_receipt (id,receipt) VALUES (1,${serialized})`,
      );
      db.run(
        "UPDATE cross_project_dependency_activation SET state='ENABLED' WHERE id=1 AND state='DISABLED'",
      );
      const admitted = inspectDependencyActivation(db);
      // Proof: removing equality committed the trigger-rewritten activationId in receipt-readback failure (2026-10-23).
      if (admitted.state !== 'ENABLED' || JSON.stringify(admitted.receipt) !== serialized)
        throw new Error('dependency activation receipt readback differs');
      db.run('COMMIT');
      return admitted;
    } catch (cause) {
      db.run('ROLLBACK');
      throw cause;
    }
  } finally {
    connection.close();
  }
}
