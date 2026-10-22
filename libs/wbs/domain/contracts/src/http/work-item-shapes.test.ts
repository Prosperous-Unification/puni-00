import { expect, test } from 'bun:test';

import { validateSchema } from './schema-shape';
import { applyProjectCommands, commandParserRefusal, commandResults } from './work-item-shapes';

test('command replies reserve every known entity field across untagged variants', async () => {
  for (const entity of [
    { id: 'x', name: 'Name', kind: 1 },
    { id: 'x', name: 'Name', serviceIds: false },
  ])
    expect(
      (await validateSchema(commandResults, { results: [{ index: 0, entity }] })).issues,
    ).toBeDefined();
  expect(
    (
      await validateSchema(commandResults, {
        results: [{ index: 0, entity: { id: 'x', name: 'Name', future: true } }],
      })
    ).issues,
  ).toBeUndefined();
});

test('parser vocabulary is closed and preserves recognized command context', async () => {
  expect(
    (
      await validateSchema(commandParserRefusal, {
        error: 'number_is_derived',
        at: 0,
        kind: 'patchWorkItem',
      })
    ).issues,
  ).toBeUndefined();
  expect(
    (await validateSchema(commandParserRefusal, { error: 'invented_failure' })).issues,
  ).toBeDefined();
});

test('deadline refusal requires both fields in its exact status declaration', async () => {
  const refusal = applyProjectCommands.refusals.find((entry) => entry.status === 422);
  if (!refusal) throw new Error('Missing deadline declaration');
  const body = {
    error: 'deadline_before_project_start',
    at: 0,
    kind: 'patchWorkItem',
    workItemId: 'w',
    projectDayZero: '2026-09-07',
  };
  expect((await validateSchema(refusal.schema, body)).issues).toBeUndefined();
  const { projectDayZero, ...missing } = body;
  expect((await validateSchema(refusal.schema, missing)).issues).toBeDefined();
});

test('prerequisite refusal preserves indexed command context and resolved identities', async () => {
  const refusals = applyProjectCommands.refusals.filter((entry) => entry.status === 409);
  const body = {
    error: 'prerequisites_unmet',
    at: 1,
    kind: 'claimWorkItem',
    stepIds: ['target'],
    blockers: [
      {
        workItemId: 'remote',
        stepId: 'build',
        type: 'FS',
        provenance: 'authored',
        relationshipId: 'dependency',
      },
    ],
  };
  const readings = await Promise.all(
    refusals.map((refusal) => validateSchema(refusal.schema, body)),
  );
  expect(readings.some((reading) => reading.issues === undefined)).toBe(true);
  const { blockers: _blockers, ...missing } = body;
  const incomplete = await Promise.all(
    refusals.map((refusal) => validateSchema(refusal.schema, missing)),
  );
  expect(incomplete.every((reading) => reading.issues !== undefined)).toBe(true);
});
