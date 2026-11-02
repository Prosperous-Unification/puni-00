import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';

/**
 * Whether drizzle's ledger records the migration folder `name`. A deploy
 * preflight reads this before migrating, to tell a table the store has not
 * reached yet from one that went missing.
 *
 * @throws when the store has no `__drizzle_migrations` table: a ledger that
 * cannot be read says nothing about which migrations ran.
 */
export function isMigrationApplied(db: Pick<Drizzle, 'all'>, name: string): boolean {
  const ledger = db
    .all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`,
    )
    .at(0)?.n;
  // Proof: with this refusal removed, `refuses a store without a migration
  // ledger` (mcp-service-settings-check-cli.db.test.ts) saw a raw `no such
  // table` query failure instead of the named refusal; watched 2026-10-28.
  if (ledger !== 1) throw new Error('the migration ledger __drizzle_migrations is absent');
  const rows = db
    .all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM __drizzle_migrations WHERE name = ${name}`)
    .at(0)?.n;
  return rows !== undefined && rows > 0;
}

/** Whether the store holds a table named `name`. */
export function hasTable(db: Pick<Drizzle, 'all'>, name: string): boolean {
  return (
    db
      .all<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ${name}`,
      )
      .at(0)?.n === 1
  );
}
