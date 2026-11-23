import { StepParallelRepository } from '@wbs/store-sqlite/step-parallel';
import { activateTestStepBlockages } from '@wbs/store-sqlite/testing/step-blockage-activation';
import { WorkItemRepository } from '@wbs/store-sqlite/work-item';
import { describe, expect, it, spyOn } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
import { createFixturePackage, readFixturePackage } from '../testing/space-rollup';

for (const endpoint of ['single', 'batch']) {
  describe(`delete sparse preservation through ${endpoint} command`, () => {
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
        const deletion = { workItemId: 'parent', strategy: 'cascade' };
        const read = spyOn(StepParallelRepository.prototype, 'listByWorkItems').mockImplementation(
          () => {
            throw new Error('poisoned sparse read');
          },
        );
        try {
          const commands = { commands: [{ kind: 'deleteWorkItem', ...deletion }] };
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
                commands: [{ kind: 'deleteWorkItem', ...deletion, workItemId: 'missing' }],
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
                  { kind: 'deleteWorkItem', ...deletion },
                ],
              }
            : { commands: [{ kind: 'deleteWorkItem', ...deletion }] },
        );
        expect(answer).toEqual({
          status: 409,
          body: {
            error: 'referenced_by_step_parallel',
            at: endpoint === 'batch' ? 1 : 0,
            kind: 'deleteWorkItem',
            nodes: steps.map(({ id }) => ({ workItemId: 'parent', stepId: id })),
          },
        });
        expect(snapshot()).toEqual(before);
        h.sqlite.run("DELETE FROM step_parallel WHERE work_item_id = 'parent'");
        expect(
          (
            await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/commands`, {
              commands: [{ kind: 'deleteWorkItem', ...deletion }],
            })
          ).status,
        ).toBe(200);
      } finally {
        await h.closeComposed();
      }
    });
  });
}

for (const operation of ['redo-leaf', 'redo-cascade', 'undo-create', 'undo-duplicate'] as const) {
  for (const policy of ['owned', 'unrelated', 'empty', 'revision', 'throw', 'corrupt'] as const) {
    it(`${operation} ${policy} sparse policy preserves replay atomicity and history policy`, async () => {
      const h = OrganizationHarness.openComposed();
      try {
        activateTestStepBlockages(h.sqlite.filename);
        await h.register('owner');
        h.organization('org');
        h.member('org', 'owner', 'member', ['project-contributor', 'org-viewer']);
        h.grantPermissions('org', 'owner', ['organization.create_project']);
        h.bind('owner', 'org');
        h.activate();
        const workPackageId = await createFixturePackage(h, 'owner', 'Delete replay');
        const step = (await readFixturePackage(h, 'owner', workPackageId)).steps.at(0);
        if (step === undefined) throw new Error('fixture step absent');
        for (const id of ['root', 'unrelated'])
          h.sqlite.run(
            'INSERT INTO work_item (id,work_package_id,name,position,revision) VALUES (?,?,?,1,0)',
            [id, workPackageId, id],
          );
        if (operation === 'redo-cascade')
          h.sqlite.run(
            "INSERT INTO work_item (id,work_package_id,name,parent_id,position,revision) VALUES ('child',?,'Child','root',1,0)",
            [workPackageId],
          );
        const edit =
          operation === 'undo-create'
            ? { kind: 'createWorkItem', parentId: null, afterId: null, name: 'Authored' }
            : operation === 'undo-duplicate'
              ? { kind: 'duplicateWorkItem', workItemId: 'root' }
              : { kind: 'deleteWorkItem', workItemId: 'root', strategy: 'cascade' };
        const patch = {
          kind: 'patchWorkItem',
          workItemId: 'unrelated',
          patch: { name: 'Edited in batch' },
        };
        const replay = operation.startsWith('redo') ? 'redo' : 'undo';
        expect(
          (
            await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/commands`, {
              commands: replay === 'undo' ? [edit, patch] : [patch, edit],
            })
          ).status,
        ).toBe(200);
        if (replay === 'redo')
          expect(
            (await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/undo`)).status,
          ).toBe(200);
        const authored =
          operation === 'undo-create' || operation === 'undo-duplicate'
            ? (h.sqlite
                .query('SELECT id FROM work_item WHERE work_package_id = ? AND name = ?')
                .get(workPackageId, operation === 'undo-create' ? 'Authored' : 'root (copy)') as {
                id: string;
              } | null)
            : { id: operation === 'redo-cascade' ? 'child' : 'root' };
        if (authored === null) throw new Error('authored replay owner absent');
        const owner = policy === 'unrelated' ? 'unrelated' : authored.id;
        const beforeRevision = h.sqlite
          .query('SELECT revision FROM work_item WHERE id = ?')
          .get(owner);
        // Raw SQL adds retained policy without a revision change so applyDelete must independently refuse.
        if (policy !== 'empty' && policy !== 'revision')
          h.sqlite.run(
            'INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES (?,?,1)',
            [owner, step.id],
          );
        expect(h.sqlite.query('SELECT revision FROM work_item WHERE id = ?').get(owner)).toEqual(
          beforeRevision,
        );
        if (policy === 'revision')
          h.sqlite.run('UPDATE work_item SET revision = revision + 1 WHERE id = ?', [authored.id]);
        if (policy === 'corrupt') {
          h.sqlite.run('PRAGMA ignore_check_constraints = ON');
          try {
            h.sqlite.run('UPDATE step_parallel SET max_parallel = 1001 WHERE work_item_id = ?', [
              owner,
            ]);
          } finally {
            h.sqlite.run('PRAGMA ignore_check_constraints = OFF');
          }
        }
        const tables = [
          'work_item',
          'work_package',
          'step_parallel',
          'estimate',
          'actual',
          'step_progress',
          'step_measure',
          'step_blockage',
          'step_node_attempt',
          'step_node_attempt_issued',
          'assignment',
          'typed_dependency',
          'event_log',
          'event_sequencer',
          'plan_event',
        ];
        const snapshot = () =>
          tables.map((table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
        const before = snapshot();
        const journalBefore = h.sqlite
          .query('SELECT * FROM command_journal WHERE work_package_id = ?')
          .all(workPackageId);
        expect(journalBefore).toHaveLength(1);
        const appliedNames: string[] = [];
        // Preserve real repository writes while observing that the first replay patch ran before refusal.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const applyPatch = WorkItemRepository.prototype.patch;
        const patchRead = spyOn(WorkItemRepository.prototype, 'patch').mockImplementation(
          async function (
            this: WorkItemRepository,
            ...parameters: Parameters<WorkItemRepository['patch']>
          ) {
            const written = await applyPatch.apply(this, parameters);
            if (written.ok) appliedNames.push(written.workItem.name);
            return written;
          },
        );
        const sparseRead =
          policy === 'throw'
            ? spyOn(StepParallelRepository.prototype, 'listByWorkItems').mockImplementation(() => {
                throw new Error('delete replay sparse reader unavailable');
              })
            : undefined;
        let answer: Awaited<ReturnType<typeof h.call>>;
        try {
          answer = await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/${replay}`);
        } finally {
          patchRead.mockRestore();
          sparseRead?.mockRestore();
        }
        expect(appliedNames).toEqual(
          policy === 'revision' ? [] : [replay === 'undo' ? 'unrelated' : 'Edited in batch'],
        );
        if (policy === 'empty' || policy === 'unrelated') {
          expect(answer.status).toBe(200);
          expect(
            h.sqlite.query('SELECT id FROM work_item WHERE id = ?').get(authored.id),
          ).toBeNull();
          expect(
            h.sqlite.query('SELECT work_item_id,step_id,max_parallel FROM step_parallel').all(),
          ).toEqual(
            policy === 'empty'
              ? []
              : [{ work_item_id: 'unrelated', step_id: step.id, max_parallel: 1 }],
          );
        } else if (policy === 'throw' || policy === 'corrupt') {
          expect(answer.status).toBe(500);
          expect(snapshot()).toEqual(before);
          expect(
            h.sqlite
              .query('SELECT * FROM command_journal WHERE work_package_id = ?')
              .all(workPackageId),
          ).toEqual(journalBefore);
        } else {
          expect(answer).toMatchObject({ status: 409, body: { error: 'stale_undo' } });
          expect(snapshot()).toEqual(before);
          expect(
            h.sqlite
              .query('SELECT * FROM command_journal WHERE work_package_id = ?')
              .all(workPackageId),
          ).toHaveLength(0);
          expect(
            (await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/${replay}`)).status,
          ).toBe(409);
        }
      } finally {
        await h.closeComposed();
      }
    });
  }
}

it('promote delete and redo retain surviving child sparse policy', async () => {
  const h = OrganizationHarness.openComposed();
  try {
    activateTestStepBlockages(h.sqlite.filename);
    await h.register('owner');
    h.organization('org');
    h.member('org', 'owner', 'member', ['project-contributor', 'org-viewer']);
    h.grantPermissions('org', 'owner', ['organization.create_project']);
    h.bind('owner', 'org');
    h.activate();
    const workPackageId = await createFixturePackage(h, 'owner', 'Promote policy');
    const step = (await readFixturePackage(h, 'owner', workPackageId)).steps.at(0);
    if (step === undefined) throw new Error('fixture step absent');
    h.sqlite.run(
      "INSERT INTO work_item (id,work_package_id,name,parent_id,position,revision) VALUES ('root',?,'Root',NULL,1,0),('child',?,'Child','root',1,0),('unrelated',?,'Unrelated',NULL,2,0)",
      [workPackageId, workPackageId, workPackageId],
    );
    for (const owner of ['child', 'unrelated'])
      h.sqlite.run('INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES (?,?,1)', [
        owner,
        step.id,
      ]);
    const policy = h.sqlite
      .query('SELECT * FROM step_parallel ORDER BY work_item_id,step_id')
      .all();
    expect(
      (
        await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/commands`, {
          commands: [{ kind: 'deleteWorkItem', workItemId: 'root', strategy: 'promote' }],
        })
      ).status,
    ).toBe(200);
    expect(h.sqlite.query("SELECT parent_id FROM work_item WHERE id = 'child'").get()).toEqual({
      parent_id: null,
    });
    expect(
      h.sqlite.query('SELECT * FROM step_parallel ORDER BY work_item_id,step_id').all(),
    ).toEqual(policy);
    expect((await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/undo`)).status).toBe(
      200,
    );
    expect((await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/redo`)).status).toBe(
      200,
    );
    expect(
      h.sqlite.query('SELECT * FROM step_parallel ORDER BY work_item_id,step_id').all(),
    ).toEqual(policy);
  } finally {
    await h.closeComposed();
  }
});
