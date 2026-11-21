import { expect, test } from 'bun:test';

import { documentFromShapes } from './document-from-shapes';
import { validateSchema } from './schema-shape';
import * as stepShapes from './step-shapes';
import { patchWorkPackageStepValues } from './step-shapes';

test('exports only the current package values operation and compatible response shape', () => {
  expect(Object.keys(stepShapes).sort()).toEqual(['patchWorkPackageStepValues', 'stepShape']);
});

test('documents the current addressed values request without definition or cascade operations', () => {
  const document = documentFromShapes([patchWorkPackageStepValues]);
  const path = document.paths['/api/work-packages/{id}/steps/{stepId}'];
  expect(path?.['patch']?.operationId).toBe('patchWorkPackageStepValues');
  expect(document.paths['/api/work-packages/{id}/steps']).toBeUndefined();
  expect(path?.['delete']).toBeUndefined();
  const patch = path?.['patch'];
  expect(patch?.requestBody?.content['application/json']?.schema).toMatchObject({
    type: 'object',
    properties: {
      estimateUnit: { enum: ['minutes', 'workdays'] },
      allowanceBps: { type: 'integer', minimum: 0, maximum: 100000 },
    },
    additionalProperties: false,
  });
  expect(patch?.parameters).toEqual([
    { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    { in: 'path', name: 'stepId', required: true, schema: { type: 'string' } },
  ]);
});

test('closes package values to exact allowance basis points and supported units', async () => {
  const body = patchWorkPackageStepValues.body;
  expect(
    (await validateSchema(body, { allowanceBps: 1234, estimateUnit: 'minutes' })).issues,
  ).toBeUndefined();
  for (const supplied of [
    { name: 'Global rename' },
    { allowancePercent: 30 },
    { allowanceBps: 1234, extra: true },
    { allowanceBps: 1.5 },
    { allowanceBps: -1 },
    { allowanceBps: 100001 },
    { estimateUnit: 'hours' },
  ])
    expect((await validateSchema(body, supplied)).issues).toBeDefined();
});

test('retains the compatible step response on the current values operation', () => {
  const document = documentFromShapes([patchWorkPackageStepValues]);
  expect(
    document.paths['/api/work-packages/{id}/steps/{stepId}']?.['patch']?.responses['200']
      ?.content?.['application/json']?.schema,
  ).toMatchObject({
    properties: {
      step: {
        properties: {
          id: { type: 'string' },
          workPackageId: { type: 'string' },
          name: { type: 'string' },
          position: { type: 'number' },
          code: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          allowancePercent: { type: 'number' },
          estimateUnit: { enum: ['minutes', 'workdays'] },
        },
        required: ['id', 'name', 'position', 'workPackageId'],
      },
    },
  });
});

test('still reads a step from a be-01 that predates step codes', async () => {
  const older = {
    step: {
      id: 'step',
      workPackageId: 'work_package',
      name: 'Dev',
      position: 10,
      estimateUnit: 'workdays' as const,
    },
  };
  const reply = patchWorkPackageStepValues.responses[0].schema;

  expect(await validateSchema(reply, older)).toEqual({ value: older });
  const uncoded = { step: { ...older.step, code: null } };
  expect(await validateSchema(reply, uncoded)).toEqual({ value: uncoded });
  expect((await validateSchema(reply, { step: { ...older.step, code: 7 } })).issues).toBeDefined();
});

/**
 * Proof: with `allowancePercent` required, this failed on `must have required
 * property 'allowancePercent'`; watched 2026-09-27.
 */
test('still reads a step from a be-01 that predates step allowances', async () => {
  const older = {
    step: {
      id: 'step',
      workPackageId: 'work_package',
      name: 'Dev',
      position: 10,
      estimateUnit: 'workdays' as const,
      code: 'dev',
    },
  };
  const reply = patchWorkPackageStepValues.responses[0].schema;

  expect(await validateSchema(reply, older)).toEqual({ value: older });
  const current = { step: { ...older.step, allowancePercent: 30 } };
  expect(await validateSchema(reply, current)).toEqual({ value: current });
  expect(
    (await validateSchema(reply, { step: { ...older.step, allowancePercent: '30' } })).issues,
  ).toBeDefined();
});

test('reads a pre-unit backend as the historical workday protocol and refuses malformed present units', async () => {
  const reply = patchWorkPackageStepValues.responses[0].schema;
  const older = { step: { id: 'step', workPackageId: 'work_package', name: 'Dev', position: 10 } };
  expect((await validateSchema(reply, older)).issues).toBeUndefined();
  expect(
    (await validateSchema(reply, { step: { ...older.step, estimateUnit: 'hours' } })).issues,
  ).toBeDefined();
});
