import { ConnectedDependencyGraphReader } from '@wbs/core/service/connected-dependency-graph';
import { CommandJournalRepository } from '@wbs/store-sqlite/command-journal';
import { afterEach, expect, spyOn, test } from 'bun:test';

import {
  closeFixture,
  harness,
  readIncidentRows,
  readTables,
  seedIncidents,
} from './cross-project-dependency-fixture';

afterEach(closeFixture);

test('synthetic mounted copy preserves incoming identities and replays without foreign owner writes', async () => {
  const fixture = await seedIncidents({ syntheticExternalCommands: true });
  const owner = fixture.owner.projectId;
  const route = `/api/projects/${owner}`;
  const original = await readIncidentRows(owner);
  const incoming = original.find((edge) => edge.id === 'incoming');
  if (incoming === undefined) throw new Error('mounted copy prerequisite missing');
  const readForeignHistory = () =>
    harness.sqlite
      .query('SELECT * FROM command_journal WHERE project_id!=? ORDER BY id')
      .all(owner);
  const readRevision = () => {
    const row = harness.sqlite
      .query<{ revision: number }, [string]>('SELECT revision FROM work_item WHERE id=?')
      .get(fixture.predecessor.workItemId);
    if (row === null) throw new Error('mounted copy predecessor missing');
    return row.revision;
  };
  const readForeignRelationships = () =>
    harness.sqlite
      .query('SELECT * FROM external_dependency WHERE successor_project_id!=? ORDER BY id')
      .all(owner);
  const readOwnerHistory = () =>
    harness.sqlite
      .query<{ id: string; undone: number }, [string]>(
        'SELECT id,undone FROM command_journal WHERE project_id=? ORDER BY seq',
      )
      .all(owner);
  const ownerHistory = readOwnerHistory();
  const foreignRelationships = readForeignRelationships();
  const foreignHistory = readForeignHistory();
  const revision = readRevision();
  const copied = await fixture.request(`${route}/commands`, {
    commands: [{ kind: 'duplicateWorkItem', workItemId: fixture.owner.workItemId }],
  });
  expect(copied.status).toBe(200);
  const body = (await copied.json()) as { results: { id: string }[] };
  const copiedId = body.results.at(0)?.id;
  if (copiedId === undefined) throw new Error('mounted copy response identity missing');
  const after = await readIncidentRows(owner);
  const retained = after.filter((edge) => edge.successor.workItemId === copiedId);
  expect(retained).toHaveLength(1);
  const relationship = retained.at(0);
  if (relationship === undefined) throw new Error('mounted copied prerequisite missing');
  expect(relationship).toEqual({
    ...incoming,
    id: relationship.id,
    successor: { ...incoming.successor, workItemId: copiedId },
  });
  expect(typeof relationship.id).toBe('string');
  expect(relationship.id).not.toBe(incoming.id);
  expect(after.filter((edge) => edge.successor.workItemId !== copiedId)).toEqual(original);
  expect(readRevision()).toBe(revision + 1);
  expect(readForeignHistory()).toEqual(foreignHistory);
  expect(readForeignRelationships()).toEqual(foreignRelationships);
  const copiedHistory = readOwnerHistory();
  expect(copiedHistory).toHaveLength(ownerHistory.length + 1);
  const journal = copiedHistory.at(-1);
  if (journal === undefined) throw new Error('mounted copy journal missing');
  expect(ownerHistory.some((entry) => entry.id === journal.id)).toBe(false);
  expect(copiedHistory).toEqual([...ownerHistory, { id: journal.id, undone: 0 }]);
  expect((await fixture.request(`${route}/undo`)).status).toBe(200);
  expect(await readIncidentRows(owner)).toEqual(original);
  expect(harness.sqlite.query('SELECT id FROM work_item WHERE id=?').get(copiedId)).toBeNull();
  expect(readRevision()).toBe(revision + 2);
  expect(readForeignHistory()).toEqual(foreignHistory);
  expect(readForeignRelationships()).toEqual(foreignRelationships);
  expect(readOwnerHistory()).toEqual([...ownerHistory, { id: journal.id, undone: 1 }]);
  expect((await fixture.request(`${route}/redo`)).status).toBe(200);
  expect(await readIncidentRows(owner)).toEqual(after);
  expect(harness.sqlite.query('SELECT id FROM work_item WHERE id=?').get(copiedId)).toEqual({
    id: copiedId,
  });
  expect(readRevision()).toBe(revision + 3);
  expect(readOwnerHistory()).toEqual(copiedHistory);
  expect(readForeignHistory()).toEqual(foreignHistory);
  expect(readForeignRelationships()).toEqual(foreignRelationships);
});

function copyBatch(fixture: Awaited<ReturnType<typeof seedIncidents>>) {
  return fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
    commands: [
      {
        kind: 'patchWorkItem',
        workItemId: fixture.owner.workItemId,
        patch: { notes: 'earlier batch write' },
      },
      { kind: 'duplicateWorkItem', workItemId: fixture.owner.workItemId },
    ],
  });
}

