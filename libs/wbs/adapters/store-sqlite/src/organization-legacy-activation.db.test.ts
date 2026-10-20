import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Connection, openConnection, openDatabase } from './db';
import { DrizzleEventLogStore } from './event-log';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { beginOptimizationDrain, finishOptimizationDrain } from './optimization-drain';
import { activateLegacyOrganization } from './organization-legacy-activation';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;

let dir: string;
let connection: Connection;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-legacy-activation-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const raw = openDatabase(path);
  try {
    raw.run("INSERT INTO users (id, username, created_at) VALUES ('u1', 'dany', 1)");
    for (const id of ['p-live', 'p-gone'])
      raw.run(
        `INSERT INTO project (id, name, owner_id, created_at) VALUES ('${id}', '${id}', 'u1', 1)`,
      );
  } finally {
    raw.close();
  }
  connection = openConnection(path);
});

afterEach(() => {
  connection.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Events on both projects through the production log, then `p-gone` deleted by the drain. */
async function deleteProjectWithEvents(): Promise<void> {
  const events = new DrizzleEventLogStore(connection.db, OPEN);
  await events.recordEvent('project:p-live', { kind: 'renamed' }, 1);
  await events.recordEvent('project:p-gone', { kind: 'renamed' }, 1);
  beginOptimizationDrain(connection.db, 'p-gone', { at: 2, by: 'u1' });
  expect(finishOptimizationDrain(connection.db, 'p-gone')).toBe('finished');
}

function subscriptions(table: 'event_sequencer' | 'event_log'): unknown[] {
  return connection.db.all(`SELECT DISTINCT subscription FROM ${table} ORDER BY subscription`);
}

describe('activateLegacyOrganization over a deleted project', () => {
  it('refuses the stream project deletion leaves behind', async () => {
    await deleteProjectWithEvents();

    const outcome = await activateLegacyOrganization(connection.db, {
      name: 'default',
      superAdmin: 'dany',
      at: 5,
      isApplied: true,
      isPruningRetainedStreams: false,
    });

    expect(outcome).toEqual({
      ok: false,
      refused: {
        refusal: 'reconciliation_failed',
        unmappedRoots: [],
        catalogNameDrift: [],
        ownershipConflicts: [{ kind: 'event_stream', id: 'project:p-gone' }],
      },
    });
    expect(connection.db.all('SELECT * FROM organization')).toEqual([]);
  });

  it('prunes only streams whose project is gone, then activates', async () => {
    await deleteProjectWithEvents();

    const outcome = await activateLegacyOrganization(connection.db, {
      name: 'default',
      superAdmin: 'dany',
      at: 5,
      isApplied: true,
      isPruningRetainedStreams: true,
    });

    expect(outcome).toMatchObject({ ok: true, activation: { prunedStreams: ['project:p-gone'] } });
    expect(subscriptions('event_sequencer')).toEqual([{ subscription: 'project:p-live' }]);
    expect(subscriptions('event_log')).toEqual([{ subscription: 'project:p-live' }]);
  });
});
