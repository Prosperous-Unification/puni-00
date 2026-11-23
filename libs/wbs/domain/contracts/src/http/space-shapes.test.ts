import { expect, test } from 'bun:test';

import { readSpace, readSpaceRollUps } from './space-shapes';

const emptySpace = {
  space: {
    id: 'space',
    name: 'Department',
    virtual: false,
    revision: 0,
    projectCount: 1,
    workPackageCount: 0,
    createdById: 'author',
    createdAt: 1,
  },
  writable: false,
  personIds: [],
  serviceTeamIds: [],
  projects: [
    { project: { id: 'project', name: 'Empty engagement' }, position: 10, workPackages: [] },
  ],
};

test('space read requires its readable project count', async () => {
  const { projectCount, ...header } = emptySpace.space;
  expect(projectCount).toBe(1);
  expect(
    (
      await readSpace.responses[0].schema.validator['~standard'].validate({
        ...emptySpace,
        space: header,
      })
    ).issues,
  ).toBeDefined();
});

for (const count of [-1, 0.5, '1'] as const)
  test('space read refuses an invalid readable project count ' + String(count), async () => {
    expect(
      (
        await readSpace.responses[0].schema.validator['~standard'].validate({
          ...emptySpace,
          space: { ...emptySpace.space, projectCount: count },
        })
      ).issues,
    ).toBeDefined();
  });

test('project rollup contract admits explicit empty projects and refuses obsolete flat figures', async () => {
  const schema = readSpaceRollUps.responses[0].schema.validator['~standard'];
  const projects = [
    {
      project: { id: 'project', name: 'Empty engagement' },
      position: 10,
      rollUp: { kind: 'empty' },
      workPackages: [],
    },
  ];
  expect((await schema.validate({ projects })).issues).toBeUndefined();
  expect((await schema.validate({ projects, rollUps: {} })).issues).toBeDefined();
  expect((await schema.validate({ rollUps: {} })).issues).toBeDefined();
});

test('project rollup query requires projectIds and rejects mixed retired package IDs', async () => {
  const schema = readSpaceRollUps.query.validator['~standard'];
  expect((await schema.validate({ projectIds: 'project' })).issues).toBeUndefined();
  expect(
    (await schema.validate({ projectIds: 'project', workPackageIds: 'package' })).issues,
  ).toBeDefined();
});

test('space read contract admits a real empty project and refuses the obsolete flat rows', async () => {
  const schema = readSpace.responses[0].schema.validator['~standard'];
  expect((await schema.validate(emptySpace)).issues).toBeUndefined();
  expect((await schema.validate({ ...emptySpace, rows: [] })).issues).toBeDefined();
  const { projects, ...withoutProjects } = emptySpace;
  expect(projects).toHaveLength(1);
  expect((await schema.validate({ ...withoutProjects, rows: [] })).issues).toBeDefined();
});

for (const [field, value] of [
  ['organizationId', 'org'],
  ['spaceId', 'space'],
  ['spacePosition', 10],
  ['revision', 1],
  ['createdAt', 1],
  ['createdBy', 'author'],
  ['updatedAt', 1],
  ['workPackageCount', 10],
  ['workPackages', []],
] as const)
  test('space parent identity refuses private project metadata ' + field, async () => {
    const reply = {
      ...emptySpace,
      projects: [
        {
          project: { id: 'project', name: 'Engagement', [field]: value },
          position: 10,
          workPackages: [],
        },
      ],
    };
    expect(
      (await readSpace.responses[0].schema.validator['~standard'].validate(reply)).issues,
    ).toBeDefined();
  });
