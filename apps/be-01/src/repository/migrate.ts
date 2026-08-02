import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

import { assertPragmas, openDatabase } from './db';

export function runMigrations(dbPath: string, migrationsFolder: string): void {
  const sqlite = openDatabase(dbPath);
  assertPragmas(sqlite);
  const db = drizzle({ client: sqlite });
  migrate(db, { migrationsFolder });
  sqlite.close();
}
