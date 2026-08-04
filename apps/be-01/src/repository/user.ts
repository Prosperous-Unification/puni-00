import { eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { User, UserStore } from './index';
import { users } from './schema';

/**
 * SQLite reports a uniqueness violation as a message, not a typed error, so
 * `create` translates it into a `null` return the caller can branch on. The
 * alternative — checking for an existing row first — is a race: two
 * registrations of the same username both see it free.
 */
export class UserRepository implements UserStore {
  constructor(private readonly db: SQLiteBunDatabase) {}

  async create(user: User): Promise<User | null> {
    try {
      await this.db.insert(users).values(user);
      return user;
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('UNIQUE constraint failed: users.username')
      ) {
        return null;
      }
      throw err;
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  }
}
