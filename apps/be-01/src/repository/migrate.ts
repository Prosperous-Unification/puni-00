import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

export function runMigrations(dbPath: string, migrationsFolder: string): void {
  const sqlite = new Database(dbPath);
  const db = drizzle({ client: sqlite });
  migrate(db, { migrationsFolder });
  sqlite.close();
}