async function expectRecoveredCopy(
  fixture: Awaited<ReturnType<typeof seedIncidents>>,
  original: Awaited<ReturnType<typeof readIncidentRows>>,
  pushes: string[],
  sent: string[],
) {
  const response = await copyBatch(fixture);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { results: { id?: string }[] };
  const copiedId = body.results.at(-1)?.id;
  if (copiedId === undefined) throw new Error('recovered copy identity missing');
  const relationships = await readIncidentRows(fixture.owner.projectId);
  const retained = relationships.filter((edge) => edge.successor.workItemId === copiedId);
  const incoming = original.find((edge) => edge.id === 'incoming');
  const copied = retained.at(0);
  if (incoming === undefined || copied === undefined)
    throw new Error('recovered prerequisite missing');
  expect(retained).toHaveLength(1);
  expect(copied.id).not.toBe(incoming.id);
  expect(copied).toEqual({
    ...incoming,
    id: copied.id,
    successor: { ...incoming.successor, workItemId: copiedId },
  });
  expect(relationships.filter((edge) => edge.successor.workItemId !== copiedId)).toEqual(original);
  expect(pushes.length).toBeGreaterThan(sent.length);
}

// Proof: bypassing duplicate's structuralRefusal call answered 200 instead of 500
// for the injected connected graph read failure; watched 2026-10-23.
test('active mounted copy graph read failure rolls back earlier batch writes and publishes nothing', async () => {
  const pushes: string[] = [];
  const fixture = await seedIncidents({ syntheticExternalCommands: true, pushes });
  const owner = fixture.owner.projectId;
  const original = await readIncidentRows(owner);
  const before = readTables();
  const sent = [...pushes];
  const readDescriptor = Object.getOwnPropertyDescriptor(
    ConnectedDependencyGraphReader.prototype,
    'read',
  );
  if (readDescriptor === undefined) throw new Error('connected graph production reader missing');
  const read = readDescriptor.value as ConnectedDependencyGraphReader['read'];
  let failedReads = 0;
  const fault = spyOn(ConnectedDependencyGraphReader.prototype, 'read').mockImplementation(
    function (this: ConnectedDependencyGraphReader, projectIds, changes = []) {
      if (changes.some((change) => change.projectId === owner && change.rows !== undefined)) {
        failedReads++;
        throw new Error('mounted copy connected graph unreadable');
      }
      return read.call(this, projectIds, changes);
    },
  );
  try {
    const response = await copyBatch(fixture);
    expect(response.status).toBe(500);
    expect(failedReads).toBe(1);
    expect(readTables()).toEqual(before);
    expect(pushes).toEqual(sent);
    expect(await readIncidentRows(owner)).toEqual(original);
  } finally {
    fault.mockRestore();
  }
  await expectRecoveredCopy(fixture, original, pushes, sent);
});

// Proof: omitted exception rollback prevented the next source read from beginning;
// replacing rollback with COMMIT failed the all-table snapshot (2026-10-23).
test('active mounted copy late journal insert failure rolls back every table and publishes nothing', async () => {
  const pushes: string[] = [];
  const fixture = await seedIncidents({ syntheticExternalCommands: true, pushes });
  const owner = fixture.owner.projectId;
  const original = await readIncidentRows(owner);
  const before = readTables();
  const sent = [...pushes];
  const appendDescriptor = Object.getOwnPropertyDescriptor(
    CommandJournalRepository.prototype,
    'append',
  );
  if (appendDescriptor === undefined) throw new Error('production journal append missing');
  const append = appendDescriptor.value as CommandJournalRepository['append'];
  let journalFailure: unknown;
  const fault = spyOn(CommandJournalRepository.prototype, 'append').mockImplementation(
    async function (this: CommandJournalRepository, entry, event) {
      try {
        await append.call(this, entry, event);
      } catch (cause) {
        journalFailure = cause;
        throw cause;
      }
    },
  );
  harness.sqlite.run(`CREATE TRIGGER fail_copy_journal BEFORE INSERT ON command_journal BEGIN
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM work_item JOIN external_dependency ON successor_work_item_id=work_item.id
      WHERE work_item.project_id=NEW.project_id AND notes='earlier batch write' AND external_dependency.id!='incoming'
    ) THEN RAISE(ABORT, 'mounted copy late journal failure')
      ELSE RAISE(ABORT, 'copied prerequisite missing at journal insertion') END;
  END`);
  try {
    const response = await copyBatch(fixture);
    expect(response.status).toBe(500);
    expect(journalFailure).toMatchObject({
      cause: { message: 'mounted copy late journal failure' },
    });
    expect(readTables()).toEqual(before);
    expect(pushes).toEqual(sent);
    expect(await readIncidentRows(owner)).toEqual(original);
  } finally {
    fault.mockRestore();
  }
  harness.sqlite.run('DROP TRIGGER fail_copy_journal');
  await expectRecoveredCopy(fixture, original, pushes, sent);
});
