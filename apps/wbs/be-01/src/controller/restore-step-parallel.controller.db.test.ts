import { StepBlockageRepository } from '@wbs/store-sqlite/step-blockage';
import { StepParallelRepository } from '@wbs/store-sqlite/step-parallel';
import { activateTestStepBlockages } from '@wbs/store-sqlite/testing/step-blockage-activation';
import { WorkItemRepository } from '@wbs/store-sqlite/work-item';
import { expect, it, spyOn } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
import { createFixturePackage, readFixturePackage } from '../testing/space-rollup';

for (const operation of ['redo-create', 'undo-delete'] as const) {
  for (const policy of [
    'destination',
    'unrelated',
    'empty',
    'revision',
    'throw',
    'corrupt',
    'parent',
    'root',
    'shape',
    'blockage',
    'captured-blockage',
  ] as const) {
    if (operation === 'redo-create' && (policy === 'blockage' || policy === 'captured-blockage'))
      continue;
    it(`${operation} ${policy} sparse policy preserves replay atomicity and history policy`, async () => {
      const h = OrganizationHarness.openComposed();
      try {
        activateTestStepBlockages(h.sqlite.filename);
        await h.register('owner');
        await h.register('viewer');
        h.organization('org');
        h.member('org', 'owner', 'member', ['project-contributor', 'org-viewer']);
        h.grantPermissions('org', 'owner', ['organization.create_project']);
        h.member('org', 'viewer', 'viewer', ['org-viewer']);
        h.bind('owner', 'org');
        h.bind('viewer', 'org');
        h.activate();
        const workPackageId = await createFixturePackage(h, 'owner', 'Restore replay');
        const step = (await readFixturePackage(h, 'owner', workPackageId)).steps.at(0);
        if (step === undefined) throw new Error('fixture step absent');
        for (const id of ['root', 'unrelated'])
          h.sqlite.run(
            'INSERT INTO work_item (id,work_package_id,name,position,revision) VALUES (?,?,?,1,0)',
            [id, workPackageId, id],
          );
        const parentId = policy === 'root' ? null : 'root';
        if (operation === 'undo-delete')
          h.sqlite.run(
            "INSERT INTO work_item (id,work_package_id,name,parent_id,position,revision) VALUES ('child',?,'Authored',?,1,0)",
            [workPackageId, parentId],
          );
        if (policy === 'captured-blockage')
          h.sqlite.run(
            'INSERT INTO step_blockage (work_item_id,step_id,blocked_at) VALUES (?,?,17)',
            ['child', step.id],
          );
        // A first child records a transition_first_child command. A sibling makes
        // this edit record the ordinary subtree restoration exercised by these cases.
        const needsSibling = operation === 'redo-create' && parentId !== null;
        if (needsSibling)
          h.sqlite.run(
            "INSERT INTO work_item (id,work_package_id,name,parent_id,position,revision) VALUES ('existing-sibling',?,'Existing sibling','root',10,0)",
            [workPackageId],
          );
        const edit =
          operation === 'redo-create'
            ? { kind: 'createWorkItem', parentId, afterId: null, name: 'Authored' }
            : { kind: 'deleteWorkItem', workItemId: 'child', strategy: 'cascade' };
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
        if (needsSibling) h.sqlite.run("DELETE FROM work_item WHERE id='existing-sibling'");
        // The restored row is absent; its destination survives without revision drift.
        const owner = policy === 'unrelated' || policy === 'root' ? 'unrelated' : 'root';
        const beforeRevision = h.sqlite
          .query('SELECT revision FROM work_item WHERE id = ?')
          .get(owner);
        // Raw SQL adds retained policy without a revision change so applyRestore must independently refuse.
        if (policy !== 'empty' && policy !== 'revision')
          h.sqlite.run(
            'INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES (?,?,1)',
            [owner, step.id],
          );
        expect(h.sqlite.query('SELECT revision FROM work_item WHERE id = ?').get(owner)).toEqual(
          beforeRevision,
        );
        if (policy === 'revision')
          h.sqlite.run('UPDATE work_item SET revision = revision + 1 WHERE id = ?', ['unrelated']);
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
        if (policy === 'parent')
          h.sqlite.run(
            "INSERT INTO work_item (id,work_package_id,name,parent_id,position,revision) VALUES ('sibling',?,'Sibling','root',2,0)",
            [workPackageId],
          );
        if (policy === 'shape')
          h.sqlite.run(
            "INSERT INTO typed_dependency (id,work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,type) VALUES ('pinned',?,'root','node',?,'unrelated','whole','FS')",
            [workPackageId, step.id],
          );
        if (policy === 'blockage')
          h.sqlite.run(
            'INSERT INTO step_blockage (work_item_id,step_id,blocked_at) VALUES (?,?,1)',
            ['root', step.id],
          );
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
        const removedBlockages: string[] = [];
        // Preserve real removal so a late guard cannot hide a rolled-back clear.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const removeBlockage = StepBlockageRepository.prototype.remove;
        const blockageWrite = spyOn(StepBlockageRepository.prototype, 'remove').mockImplementation(
          async function (
            this: StepBlockageRepository,
            ...parameters: Parameters<StepBlockageRepository['remove']>
          ) {
            await removeBlockage.apply(this, parameters);
            removedBlockages.push(parameters[0]);
          },
        );
        const sparseRead =
          policy === 'throw' ||
          policy === 'root' ||
          policy === 'shape' ||
          policy === 'blockage' ||
          policy === 'revision'
            ? spyOn(StepParallelRepository.prototype, 'listByWorkItems').mockImplementation(() => {
                throw new Error('restore replay sparse reader unavailable');
              })
            : undefined;
        let answer: Awaited<ReturnType<typeof h.call>>;
        try {
          if (policy === 'throw') {
            expect(
              (await h.call('viewer', 'POST', `/api/work-packages/${workPackageId}/${replay}`))
                .status,
            ).toBe(403);
            expect(
              h.sqlite
                .query('SELECT * FROM command_journal WHERE work_package_id = ?')
                .all(workPackageId),
            ).toEqual(journalBefore);
          }
          answer = await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/${replay}`);
        } finally {
          patchRead.mockRestore();
          blockageWrite.mockRestore();
          sparseRead?.mockRestore();
        }
        if (policy === 'captured-blockage') expect(removedBlockages).toEqual([]);
        expect(appliedNames).toEqual(
          policy === 'revision' ? [] : [replay === 'undo' ? 'unrelated' : 'Edited in batch'],
        );
        if (policy === 'empty' || policy === 'unrelated' || policy === 'root') {
          expect(answer.status).toBe(200);
          expect(
            h.sqlite.query('SELECT parent_id FROM work_item WHERE name = ?').get('Authored'),
          ).toEqual({ parent_id: parentId });
          expect(
            h.sqlite.query('SELECT work_item_id,step_id,max_parallel FROM step_parallel').all(),
          ).toEqual(
            policy === 'empty'
              ? []
              : [{ work_item_id: 'unrelated', step_id: step.id, max_parallel: 1 }],
          );
        } else if (policy === 'throw' || policy === 'corrupt' || policy === 'parent') {
          expect(answer.status).toBe(500);
          expect(snapshot()).toEqual(before);
          expect(
            h.sqlite
              .query('SELECT * FROM command_journal WHERE work_package_id = ?')
              .all(workPackageId),
          ).toEqual(journalBefore);
        } else {
          expect(answer).toMatchObject({ status: 409, body: { error: 'stale_undo' } });
          if (policy === 'shape')
            expect(answer.body).toMatchObject({
              detail: 'relationship pinned no longer fits this tree.',
            });
          if (policy === 'blockage')
            expect(answer.body).toMatchObject({
              detail: 'the deletion parent blockage changed since this command.',
            });
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

it('redo-duplicate restores its historical snapshot without rereading newly authored source policy', async () => {
  const h = OrganizationHarness.openComposed();
  try {
    activateTestStepBlockages(h.sqlite.filename);
    await h.register('owner');
    h.organization('org');
    h.member('org', 'owner', 'member', ['project-contributor', 'org-viewer']);
    h.grantPermissions('org', 'owner', ['organization.create_project']);
    h.bind('owner', 'org');
    h.activate();
    const workPackageId = await createFixturePackage(h, 'owner', 'Duplicate history');
    const step = (await readFixturePackage(h, 'owner', workPackageId)).steps.at(0);
    if (step === undefined) throw new Error('fixture step absent');
    h.sqlite.run(
      "INSERT INTO work_item (id,work_package_id,name,position,revision) VALUES ('source',?,'Original',1,0)",
      [workPackageId],
    );
    expect(
      (
        await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/commands`, {
          commands: [{ kind: 'duplicateWorkItem', workItemId: 'source' }],
        })
      ).status,
    ).toBe(200);
    const copy = h.sqlite
      .query("SELECT id FROM work_item WHERE name = 'Original (copy)'")
      .get() as { id: string } | null;
    if (copy === null) throw new Error('historical duplicate absent');
    expect((await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/undo`)).status).toBe(
      200,
    );
    const beforeRevision = h.sqlite
      .query("SELECT revision FROM work_item WHERE id = 'source'")
      .get();
    h.sqlite.run('INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES (?,?,1)', [
      'source',
      step.id,
    ]);
    expect(h.sqlite.query("SELECT revision FROM work_item WHERE id = 'source'").get()).toEqual(
      beforeRevision,
    );
    const sparseRead = spyOn(
      StepParallelRepository.prototype,
      'listByWorkItems',
    ).mockImplementation(() => {
      throw new Error('historical duplicate must not reread its original source');
    });
    let answer: Awaited<ReturnType<typeof h.call>>;
    try {
      answer = await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/redo`);
    } finally {
      sparseRead.mockRestore();
    }
    expect(answer.status).toBe(200);
    expect(h.sqlite.query('SELECT id,parent_id FROM work_item WHERE id = ?').get(copy.id)).toEqual({
      id: copy.id,
      parent_id: null,
    });
    expect(
      h.sqlite.query('SELECT work_item_id,step_id,max_parallel FROM step_parallel').all(),
    ).toEqual([{ work_item_id: 'source', step_id: step.id, max_parallel: 1 }]);
  } finally {
    await h.closeComposed();
  }
});

