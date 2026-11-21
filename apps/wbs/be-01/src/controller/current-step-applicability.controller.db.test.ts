import { applyWorkPackageCommands, type PlanCommandWire, validateSchema } from '@wbs/contracts';
import type { PlanCommand } from '@wbs/core';
import { formatStepNodeId } from '@wbs/domain';
import { expect, test } from 'bun:test';

import {
  PACKAGE_STEP_SEED,
  type PackageStepFixture,
  withinPackageSteps,
} from '../testing/package-step-values-fixture';

const { workPackageId, stepId, foreignStepId } = PACKAGE_STEP_SEED;

/** Authors the measure through real scoped directory admission before any leaf command. */
async function withinApplicability(exercise: (fixture: PackageStepFixture) => Promise<void>) {
  await withinPackageSteps(async (fixture) => {
    fixture.harness.grant('org-a', 'manager', 'org-admin');
    expect(
      await fixture.harness.call('manager', 'POST', '/api/directory/commands', {
        commands: [
          {
            kind: 'createMeasure',
            ref: 'effort',
            key: 'applicability_effort',
            name: 'Applicability effort',
            unit: 'points',
            measureKind: 'count',
            scale: 'integer',
            threePoint: true,
          },
        ],
      }),
    ).toMatchObject({ status: 200 });
    await exercise(fixture);
  });
}

/** Requires the actual create response before addressing this fixture's leaf. */
async function createLeaf(fixture: PackageStepFixture) {
  const answer = await fixture.harness.call(
    'manager',
    'POST',
    `/api/work-packages/${workPackageId}/commands`,
    {
      commands: [
        {
          kind: 'createWorkItem',
          ref: 'leaf',
          parentId: null,
          afterId: null,
          name: 'Current applicability leaf',
        },
      ],
    },
  );
  expect(answer.status).toBe(200);
  const checked = await validateSchema(applyWorkPackageCommands.responses[0].schema, answer.body);
  if (checked.issues !== undefined) throw new Error('Applicability create response is malformed');
  const id = checked.value.results[0]?.id;
  if (id === undefined) throw new Error('Applicability create response has no leaf identity');
  return id;
}

/** Uses the fixture's persisted organization grant and the binding's actual stored scope. */
async function unbind(fixture: PackageStepFixture) {
  const binding = fixture.harness.sqlite
    .query<{ id: string }, [string]>(
      "SELECT id FROM step_binding WHERE step_id=? AND scope_kind='organization' AND scope_id='org-a'",
    )
    .get(stepId);
  if (binding === null) throw new Error('Applicability fixture binding is missing');
  const before = fixture.harness.sqlite
    .query('SELECT * FROM work_package_step ORDER BY work_package_id,step_id')
    .all();
  expect(
    await fixture.harness.call(
      'manager',
      'DELETE',
      '/api/organization/step-bindings/' + binding.id,
      { dryRun: false },
    ),
  ).toEqual({ status: 204, body: null });
  expect(
    fixture.harness.sqlite
      .query('SELECT * FROM work_package_step ORDER BY work_package_id,step_id')
      .all(),
  ).toEqual(before);
  expect(
    fixture.harness.sqlite.query('SELECT id FROM step_binding WHERE id=?').all(binding.id),
  ).toEqual([]);
}

/** A real typed binding keeps this identity in the package union, excluding the untyped leaf. */
async function bindOtherType(fixture: PackageStepFixture) {
  const typeId = 'applicability-other-type';
  fixture.harness.sqlite.run('INSERT INTO work_item_type(id,name) VALUES(?,?)', [typeId, typeId]);
  fixture.harness.sqlite.run(
    'INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES(?,?,?)',
    [typeId, 'org-a', typeId],
  );
  expect(
    await fixture.harness.call('manager', 'POST', '/api/organization/step-bindings', {
      stepId,
      scopeKind: 'organization',
      scopeId: 'org-a',
      workItemTypeId: typeId,
      position: 10,
    }),
  ).toMatchObject({ status: 201 });
  const read = await fixture.harness.call('manager', 'GET', `/api/work-packages/${workPackageId}`);
  expect(read.status).toBe(200);
  expect(read.body).toMatchObject({ steps: [{ id: stepId }] });
}

