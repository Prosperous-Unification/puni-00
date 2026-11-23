import {
  applyWorkPackageCommands,
  discoverAddressCandidates,
  exportWorkPackage,
  getWorkItems,
  validateSchema,
} from '@wbs/contracts';
import { expect, test } from 'bun:test';

import { PACKAGE_STEP_SEED, withinPackageSteps } from '../testing/package-step-values-fixture';

const { workPackageId, stepId } = PACKAGE_STEP_SEED;

// Catches a package-union fallback, inherited types, missing empty leaves and lost provenance.
for (const shared of [false, true])
  test(
    'current tree carries each leaf own resolved steps and every matching binding ' +
      (shared ? 'shared' : 'isolated'),
    async () => {
      await withinPackageSteps(async ({ harness }) => {
        harness.sqlite.run('UPDATE organization SET shared_people=? WHERE id=?', [
          shared ? 1 : 0,
          'org-a',
        ]);
        harness.grant('org-a', 'manager', 'org-admin');
        const typeId = 'tree-story';
        harness.sqlite.run('INSERT INTO work_item_type(id,name) VALUES(?,?)', [typeId, 'Story']);
        harness.sqlite.run('INSERT INTO work_item_type(id,name) VALUES(?,?)', [
          'tree-task',
          'Task',
        ]);
        harness.sqlite.run(
          'INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES(?,?,?)',
          ['tree-task', 'org-a', 'Task'],
        );
        harness.sqlite.run(
          'INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES(?,?,?)',
          [typeId, 'org-a', 'Story'],
        );
        expect(
          await harness.call(
            'manager',
            'DELETE',
            '/api/organization/step-bindings/' + stepId + ':binding',
            {
              dryRun: false,
            },
          ),
        ).toEqual({ status: 204, body: null });
        for (const [scopeKind, scopeId, position] of [
          ['organization', 'org-a', 20],
          ['project', 'current-http-project-a', -1],
        ] as const)
          expect(
            await harness.call('manager', 'POST', '/api/organization/step-bindings', {
              stepId,
              scopeKind,
              scopeId,
              workItemTypeId: typeId,
              position,
            }),
          ).toMatchObject({ status: 201 });
        const answer = await harness.call(
          'manager',
          'POST',
          `/api/work-packages/${workPackageId}/commands`,
          {
            commands: [
              {
                kind: 'createWorkItem',
                ref: 'parent',
                parentId: null,
                afterId: null,
                name: 'Typed parent',
              },
              { kind: 'patchWorkItem', workItemRef: 'parent', patch: { typeIds: [typeId] } },
              {
                kind: 'createWorkItem',
                ref: 'child',
                parentRef: 'parent',
                afterId: null,
                name: 'Untyped child',
              },
              {
                kind: 'createWorkItem',
                ref: 'typed',
                parentId: null,
                afterRef: 'parent',
                name: 'Typed leaf',
              },
              { kind: 'patchWorkItem', workItemRef: 'typed', patch: { typeIds: [typeId] } },
              {
                kind: 'createWorkItem',
                ref: 'conflict',
                parentId: null,
                afterRef: 'typed',
                name: 'Authored conflict',
              },
            ],
          },
        );
        expect(answer.status).toBe(200);
        const checked = await validateSchema(
          applyWorkPackageCommands.responses[0].schema,
          answer.body,
        );
        if (checked.issues !== undefined)
          throw new Error('Tree fixture create response is malformed');
        const parent = checked.value.results[0]?.id,
          child = checked.value.results[2]?.id,
          typed = checked.value.results[3]?.id,
          conflict = checked.value.results[5]?.id;
        if (
          parent === undefined ||
          child === undefined ||
          typed === undefined ||
          conflict === undefined
        )
          throw new Error('Tree fixture create response lacks identities');
        // Authored current receiver state, not evidence from a genuine predecessor producer.
        for (const selected of [typeId, 'tree-task'])
          harness.sqlite.run(
            'INSERT INTO work_item_work_item_type(work_item_id,type_id) VALUES(?,?)',
            [conflict, selected],
          );
        const via = harness.sqlite
          .query<
            { bindingId: string; scopeKind: string; scopeId: string; workItemTypeId: string },
            []
          >(
            `SELECT id AS bindingId,scope_kind AS scopeKind,scope_id AS scopeId,work_item_type_id AS workItemTypeId
       FROM step_binding WHERE step_id='${stepId}' ORDER BY CASE scope_kind WHEN 'organization' THEN 0 ELSE 1 END`,
          )
          .all();
        expect(via).toHaveLength(2);
        const tree = await harness.call(
          'manager',
          'GET',
          `/api/work-packages/${workPackageId}/work-items`,
        );
        expect(tree.status).toBe(200);
        const decoded = await validateSchema(getWorkItems.responses[0].schema, tree.body);
        if (decoded.issues !== undefined) throw new Error('Current tree response is malformed');
        expect(decoded.value.stepNodes).toEqual([
          {
            id: `sn1.${typed}.${stepId}`,
            workItemId: typed,
            stepId,
            reference: '020.s1-current-http-shared',
          },
        ]);
        expect(decoded.value.workItems.find((row) => row.id === parent)).not.toHaveProperty(
          'steps',
        );
        expect(tree.body).toMatchObject({
          workItems: [
            { id: parent, typeIds: [typeId] },
            { id: child, typeIds: [], steps: [] },
            {
              id: typed,
              typeIds: [typeId],
              steps: [{ stepId, code: 'current-http-shared', name: stepId, via }],
            },
            { id: conflict, typeIds: [typeId, 'tree-task'], steps: [] },
          ],
        });
        const readCandidates = async (query = '') => {
          const response = await harness.call(
            'manager',
            'GET',
            `/api/work-packages/${workPackageId}/address-candidates${query}`,
          );
          expect(response.status).toBe(200);
          const page = await validateSchema(
            discoverAddressCandidates.responses[0].schema,
            response.body,
          );
          if (page.issues !== undefined) throw new Error('Current candidates are malformed');
          return page.value;
        };
        const candidates = await readCandidates();
        expect(candidates.candidates.map((candidate) => candidate.endpoint)).toEqual([
          { scope: 'whole', workItemId: parent },
          { scope: 'whole', workItemId: child },
          { scope: 'whole', workItemId: typed },
          { scope: 'node', workItemId: typed, stepId },
          { scope: 'whole', workItemId: conflict },
        ]);
        const qualified = candidates.candidates.find((candidate) => candidate.stepNodeId);
        if (qualified?.reference == null)
          throw new Error('Current typed candidate lacks a reference');
        expect(qualified.reference).toBe(
          candidates.workPackage.abbreviation + '.020.s1-current-http-shared',
        );
        const resolveQualified = (reference: string, revision = candidates.addressRevision) =>
          harness.call(
            'manager',
            'GET',
            `/api/work-packages/${workPackageId}/address-references?` +
              new URLSearchParams({ reference, revision }).toString(),
          );
        expect(await resolveQualified(qualified.reference)).toMatchObject({
          status: 200,
          body: { endpoint: { scope: 'node', workItemId: typed, stepId } },
        });
        expect(await resolveQualified('010.1.current-http-shared')).toEqual({
          status: 404,
          body: { error: 'not_found' },
        });
        const firstPage = await readCandidates('?limit=3');
        if (firstPage.nextCursor === null) throw new Error('Current candidates lack a cursor');
        expect(
          (await readCandidates('?limit=3&cursor=' + encodeURIComponent(firstPage.nextCursor)))
            .candidates,
        ).toEqual(candidates.candidates.slice(3));
        const exported = await harness.call(
          'manager',
          'GET',
          `/api/work-packages/${workPackageId}/export?format=json`,
        );
        expect(exported.status).toBe(200);
        const document = await validateSchema(exportWorkPackage.responses[0].schema, exported.body);
        if (document.issues !== undefined) throw new Error('Current export response is malformed');
        for (const row of document.value.workItems) expect(row).not.toHaveProperty('steps');
        const revision = decoded.value.addressRevision;
        if (revision === undefined) throw new Error('Current tree has no address revision');
        const resolve = (reference: string, currentRevision = revision) =>
          harness.call(
            'manager',
            'GET',
            `/api/work-packages/${workPackageId}/step-references?` +
              new URLSearchParams({ reference, revision: currentRevision }).toString(),
          );
        expect(await resolve('020.current-http-shared')).toMatchObject({
          status: 200,
          body: { workItemId: typed, stepId, reference: '020.s1-current-http-shared' },
        });
        for (const reference of ['010.1.current-http-shared', '030.current-http-shared'])
          expect(await resolve(reference)).toEqual({
            status: 422,
            body: { error: 'unresolvable_reference', reason: 'unknown_code' },
          });
        expect(
          await harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/commands`, {
            commands: [{ kind: 'patchWorkItem', workItemId: typed, patch: { typeIds: [] } }],
          }),
        ).toMatchObject({ status: 200 });
        const refreshed = await harness.call(
          'manager',
          'GET',
          `/api/work-packages/${workPackageId}/work-items`,
        );
        expect(refreshed.status).toBe(200);
        const fresh = await validateSchema(getWorkItems.responses[0].schema, refreshed.body);
        if (fresh.issues !== undefined || fresh.value.addressRevision === undefined)
          throw new Error('Fresh addresses are malformed');
        expect(fresh.value.steps).toEqual(decoded.value.steps);
        expect(fresh.value.stepNodes).toEqual([]);
        expect(fresh.value.addressRevision).not.toBe(revision);
        const freshCandidates = await readCandidates();
        expect(
          freshCandidates.candidates.every((candidate) => candidate.endpoint.scope === 'whole'),
        ).toBe(true);
        expect(freshCandidates.addressRevision).not.toBe(candidates.addressRevision);
        expect(await resolveQualified(qualified.reference)).toEqual({
          status: 409,
          body: {
            error: 'stale_address_revision',
            addressRevision: freshCandidates.addressRevision,
          },
        });
        expect(
          await resolveQualified(qualified.reference, freshCandidates.addressRevision),
        ).toEqual({
          status: 404,
          body: { error: 'not_found' },
        });
        expect(await resolve('020.current-http-shared')).toEqual({
          status: 409,
          body: { error: 'stale_address_revision', addressRevision: fresh.value.addressRevision },
        });
        expect(await resolve('020.current-http-shared', fresh.value.addressRevision)).toEqual({
          status: 422,
          body: { error: 'unresolvable_reference', reason: 'unknown_code' },
        });
      });
    },
    60000,
  );
