import { sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { Gate } from './gate';

/** Durable single-use jti admission shared by both running colours. */
export class SqliteDelegationUse {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Waits for the shared write turn and commits once before admitting a use. */
  consume(issuer: string, jti: string, expiresAt: number, now: number): Promise<boolean> {
    if (expiresAt <= now) return Promise.resolve(false);
    // Proof (2026-09-28): bypassing this gate made `commits an admitted use
    // after a concurrent command rolls back` accept the same use twice.
    return this.gate.enter(() =>
      Promise.resolve(
        this.db.transaction((tx) => {
          // Proof (2026-09-28): bypassing storage admitted missing/read-only uses;
          // an impossible prune predicate left an expired row in `prunes expired uses`;
          // raising the limit to 10,000 failed `prunes no more than 1,000 expired rows`.
          tx.run(sql`DELETE FROM delegation_use WHERE rowid IN
        (SELECT rowid FROM delegation_use WHERE expires_at <= ${now} LIMIT 1000)`);
          // Proof (2026-09-28): changing conflict handling to return a row admitted
          // both independent workers in `admits exactly one use across two connections`.
          const inserted = tx.all<{ jti: string }>(sql`INSERT INTO delegation_use
        (issuer, jti, expires_at) VALUES (${issuer}, ${jti}, ${expiresAt})
        ON CONFLICT (issuer, jti) DO NOTHING RETURNING jti`);
          return inserted.length === 1;
        }),
      ),
    );
  }
}