/** Authored persisted conflict exercises the current receiver; it is not old-producer evidence. */
function conflictTypes(fixture: PackageStepFixture, leafId: string) {
  const typeId = 'applicability-second-type';
  fixture.harness.sqlite.run('INSERT INTO work_item_type(id,name) VALUES(?,?)', [typeId, typeId]);
  fixture.harness.sqlite.run(
    'INSERT INTO work_item_type_organization(resource_id,organization_id,name) VALUES(?,?,?)',
    [typeId, 'org-a', typeId],
  );
  for (const selected of ['applicability-other-type', typeId])
    fixture.harness.sqlite.run(
      'INSERT INTO work_item_work_item_type(work_item_id,type_id) VALUES(?,?)',
      [leafId, selected],
    );
}

/** Records real stored facts and immutable/mutable history after configuration admission. */
function snapshot(fixture: PackageStepFixture) {
  const sqlite = fixture.harness.sqlite;
  return {
    rows: sqlite.query('SELECT * FROM work_item ORDER BY id').all(),
    types: sqlite
      .query('SELECT * FROM work_item_work_item_type ORDER BY work_item_id,type_id')
      .all(),
    estimates: sqlite.query('SELECT * FROM estimate ORDER BY work_item_id,step_id').all(),
    actuals: sqlite.query('SELECT * FROM actual ORDER BY work_item_id,step_id').all(),
    progress: sqlite.query('SELECT * FROM step_progress ORDER BY work_item_id,step_id').all(),
    measures: sqlite.query('SELECT * FROM step_measure ORDER BY work_item_id,step_id').all(),
    measureEstimates: sqlite
      .query('SELECT * FROM measure_estimate ORDER BY work_item_id,step_id')
      .all(),
    attempts: sqlite
      .query('SELECT * FROM step_node_attempt ORDER BY work_item_id,step_id,attempt_number')
      .all(),
    issued: sqlite
      .query('SELECT * FROM step_node_attempt_issued ORDER BY work_item_id,step_id')
      .all(),
    assignees: sqlite.query('SELECT * FROM assignment ORDER BY work_item_id,step_id').all(),
    claims: sqlite.query('SELECT * FROM claim ORDER BY id').all(),
    typedDependencies: sqlite.query('SELECT * FROM typed_dependency ORDER BY id').all(),
    externalDependencies: sqlite.query('SELECT * FROM external_dependency ORDER BY id').all(),
    blockages: sqlite.query('SELECT * FROM step_blockage ORDER BY work_item_id,step_id').all(),
    parallel: sqlite.query('SELECT * FROM step_parallel ORDER BY work_item_id,step_id').all(),
    journal: sqlite.query('SELECT * FROM command_journal ORDER BY seq').all(),
    events: sqlite.query('SELECT * FROM plan_event ORDER BY id').all(),
    pushes: [...fixture.pushes],
  };
}

// Proof: omitting the startAttempt recipe failed the actual compiler with
// TS2741 (missing required command fixture), without changing this source;
// watched 2026-11-20. Pair-only subtree assignment is exercised separately.
type PointKind = Exclude<
  Extract<PlanCommand, { stepId: string }>['kind'],
  'assignSubtree' | 'setStepAllowance'
>;

const commands = Object.values({
  setEstimate: { kind: 'setEstimate', days: { optimistic: 1, realistic: 2, pessimistic: 3 } },
  clearEstimate: { kind: 'clearEstimate' },
  setActual: { kind: 'setActual', days: 1 },
  clearActual: { kind: 'clearActual' },
  setProgress: { kind: 'setProgress', state: 'in_progress' },
  clearProgress: { kind: 'clearProgress' },
  setAssignee: { kind: 'setAssignee', personId: null },
  setStepBlocked: { kind: 'setStepBlocked', isBlocked: false },
  setMeasure: { kind: 'setMeasure', metric: 'applicability_effort', value: 2 },
  clearMeasure: { kind: 'clearMeasure', metric: 'applicability_effort' },
  setMeasureEstimate: {
    kind: 'setMeasureEstimate',
    measure: 'applicability_effort',
    estimate: { optimistic: 1, realistic: 2, pessimistic: 3 },
  },
  clearMeasureEstimate: { kind: 'clearMeasureEstimate', measure: 'applicability_effort' },
  startAttempt: { kind: 'startAttempt' },
  endAttempt: { kind: 'endAttempt', outcome: 'succeeded' },
  removeAttempt: { kind: 'removeAttempt', attemptNumber: 1 },
} as const satisfies { readonly [Kind in PointKind]: Extract<PlanCommandWire, { kind: Kind }> });

