import { createWorkingPlan } from '@wbs/core/module/plan-commands/working-plan.resource';
import { openSqliteSource } from '@wbs/store-sqlite';
import { StepParallelRepository } from '@wbs/store-sqlite/step-parallel';
import { activateTestStepBlockages } from '@wbs/store-sqlite/testing/step-blockage-activation';
import { describe, expect, it, spyOn } from 'bun:test';

import { BACKEND_DEPENDENCY_CAPABILITY } from '../runtime/dependency-support';
import { bindDevQaFixture } from '../testing/dev-qa-fixture';
import { OrganizationHarness } from '../testing/organization-harness';
import { readFixturePackage } from '../testing/space-rollup';

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
        h.member('org', 'owner', 'member', ['project-contributor']);
        h.grantPermissions('org', 'owner', ['organization.create_project']);
        h.member('org', 'viewer', 'viewer', ['org-viewer']);
        h.member('foreign', 'outsider', 'member', ['project-contributor']);
        h.grantPermissions('foreign', 'outsider', ['organization.create_project']);
        h.bind('owner', 'org');
        h.bind('viewer', 'org');
        h.bind('outsider', 'foreign');
        h.activate();
        const parent = await h.call('owner', 'POST', '/api/projects', { name: 'Sparse parent' });
        expect(parent.status).toBe(201);
        const projectId = (parent.body as { project: { id: string } }).project.id;
        const created = await h.call('owner', 'POST', '/api/work-packages', {
          name: 'Preserve sparse nodes',
          projectId,
        });
        expect(created.status).toBe(200);
        const workPackageId = (created.body as { workPackage: { id: string } }).workPackage.id;
        await h.publicWrites().uow.run(async ({ stores }) => {
          await bindDevQaFixture(stores.stepCatalogue, 'org', projectId, {
            at: 2,
            by: h.userId('owner'),
          });
          return { commit: true, value: undefined };
        });
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
        const borrowed = openSqliteSource({
          dependencyCapability: BACKEND_DEPENDENCY_CAPABILITY,
          dbPath: h.sqlite.filename,
        });
        try {
          await borrowed.uow.run(async (scope) => {
            const working = createWorkingPlan(scope, workPackageId);
            const sparse = working.stores.stepParallels;
            expect(await sparse.listByWorkPackage(workPackageId)).toHaveLength(steps.length);
            const owner = await scope.stores.workPackages.findById(workPackageId);
            if (owner === null) throw new Error('fixture work package is missing');
            const stamp = { at: 1, by: h.userId('owner') };
            await working.stores.workItems.listByWorkPackage(workPackageId);
            const beforeOwner = await working.stores.workItems.findById('parent');
            if (beforeOwner === null) throw new Error('borrowed parent is missing');
            await sparse.remove('parent', first.id, stamp);
            expect(await working.stores.workItems.listByWorkPackage(workPackageId)).toEqual(
              await scope.stores.workItems.listByWorkPackage(workPackageId),
            );
            expect((await working.stores.workItems.findById('parent'))?.revision).toBeGreaterThan(
              beforeOwner.revision,
            );
            expect(await sparse.listByWorkItems(workPackageId, ['parent'])).toHaveLength(
              steps.length - 1,
            );
            await sparse.set({ workItemId: 'parent', stepId: first.id, maxParallel: 1 }, stamp);
            expect(await sparse.listByWorkPackage(workPackageId)).toHaveLength(steps.length);
            expect(await working.stores.workItems.listByWorkPackage(workPackageId)).toEqual(
              await scope.stores.workItems.listByWorkPackage(workPackageId),
            );
            expect(() => sparse.listByWorkPackage('foreign')).toThrow('cannot read work package');
            const foreignWorking = createWorkingPlan(scope, 'foreign');
            expect(
              await rejectedMessage(
                foreignWorking.stores.stepParallels.set(
                  { workItemId: 'parent', stepId: first.id, maxParallel: 1 },
                  stamp,
                ),
              ),
            ).toContain('outside work package');
            expect(
              await rejectedMessage(
                foreignWorking.stores.stepParallels.remove('parent', first.id, stamp),
              ),
            ).toContain('outside work package');
            expect(await rejectedMessage(sparse.remove('missing', first.id, stamp))).toContain(
              'outside work package',
            );
            foreignWorking.close();
            working.close();
            expect(() => sparse.listByWorkPackage(workPackageId)).toThrow('closed');
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
        const child = { parentId: 'parent', afterId: null, name: 'Child' };
        const read = spyOn(StepParallelRepository.prototype, 'listByWorkItems').mockImplementation(
          () => {
            throw new Error('poisoned sparse read');
          },
        );
        try {
          const commands = { commands: [{ kind: 'createWorkItem', ...child }] };
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
          `/api/work-packages/${workPackageId}/commands`,
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
            await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/commands`, {
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
