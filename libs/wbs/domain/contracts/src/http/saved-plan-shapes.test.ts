import { expect, test } from 'bun:test';

import { documentFromShapes } from './document-from-shapes';
import {
  compareSavedPlans,
  deleteSavedPlan,
  listSavedPlans,
  readSavedPlan,
  renameSavedPlan,
  savePlan,
} from './saved-plan-shapes';
import { validateSchema } from './schema-shape';

const shapes = [
  savePlan,
  listSavedPlans,
  compareSavedPlans,
  readSavedPlan,
  renameSavedPlan,
  deleteSavedPlan,
] as const;

test('publishes six existing operation ids and required save/rename bodies with explicit media', () => {
  const document = documentFromShapes(shapes);
  expect(shapes.map((shape) => shape.operationId)).toEqual([
    'postApiProjectsByIdSaved-plans',
    'getApiProjectsByIdSaved-plans',
    'getApiProjectsByIdSaved-plansCompare',
    'getApiSaved-plansById',
    'patchApiSaved-plansById',
    'deleteApiSaved-plansById',
  ]);
  expect(document.paths['/api/projects/{id}/saved-plans']?.['post']?.requestBody).toMatchObject({
    required: true,
  });
  expect(
    Object.keys(
      document.paths['/api/projects/{id}/saved-plans']?.['post']?.requestBody?.content ?? {},
    ),
  ).toEqual(['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data']);
});

test('requires an object for save, permits its absent name, and requires rename name', async () => {
  expect(await validateSchema(savePlan.body, {})).toEqual({ value: {} });
  for (const body of [
    undefined,
    null,
    [],
    { name: '' },
    { name: null },
    { name: 3 },
    { name: 'ok', other: true },
  ]) {
    expect((await validateSchema(savePlan.body, body)).issues).toBeDefined();
    expect((await validateSchema(renameSavedPlan.body, body)).issues).toBeDefined();
  }
  expect((await validateSchema(renameSavedPlan.body, {})).issues).toBeDefined();
  expect(await validateSchema(savePlan.body, { name: '  ' })).toEqual({ value: { name: '  ' } });
});

test('creation requires creator identity while reads retain additional fields and exact stored bytes', async () => {
  const plan = {
    id: 's',
    projectId: 'p',
    name: 'N',
    createdBy: 'Ada',
    createdAt: 1,
    input: { schemaVersion: 1, bytes: '{  "historical": true }', sha256: 'digest' },
    schedule: { present: false as const, absentReason: 'future_reason' },
  };
  expect(
    (await validateSchema(savePlan.responses[0].schema, { savedPlan: plan })).issues,
  ).toBeDefined();
  const created = { savedPlan: { ...plan, createdById: null, extra: true } };
  expect(await validateSchema(savePlan.responses[0].schema, created)).toEqual({ value: created });
  const read = { savedPlan: { ...plan, audit: { newField: true } } };
  expect(await validateSchema(readSavedPlan.responses[0].schema, read)).toEqual({ value: read });
  expect(
    (
      await validateSchema(readSavedPlan.responses[0].schema, {
        savedPlan: { ...plan, schedule: { present: true } },
      })
    ).issues,
  ).toBeDefined();
});

test('comparison validates known metadata while preserving opaque historical differences', async () => {
  const reply = {
    left: {
      source: { kind: 'current' as const },
      schedule: { present: false as const, absentReason: 'pending' },
      provenance: { kind: 'legacy-unknown' as const },
    },
    right: {
      source: { kind: 'saved' as const, savedPlanId: 's' },
      schedule: { present: true as const, algorithmId: 'retired' },
      provenance: { kind: 'local' as const },
    },
    diff: {
      input: [
        { category: 'other' as const, path: 'old.field', left: { legacy: ['x'] }, right: null },
      ],
      schedule: [],
    },
  };
  expect(await validateSchema(compareSavedPlans.responses[0].schema, reply)).toEqual({
    value: reply,
  });
  expect(
    (
      await validateSchema(compareSavedPlans.responses[0].schema, {
        diff: { input: [{ category: 'invented', path: 'x', left: 1, right: 2 }], schedule: [] },
      })
    ).issues,
  ).toBeDefined();
  expect(
    (await validateSchema(compareSavedPlans.query, { left: 'current', right: 's', other: 'x' }))
      .issues,
  ).toBeDefined();
});

test('comparison requires both historical summaries even for an empty diff', async () => {
  const side = {
    source: { kind: 'saved' as const, savedPlanId: 's' },
    schedule: { present: false as const, absentReason: 'infeasible' },
    provenance: { kind: 'legacy-unknown' as const },
  };
  const reply = { diff: { input: [], schedule: [] }, left: side, right: side };
  expect(
    (await validateSchema(compareSavedPlans.responses[0].schema, reply)).issues,
  ).toBeUndefined();
  for (const key of ['left', 'right']) {
    const incomplete = { ...reply };
    Reflect.deleteProperty(incomplete, key);
    expect(
      (await validateSchema(compareSavedPlans.responses[0].schema, incomplete)).issues,
    ).toBeDefined();
  }
  for (const key of ['source', 'schedule', 'provenance']) {
    const incomplete = structuredClone(side);
    Reflect.deleteProperty(incomplete, key);
    expect(
      (await validateSchema(compareSavedPlans.responses[0].schema, { ...reply, left: incomplete }))
        .issues,
    ).toBeDefined();
  }
});

test('generated comparison document requires the side summaries for clients', () => {
  const document = documentFromShapes([compareSavedPlans]);
  expect(
    document.paths['/api/projects/{id}/saved-plans/compare']?.['get']?.responses['200'],
  ).toMatchObject({
    content: {
      'application/json': {
        schema: { required: ['diff', 'left', 'right'] },
      },
    },
  });
});