for (const addressing of ['pair', 'node'] as const) {
  for (const configuration of ['unbound', 'other-type', 'conflict'] as const) {
    for (const command of commands) {
      test(`current ${addressing} ${command.kind} distinguishes an owned ${configuration} step from absent and foreign steps`, async () => {
        await withinApplicability(async (fixture) => {
          const leafId = await createLeaf(fixture);
          await unbind(fixture);
          if (configuration !== 'unbound') await bindOtherType(fixture);
          if (configuration === 'conflict') conflictTypes(fixture, leafId);
          const before = snapshot(fixture);
          for (const [address, status, error] of [
            [
              stepId,
              configuration === 'conflict' ? 409 : 422,
              configuration === 'conflict' ? 'type_conflict' : 'step_not_resolved',
            ],
            ['c2000000-0000-4000-8000-000000000003', 404, 'unknown_step'],
            [foreignStepId, 404, 'unknown_step'],
          ] as const) {
            const stated: PlanCommandWire =
              addressing === 'pair'
                ? { ...command, workItemId: leafId, stepId: address }
                : {
                    ...command,
                    stepNodeId: formatStepNodeId({ workItemId: leafId, stepId: address }),
                  };
            expect(
              await fixture.harness.call(
                'manager',
                'POST',
                `/api/work-packages/${workPackageId}/commands`,
                { commands: [stated] },
              ),
            ).toEqual({ status, body: { error, at: 0, kind: command.kind } });
            expect(snapshot(fixture)).toEqual(before);
          }
        });
      }, 60000);
    }
  }
}

for (const addressing of ['pair', 'node'] as const) {
  test(`current ${addressing} resolved point commands retain their actual write and clear behavior`, async () => {
    await withinApplicability(async (fixture) => {
      const leafId = await createLeaf(fixture);
      for (const command of commands) {
        const answer = await fixture.harness.call(
          'manager',
          'POST',
          `/api/work-packages/${workPackageId}/commands`,
          {
            commands: [
              addressing === 'pair'
                ? { ...command, workItemId: leafId, stepId }
                : { ...command, stepNodeId: formatStepNodeId({ workItemId: leafId, stepId }) },
            ],
          },
        );
        expect(answer.status).toBe(200);
        const checked = await validateSchema(
          applyWorkPackageCommands.responses[0].schema,
          answer.body,
        );
        expect(checked.issues).toBeUndefined();
      }
      const final = snapshot(fixture);
      expect(final.estimates).toEqual([]);
      expect(final.actuals).toEqual([]);
      expect(final.progress).toEqual([]);
      expect(final.assignees).toEqual([]);
      expect(final.measures).toEqual([]);
      expect(final.measureEstimates).toEqual([]);
      expect(final.attempts).toEqual([]);
      expect(final.issued).toMatchObject([{ work_item_id: leafId, step_id: stepId, issued: 1 }]);
      expect(final.journal.length).toBeGreaterThan(1);
    });
  }, 60000);
}

for (const addressing of ['pair', 'node'] as const) {
  test(`current ${addressing} inapplicable clear rolls back the preceding rename and all history`, async () => {
    await withinApplicability(async (fixture) => {
      const leafId = await createLeaf(fixture);
      await unbind(fixture);
      await bindOtherType(fixture);
      const before = snapshot(fixture);
      const answer = await fixture.harness.call(
        'manager',
        'POST',
        `/api/work-packages/${workPackageId}/commands`,
        {
          commands: [
            { kind: 'patchWorkItem', workItemId: leafId, patch: { name: 'Must roll back' } },
            addressing === 'pair'
              ? { kind: 'clearActual', workItemId: leafId, stepId }
              : {
                  kind: 'clearActual',
                  stepNodeId: formatStepNodeId({ workItemId: leafId, stepId }),
                },
          ],
        },
      );
      expect({ answer, frame: snapshot(fixture) }).toEqual({
        answer: { status: 422, body: { error: 'step_not_resolved', at: 1, kind: 'clearActual' } },
        frame: before,
      });
    });
  }, 60000);
}

