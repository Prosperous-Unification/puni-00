import { StepParallelRepository } from '@wbs/store-sqlite/step-parallel';
import { activateTestStepBlockages } from '@wbs/store-sqlite/testing/step-blockage-activation';
import { describe, expect, it, spyOn } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
import { createFixturePackage, readFixturePackage } from '../testing/space-rollup';

for (const endpoint of ['single', 'batch']) {
  describe(`duplicate sparse preservation through ${endpoint} command`, () => {
    it('returns exact 409 nodes and rolls back every table touched by an earlier batch patch', async () => {
      const h = OrganizationHarness.openComposed();
      try {
        activateTestStepBlockages(h.sqlite.filename);
        await h.register('owner');
        await h.register('viewer');
        await h.register('outsider');
        h.organization('org');
        h.organization('foreign');
        h.member('org', 'owner', 'member', ['project-contributor', 'org-viewer']);
        h.grantPermissions('org', 'owner', ['organization.create_project']);
        h.member('org', 'viewer', 'viewer', ['org-viewer']);
        h.member('foreign', 'outsider', 'member', ['project-contributor', 'org-viewer']);
        h.grantPermissions('foreign', 'outsider', ['organization.create_project']);
        h.bind('owner', 'org');
        h.bind('viewer', 'org');
        h.bind('outsider', 'foreign');
        h.activate();
        const workPackageId = await createFixturePackage(h, 'owner', 'Preserve sparse nodes');
        const { steps } = await readFixturePackage(h, 'owner', workPackageId);
        const first = steps.at(0);
        if (first === undefined) throw new Error('work package has no fixture steps');
        h.sqlite.run(
          "INSERT INTO work_item (id,work_package_id,name,position,revision,readiness,hold) VALUES ('parent',?,'Parent',1,0,'ready','on_hold')",
          [workPackageId],
        );
        h.sqlite.run(
          'INSERT INTO estimate (work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,1,2,3)',
          ['parent', first.id],
        );
        h.sqlite.run('INSERT INTO step_blockage (work_item_id,step_id,blocked_at) VALUES (?,?,1)', [
          'parent',
          first.id,
        ]);
        for (const step of steps)
          h.sqlite.run(
            'INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES (?,?,1)',
            ['parent', step.id],
          );
        h.sqlite.run(
          "INSERT INTO work_item (id,work_package_id,name,position,revision) VALUES ('moving',?,'Moving',2,0),('unrelated',?,'Unrelated',3,0)",
          [workPackageId, workPackageId],
        );
        h.sqlite.run(
          'INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES (?,?,2)',
          ['unrelated', first.id],
        );
        const tables = [
          'work_item',
          'work_package',
          'step_parallel',
          'estimate',
          'actual',
          'step_progress',
          'step_measure',
          'step_node_attempt',
          'step_node_attempt_issued',
          'step_blockage',
          'assignment',
          'typed_dependency',
          'command_journal',
          'event_log',
          'event_sequencer',
          'plan_event',
        ];
        const snapshot = () =>
          tables.map((table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
        const before = snapshot();
        const duplication = { workItemId: 'parent' };
        const read = spyOn(StepParallelRepository.prototype, 'listByWorkItems').mockImplementation(
          () => {
            throw new Error('poisoned sparse read');
          },
        );
        try {
          const commands = { commands: [{ kind: 'duplicateWorkItem', ...duplication }] };
          expect(
            (
              await h.call(
                'viewer',
                'POST',
                `/api/work-packages/${workPackageId}/commands`,
                commands,
              )
            ).status,
          ).toBe(403);
          expect(
            (
              await h.call(
                'outsider',
                'POST',
                `/api/work-packages/${workPackageId}/commands`,
                commands,
              )
            ).status,
          ).toBe(404);
          expect(
            (await h.call('owner', 'POST', '/api/work-packages/missing/commands', commands)).status,
          ).toBe(404);
          expect(
            (
              await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/commands`, {
                commands: [{ kind: 'duplicateWorkItem', ...duplication, workItemId: 'missing' }],
              })
            ).status,
          ).toBe(404);
        } finally {
          read.mockRestore();
        }
        const answer = await h.call(
          'owner',
          'POST',
          `/api/work-packages/${workPackageId}/commands`,
          endpoint === 'batch'
            ? {
                commands: [
                  {
                    kind: 'patchWorkItem',
                    workItemId: 'moving',
                    patch: { name: 'Must roll back' },
                  },
                  { kind: 'duplicateWorkItem', ...duplication },
                ],
              }
            : { commands: [{ kind: 'duplicateWorkItem', ...duplication }] },
        );
        expect(answer).toEqual({
          status: 409,
          body: {
            error: 'referenced_by_step_parallel',
            at: endpoint === 'batch' ? 1 : 0,
            kind: 'duplicateWorkItem',
            nodes: steps.map(({ id }) => ({ workItemId: 'parent', stepId: id })),
          },
        });
        expect(snapshot()).toEqual(before);
        h.sqlite.run("DELETE FROM step_parallel WHERE work_item_id = 'parent'");
        expect(
          (
            await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/commands`, {
              commands: [{ kind: 'duplicateWorkItem', ...duplication }],
            })
          ).status,
        ).toBe(200);
        expect(
          (await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/undo`)).status,
        ).toBe(200);
        expect(
          (await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/redo`)).status,
        ).toBe(200);
        expect(h.sqlite.query('SELECT work_item_id FROM step_parallel').all()).toEqual([
          { work_item_id: 'unrelated' },
        ]);
      } finally {
        await h.closeComposed();
      }
    });
  });
}
