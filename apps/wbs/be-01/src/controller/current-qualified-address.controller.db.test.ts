import {
  applyWorkPackageCommands,
  discoverAddressCandidates,
  getWorkItems,
  validateSchema,
} from '@wbs/contracts';
import { expect, test } from 'bun:test';

import { PACKAGE_STEP_SEED, withinPackageSteps } from '../testing/package-step-values-fixture';

test('qualified candidates use descendant membership and each leaf order and count', async () => {
  await withinPackageSteps(async ({ harness, stamp }) => {
    const { workPackageId, stepId } = PACKAGE_STEP_SEED;
    const qa = 'a2000000-0000-4000-8000-000000000002';
    harness.grant('org-a', 'manager', 'org-admin');
    expect(
      await harness.call(
        'manager',
        'DELETE',
        '/api/organization/step-bindings/' + stepId + ':binding',
        { dryRun: false },
      ),
    ).toEqual({ status: 204, body: null });
    for (const id of ['qualified-a', 'qualified-b', 'qualified-unused']) {
      harness.sqlite.run('INSERT INTO work_item_type(id,name) VALUES(?,?)', [id, id]);
      harness.sqlite.run(
        'INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES(?,?,?)',
        [id, 'org-a', id],
      );
    }
    await harness.publicWrites().uow.run(async ({ stores }) => {
      expect(
        (
          await stores.stepCatalogue.bindStep(
            'org-a',
            {
              bindingId: 'qualified-dev-a',
              stepId,
              scopeKind: 'organization',
              scopeId: 'org-a',
              workItemTypeId: 'qualified-a',
              position: 10,
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
              id: qa,
              code: 'qa',
              name: 'Quality',
              position: 20,
              defaultEstimateUnit: 'workdays',
              defaultAllowancePercent: 0,
            },
            {
              bindingId: 'qualified-qa-a',
              scopeKind: 'organization',
              scopeId: 'org-a',
              workItemTypeId: 'qualified-a',
              position: 20,
            },
            stamp,
          )
        ).ok,
      ).toBe(true);
      for (const [id, selected, position] of [
        ['qualified-dev-b', stepId, 20],
        ['qualified-qa-b', qa, 10],
      ] as const)
        expect(
          (
            await stores.stepCatalogue.bindStep(
              'org-a',
              {
                bindingId: id,
                stepId: selected,
                scopeKind: 'project',
                scopeId: 'current-http-project-a',
                workItemTypeId: 'qualified-b',
                position,
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
                code: 'unused-' + String(index),
                name: id,
                position: index * 10,
                defaultEstimateUnit: 'workdays',
                defaultAllowancePercent: 0,
              },
              {
                bindingId: id + ':unused',
                scopeKind: 'organization',
                scopeId: 'org-a',
                workItemTypeId: 'qualified-unused',
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
          { kind: 'createWorkItem', ref: 'parent', parentId: null, afterId: null, name: 'Parent' },
          {
            kind: 'createWorkItem',
            ref: 'child',
            parentRef: 'parent',
            afterId: null,
            name: 'Child A',
          },
          { kind: 'patchWorkItem', workItemRef: 'child', patch: { typeIds: ['qualified-a'] } },
          {
            kind: 'createWorkItem',
            ref: 'second',
            parentId: null,
            afterRef: 'parent',
            name: 'Leaf B',
          },
          { kind: 'patchWorkItem', workItemRef: 'second', patch: { typeIds: ['qualified-b'] } },
          {
            kind: 'createWorkItem',
            ref: 'empty',
            parentId: null,
            afterRef: 'second',
            name: 'Empty',
          },
        ],
      },
    );
    expect(created.status).toBe(200);
    const decoded = await validateSchema(
      applyWorkPackageCommands.responses[0].schema,
      created.body,
    );
    if (decoded.issues !== undefined)
      throw new Error('Qualified fixture command response is malformed');
    const parent = decoded.value.results[0]?.id,
      child = decoded.value.results[1]?.id,
      second = decoded.value.results[3]?.id;
    if (parent === undefined || child === undefined || second === undefined)
      throw new Error('Qualified fixture identities are absent');
    const read = async (query = '') => {
      const response = await harness.call(
        'manager',
        'GET',
        `/api/work-packages/${workPackageId}/address-candidates${query}`,
      );
      expect(response.status).toBe(200);
      const checked = await validateSchema(
        discoverAddressCandidates.responses[0].schema,
        response.body,
      );
      if (checked.issues !== undefined) throw new Error('Qualified candidates are malformed');
      return checked.value;
    };
    const page = await read();
    expect(page.candidates).toHaveLength(10);
    expect(
      page.candidates
        .filter((candidate) => candidate.endpoint.scope === 'descendant-step')
        .map((candidate) => candidate.endpoint),
    ).toEqual([
      { scope: 'descendant-step', workItemId: parent, stepId },
      { scope: 'descendant-step', workItemId: parent, stepId: qa },
    ]);
    const nodes = page.candidates.filter((candidate) => candidate.endpoint.scope === 'node');
    expect(
      nodes.map((candidate) => [
        candidate.workItemId,
        candidate.step?.id,
        candidate.step?.ordinal,
        candidate.reference,
      ]),
    ).toEqual([
      [child, stepId, 1, page.workPackage.abbreviation + '.010.1.s1-current-http-shared'],
      [child, qa, 2, page.workPackage.abbreviation + '.010.1.s2-qa'],
      [second, qa, 1, page.workPackage.abbreviation + '.020.s1-qa'],
      [second, stepId, 2, page.workPackage.abbreviation + '.020.s2-current-http-shared'],
    ]);
    const resolve = (reference: string, revision = page.addressRevision) =>
      harness.call(
        'manager',
        'GET',
        `/api/work-packages/${workPackageId}/address-references?` +
          new URLSearchParams({ reference, revision }).toString(),
      );
    expect(await resolve('020.qa')).toMatchObject({
      status: 200,
      body: { reference: page.workPackage.abbreviation + '.020.s1-qa' },
    });
    expect(await resolve('020.s2-qa')).toMatchObject({
      status: 422,
      body: { reason: 'alias_mismatch' },
    });
    harness.sqlite.run(
      "UPDATE step_binding SET position=position+1000 WHERE work_item_type_id='qualified-unused'",
    );
    expect((await read()).addressRevision).toBe(page.addressRevision);
    await harness.publicWrites().uow.run(async ({ stores }) => {
      expect(
        (
          await stores.stepCatalogue.bindStep(
            'org-a',
            {
              bindingId: 'qualified-unused-qa',
              stepId: qa,
              scopeKind: 'organization',
              scopeId: 'org-a',
              workItemTypeId: 'qualified-unused',
              position: -10,
            },
            stamp,
          )
        ).ok,
      ).toBe(true);
      return { commit: true, value: undefined };
    });
    const unused = await read();
    expect(unused.addressRevision).toBe(page.addressRevision);
    expect(unused.candidates.map((candidate) => candidate.endpoint)).toEqual(
      page.candidates.map((candidate) => candidate.endpoint),
    );
    const first = await read('?limit=1');
    if (first.nextCursor === null) throw new Error('Qualified fixture cursor is absent');
    harness.sqlite.run(
      "UPDATE step_binding SET position=30-position WHERE work_item_type_id='qualified-b'",
    );
    const fresh = await read();
    expect(fresh.addressRevision).not.toBe(page.addressRevision);
    expect(await resolve('020.qa')).toMatchObject({
      status: 409,
      body: { addressRevision: fresh.addressRevision },
    });
    expect(await resolve('020.qa', fresh.addressRevision)).toMatchObject({
      status: 200,
      body: { reference: page.workPackage.abbreviation + '.020.s2-qa' },
    });
    expect(
      await harness.call(
        'manager',
        'GET',
        `/api/work-packages/${workPackageId}/address-candidates?cursor=` +
          encodeURIComponent(first.nextCursor),
      ),
    ).toMatchObject({ status: 409, body: { addressRevision: fresh.addressRevision } });
    expect(
      (
        await harness.call(
          'nonmember',
          'GET',
          `/api/work-packages/${workPackageId}/address-candidates`,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await harness.call(
          'hidden',
          'GET',
          `/api/work-packages/${workPackageId}/address-candidates`,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await harness.call(
          'viewer',
          'GET',
          `/api/work-packages/${workPackageId}/address-candidates`,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await harness.call(
          'manager',
          'GET',
          `/api/work-packages/${PACKAGE_STEP_SEED.foreignWorkPackageId}/address-candidates`,
        )
      ).status,
    ).toBe(404);
  });
}, 60000);

test('qualified revision includes ancestry when a frozen leaf moves between retained parents', async () => {
  await withinPackageSteps(async ({ harness }) => {
    const { workPackageId, stepId } = PACKAGE_STEP_SEED;
    harness.sqlite.run(
      "INSERT INTO work_item_type(id,name) VALUES('qualified-move-type','Moved type')",
    );
    harness.sqlite.run(
      "INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES('qualified-move-type','org-a','Moved type')",
    );
    harness.sqlite.run(
      "UPDATE step_binding SET work_item_type_id='qualified-move-type' WHERE step_id=?",
      [stepId],
    );
    const created = await harness.call(
      'manager',
      'POST',
      `/api/work-packages/${workPackageId}/commands`,
      {
        commands: [
          { kind: 'createWorkItem', ref: 'left', parentId: null, afterId: null, name: 'Left' },
          {
            kind: 'createWorkItem',
            ref: 'moving',
            parentRef: 'left',
            afterId: null,
            name: 'Moving',
          },
          {
            kind: 'patchWorkItem',
            workItemRef: 'moving',
            patch: { typeIds: ['qualified-move-type'] },
          },
          {
            kind: 'createWorkItem',
            ref: 'staying',
            parentRef: 'left',
            afterRef: 'moving',
            name: 'Staying',
          },
          { kind: 'createWorkItem', ref: 'right', parentId: null, afterRef: 'left', name: 'Right' },
          {
            kind: 'createWorkItem',
            ref: 'right-child',
            parentRef: 'right',
            afterId: null,
            name: 'Right child',
          },
        ],
      },
    );
    expect(created.status).toBe(200);
    const checked = await validateSchema(
      applyWorkPackageCommands.responses[0].schema,
      created.body,
    );
    if (checked.issues !== undefined) throw new Error('Frozen ancestry commands are malformed');
    const left = checked.value.results[0]?.id,
      moving = checked.value.results[1]?.id,
      right = checked.value.results[4]?.id;
    if (left === undefined || moving === undefined || right === undefined)
      throw new Error('Frozen ancestry identities are absent');
    const treeResponse = await harness.call(
      'manager',
      'GET',
      `/api/work-packages/${workPackageId}/work-items`,
    );
    expect(treeResponse.status).toBe(200);
    const tree = await validateSchema(getWorkItems.responses[0].schema, treeResponse.body);
    if (tree.issues !== undefined) throw new Error('Frozen ancestry tree is malformed');
    for (const row of tree.value.workItems)
      harness.sqlite.run('UPDATE work_item SET frozen_number=? WHERE id=?', [row.number, row.id]);
    const read = async (query = '') => {
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
      if (page.issues !== undefined) throw new Error('Frozen ancestry candidates are malformed');
      return page.value;
    };
    const before = await read(),
      first = await read('?limit=1');
    if (first.nextCursor === null) throw new Error('Frozen ancestry cursor is absent');
    expect(
      before.candidates
        .filter((candidate) => candidate.endpoint.scope === 'descendant-step')
        .map((candidate) => candidate.endpoint),
    ).toEqual([{ scope: 'descendant-step', workItemId: left, stepId }]);
    // Authored receiver tree edit; this read test makes no write-command/history claim.
    harness.sqlite.run('UPDATE work_item SET parent_id=? WHERE id=?', [right, moving]);
    const after = await read();
    expect(
      after.candidates
        .filter((candidate) => candidate.endpoint.scope === 'descendant-step')
        .map((candidate) => candidate.endpoint),
    ).toEqual([{ scope: 'descendant-step', workItemId: right, stepId }]);
    expect(after.addressRevision).not.toBe(before.addressRevision);
    expect(
      await harness.call(
        'manager',
        'GET',
        `/api/work-packages/${workPackageId}/address-candidates?cursor=` +
          encodeURIComponent(first.nextCursor),
      ),
    ).toMatchObject({ status: 409, body: { addressRevision: after.addressRevision } });
    const afterResponse = await harness.call(
      'manager',
      'GET',
      `/api/work-packages/${workPackageId}/work-items`,
    );
    const afterTree = await validateSchema(getWorkItems.responses[0].schema, afterResponse.body);
    if (afterTree.issues !== undefined)
      throw new Error('Frozen ancestry refreshed tree is malformed');
    expect(afterTree.value.addressRevision).toBe(tree.value.addressRevision);
  });
}, 60000);
