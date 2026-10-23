import type { StoredTypedDependency } from '@wbs/core';
import { readCommand } from '@wbs/core/service/compensating';
import { DependencyGraphGuard } from '@wbs/core/service/dependency-graph';
import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { openDatabase } from '../repository/db';
import {
  closeFixture,
  harness,
  openFixture,
  readTables,
  setRequestAdmissionObserver,
} from './cross-project-dependency-fixture';

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

function deferSignal() {
  let resolve = (): void => {
    throw new Error('signal not initialized');
  };
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
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

// Proof: bypassing PlanCommands.walk's refusal consumer or ProjectRepository's
// classified==='refused' rejection independently made both queued directions
// return unsafe HTTP 200 after structural restriction (2026-10-23).
for (const direction of ['undo', 'redo'] as const)
  test(`mounted compound ${direction} refuses queued structural project edit revocation atomically`, async () => {
    const pushes: string[] = [];
    const fixture = await openFixture({ pushes });
    const route = `/api/projects/${fixture.owner.projectId}`;
    await harness.register('grace');
    harness.member('org-a', 'grace', 'member');
    harness.sqlite.run(
      "UPDATE organization_membership SET role='member' WHERE organization_id='org-a' AND user_id=?",
      [fixture.principal.id],
    );
    harness.sqlite.run('UPDATE project SET owner_id=? WHERE id IN (?,?)', [
      harness.userId('grace'),
      fixture.owner.projectId,
      fixture.successor.projectId,
    ]);
    harness.sqlite.run('UPDATE project SET restricted=1 WHERE id=?', [fixture.successor.projectId]);
    const policies = () =>
      harness.sqlite
        .query<{ id: string; owner_id: string; restricted: number }, [string, string]>(
          'SELECT id,owner_id,restricted FROM project WHERE id IN (?,?) ORDER BY id',
        )
        .all(fixture.owner.projectId, fixture.successor.projectId);
    expect(policies()).toEqual(
      [
        { id: fixture.owner.projectId, owner_id: harness.userId('grace'), restricted: 0 },
        { id: fixture.successor.projectId, owner_id: harness.userId('grace'), restricted: 1 },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
    const cookie = fixture.principal.organizationBinding?.cookie;
    if (cookie == null) throw new Error('organization binding missing');
    const readable = await harness.request(
      `/api/projects/${fixture.successor.projectId}/address-candidates`,
      {
        headers: {
          cookie: `__Host-wbs_organization=${encodeURIComponent(cookie)}`,
          authorization: `Bearer ${harness.token('ada')}`,
          'X-WBS-Expected-Organization': 'org-a',
        },
      },
    );
    expect(readable.status).toBe(200);
    expect(
      (
        await fixture.request(`${route}/commands`, {
          commands: [{ kind: 'createWorkItem', name: 'Replay peer' }],
        })
      ).status,
    ).toBe(200);
    const peer = harness.sqlite
      .query<{ id: string }, []>("SELECT id FROM work_item WHERE name='Replay peer'")
      .get();
    if (peer === null) throw new Error('replay peer missing');
    const node = (address: { projectId: string; workItemId: string }) => {
      const step = harness.sqlite
        .query<{ id: string }, [string]>(
          'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
        )
        .get(address.projectId);
      if (step === null) throw new Error('incident endpoint step missing');
      return { ...address, scope: 'node' as const, stepId: step.id };
    };
    await harness.publicWrites().uow.run(async (scope) => {
      await scope.stores.typedDependencies.add(
        {
          id: 'revoked-incoming',
          projectId: fixture.owner.projectId,
          type: 'SS',
          predecessor: node(fixture.predecessor),
          successor: node(fixture.owner),
        },
        { at: 10, by: fixture.principal.id },
      );
      await scope.stores.typedDependencies.add(
        {
          id: 'revoked-outgoing',
          projectId: fixture.successor.projectId,
          type: 'FF',
          predecessor: node(fixture.owner),
          successor: node(fixture.successor),
        },
        { at: 10, by: fixture.principal.id },
      );
      return { commit: true, value: undefined };
    });
    const compound = await fixture.request(`${route}/commands`, {
      commands: [
        { kind: 'createWorkItem', parentId: fixture.owner.workItemId, name: 'Revoked first child' },
        { kind: 'patchWorkItem', workItemId: peer.id, patch: { notes: 'Revoked compound patch' } },
      ],
    });
    expect(compound.status).toBe(200);
    const child = harness.sqlite
      .query<{ id: string }, []>("SELECT id FROM work_item WHERE name='Revoked first child'")
      .get();
    if (child === null) throw new Error('revoked first child missing');
    const readLinks = () =>
      harness.sqlite
        .query<
          { id: string; predecessor_work_item_id: string; successor_work_item_id: string },
          []
        >(
          'SELECT id,predecessor_work_item_id,successor_work_item_id FROM external_dependency ORDER BY id',
        )
        .all();
    expect(readLinks()).toEqual([
      {
        id: 'revoked-incoming',
        predecessor_work_item_id: fixture.predecessor.workItemId,
        successor_work_item_id: child.id,
      },
      {
        id: 'revoked-outgoing',
        predecessor_work_item_id: child.id,
        successor_work_item_id: fixture.successor.workItemId,
      },
    ]);
    const readSelected = () =>
      harness.sqlite
        .query<{ id: string; undone: number }, [string]>(
          'SELECT id,undone FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
        )
        .get(fixture.owner.projectId);
    const selected = readSelected();
    if (selected === null) throw new Error('compound journal missing');
    expect(selected.undone).toBe(0);
    expect((await fixture.request(`${route}/undo`)).status).toBe(200);
    expect(readSelected()).toEqual({ ...selected, undone: 1 });
    expect(readLinks()).toEqual([
      {
        id: 'revoked-incoming',
        predecessor_work_item_id: fixture.predecessor.workItemId,
        successor_work_item_id: fixture.owner.workItemId,
      },
      {
        id: 'revoked-outgoing',
        predecessor_work_item_id: fixture.owner.workItemId,
        successor_work_item_id: fixture.successor.workItemId,
      },
    ]);
    expect((await fixture.request(`${route}/redo`)).status).toBe(200);
    expect(readSelected()).toEqual(selected);
    expect(readLinks().find(({ id }) => id === 'revoked-outgoing')?.predecessor_work_item_id).toBe(
      child.id,
    );
    if (direction === 'redo') {
      expect((await fixture.request(`${route}/undo`)).status).toBe(200);
      expect(readSelected()).toEqual({ ...selected, undone: 1 });
    }
    const entered = deferSignal();
    const unblock = deferSignal();
    const held = harness.holdWriteTurn(unblock.promise, entered.resolve);
    await entered.promise;
    const resolved = deferSignal();
    const queued = deferSignal();
    const descriptor = Object.getOwnPropertyDescriptor(WriteCoordinator.prototype, 'enter');
    if (descriptor === undefined) throw new Error('write coordinator entry missing');
    const enter = descriptor.value as WriteCoordinator['enter'];
    const queue = spyOn(WriteCoordinator.prototype, 'enter').mockImplementation(function <T>(
      this: WriteCoordinator,
      work: () => Promise<T>,
    ): Promise<T> {
      const pending = enter.call(this, work) as Promise<T>;
      queued.resolve();
      return pending;
    });
    const graph = spyOn(DependencyGraphGuard.prototype, 'findCycle');
    const separate = openDatabase(harness.databasePath());
    setRequestAdmissionObserver(resolved.resolve);
    const pending = fixture.request(`${route}/${direction}`);
    try {
      await resolved.promise;
      await queued.promise;
      queue.mockRestore();
      separate.run('UPDATE project SET restricted=1 WHERE id=?', [fixture.owner.projectId]);
      expect(policies().every(({ owner_id }) => owner_id === harness.userId('grace'))).toBe(true);
      const before = readTables();
      const links = readLinks();
      const journal = readSelected();
      const sent = [...pushes];
      unblock.resolve();
      await held;
      const response = await pending;
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'forbidden' });
      expect(readTables()).toEqual(before);
      expect(readLinks()).toEqual(links);
      expect(readSelected()).toEqual(journal);
      expect(pushes).toEqual(sent);
      expect(graph).not.toHaveBeenCalled();
    } finally {
      setRequestAdmissionObserver(undefined);
      queue.mockRestore();
      unblock.resolve();
      await held;
      separate.close();
      graph.mockRestore();
    }
  }, 15_000);
