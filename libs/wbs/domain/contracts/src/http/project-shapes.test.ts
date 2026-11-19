import { PERMISSIONS } from '@wbs/domain/access-role';
import { Ajv2020 } from 'ajv/dist/2020';
import { expect, it } from 'bun:test';

import {
  createProject,
  deleteProject,
  listProjects,
  moveWorkPackage,
  readProject,
  renameProject,
} from './project-shapes';
import { validateSchema } from './schema-shape';
import { httpShapes } from './shapes';

it('registers the current move descriptor once with the exact mutation policies', () => {
  expect([moveWorkPackage.method, moveWorkPackage.path, moveWorkPackage.operationId]).toEqual([
    'POST',
    '/api/work-packages/:id/move',
    'postApiWorkPackagesByIdMove',
  ]);
  expect(httpShapes.filter((shape) => shape === moveWorkPackage)).toHaveLength(1);
  expect(moveWorkPackage.policies).toEqual([
    { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
    { kind: 'identity', require: 'write-scope' },
    { kind: 'organization-resource', operation: 'mutation' },
  ]);
});

it('requires a closed explicit move destination without accepting caller authority', async () => {
  expect(await validateSchema(moveWorkPackage.body, { projectId: 'target' })).toEqual({
    value: { projectId: 'target' },
  });
  for (const body of [
    {},
    { projectId: '' },
    { projectId: null },
    { projectId: 42 },
    { projectId: 'target', actor: 'other' },
    { projectId: 'target', organizationId: 'other' },
    { projectId: 'target', workPackageId: 'other' },
  ])
    expect((await validateSchema(moveWorkPackage.body, body)).issues).toBeDefined();
  expect((await validateSchema(moveWorkPackage.params, { id: '' })).issues).toBeDefined();
});

it('requires the committed move revisions and typed dependency identifiers', async () => {
  const schema = moveWorkPackage.responses[0].schema;
  const moved = {
    workPackageId: 'w',
    projectId: 'target',
    revision: 1,
    sourceProject: { id: 'source', revision: 2 },
    targetProject: { id: 'target', revision: 3 },
  };
  expect((await validateSchema(schema, moved)).issues).toBeUndefined();
  for (const malformed of [
    { ...moved, sourceProject: null },
    { ...moved, targetProject: { id: 'target' } },
    { ...moved, revision: -1 },
  ])
    expect((await validateSchema(schema, malformed)).issues).toBeDefined();
  const dependencyConflicts = moveWorkPackage.refusals.filter(
    (refusal) =>
      refusal.status === 409 &&
      'schema' in refusal &&
      JSON.stringify(refusal.schema.jsonSchema).includes('"dependency_crosses_project"'),
  );
  expect(dependencyConflicts).toHaveLength(1);
  const conflict = dependencyConflicts.at(0);
  if (conflict === undefined || !('schema' in conflict))
    throw new Error('dedicated move dependency conflict descriptor is absent');
  expect(
    (
      await validateSchema<unknown>(conflict.schema, {
        error: 'dependency_crosses_project',
        dependencyIds: ['edge'],
      })
    ).issues,
  ).toBeUndefined();
  expect(
    (
      await validateSchema<unknown>(conflict.schema, {
        error: 'dependency_crosses_project',
        dependencyIds: [42],
      })
    ).issues,
  ).toBeDefined();
  expect(
    (await validateSchema<unknown>(conflict.schema, { error: 'cross_organization' })).issues,
  ).toBeDefined();
  expect(
    (await validateSchema<unknown>(conflict.schema, { error: 'organization_context_changed' }))
      .issues,
  ).toBeDefined();
  const contextConflicts = moveWorkPackage.refusals.filter(
    (refusal) =>
      refusal.status === 409 &&
      'schema' in refusal &&
      JSON.stringify(refusal.schema.jsonSchema).includes('"organization_context_changed"'),
  );
  expect(contextConflicts).toHaveLength(1);
  const context = contextConflicts.at(0);
  if (context === undefined || !('schema' in context))
    throw new Error('move organization context conflict descriptor is absent');
  expect(
    (await validateSchema<unknown>(context.schema, { error: 'organization_context_changed' }))
      .issues,
  ).toBeUndefined();
  expect(
    (
      await validateSchema<unknown>(context.schema, {
        error: 'dependency_crosses_project',
        dependencyIds: ['edge'],
      })
    ).issues,
  ).toBeDefined();
});

it('registers exactly five ordinary project endpoints with distinct operation identities', () => {
  const shapes = [createProject, listProjects, readProject, renameProject, deleteProject];
  expect(shapes.map((shape) => [shape.method, shape.path])).toEqual([
    ['POST', '/api/projects'],
    ['GET', '/api/projects'],
    ['GET', '/api/projects/:id'],
    ['PATCH', '/api/projects/:id'],
    ['DELETE', '/api/projects/:id'],
  ]);
  expect(new Set(shapes.map((shape) => shape.operationId)).size).toBe(5);
  for (const shape of shapes)
    expect(httpShapes.filter((registered) => registered === shape)).toHaveLength(1);
});
for (const shape of [createProject, renameProject])
  it(shape.operationId + ' accepts its closed name boundary without caller authority', async () => {
    const declaration = shape.body;
    expect(await validateSchema(declaration, { name: ' ' })).toEqual({ value: { name: ' ' } });
    for (const body of [
      {},
      [],
      { name: '' },
      { name: 42 },
      { name: 'Name', organizationId: 'other' },
      { name: 'Name', actor: 'other' },
      { name: 'Name', id: 'override' },
      { name: 'Name', projectId: 'other' },
      ...(shape === renameProject ? [{ name: 'Name', workPackage: { name: 'Child' } }] : []),
    ])
      expect((await validateSchema(declaration, body)).issues).toBeDefined();
  });
it('declares mutation and read boundary policies', () => {
  for (const shape of [createProject, renameProject, deleteProject])
    expect(shape.policies).toEqual([
      { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
      { kind: 'identity', require: 'write-scope' },
      { kind: 'organization-resource', operation: 'mutation' },
    ]);
  for (const shape of [listProjects, readProject])
    expect(shape.policies).toEqual([
      { kind: 'identity', require: 'signed-in' },
      { kind: 'organization-resource', operation: 'read' },
    ]);
});
it('requires explicit readable detail counts/entries and declares not_empty IDs and empty204', async () => {
  const response = readProject.responses[0];
  const project = {
    id: 'p',
    organizationId: 'org',
    name: 'Plan',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: null,
    workPackageCount: 0,
    workPackages: [],
  };
  expect((await validateSchema(response.schema, { project })).issues).toBeUndefined();
  expect(
    (await validateSchema(response.schema, { project: { ...project, workPackageCount: 'hidden' } }))
      .issues,
  ).toBeDefined();
  expect(
    (await validateSchema(response.schema, { project: { ...project, workPackages: null } })).issues,
  ).toBeDefined();
  expect(deleteProject.responses).toEqual([{ kind: 'empty', status: 204 }]);
  const refusal = deleteProject.refusals.find(
    (refusal) =>
      refusal.status === 409 &&
      JSON.stringify(refusal.schema.jsonSchema).includes('workPackageIds'),
  );
  if (refusal === undefined || !('schema' in refusal)) throw Error('missing not_empty refusal');
  expect(
    (await validateSchema<unknown>(refusal.schema, { error: 'not_empty', workPackageIds: [] }))
      .issues,
  ).toBeUndefined();
  expect(
    (
      await validateSchema<unknown>(refusal.schema, {
        error: 'not_empty',
        workPackageIds: ['visible'],
      })
    ).issues,
  ).toBeUndefined();
  expect(
    (await validateSchema<unknown>(refusal.schema, { error: 'not_empty', workPackageIds: [42] }))
      .issues,
  ).toBeDefined();
});

it('declares create-only optional first package without widening rename', async () => {
  expect(
    (await validateSchema(createProject.body, { name: 'Plan', workPackage: { name: 'First' } }))
      .issues,
  ).toBeUndefined();
  expect(
    (await validateSchema(renameProject.body, { name: 'Plan', workPackage: { name: 'First' } }))
      .issues,
  ).toBeDefined();
});
it('correlates the complete combined reply in runtime and generated descriptor while allowing unrelated additions', async () => {
  const project = {
    id: 'p',
    organizationId: 'org',
    name: 'Plan',
    revision: 0,
    createdAt: 17,
    updatedAt: null,
    createdBy: 'creator',
    workPackageCount: 1,
  };
  const workPackage = {
    id: 'w',
    projectId: 'p',
    name: 'First',
    abbreviation: 'FIRST',
    restricted: false,
    estimateMethod: 'pert',
    depReach: 'whole-item',
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'ceil',
    startDate: null,
    solutionRef: null,
    revision: 0,
    createdAt: 17,
    optimizationEnabled: false,
    scheduleEngine: 'fast',
    scheduleObjective: 'pri',
  };
  const steps = [
    {
      id: 's',
      workPackageId: 'w',
      name: 'Dev',
      position: 10,
      code: 'DEV',
      allowancePercent: 0,
      estimateUnit: 'workdays',
    },
  ];
  const schema = createProject.responses[0].schema;
  const descriptor = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true }).compile(
    schema.jsonSchema,
  );
  for (const body of [
    { project },
    { project, extra: 'allowed' },
    { project, workPackage, steps },
    { project, workPackage, steps, extra: 'allowed' },
  ]) {
    expect((await validateSchema(schema, body)).issues).toBeUndefined();
    expect(descriptor(body)).toBe(true);
  }
  for (const body of [
    { project, workPackage },
    { project, steps },
    { project, workPackage: null, steps },
    { project, workPackage, steps: null },
    { project, workPackage: { ...workPackage, projectId: null }, steps },
    { project, workPackage, steps: [{ id: 42 }] },
    { project, workPackage: null, steps: null },
  ]) {
    expect((await validateSchema(schema, body)).issues).toBeDefined();
    expect(descriptor(body)).toBe(false);
  }
});

