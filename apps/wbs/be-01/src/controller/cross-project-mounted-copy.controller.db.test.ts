import { afterEach, expect, test } from 'bun:test';

import {
  closeFixture,
  harness,
  readIncidentRows,
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
