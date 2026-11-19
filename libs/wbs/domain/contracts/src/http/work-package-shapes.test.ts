import { expect, test } from 'bun:test';

import { documentFromShapes } from './document-from-shapes';
import { validateSchema } from './schema-shape';
import { workPackageWithSteps } from './work-package-response';
import {
  createWorkPackage,
  exportWorkPackage,
  listWorkPackages,
  patchWorkPackage,
  readWorkPackage,
  recordWorkPackageOpen,
  retryWorkPackageOptimization,
} from './work-package-shapes';

const shapes = [
  createWorkPackage,
  listWorkPackages,
  recordWorkPackageOpen,
  exportWorkPackage,
  readWorkPackage,
  patchWorkPackage,
  retryWorkPackageOptimization,
] as const;

test('preserves seven operation ids and declares both export representations without undo flags', () => {
  expect(shapes.map((shape) => shape.operationId)).toEqual([
    'postApiWorkPackages',
    'getApiWorkPackages',
    'postApiWorkPackagesByIdOpened',
    'getApiWorkPackagesByIdExport',
    'getApiWorkPackagesById',
    'patchApiWorkPackagesById',
    'postApiWorkPackagesByIdOptimizationRetry',
  ]);
  expect(createWorkPackage.responses[0].schema).toBe(workPackageWithSteps);
  expect(readWorkPackage.responses[0].schema).toBe(workPackageWithSteps);
  const document = documentFromShapes(shapes);
  const content =
    document.paths['/api/work-packages/{id}/export']?.['get']?.responses['200']?.content;
  expect(Object.keys(content ?? {})).toEqual(['application/json', 'text/markdown; charset=utf-8']);
  const schema = content?.['application/json']?.schema;
  expect(schema).toHaveProperty('anyOf');
  if (schema === undefined || !('anyOf' in schema))
    throw new Error('export response must declare versioned document arms');
  expect(schema.anyOf).toHaveLength(2);
  const armsByVersion = new Map(
    schema.anyOf.map((arm) => [
      (arm as { properties?: { document?: { properties?: { version?: { const?: unknown } } } } })
        .properties?.document?.properties?.version?.const,
      arm,
    ]),
  );
  expect(armsByVersion.size).toBe(2);
  for (const version of [15, 16]) {
    const arm = armsByVersion.get(version);
    expect(arm).toMatchObject({
      type: 'object',
      properties: {
        document: {
          properties: { format: { const: 'wbs-plan' }, version: { const: version } },
          required: ['exportedAt', 'format', 'version'],
        },
        workPackage: { type: 'object' },
        workItems: { type: 'array' },
      },
    });
    expect(arm).not.toHaveProperty('properties.undoable');
    expect(arm).not.toHaveProperty('properties.redoable');
  }
  expect(document.paths['/api/work-packages/{id}']?.['patch']?.requestBody).toMatchObject({
    required: true,
  });
});

test('declares the Retry request and every established wire outcome', async () => {
  expect(
    await validateSchema(retryWorkPackageOptimization.body, {
      objective: 'pri',
      inputHash: 'held-hash',
    }),
  ).toEqual({ value: { objective: 'pri', inputHash: 'held-hash' } });
  for (const body of [{ objective: 'quickest', inputHash: 'held-hash' }, { objective: 'pri' }])
    expect((await validateSchema(retryWorkPackageOptimization.body, body)).issues).toBeDefined();
  expect(
    await validateSchema(retryWorkPackageOptimization.body, {
      objective: 'pri',
      inputHash: 'held-hash',
      extra: true,
    }),
  ).toEqual({ value: { objective: 'pri', inputHash: 'held-hash' } });
  expect(retryWorkPackageOptimization.responses.map(({ status }) => status)).toEqual([202]);
  expect(retryWorkPackageOptimization.refusals.map(({ status }) => status)).toContain(409);
  const operation = documentFromShapes([retryWorkPackageOptimization]).paths[
    '/api/work-packages/{id}/optimization/retry'
  ]?.['post'];
  expect(operation?.operationId).toBe('postApiWorkPackagesByIdOptimizationRetry');
  expect(operation?.responses).toHaveProperty('202');
  expect(operation?.responses).toHaveProperty('409');
});

test('allows empty names and empty patches while rejecting unknown nested fields', async () => {
  expect(await validateSchema(createWorkPackage.body, { name: '', projectId: 'parent' })).toEqual({
    value: { name: '', projectId: 'parent' },
  });
  expect(await validateSchema(patchWorkPackage.body, {})).toEqual({ value: {} });
  for (const body of [
    undefined,
    null,
    [],
    { extra: 1 },
    { pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1, extra: 1 } },
    { solutionRef: { slug: 's', url: 'u', extra: 1 } },
  ])
    expect((await validateSchema(patchWorkPackage.body, body)).issues).toBeDefined();
  expect(
    (await validateSchema(createWorkPackage.body, { name: 'n', projectId: 'parent', extra: 1 }))
      .issues,
  ).toBeDefined();
});

test('keeps structural and semantic settings rules distinct', async () => {
  const semantic = {
    startDate: '2026-02-31',
    pertWeights: { optimistic: 0, realistic: 0, pessimistic: 0 },
    solutionRef: { slug: 's', url: 'not-a-url' },
  };
  expect(await validateSchema(patchWorkPackage.body, semantic)).toEqual({ value: semantic });
  expect(
    await validateSchema(patchWorkPackage.body, { startDate: null, solutionRef: null }),
  ).toEqual({
    value: { startDate: null, solutionRef: null },
  });
  for (const body of [
    { startDate: 'notaday' },
    { pertWeights: { optimistic: Infinity, realistic: 4, pessimistic: 1 } },
    { pertWeights: { optimistic: -1, realistic: 4, pessimistic: 1 } },
    { scheduleEngine: 'future' },
    { scheduleObjective: 'future' },
    { optimizationEnabled: 'true' },
  ])
    expect((await validateSchema(patchWorkPackage.body, body)).issues).toBeDefined();
});
