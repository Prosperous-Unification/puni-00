import { applyWorkPackageCommands, getWorkItems, validateSchema } from '@wbs/contracts';
import { expect, test } from 'bun:test';

import { PACKAGE_STEP_SEED, withinPackageSteps } from '../testing/package-step-values-fixture';

for (const shared of [false, true])
  test(
    'current attempt labels use the leaf order and preserve recorded sentences ' +
      (shared ? 'shared' : 'isolated'),
    async () => {
      await withinPackageSteps(async ({ harness, stamp }) => {
        const { workPackageId, stepId } = PACKAGE_STEP_SEED;
        harness.sqlite.run('UPDATE organization SET shared_people=? WHERE id=?', [
          shared ? 1 : 0,
          'org-a',
        ]);
        for (const id of ['label-story', 'label-unused']) {
          harness.sqlite.run('INSERT INTO work_item_type(id,name) VALUES(?,?)', [id, id]);
          harness.sqlite.run(
            'INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES(?,?,?)',
            [id, 'org-a', id],
          );
        }
        harness.sqlite.run(
          "UPDATE step_binding SET work_item_type_id='label-story',position=20 WHERE step_id=?",
          [stepId],
        );
        await harness.publicWrites().uow.run(async ({ stores }) => {
          expect(
            (
              await stores.stepCatalogue.bindStep(
                'org-a',
                {
                  bindingId: 'label-unused-dev',
                  stepId,
                  scopeKind: 'organization',
                  scopeId: 'org-a',
                  workItemTypeId: 'label-unused',
                  position: -10,
                },
                stamp,
              )
            ).ok,
          ).toBe(true);
          expect(
            (
              await stores.stepCatalogue.defineAndBindStep(
                'org-a',
                {
                  id: 'a2000000-0000-4000-8000-000000000002',
                  code: 'label-qa',
                  name: 'Quality',
                  position: 10,
                  defaultEstimateUnit: 'workdays',
                  defaultAllowancePercent: 0,
                },
                {
                  bindingId: 'label-qa',
                  scopeKind: 'organization',
                  scopeId: 'org-a',
                  workItemTypeId: 'label-story',
                  position: 10,
                },
                stamp,
              )
            ).ok,
          ).toBe(true);
          for (let index = 3; index <= 12; index++) {
            const id = 'a2000000-0000-4000-8000-' + String(index).padStart(12, '0');
            expect(
              (
                await stores.stepCatalogue.defineAndBindStep(
                  'org-a',
                  {
                    id,
                    code: 'label-unused-' + String(index),
                    name: id,
                    position: index * 10,
                    defaultEstimateUnit: 'workdays',
                    defaultAllowancePercent: 0,
                  },
                  {
                    bindingId: id + ':unused',
                    scopeKind: 'organization',
                    scopeId: 'org-a',
                    workItemTypeId: 'label-unused',
                    position: index * 10,
                  },
                  stamp,
                )
              ).ok,
            ).toBe(true);
          }
          return { commit: true, value: undefined };
        });
        const created = await harness.call(
          'manager',
          'POST',
          `/api/work-packages/${workPackageId}/commands`,
          {
            commands: [
              {
                kind: 'createWorkItem',
                ref: 'leaf',
                parentId: null,
                afterId: null,
                name: 'Authored attempt leaf',
              },
              { kind: 'patchWorkItem', workItemRef: 'leaf', patch: { typeIds: ['label-story'] } },
            ],
          },
        );
        expect(created.status).toBe(200);
        const checked = await validateSchema(
          applyWorkPackageCommands.responses[0].schema,
          created.body,
        );
        if (checked.issues !== undefined || checked.value.results[0]?.id === undefined)
          throw new Error('Attempt label create response lacks its identity');
        const workItemId = checked.value.results[0].id;
        expect(
          await harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/commands`, {
            commands: [{ kind: 'startAttempt', workItemId, stepId }],
          }),
        ).toMatchObject({ status: 200 });
        const sentences = () =>
          harness.sqlite
            .query<{ kind: string; label: string }, []>(
              "SELECT kind,label FROM plan_event WHERE kind IN ('start_attempt','end_attempt','remove_attempt') ORDER BY rowid",
            )
            .all();
        expect(sentences()).toEqual([
          { kind: 'start_attempt', label: 'started attempt 1 of 010.s2-current-http-shared' },
        ]);
        const recorded = harness.sqlite
          .query<{ id: string }, []>('SELECT * FROM plan_event ORDER BY id')
          .all();
        const recordedIds = new Set(recorded.map((event) => event.id));
        harness.sqlite.run(
          "UPDATE step_binding SET position=30-position WHERE work_item_type_id='label-story'",
        );
        expect(
          await harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/commands`, {
            commands: [{ kind: 'endAttempt', workItemId, stepId, outcome: 'failed' }],
          }),
        ).toMatchObject({ status: 200 });
        expect(
          await harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/commands`, {
            commands: [{ kind: 'removeAttempt', workItemId, stepId, attemptNumber: 1 }],
          }),
        ).toMatchObject({ status: 200 });
        expect(sentences()).toEqual([
          { kind: 'start_attempt', label: 'started attempt 1 of 010.s2-current-http-shared' },
          { kind: 'end_attempt', label: 'ended attempt 1 of 010.s1-current-http-shared failed' },
          { kind: 'remove_attempt', label: 'removed attempt 1 of 010.s1-current-http-shared' },
        ]);
        expect(
          harness.sqlite
            .query<{ id: string }, []>('SELECT * FROM plan_event ORDER BY id')
            .all()
            .filter((event) => recordedIds.has(event.id)),
        ).toEqual(recorded);
        const sibling = PACKAGE_STEP_SEED.siblingWorkPackageId;
        harness.sqlite.run(
          "UPDATE step_binding SET position=30-position WHERE work_item_type_id='label-story'",
        );
        const siblingCreated = await harness.call(
          'manager',
          'POST',
          `/api/work-packages/${sibling}/commands`,
          {
            commands: [
              {
                kind: 'createWorkItem',
                ref: 'remote',
                parentId: null,
                afterId: null,
                name: 'Remote label leaf',
              },
              { kind: 'patchWorkItem', workItemRef: 'remote', patch: { typeIds: ['label-story'] } },
            ],
          },
        );
        expect(siblingCreated.status).toBe(200);
        const remote = await validateSchema(
          applyWorkPackageCommands.responses[0].schema,
          siblingCreated.body,
        );
        if (remote.issues !== undefined || remote.value.results[0]?.id === undefined)
          throw new Error('Connected label create response lacks its identity');
        const remoteId = remote.value.results[0].id;
        harness.sqlite.run("UPDATE work_item SET frozen_number='080' WHERE id=?", [remoteId]);
        // The actual inactive gate also rejects fixture SQL; no activation receipt is fabricated.
        const externalBefore = harness.sqlite
          .query('SELECT * FROM external_dependency ORDER BY id')
          .all();
        expect(() =>
          harness.sqlite.run(
            "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type,created_at,created_by) VALUES('current-label-edge','org-a',?,?,?,'node',?,?,'node',?,'SS',100,?)",
            [workPackageId, sibling, workItemId, stepId, remoteId, stepId, stamp.by],
          ),
        ).toThrow('external_dependencies_inactive');
        expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
          externalBefore,
        );
        for (const selected of [workPackageId, sibling]) {
          const response = await harness.call(
            'manager',
            'GET',
            `/api/work-packages/${selected}/work-items?full=true`,
          );
          expect(response.status).toBe(200);
          const tree = await validateSchema(getWorkItems.responses[0].schema, response.body);
          if (tree.issues !== undefined) throw new Error('Connected label tree is malformed');
          expect(tree.value.stepNodes?.find((node) => node.stepId === stepId)?.reference).toBe(
            (selected === workPackageId ? '010' : '080') + '.s2-current-http-shared',
          );
        }
      });
    },
    60000,
  );