test('current parent clears preserve pair no-ops and refuse addressed leaf-node writes', async () => {
  await withinApplicability(async (fixture) => {
    const parentId = await createLeaf(fixture);
    const created = await fixture.harness.call(
      'manager',
      'POST',
      `/api/work-packages/${workPackageId}/commands`,
      {
        commands: [
          { kind: 'createWorkItem', ref: 'child', name: 'Child', parentId, afterId: null },
        ],
      },
    );
    expect(created.status).toBe(200);
    for (const kind of ['clearEstimate', 'clearActual', 'clearProgress'] as const) {
      expect(
        (
          await fixture.harness.call(
            'manager',
            'POST',
            `/api/work-packages/${workPackageId}/commands`,
            {
              commands: [{ kind, workItemId: parentId, stepId }],
            },
          )
        ).status,
      ).toBe(200);
      expect(
        await fixture.harness.call(
          'manager',
          'POST',
          `/api/work-packages/${workPackageId}/commands`,
          {
            commands: [{ kind, stepNodeId: formatStepNodeId({ workItemId: parentId, stepId }) }],
          },
        ),
      ).toEqual({ status: 409, body: { error: 'rolled_up', at: 0, kind } });
    }
  });
}, 60000);

for (const configuration of ['unbound', 'other-type', 'conflict'] as const) {
  test(`current pair assignSubtree distinguishes an owned ${configuration} step from absent and foreign steps`, async () => {
    await withinApplicability(async (fixture) => {
      const leafId = await createLeaf(fixture);
      await unbind(fixture);
      if (configuration !== 'unbound') await bindOtherType(fixture);
      if (configuration === 'conflict') conflictTypes(fixture, leafId);
      const before = snapshot(fixture);
      for (const [address, status, error] of [
        [
          stepId,
          configuration === 'conflict' ? 409 : 422,
          configuration === 'conflict' ? 'type_conflict' : 'step_not_resolved',
        ],
        ['c2000000-0000-4000-8000-000000000003', 404, 'unknown_step'],
        [foreignStepId, 404, 'unknown_step'],
      ] as const) {
        expect(
          await fixture.harness.call(
            'manager',
            'POST',
            `/api/work-packages/${workPackageId}/commands`,
            {
              commands: [
                { kind: 'assignSubtree', workItemId: leafId, stepId: address, personId: null },
              ],
            },
          ),
        ).toEqual({ status, body: { error, at: 0, kind: 'assignSubtree' } });
        expect(snapshot(fixture)).toEqual(before);
      }
    });
  }, 60000);
}

