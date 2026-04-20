import { makeTestDb } from '@wbs/validation/fixtures';
import type { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { DrizzleEventLogRepo } from '../repository/event-log';
import { EventSequencer } from './event-sequencer';

const BOOT_SQL = `
  CREATE TABLE event_sequencer (subscription TEXT PRIMARY KEY, next_seq INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE event_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription TEXT NOT NULL,
    seq INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX event_log_sub_seq ON event_log(subscription, seq);
`;

async function bootstrap() {
  const db = await makeTestDb({ migrationsFolder: null });
  const client = (db as unknown as { $client: Database }).$client;
  client.run(BOOT_SQL);
  return { db, client };
}

describe('EventSequencer', () => {
  it('assigns monotonic seq numbers per subscription', async () => {
    const { db, client } = await bootstrap();
    const seq = new EventSequencer(new DrizzleEventLogRepo(db), () => 1_000);
    const a1 = await seq.recordEvent('doc:a', { v: 1 });
    const a2 = await seq.recordEvent('doc:a', { v: 2 });
    const b1 = await seq.recordEvent('doc:b', { v: 1 });
    expect(a1.seq).toBe(0);
    expect(a2.seq).toBe(1);
    expect(b1.seq).toBe(0);
    client.close();
  });

  it('persists the event in event_log with matching seq and payload', async () => {
    const { db, client } = await bootstrap();
    const seq = new EventSequencer(new DrizzleEventLogRepo(db), () => 5_000);
    await seq.recordEvent('doc:a', { hello: 'world' });
    const rows = client.query('SELECT * FROM event_log WHERE subscription = ?').all('doc:a') as {
      seq: number;
      message: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].seq).toBe(0);
    expect(JSON.parse(rows[0].message)).toEqual({ hello: 'world' });
    client.close();
  });
});
