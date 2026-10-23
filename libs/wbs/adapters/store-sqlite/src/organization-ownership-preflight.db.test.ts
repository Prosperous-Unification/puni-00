import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openConnection, openDatabase, openReadOnlyConnection } from './db';
import { runMigrations } from './migrate';
import { preflightOrganizationOwnership } from './organization-ownership-preflight';

const migrations = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let directory: string;
let path: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ownership-preflight-'));
  path = join(directory, 'plan.db');
  runMigrations(path, migrations);
  // Migrations seed external systems; keep these focused fixtures explicitly empty.
  const database = openDatabase(path);
  try {
    database.run('DELETE FROM external_system');
  } finally {
    database.close();
  }
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function write(...statements: string[]): void {
  const database = openDatabase(path);
  try {
    for (const statement of statements) database.run(statement);
  } finally {
    database.close();
  }
}

async function inspect() {
  const connection = openReadOnlyConnection(path);
  try {
    return await preflightOrganizationOwnership(connection.db);
  } finally {
    connection.close();
  }
}

const emptyReport = {
  marker: 'pre_activation' as const,
  unmappedRoots: [],
  catalogNameDrift: [],
  ownershipConflicts: [],
};

test('reports only marker and three empty finding arrays and permits connection reuse', async () => {
  const connection = openReadOnlyConnection(path);
  try {
    expect(await preflightOrganizationOwnership(connection.db)).toEqual(emptyReport);
    expect(await preflightOrganizationOwnership(connection.db)).toEqual(emptyReport);
  } finally {
    connection.close();
  }
});

test('reports all three findings together without dropping any probe', async () => {
  write(
    "INSERT INTO tag (id, name) VALUES ('unmapped', 'Before legacy')",
    "INSERT INTO organization (id, name, legacy, created_at) VALUES ('legacy', 'Legacy', 1, 1)",
    "INSERT INTO tag (id, name) VALUES ('drift', 'Original')",
    'DROP TRIGGER tag_organization_name_bridge',
    "UPDATE tag SET name = 'Changed' WHERE id = 'drift'",
    "INSERT INTO event_sequencer (subscription, next_seq) VALUES ('project:gone', 1)",
  );
  expect(await inspect()).toEqual({
    marker: 'pre_activation',
    unmappedRoots: [{ kind: 'tag', id: 'unmapped' }],
    catalogNameDrift: [{ kind: 'tag', id: 'drift' }],
    ownershipConflicts: [{ kind: 'event_stream', id: 'project:gone' }],
  });
});

test('reports activated state explicitly without a readiness verdict', async () => {
  write("UPDATE organization_activation SET state = 'activated', activated_at = 5");
  expect(await inspect()).toEqual({ ...emptyReport, marker: 'activated' });
});

for (const [state, statement] of [
  ['absent', 'DROP TABLE organization_activation'],
  ['unreadable', 'ALTER TABLE organization_activation RENAME COLUMN state TO lost_state'],
  ['malformed', 'DELETE FROM organization_activation'],
]) {
  test(`refuses ${state} marker rather than returning findings`, async () => {
    write('DROP TRIGGER organization_activation_no_delete', statement);
    const refusal = await inspect().catch((cause: unknown) => cause);
    expect(refusal).toBeInstanceOf(Error);
    expect(refusal instanceof Error ? refusal.message : undefined).toContain(`marker is ${state}`);
  });
}

test('pins marker and every finding across a competing commit and all probes', async () => {
  write(
    "INSERT INTO organization (id, name, legacy, created_at) VALUES ('legacy', 'Legacy', 1, 1)",
    "INSERT INTO tag (id, name) VALUES ('drift', 'Original')",
    'DROP TRIGGER tag_organization_name_bridge',
  );
  let committed = false;
  const connection = openConnection(path, {
    logQuery(query) {
      // The marker SELECT has finished when the first root query is issued.
      if (!committed && query.includes('project_organization')) {
        committed = true;
        // One competing transaction changes the marker and every probe's answer.
        // Activate before inserting so the bridge leaves the new root unmapped.
        write(
          'BEGIN IMMEDIATE',
          "UPDATE organization_activation SET state = 'activated', activated_at = 5",
          "INSERT INTO tag (id, name) VALUES ('later', 'Committed after marker')",
          "UPDATE tag SET name = 'Changed' WHERE id = 'drift'",
          "INSERT INTO event_sequencer (subscription, next_seq) VALUES ('project:gone', 1)",
          'COMMIT',
        );
      }
    },
  });
  try {
    expect(await preflightOrganizationOwnership(connection.db)).toEqual(emptyReport);
    expect(committed).toBe(true);
    expect(await preflightOrganizationOwnership(connection.db)).toEqual({
      marker: 'activated',
      unmappedRoots: [{ kind: 'tag', id: 'later' }],
      catalogNameDrift: [{ kind: 'tag', id: 'drift' }],
      ownershipConflicts: [{ kind: 'event_stream', id: 'project:gone' }],
    });
  } finally {
    connection.close();
  }
});

test('throws on unavailable query state and rolls back before reuse', async () => {
  const connection = openReadOnlyConnection(path);
  write('ALTER TABLE tag_organization RENAME TO hidden_tag_organization');
  try {
    const refusal = await preflightOrganizationOwnership(connection.db).catch(
      (cause: unknown) => cause,
    );
    expect(refusal).toBeInstanceOf(Error);
    write('ALTER TABLE hidden_tag_organization RENAME TO tag_organization');
    expect(await preflightOrganizationOwnership(connection.db)).toEqual(emptyReport);
    expect(connection.db.all(sql`SELECT state FROM organization_activation`)).toEqual([
      { state: 'pre_activation' },
    ]);
  } finally {
    connection.close();
  }
});
