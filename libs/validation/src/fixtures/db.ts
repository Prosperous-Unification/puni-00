import { Database } from 'bun:sqlite';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';

export interface TestDbOptions {
  migrationsFolder: string | null;
}

export async function makeTestDb(opts: TestDbOptions): Promise<BunSQLiteDatabase> {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite);
  if (opts.migrationsFolder) {
    const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
    migrate(db, { migrationsFolder: opts.migrationsFolder });
  }
  return db;
}
