import { expect, test } from 'bun:test';

import type { ClientReply } from './client-types';
import { documentFromShapes } from './document-from-shapes';
import { importWorkPackage } from './import-shapes';
import { validateSchema } from './schema-shape';

type ImportSummary = Extract<ClientReply<typeof importWorkPackage>, { kind: 'success' }>['body'];

/** Compile-only fixtures exercise the generated import response at its client boundary. */
export function importSummaryTypeFixtures(): void {
  const _incompleteCreatedSummary: ImportSummary = {
    workPackageId: 'work-package-1',
    rows: 3,
    // Proof: making createdNames.externalSystems optional produced TS2578 here.
    // @ts-expect-error Created summaries name every directory kind, including external systems.
    created: { teams: [], people: [], tags: [], services: [], types: [] },
    solutionRef: 'none',
  };
}

test('declares the plan import shape and complete typed outcomes', async () => {
  expect(importWorkPackage).toMatchObject({
    method: 'POST',
    path: '/api/work-packages/import',
    operationId: 'postApiWorkPackagesImport',
    policies: [
      { kind: 'organization-resource', operation: 'mutation' },
      { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
      { kind: 'identity', require: 'write-scope' },
    ],
    bodyMedia: ['application/json'],
  });
  expect(importWorkPackage.responses.map(({ status }) => status)).toEqual([201]);
  expect(importWorkPackage.refusals.map(({ status }) => status)).toEqual([
    409, 400, 422, 404, 400, 401, 403, 403, 409, 403, 409, 409, 409, 409, 409,
  ]);
  const limit = importWorkPackage.refusals[12];
  const crossed = { error: 'agent_person_limit' as const, cap: 8, current: 6, added: 3 };
  expect(await validateSchema<unknown>(limit.schema, crossed)).toEqual({ value: crossed });
  expect(
    (await validateSchema<unknown>(limit.schema, { ...crossed, added: '3' })).issues,
  ).toBeDefined();
  const capacityLimit = importWorkPackage.refusals[13];
  const statedPast = {
    error: 'capacity_limit' as const,
    resourceId: 'ram',
    cap: 64,
    declared: 0,
    asked: 70,
  };
  expect(await validateSchema<unknown>(capacityLimit.schema, statedPast)).toEqual({
    value: statedPast,
  });
  expect(
    (await validateSchema<unknown>(capacityLimit.schema, { ...statedPast, declared: undefined }))
      .issues,
  ).toBeDefined();

  const operation = documentFromShapes([importWorkPackage]).paths['/api/work-packages/import']?.[
    'post'
  ];
  expect(operation?.operationId).toBe('postApiWorkPackagesImport');
  expect(Object.keys(operation?.responses ?? {}).sort()).toEqual([
    '201',
    '400',
    '401',
    '403',
    '404',
    '409',
    '422',
  ]);
  const malformedSchema = operation?.responses['400']?.content?.['application/json']?.schema;
  if (malformedSchema === undefined || !('anyOf' in malformedSchema))
    throw new Error('import400 schema must declare both refusal arms');
  expect(malformedSchema.anyOf).toHaveLength(2);
  expect(malformedSchema.anyOf[0]).toMatchObject({
    type: 'object',
    properties: { error: { const: 'invalid_json' } },
    required: ['error'],
  });
  expect(malformedSchema.anyOf[1]).toMatchObject({
    type: 'object',
    required: ['detail', 'error', 'path'],
  });

  const summary = {
    workPackageId: 'work-package-1',
    rows: 3,
    created: {
      teams: ['Billing'],
      people: [],
      tags: [],
      services: [],
      types: [],
      externalSystems: [],
    },
    solutionRef: 'kept' as const,
  };
  expect(await validateSchema(importWorkPackage.responses[0].schema, summary)).toEqual({
    value: summary,
  });
  expect(
    (await validateSchema(importWorkPackage.responses[0].schema, { ...summary, rows: undefined }))
      .issues,
  ).toBeDefined();
});

test('declares the opaque inherited budget-factor import conflict and rejects a wrong or absent key', async () => {
  const accepted = async (body: unknown) => {
    const matching: unknown[] = [];
    for (const refusal of importWorkPackage.refusals) {
      if (refusal.status !== 409) continue;
      const checked = await validateSchema<unknown>(refusal.schema, body);
      if (checked.issues === undefined) matching.push(checked.value);
    }
    return matching;
  };
  const body = { error: 'import_settings_conflict', key: 'budgetFactor' };
  expect(await accepted(body)).toEqual([body]);
  expect(await accepted({ error: 'import_settings_conflict', key: 'timezone' })).toEqual([]);
  expect(await accepted({ error: 'import_settings_conflict' })).toEqual([]);
});