test('current assignSubtree preserves parent aggregation and resolved leaf replacement', async () => {
  await withinApplicability(async (fixture) => {
    const parentId = await createLeaf(fixture);
    const added = await fixture.harness.call(
      'manager',
      'POST',
      `/api/work-packages/${workPackageId}/commands`,
      {
        commands: [
          { kind: 'createPerson', ref: 'person', name: 'Applicability assignee' },
          { kind: 'createWorkItem', ref: 'first', name: 'First child', parentId, afterId: null },
          {
            kind: 'createWorkItem',
            ref: 'second',
            name: 'Second child',
            parentId,
            afterRef: 'first',
          },
        ],
      },
    );
    expect(added.status).toBe(200);
    const checked = await validateSchema(applyWorkPackageCommands.responses[0].schema, added.body);
    if (checked.issues !== undefined)
      throw new Error('Subtree fixture create response is malformed');
    const personId = checked.value.results[0]?.id;
    const firstId = checked.value.results[1]?.id;
    const secondId = checked.value.results[2]?.id;
    if (personId === undefined || firstId === undefined || secondId === undefined)
      throw new Error('Subtree fixture lacks its actual person/child identities');
    expect(
      (
        await fixture.harness.call(
          'manager',
          'POST',
          `/api/work-packages/${workPackageId}/commands`,
          {
            commands: [{ kind: 'assignSubtree', workItemId: parentId, stepId, personId }],
          },
        )
      ).status,
    ).toBe(200);
    const assignments = fixture.harness.sqlite
      .query('SELECT work_item_id,step_id,person_id FROM assignment ORDER BY work_item_id')
      .all();
    expect(assignments).toHaveLength(2);
    for (const childId of [firstId, secondId])
      expect(assignments).toContainEqual({
        work_item_id: childId,
        step_id: stepId,
        person_id: personId,
      });
    expect(
      (
        await fixture.harness.call(
          'manager',
          'POST',
          `/api/work-packages/${workPackageId}/commands`,
          {
            commands: [{ kind: 'assignSubtree', workItemId: firstId, stepId, personId: null }],
          },
        )
      ).status,
    ).toBe(200);
    expect(
      fixture.harness.sqlite.query('SELECT work_item_id,step_id,person_id FROM assignment').all(),
    ).toEqual([{ work_item_id: secondId, step_id: stepId, person_id: personId }]);
  });
}, 60000);

test('current package allowance remains a package command without a work item target', async () => {
  await withinApplicability(async (fixture) => {
    expect(
      (
        await fixture.harness.call(
          'manager',
          'POST',
          `/api/work-packages/${workPackageId}/commands`,
          {
            commands: [{ kind: 'setStepAllowance', stepId, allowancePercent: 12.34 }],
          },
        )
      ).status,
    ).toBe(200);
    expect(
      fixture.harness.sqlite
        .query('SELECT allowance_bps FROM work_package_step WHERE work_package_id=? AND step_id=?')
        .get(workPackageId, stepId),
    ).toEqual({ allowance_bps: 1234 });
    expect(
      (await fixture.harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/undo`))
        .status,
    ).toBe(200);
    expect(
      fixture.harness.sqlite
        .query('SELECT allowance_bps FROM work_package_step WHERE work_package_id=? AND step_id=?')
        .get(workPackageId, stepId),
    ).toEqual({ allowance_bps: 700 });
  });
}, 60000);

test('current inactive blockage writer rolls back preceding work without an activation substitute', async () => {
  await withinApplicability(async (fixture) => {
    const leafId = await createLeaf(fixture);
    const before = snapshot(fixture);
    const answer = await fixture.harness.call(
      'manager',
      'POST',
      `/api/work-packages/${workPackageId}/commands`,
      {
        commands: [
          { kind: 'patchWorkItem', workItemId: leafId, patch: { name: 'Must roll back' } },
          { kind: 'setStepBlocked', workItemId: leafId, stepId, isBlocked: true },
        ],
      },
    );
    expect(answer).toEqual({ status: 409, body: { error: 'step_blockage_inactive' } });
    expect(snapshot(fixture)).toEqual(before);
  });
}, 60000);

for (const addressing of ['pair', 'node'] as const) {
  test(`current ${addressing} inapplicable measure clear rolls back the preceding rename and all facts`, async () => {
    await withinApplicability(async (fixture) => {
      const leafId = await createLeaf(fixture);
      await unbind(fixture);
      await bindOtherType(fixture);
      const before = snapshot(fixture);
      const answer = await fixture.harness.call(
        'manager',
        'POST',
        `/api/work-packages/${workPackageId}/commands`,
        {
          commands: [
            { kind: 'patchWorkItem', workItemId: leafId, patch: { name: 'Must roll back' } },
            addressing === 'pair'
              ? { kind: 'clearMeasure', workItemId: leafId, stepId, metric: 'applicability_effort' }
              : {
                  kind: 'clearMeasure',
                  stepNodeId: formatStepNodeId({ workItemId: leafId, stepId }),
                  metric: 'applicability_effort',
                },
          ],
        },
      );
      expect({ answer, frame: snapshot(fixture) }).toEqual({
        answer: { status: 422, body: { error: 'step_not_resolved', at: 1, kind: 'clearMeasure' } },
        frame: before,
      });
    });
  }, 60000);
}