it('rejects partial null and authority-bearing first-package bodies', async () => {
  for (const workPackage of [
    null,
    [],
    {},
    { name: '' },
    { name: 42 },
    { name: 'Child', actor: 'other' },
    { name: 'Child', organizationId: 'other' },
    { name: 'Child', projectId: 'other' },
    { name: 'Child', grantId: 'other' },
  ])
    expect(
      (await validateSchema(createProject.body, { name: 'Plan', workPackage })).issues,
    ).toBeDefined();
});

it('accepts full and exact shell list entries without widening create rename or detail', async () => {
  const full = {
    id: 'full',
    organizationId: 'org',
    name: 'Full',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: null,
    workPackageCount: 0,
  };
  const shell = { id: 'shell', name: 'Shell' };
  const schema = listProjects.responses[0].schema;
  const validates = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true }).compile(
    schema.jsonSchema,
  );
  for (const body of [
    { projects: [full, shell] },
    { projects: [{ ...shell, futureHint: 'allowed' }] },
    { projects: [] },
  ]) {
    expect((await validateSchema<unknown>(schema, body)).issues).toBeUndefined();
    expect(validates(body)).toBe(true);
  }
  for (const shape of [createProject, renameProject, readProject])
    expect(
      (await validateSchema<unknown>(shape.responses[0].schema, { project: shell })).issues,
    ).toBeDefined();
});

