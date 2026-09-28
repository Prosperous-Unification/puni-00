import { sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

/** Durable single-use jti admission shared by both running colours. */
export class SqliteDelegationUse {
  constructor(private readonly db: SQLiteBunDatabase) {}

  /** Consumes once, pruning at most 1,000 expired rows in the same write. */
  consume(issuer: string, jti: string, expiresAt: number, now: number): boolean {
    if (expiresAt <= now) return false;
    return this.db.transaction((tx) => {
      // Proof: replacing this write with a no-op made the missing and read-only
      // table tests admit a use; pruning with an impossible predicate left an
      // expired row in `prunes expired uses`; raising the LIMIT to 10,000
      // failed `prunes no more than 1,000 expired rows` (2026-09-28).
      tx.run(sql`DELETE FROM delegation_use WHERE rowid IN
        (SELECT rowid FROM delegation_use WHERE expires_at <= ${now} LIMIT 1000)`);
      // Proof: removing the primary key or this conflict refusal let both
      // connections admit one jti in delegation-use.db.test.ts (2026-09-28).
      const inserted = tx.all<{ jti: string }>(sql`INSERT INTO delegation_use
        (issuer, jti, expires_at) VALUES (${issuer}, ${jti}, ${expiresAt})
        ON CONFLICT (issuer, jti) DO NOTHING RETURNING jti`);
      return inserted.length === 1;
    });
  }
}
