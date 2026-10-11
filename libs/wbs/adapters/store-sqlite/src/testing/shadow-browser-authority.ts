import { sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

/** Makes this connection's otherwise intact B1 table unreadable for a mounted fault proof. */
export function shadowBrowserAuthority(db: SQLiteBunDatabase): void {
  db.run(
    sql.raw(
      'CREATE TEMP VIEW browser_credential_revocations AS SELECT * FROM unreadable_browser_authority',
    ),
  );
}
