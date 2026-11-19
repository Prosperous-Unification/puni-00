import { expect, test } from 'bun:test';

import { documentFromShapes } from './document-from-shapes';
import { validateSchema } from './schema-shape';
import { readSolution } from './solution-shapes';
import { workPackageWithSteps } from './work-package-response';

const response = {
  workPackage: {
    id: 'work_package',
    name: 'Plan',
    abbreviation: 'PLAN',
    projectId: 'solution-parent',
    restricted: true,
    estimateMethod: 'pert' as const,
    depReach: 'anchor-slice' as const,
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'ceil' as const,
    startDate: '2026-09-06',
    solutionRef: { slug: 'solution', url: 'https://example.com/solution' },
    revision: 2,
    createdAt: 1,
    optimizationEnabled: true,
    scheduleEngine: 'optimized' as const,
    scheduleObjective: 'time' as const,
  },
  steps: [
    {
      id: 'step',
      workPackageId: 'work_package',
      name: 'Build',
      position: 10,
      code: 'build',
      allowancePercent: 0,
      estimateUnit: 'workdays' as const,
    },
  ],
};

test('emits the existing solution operation and required slug plus complete work package response', () => {
  const operation = documentFromShapes([readSolution]).paths['/plans/by-solution/{slug}']?.['get'];
  expect(operation?.operationId).toBe('getPlansBy-solutionBySlug');
  expect(operation?.parameters).toEqual([
    { in: 'path', name: 'slug', required: true, schema: { type: 'string' } },
  ]);
  expect(operation?.responses['200']?.content?.['application/json']?.schema).toMatchObject({
    properties: {
      workPackage: { required: Object.keys(response.workPackage).sort() },
      steps: { items: { required: ['id', 'name', 'position', 'workPackageId'] } },
    },
  });
});

test('validates every required work package and step field without stripping additive properties', async () => {
  expect((await validateSchema(workPackageWithSteps, response)).issues).toBeUndefined();
  for (const field of Object.keys(response.workPackage)) {
    const workPackage = Object.fromEntries(
      Object.entries(response.workPackage).filter(([key]) => key !== field),
    );
    expect(
      (await validateSchema(workPackageWithSteps, { ...response, workPackage })).issues,
    ).toBeDefined();
  }
  for (const [field, value] of [
    ['estimateMethod', 'guess'],
    ['depReach', 'all'],
    ['estimateRounding', 'truncate'],
    ['scheduleEngine', 'slow'],
    ['scheduleObjective', 'cost'],
  ] as const) {
    expect(
      (
        await validateSchema(workPackageWithSteps, {
          ...response,
          workPackage: { ...response.workPackage, [field]: value },
        })
      ).issues,
    ).toBeDefined();
  }
  expect(
    (
      await validateSchema(workPackageWithSteps, {
        ...response,
        steps: [{ id: 'step', name: 'Build', position: 10 }],
      })
    ).issues,
  ).toBeDefined();
  const enriched = {
    ...response,
    workPackage: { ...response.workPackage, createdBy: 'owner' },
    steps: response.steps.map((step) => ({ ...step, updatedAt: 3 })),
  };
  expect(await validateSchema(workPackageWithSteps, enriched)).toEqual({ value: enriched });
  expect((await validateSchema(readSolution.params, {})).issues).toBeDefined();
  expect(
    (await validateSchema(readSolution.params, { slug: 'solution', extra: 'x' })).issues,
  ).toBeDefined();
});
