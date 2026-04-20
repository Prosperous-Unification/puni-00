import { makeTestDb } from '@wbs/validation/fixtures';
import type { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { ExampleRepository } from './example';

const CREATE_TABLE =
  'CREATE TABLE examples (id TEXT PRIMARY KEY, label TEXT NOT NULL, created_at INTEGER NOT NULL)';

describe('ExampleRepository', () => {
  it('inserts and reads back by id', async () => {
    const db = await makeTestDb({ migrationsFolder: null });
    const client = (db as unknown as { $client: Database }).$client;
    client.run(CREATE_TABLE);
    const repo = new ExampleRepository(db);
    await repo.create({ id: 'ex-1', label: 'hello', createdAt: 123 });
    const found = await repo.findById('ex-1');
    expect(found).toEqual({ id: 'ex-1', label: 'hello', createdAt: 123 });
    client.close();
  });

  it('returns null when the id is not present', async () => {
    const db = await makeTestDb({ migrationsFolder: null });
    const client = (db as unknown as { $client: Database }).$client;
    client.run(CREATE_TABLE);
    const repo = new ExampleRepository(db);
    expect(await repo.findById('nope')).toBeNull();
    client.close();
  });
});