for (const policy of ['source', 'destination'] as const) {
  it(`nonnull-parent redo-duplicate ${policy} policy uses historical source and current destination`, async () => {
    const h = OrganizationHarness.openComposed();
    try {
      activateTestStepBlockages(h.sqlite.filename);
      await h.register('owner');
      h.organization('org');
      h.member('org', 'owner', 'member', ['project-contributor', 'org-viewer']);
      h.grantPermissions('org', 'owner', ['organization.create_project']);
      h.bind('owner', 'org');
      h.activate();
      const workPackageId = await createFixturePackage(h, 'owner', 'Nested duplicate history');
      const step = (await readFixturePackage(h, 'owner', workPackageId)).steps.at(0);
      if (step === undefined) throw new Error('fixture step absent');
      h.sqlite.run(
        "INSERT INTO work_item (id,work_package_id,name,parent_id,position,revision) VALUES ('parent',?,'Parent',NULL,1,0),('source',?,'Original','parent',1,0)",
        [workPackageId, workPackageId],
      );
      expect(
        (
          await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/commands`, {
            commands: [{ kind: 'duplicateWorkItem', workItemId: 'source' }],
          })
        ).status,
      ).toBe(200);
      const copy = h.sqlite
        .query("SELECT id FROM work_item WHERE name = 'Original (copy)'")
        .get() as { id: string } | null;
      if (copy === null) throw new Error('historical duplicate absent');
      expect(
        (await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/undo`)).status,
      ).toBe(200);
      // Move the historical source away without revision drift, leaving a valid leaf destination.
      const revisions = h.sqlite.query('SELECT id,revision FROM work_item ORDER BY id').all();
      h.sqlite.run("UPDATE work_item SET parent_id = NULL WHERE id = 'source'");
      h.sqlite.run('INSERT INTO step_parallel (work_item_id,step_id,max_parallel) VALUES (?,?,1)', [
        policy === 'source' ? 'source' : 'parent',
        step.id,
      ]);
      expect(h.sqlite.query('SELECT id,revision FROM work_item ORDER BY id').all()).toEqual(
        revisions,
      );
      const journal = h.sqlite.query('SELECT * FROM command_journal').all();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const readParallels = StepParallelRepository.prototype.listByWorkItems;
      const sparseRead = spyOn(
        StepParallelRepository.prototype,
        'listByWorkItems',
      ).mockImplementation(function (
        this: StepParallelRepository,
        workPackage: string,
        owners: readonly string[],
      ) {
        if (owners.includes('source')) throw new Error('cannot reread historical duplicate source');
        return readParallels.call(this, workPackage, owners);
      });
      let answer: Awaited<ReturnType<typeof h.call>>;
      try {
        answer = await h.call('owner', 'POST', `/api/work-packages/${workPackageId}/redo`);
      } finally {
        sparseRead.mockRestore();
      }
      expect(answer.status).toBe(policy === 'source' ? 200 : 409);
      if (policy === 'source') {
        expect(h.sqlite.query('SELECT parent_id FROM work_item WHERE id = ?').get(copy.id)).toEqual(
          { parent_id: 'parent' },
        );
        expect(h.sqlite.query('SELECT * FROM command_journal').all()).toHaveLength(journal.length);
      } else {
        expect(answer.body).toMatchObject({ error: 'stale_undo' });
        expect(h.sqlite.query('SELECT id FROM work_item WHERE id = ?').get(copy.id)).toBeNull();
        expect(h.sqlite.query('SELECT * FROM command_journal').all()).toHaveLength(0);
      }
      expect(
        h.sqlite.query('SELECT work_item_id,step_id,max_parallel FROM step_parallel').all(),
      ).toEqual([
        {
          work_item_id: policy === 'source' ? 'source' : 'parent',
          step_id: step.id,
          max_parallel: 1,
        },
      ]);
    } finally {
      await h.closeComposed();
    }
  });
}
