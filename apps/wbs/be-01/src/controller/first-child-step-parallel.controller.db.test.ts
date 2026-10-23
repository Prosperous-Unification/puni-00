import { createWorkingPlan } from '@wbs/core/module/plan-commands/working-plan.resource';
import { openSqliteSource } from '@wbs/store-sqlite';
import { StepParallelRepository } from '@wbs/store-sqlite/step-parallel';
import { activateTestStepBlockages } from '@wbs/store-sqlite/testing/step-blockage-activation';
import { describe, expect, it, spyOn } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/** Awaits real rejected calls without relying on Bun's void-typed rejection matcher. */
async function rejectedMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (cause) {
    if (cause instanceof Error) return cause.message;
    throw cause;
  }
  throw new Error('expected the production call to reject');
}

for (const endpoint of ['single', 'batch']) {
  describe(`first-child sparse preservation through ${endpoint} command`, () => {
    it('returns exact 409 nodes and rolls back every table touched by an earlier batch patch', async () => {
      const h = OrganizationHarness.openComposed();
      try {
        activateTestStepBlockages(h.sqlite.filename);
        await h.register('owner');
        await h.register('viewer');
        await h.register('outsider');
        h.organization('org');
        h.organization('foreign');
        h.member('org', 'owner', 'member');
        h.member('org', 'viewer', 'viewer');
        h.member('foreign', 'outsider', 'member');
        h.bind('owner', 'org');
        h.bind('viewer', 'org');
        h.bind('outsider', 'foreign');
        h.activate();
        const created = await h.call('owner', 'POST', '/api/projects', {
          name: 'Preserve sparse nodes',
        });
        expect(created.status).toBe(200);
        const projectId = (created.body as { project: { id: string } }).project.id;
        const steps = h.sqlite
          .query('SELECT id FROM step WHERE project_id = ? ORDER BY position,id')
          .all(projectId) as { id: string }[];
        const first = steps.at(0);
        if (first === undefined) throw new Error('project has no fixture steps');
        h.sqlite.run(
          "INSERT INTO work_item (id,project_id,name,position,revision,readiness,hold) VALUES ('parent',?,'Parent',1,0,'ready','on_hold')",
          [projectId],
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
        const borrowed = openSqliteSource({ dbPath: h.sqlite.filename });
        try {
          await borrowed.uow.run(async (scope) => {
            const working = createWorkingPlan(scope, projectId);
            const sparse = working.stores.stepParallels;
            expect(await sparse.listByProject(projectId)).toHaveLength(steps.length);
            const owner = await scope.stores.projects.findById(projectId);
            if (owner === null) throw new Error('fixture project is missing');
            const stamp = { at: 1, by: owner.ownerId };
            await working.stores.workItems.listByProject(projectId);
            const beforeOwner = await working.stores.workItems.findById('parent');
            if (beforeOwner === null) throw new Error('borrowed parent is missing');
            await sparse.remove('parent', first.id, stamp);
            expect(await working.stores.workItems.listByProject(projectId)).toEqual(
              await scope.stores.workItems.listByProject(projectId),
            );
            expect((await working.stores.workItems.findById('parent'))?.revision).toBeGreaterThan(
              beforeOwner.revision,
            );
            expect(await sparse.listByWorkItems(projectId, ['parent'])).toHaveLength(
              steps.length - 1,
            );
            await sparse.set({ workItemId: 'parent', stepId: first.id, maxParallel: 1 }, stamp);
            expect(await sparse.listByProject(projectId)).toHaveLength(steps.length);
            expect(await working.stores.workItems.listByProject(projectId)).toEqual(
              await scope.stores.workItems.listByProject(projectId),
            );
            expect(() => sparse.listByProject('foreign')).toThrow('cannot read project');
            const foreignWorking = createWorkingPlan(scope, 'foreign');
            expect(
              await rejectedMessage(
                foreignWorking.stores.stepParallels.set(
                  { workItemId: 'parent', stepId: first.id, maxParallel: 1 },
                  stamp,
                ),
              ),
            ).toContain('outside project');
            expect(
              await rejectedMessage(
                foreignWorking.stores.stepParallels.remove('parent', first.id, stamp),
              ),
            ).toContain('outside project');
            expect(await rejectedMessage(sparse.remove('missing', first.id, stamp))).toContain(
              'outside project',
            );
            foreignWorking.close();
            working.close();
            expect(() => sparse.listByProject(projectId)).toThrow('closed');
            expect(
              await rejectedMessage(
                sparse.set({ workItemId: 'parent', stepId: first.id, maxParallel: 1 }, stamp),
              ),
            ).toContain('closed');
            expect(await rejectedMessage(sparse.remove('parent', first.id, stamp))).toContain(
              'closed',
            );
            return { commit: false, value: undefined };
          });
        } finally {
          await borrowed.close();
        }
        const tables = [
          'work_item',
          'project',
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
        const child = { parentId: 'parent', afterId: null, name: 'Child' };
        const read = spyOn(StepParallelRepository.prototype, 'listByWorkItems').mockImplementation(
          () => {
            throw new Error('poisoned sparse read');
          },
        );
        try {
          const commands = { commands: [{ kind: 'createWorkItem', ...child }] };
          expect(
            (await h.call('viewer', 'POST', `/api/projects/${projectId}/commands`, commands))
              .status,
          ).toBe(403);
          expect(
            (await h.call('outsider', 'POST', `/api/projects/${projectId}/commands`, commands))
              .status,
          ).toBe(404);
          expect(
            (await h.call('owner', 'POST', '/api/projects/missing/commands', commands)).status,
          ).toBe(404);
          expect(
            (
              await h.call('owner', 'POST', `/api/projects/${projectId}/commands`, {
                commands: [{ kind: 'createWorkItem', ...child, parentId: 'missing' }],
              })
            ).status,
          ).toBe(404);
        } finally {
          read.mockRestore();
        }
        const answer = await h.call(
          'owner',
          'POST',
          `/api/projects/${projectId}/commands`,
          endpoint === 'batch'
            ? {
                commands: [
                  {
                    kind: 'patchWorkItem',
                    workItemId: 'parent',
                    patch: { name: 'Must roll back' },
                  },
                  { kind: 'createWorkItem', ...child },
                ],
              }
            : { commands: [{ kind: 'createWorkItem', ...child }] },
        );
        expect(answer).toEqual({
          status: 409,
          body: {
            error: 'referenced_by_step_parallel',
            at: endpoint === 'batch' ? 1 : 0,
            kind: 'createWorkItem',
            nodes: steps.map(({ id }) => ({ workItemId: 'parent', stepId: id })),
          },
        });
        expect(snapshot()).toEqual(before);
        h.sqlite.run('DELETE FROM step_parallel');
        expect(
          (
            await h.call('owner', 'POST', `/api/projects/${projectId}/commands`, {
              commands: [{ kind: 'createWorkItem', ...child }],
            })
          ).status,
        ).toBe(200);
      } finally {
        await h.closeComposed();
      }
    });
  });
}
