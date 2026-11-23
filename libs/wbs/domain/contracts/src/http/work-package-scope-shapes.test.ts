import { expect, test } from 'bun:test';

import { listMembers } from './organization-shapes';
import { validateSchema } from './schema-shape';
import { readStartableWork } from './startable-shapes';
import { applyWorkPackageCommands } from './work-item-shapes';

// This is a wire-vocabulary proof, not a Project grant/writer positive before slice2.
test('member projection uses catalogue scope spellings', async () => {
  for (const scopeKind of ['organization', 'project', 'work_package']) {
    const body = {
      members: [
        {
          userId: 'account',
          username: 'Account',
          email: null,
          grantCount: 1,
          createdAt: 1,
          effectiveRole: {
            permissions: ['organization.navigate'],
            via: [
              {
                scopeKind,
                scopeId: 'scope',
                subjectKind: 'user',
                subjectId: 'account',
                roleId: 'role',
              },
            ],
          },
        },
      ],
    };
    expect((await validateSchema(listMembers.responses[0].schema, body)).issues).toBeUndefined();
    const malformed = structuredClone(body);
    malformed.members[0].effectiveRole.via[0].scopeKind = 'work package';
    expect((await validateSchema(listMembers.responses[0].schema, malformed)).issues).toBeDefined();
  }
});

const leaf = {
  workItemId: 'row',
  number: '010',
  numberIsFrozen: false,
  name: 'Build',
  stepIds: ['dev'],
  assignees: [],
  teams: [],
  unfinishedPredecessorIds: [],
  subtreeClaim: null,
  fits: false,
};
test('startable exhaustion uses the domain occupancy scope', async () => {
  for (const scope of ['work_package', 'organization']) {
    const exhausted = {
      resourceId: 'ram',
      name: 'RAM',
      unitLabel: 'GB',
      asked: 8,
      free: 4,
      shortfall: 4,
      scope,
    };
    const body = {
      leaves: [],
      doesNotFit: [{ ...leaf, exhausted }],
      claimed: [],
      subtreeClaims: [],
      resources: [],
      occupancyScope: 'work_package',
    };
    expect(
      (await validateSchema(readStartableWork.responses[0].schema, body)).issues,
    ).toBeUndefined();
    expect(
      (
        await validateSchema(readStartableWork.responses[0].schema, {
          ...body,
          doesNotFit: [{ ...leaf, exhausted: { ...exhausted, scope: 'work package' } }],
        })
      ).issues,
    ).toBeDefined();
  }
});

test('command exhaustion uses the domain occupancy scope in every resource detail', async () => {
  const boundaries = applyWorkPackageCommands.refusals.filter(
    (refusal) =>
      'schema' in refusal &&
      JSON.stringify(refusal.schema.jsonSchema).includes('resources_exhausted'),
  );
  expect(boundaries).toHaveLength(1);
  const boundary = boundaries.at(0);
  if (boundary === undefined) throw new Error('resource exhaustion boundary absent');
  for (const scope of ['work_package', 'organization']) {
    const resource = { resourceId: 'ram', asked: 8, free: 4, holders: [], scope };
    const body = {
      at: 0,
      kind: 'claimWorkItem',
      error: 'resources_exhausted',
      ...resource,
      resources: [resource],
    };
    expect((await validateSchema<unknown>(boundary.schema, body)).issues).toBeUndefined();
    expect(
      (await validateSchema<unknown>(boundary.schema, { ...body, scope: 'work package' })).issues,
    ).toBeDefined();
    expect(
      (
        await validateSchema<unknown>(boundary.schema, {
          ...body,
          resources: [{ ...resource, scope: 'work package' }],
        })
      ).issues,
    ).toBeDefined();
  }
});