it('rejects partial malformed and hybrid known metadata instead of falling through to the shell arm', async () => {
  const schema = listProjects.responses[0].schema;
  const validates = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true }).compile(
    schema.jsonSchema,
  );
  const full = {
    id: 'p',
    organizationId: 'org',
    name: 'Full',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: null,
    workPackageCount: 0,
  };
  for (const entry of [
    { id: 'p', name: '' },
    { id: 'p', name: 'Partial', revision: 0 },
    { ...full, createdAt: 'yesterday' },
    { ...full, workPackageCount: null },
    { id: 'p', name: 'Shell', workPackages: [] },
    { id: 'p', name: 'Shell', createdBy: null },
    { id: 'p', name: 'Shell', updatedAt: null },
    { id: 'p', name: 'Shell', organizationId: 'org' },
  ]) {
    const body = { projects: [entry] };
    expect((await validateSchema<unknown>(schema, body)).issues).toBeDefined();
    expect(validates(body)).toBe(false);
  }
});

it('declares the complete public permission catalogue for detail403 while keeping the actual read requirement precise', async () => {
  const refusals = readProject.refusals.filter(
    (refusal) =>
      refusal.status === 403 && JSON.stringify(refusal.schema.jsonSchema).includes('"forbidden"'),
  );
  expect(refusals).toHaveLength(1);
  const refusal = refusals.at(0);
  if (refusal === undefined) throw new Error('Project detail forbidden descriptor is absent');
  const validates = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true }).compile(
    refusal.schema.jsonSchema,
  );
  for (const { id } of PERMISSIONS) {
    const body = { error: 'forbidden', permission: id };
    expect((await validateSchema<unknown>(refusal.schema, body)).issues).toBeUndefined();
    expect(validates(body)).toBe(true);
  }
  expect(
    (
      await validateSchema<unknown>(refusal.schema, {
        error: 'forbidden',
        permission: 'project.teleport',
      })
    ).issues,
  ).toBeDefined();
  expect(
    (await validateSchema<unknown>(refusal.schema, { error: 'forbidden' })).issues,
  ).toBeDefined();
});
