import { eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

import type { Example, ExampleRepo } from './index';
import { examples } from './schema';

export class ExampleRepository implements ExampleRepo {
  constructor(private readonly db: BunSQLiteDatabase) {}

  async create(ex: Example): Promise<void> {
    await this.db.insert(examples).values(ex);
  }

  async findById(id: string): Promise<Example | null> {
    const rows = await this.db.select().from(examples).where(eq(examples.id, id)).limit(1);
    return rows[0] ?? null;
  }
}
