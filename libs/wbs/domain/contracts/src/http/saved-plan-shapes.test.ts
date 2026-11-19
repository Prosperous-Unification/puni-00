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
    'postApiWorkPackagesByIdSaved-plans',
    'getApiWorkPackagesByIdSaved-plans',
    'getApiWorkPackagesByIdSaved-plansCompare',
    'getApiSaved-plansById',
    'patchApiSaved-plansById',
    'deleteApiSaved-plansById',
  ]);
  expect(
    document.paths['/api/work-packages/{id}/saved-plans']?.['post']?.requestBody,
  ).toMatchObject({
    required: true,
  });
  expect(
    Object.keys(
      document.paths['/api/work-packages/{id}/saved-plans']?.['post']?.requestBody?.content ?? {},
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
    workPackageId: 'p',
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
      parent: { kind: 'recorded' as const, projectId: 'current-parent' },
      schedule: { present: false as const, absentReason: 'pending' },
      provenance: { kind: 'legacy-unknown' as const },
    },
    right: {
      source: { kind: 'saved' as const, savedPlanId: 's' },
      parent: { kind: 'unrecorded' as const },
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
    parent: { kind: 'unrecorded' as const },
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
  for (const key of ['source', 'parent', 'schedule', 'provenance']) {
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
    document.paths['/api/work-packages/{id}/saved-plans/compare']?.['get']?.responses['200'],
  ).toMatchObject({
    content: {
      'application/json': {
        schema: { required: ['diff', 'left', 'right'] },
      },
    },
  });
});

function capturedComparisonReply() {
  return {
    left: {
      source: { kind: 'saved', savedPlanId: 'old' },
      parent: { kind: 'unrecorded' },
      schedule: { present: false, absentReason: 'pending' },
      provenance: { kind: 'local' },
    },
    right: {
      source: { kind: 'current' },
      parent: { kind: 'recorded', projectId: 'actual-parent' },
      schedule: { present: false, absentReason: 'pending' },
      provenance: { kind: 'local' },
    },
    diff: { input: [], schedule: [] },
  };
}

test('comparison requires parent evidence on both sides even with an empty diff', async () => {
  const reply = capturedComparisonReply();
  expect(
    (await validateSchema(compareSavedPlans.responses[0].schema, reply)).issues,
  ).toBeUndefined();
  for (const which of ['left', 'right'] as const) {
    const incomplete = structuredClone(reply);
    Reflect.deleteProperty(incomplete[which], 'parent');
    expect(
      (await validateSchema(compareSavedPlans.responses[0].schema, incomplete)).issues,
    ).toBeDefined();
  }
});

test('comparison refuses malformed recorded parent evidence instead of inferring it', async () => {
  for (const parent of [
    null,
    {},
    { kind: 'future' },
    { kind: 'recorded' },
    { kind: 'recorded', projectId: null },
    { kind: 'recorded', projectId: '' },
  ]) {
    const reply = capturedComparisonReply();
    const malformed = { ...reply, right: { ...reply.right, parent } };
    expect(
      (await validateSchema(compareSavedPlans.responses[0].schema, malformed)).issues,
    ).toBeDefined();
  }
});

test('comparison accepts retired-field differences while unknown categories still refuse', async () => {
  const reply = capturedComparisonReply();
  const difference = {
    category: 'retired-field',
    path: 'workPackage.ownerId',
    left: null,
    right: 'former-owner',
  };
  const retired = { ...reply, diff: { input: [difference], schedule: [] } };
  expect(await validateSchema<unknown>(compareSavedPlans.responses[0].schema, retired)).toEqual({
    value: retired,
  });
  expect(
    (
      await validateSchema(compareSavedPlans.responses[0].schema, {
        ...retired,
        diff: { input: [{ ...difference, category: 'future-category' }], schedule: [] },
      })
    ).issues,
  ).toBeDefined();
});
