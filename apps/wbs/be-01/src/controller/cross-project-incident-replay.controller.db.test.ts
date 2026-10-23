import type { StoredTypedDependency } from '@wbs/core';
import { readCommand } from '@wbs/core/service/compensating';
import { afterEach, expect, test } from 'bun:test';

import { closeFixture, harness, openFixture, readTables } from './cross-project-dependency-fixture';

afterEach(closeFixture);

interface IncidentRow {
  id: string;
  organization_id: string;
  type: string;
  predecessor_project_id: string;
  predecessor_work_item_id: string;
  predecessor_scope: string;
  predecessor_step_id: string | null;
  successor_project_id: string;
  successor_work_item_id: string;
  successor_scope: string;
  successor_step_id: string | null;
  created_at: number;
  created_by: string;
}

for (const corruptAudit of [false, true]) {
  test(`mounted compound first-child replay ${corruptAudit ? 'refuses changed creation audit after its inverse patch' : 'preserves restricted incident ownership and exact receipts through undo redo'}`, async () => {
    const pushes: string[] = [];
    const fixture = await openFixture({ pushes });
    const owner = fixture.owner.projectId;
    const route = `/api/projects/${owner}`;
    expect(
      (
        await fixture.request(`${route}/commands`, {
          commands: [{ kind: 'createWorkItem', name: 'Unrelated local row' }],
        })
      ).status,
    ).toBe(200);
    const peer = harness.sqlite
      .query<{ id: string }, []>("SELECT id FROM work_item WHERE name='Unrelated local row'")
      .get();
    if (peer === null) throw new Error('local peer missing');
    await harness.register('grace');
    harness.member('org-a', 'grace', 'member');
    harness.sqlite
      .query(
        "UPDATE organization_membership SET role='member' WHERE organization_id='org-a' AND user_id=?",
      )
      .run(fixture.principal.id);
    harness.sqlite
      .query('UPDATE project SET owner_id=?,restricted=1 WHERE id=?')
      .run(harness.userId('grace'), fixture.successor.projectId);
    const node = (address: { projectId: string; workItemId: string }) => {
      const step = harness.sqlite
        .query<{ id: string }, [string]>(
          'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
        )
        .get(address.projectId);
      if (step === null) throw new Error('endpoint step missing');
      return { ...address, scope: 'node' as const, stepId: step.id };
    };
    const links: StoredTypedDependency[] = [
      {
        id: 'mounted-incoming',
        projectId: owner,
        type: 'SS',
        predecessor: node(fixture.predecessor),
        successor: node(fixture.owner),
      },
      {
        id: 'mounted-outgoing',
        projectId: fixture.successor.projectId,
        type: 'FF',
        predecessor: node(fixture.owner),
        successor: node(fixture.successor),
      },
      {
        id: 'mounted-whole',
        projectId: fixture.successor.projectId,
        type: 'FS',
        predecessor: { ...fixture.owner, scope: 'whole' },
        successor: { ...fixture.successor, scope: 'whole' },
      },
    ];
    await harness.publicWrites().uow.run(async (scope) => {
      for (const relationship of links)
        await scope.stores.typedDependencies.add(relationship, {
          at: 10,
          by: fixture.principal.id,
        });
      return { commit: true, value: undefined };
    });
    const forbiddenBefore = readTables();
    const forbiddenPushes = [...pushes];
    expect(
      (
        await fixture.request(`/api/projects/${fixture.successor.projectId}/commands`, {
          commands: [
            {
              kind: 'patchWorkItem',
              workItemId: fixture.successor.workItemId,
              patch: { name: 'Forbidden' },
            },
          ],
        })
      ).status,
    ).toBe(403);
    expect(readTables()).toEqual(forbiddenBefore);
    expect(pushes).toEqual(forbiddenPushes);
    const readLinks = () =>
      harness.sqlite
        .query<IncidentRow, []>(
          'SELECT id,organization_id,type,predecessor_project_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_project_id,successor_work_item_id,successor_scope,successor_step_id,created_at,created_by FROM external_dependency ORDER BY id',
        )
        .all();
    const readRemoteJournal = () =>
      harness.sqlite
        .query('SELECT * FROM command_journal WHERE project_id!=? ORDER BY id')
        .all(owner);
    const readOwnerJournal = () =>
      harness.sqlite
        .query<{ id: string; undone: number; inverse: string }, [string]>(
          'SELECT id,undone,inverse FROM command_journal WHERE project_id=? ORDER BY seq',
        )
        .all(owner);
    const readWhole = () =>
      harness.sqlite.query("SELECT * FROM external_dependency WHERE id='mounted-whole'").get();
    const wholeBefore = readWhole();
    const original = readLinks();
    const remoteJournal = readRemoteJournal();
    const journalBefore = readOwnerJournal();
    expect(
      (
        await fixture.request(`${route}/commands`, {
          commands: [
            {
              kind: 'createWorkItem',
              parentId: fixture.owner.workItemId,
              name: 'Mounted first child',
            },
            { kind: 'patchWorkItem', workItemId: peer.id, patch: { notes: 'Compound patch' } },
          ],
        })
      ).status,
    ).toBe(200);
    const child = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE parent_id=?')
      .get(fixture.owner.workItemId);
    if (child === null) throw new Error('mounted first child missing');
    const mapped = original.map((relationship) => ({
      ...relationship,
      predecessor_work_item_id:
        relationship.id === 'mounted-outgoing' ? child.id : relationship.predecessor_work_item_id,
      successor_work_item_id:
        relationship.id === 'mounted-incoming' ? child.id : relationship.successor_work_item_id,
    }));
    expect(readLinks()).toEqual(mapped);
    expect(readWhole()).toEqual(wholeBefore);
    expect(readRemoteJournal()).toEqual(remoteJournal);
    const journal = readOwnerJournal();
    expect(journal).toHaveLength(journalBefore.length + 1);
    expect(journal.slice(0, -1)).toEqual(journalBefore);
    const selected = journal.at(-1);
    if (selected === undefined) throw new Error('compound journal missing');
    const inverse = readCommand(JSON.parse(selected.inverse) as unknown);
    expect(inverse.do).toBe('batch');
    if (inverse.do !== 'batch') throw new Error('compound inverse missing');
    // Undo must execute this unrelated patch before reaching the incident receipt guard.
    expect(inverse.steps.map((command) => command.do)).toEqual([
      'patch',
      'transition_incident_nodes',
    ]);
    const readPeer = () =>
      harness.sqlite
        .query('SELECT notes,revision,updated_at FROM work_item WHERE id=?')
        .get(peer.id);
    // Proof: removing only both createdAt receipt comparisons made this mounted undo
    // return unsafe HTTP 200 instead of HTTP 409, while other equality checks remained (2026-10-23).
    if (corruptAudit) {
      const revisions = harness.sqlite.query('SELECT id,revision FROM work_item ORDER BY id').all();
      harness.sqlite.run(
        "UPDATE external_dependency SET created_at=11 WHERE id='mounted-outgoing'",
      );
      expect(harness.sqlite.query('SELECT id,revision FROM work_item ORDER BY id').all()).toEqual(
        revisions,
      );
      const before = readTables();
      const peerBefore = readPeer();
      const pushesBefore = [...pushes];
      const response = await fixture.request(`${route}/undo`);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: 'stale_undo' });
      expect(readPeer()).toEqual(peerBefore);
      // Stale history intentionally discards only its selected journal after the replay transaction rolls back.
      expect(readTables()).toEqual(
        before.map((table) =>
          table.name !== 'command_journal'
            ? table
            : {
                ...table,
                rows: table.rows.filter(
                  (row) => (JSON.parse(row) as { id: string }).id !== selected.id,
                ),
              },
        ),
      );
      expect(pushes).toEqual(pushesBefore);
      return;
    }
    expect((await fixture.request(`${route}/undo`)).status).toBe(200);
    expect(readLinks()).toEqual(original);
    expect(readWhole()).toEqual(wholeBefore);
    expect(readOwnerJournal()).toHaveLength(journal.length);
    expect(readPeer()).toMatchObject({ notes: '' });
    expect(readOwnerJournal().at(-1)).toMatchObject({ id: selected.id, undone: 1 });
    expect(readRemoteJournal()).toEqual(remoteJournal);
    expect((await fixture.request(`${route}/redo`)).status).toBe(200);
    expect(readLinks()).toEqual(mapped);
    expect(readWhole()).toEqual(wholeBefore);
    expect(readPeer()).toMatchObject({ notes: 'Compound patch' });
    expect(readOwnerJournal()).toHaveLength(journal.length);
    expect(readOwnerJournal().at(-1)).toMatchObject({ id: selected.id, undone: 0 });
    expect(readRemoteJournal()).toEqual(remoteJournal);
  });
}
