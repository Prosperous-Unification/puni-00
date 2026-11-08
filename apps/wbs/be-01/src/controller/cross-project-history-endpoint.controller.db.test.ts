import { WorkItemRepository } from '@wbs/store-sqlite/work-item';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { closeFixture, harness, openFixture, readTables } from './cross-project-dependency-fixture';

afterEach(closeFixture);

for (const delivery of ['healthy', 'wrong-owner', 'wrong-identity'] as const)
  test(`mounted external redo revalidates ${delivery} endpoint delivery without consuming history`, async () => {
    const pushes: string[] = [];
    const fixture = await openFixture({ syntheticExternalCommands: true, pushes });
    const route = `/api/projects/${fixture.owner.projectId}`;
    await harness.register('grace');
    harness.member('org-a', 'grace', 'member');
    harness.sqlite.run(
      "UPDATE organization_membership SET role='member' WHERE organization_id='org-a' AND user_id=?",
      [fixture.principal.id],
    );
    harness.sqlite.run('UPDATE project SET owner_id=?,restricted=1 WHERE id=?', [
      harness.userId('grace'),
      fixture.predecessor.projectId,
    ]);
    expect(
      harness.sqlite
        .query('SELECT owner_id,restricted FROM project WHERE id=?')
        .get(fixture.predecessor.projectId),
    ).toEqual({ owner_id: harness.userId('grace'), restricted: 1 });
    expect(fixture.principal.id).not.toBe(harness.userId('grace'));
    expect(
      (
        await fixture.request(`${route}/commands`, {
          commands: [{ kind: 'createWorkItem', name: 'Unrelated local row' }],
        })
      ).status,
    ).toBe(200);
    const local = harness.sqlite
      .query<{ id: string }, [string]>(
        "SELECT id FROM work_item WHERE project_id=? AND name='Unrelated local row'",
      )
      .get(fixture.owner.projectId);
    if (local === null) throw new Error('fixture unrelated row missing');
    expect(
      (
        await fixture.request(`${route}/commands`, {
          commands: [
            { kind: 'patchWorkItem', workItemId: local.id, patch: { name: 'Replayed patch' } },
            { kind: 'addTypedDependency', ...fixture.input },
          ],
        })
      ).status,
    ).toBe(200);
    const readRelationship = () =>
      harness.sqlite
        .query(
          'SELECT id,organization_id,predecessor_project_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_project_id,successor_work_item_id,successor_scope,successor_step_id,type FROM external_dependency',
        )
        .get();
    const relationship = readRelationship();
    if (relationship === null) throw new Error('fixture replay relationship missing');
    const entry = harness.sqlite
      .query<{ id: string }, [string]>(
        'SELECT id FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
      )
      .get(fixture.owner.projectId);
    if (entry === null) throw new Error('fixture selected journal missing');
    expect((await fixture.request(`${route}/undo`)).status).toBe(200);
    expect(harness.sqlite.query('SELECT * FROM external_dependency').all()).toEqual([]);
    expect(harness.sqlite.query('SELECT name FROM work_item WHERE id=?').get(local.id)).toEqual({
      name: 'Unrelated local row',
    });
    const selected = harness.sqlite.query('SELECT * FROM command_journal WHERE id=?').get(entry.id);
    expect(selected).toMatchObject({ undone: 1 });
    const before = readTables();
    const sent = [...pushes];
    const descriptor = Object.getOwnPropertyDescriptor(WorkItemRepository.prototype, 'findById');
    if (descriptor === undefined) throw new Error('fixture production row reader missing');
    const findById = descriptor.value as WorkItemRepository['findById'];
    let delivered = 0;
    const endpoint = spyOn(WorkItemRepository.prototype, 'findById').mockImplementation(
      async function (this: WorkItemRepository, id) {
        const row = await findById.call(this, id);
        if (id !== fixture.predecessor.workItemId) return row;
        if (row === null) throw new Error('fixture genuine predecessor disappeared');
        delivered++;
        if (delivery === 'wrong-owner') return { ...row, projectId: fixture.owner.projectId };
        if (delivery === 'wrong-identity') return { ...row, id: fixture.owner.workItemId };
        return row;
      },
    );
    try {
      const response = await fixture.request(`${route}/redo`);
      expect(delivered).toBeGreaterThan(0);
      if (delivery === 'healthy') {
        expect(response.status).toBe(200);
        expect(readRelationship()).toEqual(relationship);
        expect(harness.sqlite.query('SELECT name FROM work_item WHERE id=?').get(local.id)).toEqual(
          {
            name: 'Replayed patch',
          },
        );
        expect(
          harness.sqlite.query('SELECT undone FROM command_journal WHERE id=?').get(entry.id),
        ).toEqual({ undone: 0 });
        expect(pushes.length).toBeGreaterThan(sent.length);
        return;
      }
      expect({
        status: response.status,
        relationship: readRelationship(),
        local: harness.sqlite.query('SELECT name FROM work_item WHERE id=?').get(local.id),
        journal: harness.sqlite
          .query('SELECT undone FROM command_journal WHERE id=?')
          .get(entry.id),
      }).toEqual({
        status: delivery === 'wrong-owner' ? 404 : 500,
        relationship: null,
        local: { name: 'Unrelated local row' },
        journal: { undone: 1 },
      });
      if (delivery === 'wrong-owner') expect(await response.json()).toEqual({ error: 'not_found' });
      else expect(await response.text()).toBe('Internal Server Error');
      expect(
        harness.sqlite.query('SELECT * FROM command_journal WHERE id=?').get(entry.id),
      ).toEqual(selected);
      expect(readTables()).toEqual(before);
      expect(pushes).toEqual(sent);
    } finally {
      endpoint.mockRestore();
    }
  });
