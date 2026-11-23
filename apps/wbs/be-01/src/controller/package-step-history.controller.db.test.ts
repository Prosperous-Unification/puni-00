import {
  applyWorkPackageCommands,
  getWorkItems,
  type PlanCommandWire,
  validateSchema,
} from '@wbs/contracts';
import { MAX_ESTIMATE_DAYS, MAX_ESTIMATE_MINUTES } from '@wbs/domain';
import { expect, test } from 'bun:test';

import {
  PACKAGE_STEP_SEED,
  type PackageStepFixture,
  withinPackageSteps,
} from '../testing/package-step-values-fixture';

const { workPackageId, stepId } = PACKAGE_STEP_SEED;

/** Sends the current command contract through the composed HTTP/auth/Source boundary. */
async function write(fixture: PackageStepFixture, commands: readonly PlanCommandWire[]) {
  const answer = await fixture.harness.call(
    'manager',
    'POST',
    `/api/work-packages/${workPackageId}/commands`,
    { commands },
  );
  expect(answer.status).toBe(200);
  const checked = await validateSchema(applyWorkPackageCommands.responses[0].schema, answer.body);
  if (checked.issues !== undefined)
    throw new Error('Current history fixture received a malformed command response');
  return checked.value;
}

/** Requires the identity returned for this actual create command before addressing its leaf. */
async function createLeaf(fixture: PackageStepFixture): Promise<string> {
  const created = await write(fixture, [
    {
      kind: 'createWorkItem',
      ref: 'leaf',
      parentId: null,
      afterId: null,
      name: 'Native history leaf',
    },
  ]);
  const id = created.results[0]?.id;
  if (id === undefined) throw new Error('Current history create did not return its leaf identity');
  return id;
}

/** Reads the persisted triple without introducing another scheduling or unit interpretation. */
function readEstimates(fixture: PackageStepFixture, leafId: string) {
  return fixture.harness.sqlite
    .query<{ optimistic: number; realistic: number; pessimistic: number }, [string, string]>(
      'SELECT optimistic,realistic,pessimistic FROM estimate WHERE work_item_id=? AND step_id=?',
    )
    .all(leafId, stepId);
}

test('current package history refuses undo that would restore an estimate under a changed unit', async () => {
  await withinPackageSteps(async (fixture) => {
    const leafId = await createLeaf(fixture);
    await write(fixture, [
      {
        kind: 'setEstimate',
        workItemId: leafId,
        stepId,
        days: { optimistic: 2, realistic: 2, pessimistic: 2 },
      },
    ]);
    await write(fixture, [{ kind: 'clearEstimate', workItemId: leafId, stepId }]);
    expect(
      await fixture.harness.call(
        'manager',
        'PATCH',
        `/api/work-packages/${workPackageId}/steps/${stepId}`,
        { estimateUnit: 'minutes' },
      ),
    ).toMatchObject({ status: 200 });
    expect(
      await fixture.harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/undo`),
    ).toMatchObject({ status: 409, body: { error: 'stale_undo' } });
    expect(readEstimates(fixture, leafId)).toEqual([]);
    expect(
      fixture.harness.sqlite
        .query('SELECT estimate_unit FROM work_package_step WHERE work_package_id=? AND step_id=?')
        .get(workPackageId, stepId),
    ).toEqual({ estimate_unit: 'minutes' });
  });
}, 60000);

test('current package history retains minute bindings through chained undo redo and rebase', async () => {
  await withinPackageSteps(async (fixture) => {
    expect(
      await fixture.harness.call(
        'manager',
        'PATCH',
        `/api/work-packages/${workPackageId}/steps/${stepId}`,
        { estimateUnit: 'minutes' },
      ),
    ).toMatchObject({ status: 200 });
    const leafId = await createLeaf(fixture);
    for (const point of [30, 60])
      await write(fixture, [
        {
          kind: 'setEstimate',
          workItemId: leafId,
          stepId,
          days: { optimistic: point, realistic: point, pessimistic: point },
        },
      ]);
    for (const [direction, point] of [
      ['undo', 30],
      ['undo', null],
      ['redo', 30],
      ['redo', 60],
    ] as const) {
      expect(
        await fixture.harness.call(
          'manager',
          'POST',
          `/api/work-packages/${workPackageId}/${direction}`,
        ),
      ).toMatchObject({ status: 200 });
      expect(readEstimates(fixture, leafId)).toEqual(
        point === null ? [] : [{ optimistic: point, realistic: point, pessimistic: point }],
      );
    }
  });
}, 60000);

for (const direction of [
  'minutes-to-workdays',
  'workdays-to-minutes-redo',
  'deleted-subtree',
] as const) {
  test(`current package history refuses incompatible ${direction} before restoring facts`, async () => {
    await withinPackageSteps(async (fixture) => {
      if (direction === 'minutes-to-workdays')
        expect(
          await fixture.harness.call(
            'manager',
            'PATCH',
            `/api/work-packages/${workPackageId}/steps/${stepId}`,
            { estimateUnit: 'minutes' },
          ),
        ).toMatchObject({ status: 200 });
      const leafId = await createLeaf(fixture);
      await write(fixture, [
        {
          kind: 'setEstimate',
          workItemId: leafId,
          stepId,
          days: { optimistic: 1, realistic: 2, pessimistic: 3 },
        },
      ]);
      if (direction === 'workdays-to-minutes-redo')
        expect(
          await fixture.harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/undo`),
        ).toMatchObject({ status: 200 });
      else if (direction === 'deleted-subtree')
        await write(fixture, [{ kind: 'deleteWorkItem', workItemId: leafId, strategy: 'cascade' }]);
      else await write(fixture, [{ kind: 'clearEstimate', workItemId: leafId, stepId }]);
      expect(
        await fixture.harness.call(
          'manager',
          'PATCH',
          `/api/work-packages/${workPackageId}/steps/${stepId}`,
          { estimateUnit: direction === 'minutes-to-workdays' ? 'workdays' : 'minutes' },
        ),
      ).toMatchObject({ status: 200 });
      const replay = direction === 'workdays-to-minutes-redo' ? 'redo' : 'undo';
      expect(
        await fixture.harness.call(
          'manager',
          'POST',
          `/api/work-packages/${workPackageId}/${replay}`,
        ),
      ).toMatchObject({ status: 409, body: { error: 'stale_undo' } });
      expect(readEstimates(fixture, leafId)).toEqual([]);
      if (direction === 'deleted-subtree')
        expect(
          fixture.harness.sqlite.query('SELECT id FROM work_item WHERE id=?').get(leafId),
        ).toBeNull();
    });
  }, 60000);
}

test('current package history refuses a mixed inverse before its rename and preserves the older independent entry', async () => {
  await withinPackageSteps(async (fixture) => {
    const estimated = await createLeaf(fixture);
    await write(fixture, [
      {
        kind: 'setEstimate',
        workItemId: estimated,
        stepId,
        days: { optimistic: 1, realistic: 2, pessimistic: 3 },
      },
    ]);
    const renamed = await createLeaf(fixture),
      older = await createLeaf(fixture);
    await write(fixture, [
      { kind: 'deleteWorkItem', workItemId: estimated, strategy: 'cascade' },
      { kind: 'patchWorkItem', workItemId: renamed, patch: { name: 'Changed' } },
    ]);
    expect(
      await fixture.harness.call(
        'manager',
        'PATCH',
        `/api/work-packages/${workPackageId}/steps/${stepId}`,
        { estimateUnit: 'minutes' },
      ),
    ).toMatchObject({ status: 200 });
    const names = fixture.harness.sqlite.query('SELECT * FROM work_item WHERE id=?').get(renamed);
    const entries = fixture.harness.sqlite
      .query<{ id: string }, []>('SELECT id FROM command_journal ORDER BY seq')
      .all();
    const events = fixture.harness.sqlite.query('SELECT * FROM plan_event ORDER BY id').all(),
      pushes = [...fixture.pushes];
    expect(
      await fixture.harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/undo`),
    ).toMatchObject({ status: 409, body: { error: 'stale_undo' } });
    expect(fixture.harness.sqlite.query('SELECT * FROM work_item WHERE id=?').get(renamed)).toEqual(
      names,
    );
    expect(
      fixture.harness.sqlite.query('SELECT id FROM work_item WHERE id=?').get(estimated),
    ).toBeNull();
    expect(readEstimates(fixture, estimated)).toEqual([]);
    expect(fixture.harness.sqlite.query('SELECT * FROM plan_event ORDER BY id').all()).toEqual(
      events,
    );
    expect(fixture.pushes).toEqual(pushes);
    expect(
      fixture.harness.sqlite
        .query<{ id: string }, []>('SELECT id FROM command_journal ORDER BY seq')
        .all(),
    ).toEqual(entries.slice(0, -1));
    expect(
      await fixture.harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/undo`),
    ).toMatchObject({ status: 200 });
    expect(
      fixture.harness.sqlite.query('SELECT id FROM work_item WHERE id=?').get(older),
    ).toBeNull();
  });
}, 60000);

test('current package values retain the exact estimate census before a unit change', async () => {
  await withinPackageSteps(async (fixture) => {
    expect(
      await fixture.harness.call(
        'manager',
        'PATCH',
        `/api/work-packages/${workPackageId}/steps/${stepId}`,
        { estimateUnit: 'hours' },
      ),
    ).toMatchObject({ status: 422, body: { error: 'invalid_body' } });
    const leaves: string[] = [];
    for (let index = 0; index < 3; index++) {
      const leafId = await createLeaf(fixture);
      leaves.push(leafId);
      await write(fixture, [
        {
          kind: 'setEstimate',
          workItemId: leafId,
          stepId,
          days: { optimistic: 1, realistic: 2, pessimistic: 3 },
        },
      ]);
    }
    expect(
      await fixture.harness.call(
        'manager',
        'PATCH',
        `/api/work-packages/${workPackageId}/steps/${stepId}`,
        { estimateUnit: 'minutes' },
      ),
    ).toMatchObject({ status: 409, body: { error: 'estimates_present', count: 3 } });
    await write(
      fixture,
      leaves.map((workItemId) => ({ kind: 'clearEstimate', workItemId, stepId })),
    );
    expect(
      await fixture.harness.call(
        'manager',
        'PATCH',
        `/api/work-packages/${workPackageId}/steps/${stepId}`,
        { estimateUnit: 'minutes' },
      ),
    ).toMatchObject({ status: 200 });
  });
}, 60000);

test('current native minute range refusals roll back the preceding rename and retain journal events and pushes', async () => {
  await withinPackageSteps(async (fixture) => {
    expect(
      await fixture.harness.call(
        'manager',
        'PATCH',
        `/api/work-packages/${workPackageId}/steps/${stepId}`,
        { estimateUnit: 'minutes' },
      ),
    ).toMatchObject({ status: 200 });
    const leafId = await createLeaf(fixture);
    await write(fixture, [
      {
        kind: 'setEstimate',
        workItemId: leafId,
        stepId,
        days: { optimistic: 30, realistic: 40, pessimistic: 90 },
      },
    ]);
    const journal = fixture.harness.sqlite
      .query('SELECT * FROM command_journal ORDER BY seq')
      .all();
    const events = fixture.harness.sqlite.query('SELECT * FROM plan_event ORDER BY id').all(),
      pushes = [...fixture.pushes];
    const leaf = fixture.harness.sqlite.query('SELECT * FROM work_item WHERE id=?').get(leafId);
    for (const [point, error] of [
      [1.5, 'minutes_not_integer'],
      [MAX_ESTIMATE_MINUTES + 1, 'minutes_above_max'],
    ] as const) {
      expect(
        await fixture.harness.call(
          'manager',
          'POST',
          `/api/work-packages/${workPackageId}/commands`,
          {
            commands: [
              { kind: 'patchWorkItem', workItemId: leafId, patch: { name: 'Should roll back' } },
              {
                kind: 'setEstimate',
                workItemId: leafId,
                stepId,
                days: { optimistic: point, realistic: point, pessimistic: point },
              },
            ],
          },
        ),
      ).toMatchObject({ status: 422, body: { error, at: 1 } });
      expect(
        fixture.harness.sqlite.query('SELECT * FROM work_item WHERE id=?').get(leafId),
      ).toEqual(leaf);
      expect(readEstimates(fixture, leafId)).toEqual([
        { optimistic: 30, realistic: 40, pessimistic: 90 },
      ]);
      expect(
        fixture.harness.sqlite.query('SELECT * FROM command_journal ORDER BY seq').all(),
      ).toEqual(journal);
      expect(fixture.harness.sqlite.query('SELECT * FROM plan_event ORDER BY id').all()).toEqual(
        events,
      );
      expect(fixture.pushes).toEqual(pushes);
    }
  });
}, 60000);

test('current package estimates distinguish the workday bound from native whole minutes', async () => {
  await withinPackageSteps(async (fixture) => {
    const leafId = await createLeaf(fixture),
      point = MAX_ESTIMATE_DAYS + 1;
    const command = {
      kind: 'setEstimate' as const,
      workItemId: leafId,
      stepId,
      days: { optimistic: point, realistic: point, pessimistic: point },
    };
    expect(
      await fixture.harness.call(
        'manager',
        'POST',
        `/api/work-packages/${workPackageId}/commands`,
        { commands: [command] },
      ),
    ).toMatchObject({
      status: 422,
      body: { error: 'invalid_estimate', at: 0, kind: 'setEstimate' },
    });
    expect(readEstimates(fixture, leafId)).toEqual([]);
    expect(
      await fixture.harness.call(
        'manager',
        'PATCH',
        `/api/work-packages/${workPackageId}/steps/${stepId}`,
        { estimateUnit: 'minutes' },
      ),
    ).toMatchObject({ status: 200 });
    await write(fixture, [command]);
    expect(readEstimates(fixture, leafId)).toEqual([
      { optimistic: point, realistic: point, pessimistic: point },
    ]);
  });
}, 60000);

test('current package read retains native charges beside the half-day projection', async () => {
  await withinPackageSteps(async (fixture) => {
    expect(
      await fixture.harness.call(
        'manager',
        'PATCH',
        `/api/work-packages/${workPackageId}/steps/${stepId}`,
        { estimateUnit: 'minutes', allowanceBps: 0 },
      ),
    ).toMatchObject({ status: 200 });
    const leafId = await createLeaf(fixture);
    await write(fixture, [
      {
        kind: 'setEstimate',
        workItemId: leafId,
        stepId,
        days: { optimistic: 240, realistic: 240, pessimistic: 240 },
      },
    ]);
    const answer = await fixture.harness.call(
      'manager',
      'GET',
      `/api/work-packages/${workPackageId}/work-items`,
    );
    expect(answer.status).toBe(200);
    const checked = await validateSchema(getWorkItems.responses[0].schema, answer.body);
    if (checked.issues !== undefined) throw new Error('Current history tree response is malformed');
    const leaf = checked.value.workItems.find((row) => row.id === leafId);
    expect(leaf?.charged?.[stepId]).toEqual({ unit: 'minutes', minutes: 240 });
    expect(leaf?.finalDays[stepId]).toBe(0.5);
    expect(leaf?.schedule?.duration).toBe(0.5);
  });
}, 60000);

test('authored unit metadata rejects malformed present maps and explicitly binds omission to workdays', async () => {
  await withinPackageSteps(async (fixture) => {
    const leafId = await createLeaf(fixture);
    await write(fixture, [
      {
        kind: 'setEstimate',
        workItemId: leafId,
        stepId,
        days: { optimistic: 1, realistic: 2, pessimistic: 3 },
      },
    ]);
    await write(fixture, [{ kind: 'clearEstimate', workItemId: leafId, stepId }]);
    const readEntry = () => {
      const entry = fixture.harness.sqlite
        .query<{ id: string; preconditions: string }, []>(
          'SELECT id,preconditions FROM command_journal ORDER BY seq DESC LIMIT 1',
        )
        .get();
      if (entry === null) throw new Error('Current history fixture has no retained journal entry');
      return entry;
    };
    const entry = readEntry(),
      preconditions = JSON.parse(entry.preconditions) as Record<string, unknown>;
    const events = fixture.harness.sqlite.query('SELECT * FROM plan_event ORDER BY id').all();
    for (const estimateUnits of [null, {}]) {
      fixture.harness.sqlite.run('UPDATE command_journal SET preconditions=? WHERE id=?', [
        JSON.stringify({ ...preconditions, estimateUnits }),
        entry.id,
      ]);
      expect(
        await fixture.harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/undo`),
      ).toMatchObject({ status: 500 });
      expect(readEstimates(fixture, leafId)).toEqual([]);
      expect(fixture.harness.sqlite.query('SELECT * FROM plan_event ORDER BY id').all()).toEqual(
        events,
      );
    }
    // Authored receiver-boundary input, not evidence from an immutable historical producer.
    delete preconditions['estimateUnits'];
    fixture.harness.sqlite.run('UPDATE command_journal SET preconditions=? WHERE id=?', [
      JSON.stringify(preconditions),
      entry.id,
    ]);
    expect(
      await fixture.harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/undo`),
    ).toMatchObject({ status: 200 });
    expect(readEstimates(fixture, leafId)).toEqual([
      { optimistic: 1, realistic: 2, pessimistic: 3 },
    ]);
    expect(
      await fixture.harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/redo`),
    ).toMatchObject({ status: 200 });
    const repaired = readEntry(),
      repairedConditions = JSON.parse(repaired.preconditions) as Record<string, unknown>;
    delete repairedConditions['estimateUnits'];
    fixture.harness.sqlite.run('UPDATE command_journal SET preconditions=? WHERE id=?', [
      JSON.stringify(repairedConditions),
      repaired.id,
    ]);
    expect(
      await fixture.harness.call(
        'manager',
        'PATCH',
        `/api/work-packages/${workPackageId}/steps/${stepId}`,
        { estimateUnit: 'minutes' },
      ),
    ).toMatchObject({ status: 200 });
    expect(
      await fixture.harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/undo`),
    ).toMatchObject({ status: 409, body: { error: 'stale_undo' } });
    expect(readEstimates(fixture, leafId)).toEqual([]);
  });
}, 60000);

test('current package history tolerates same units unrelated steps and pairs allowance undo and away-and-back edits', async () => {
  await withinPackageSteps(async (fixture) => {
    const leafId = await createLeaf(fixture),
      otherStepId = 'history-other-step';
    await write(fixture, [
      {
        kind: 'setEstimate',
        workItemId: leafId,
        stepId,
        days: { optimistic: 1, realistic: 2, pessimistic: 3 },
      },
    ]);
    await fixture.harness.publicWrites().uow.run(async ({ stores }) => {
      expect(
        (
          await stores.stepCatalogue.defineAndBindStep(
            'org-a',
            {
              id: otherStepId,
              code: 'history-other',
              name: 'Other history phase',
              position: 20,
              defaultEstimateUnit: 'workdays',
              defaultAllowancePercent: 0,
            },
            {
              bindingId: otherStepId + ':binding',
              scopeKind: 'organization',
              scopeId: 'org-a',
              workItemTypeId: null,
              position: 20,
            },
            fixture.stamp,
          )
        ).ok,
      ).toBe(true);
      return { commit: true, value: undefined };
    });
    for (const [addressed, phase, unit] of [
      [workPackageId, stepId, 'workdays'],
      [workPackageId, otherStepId, 'minutes'],
      [PACKAGE_STEP_SEED.siblingWorkPackageId, stepId, 'minutes'],
    ] as const)
      expect(
        await fixture.harness.call(
          'manager',
          'PATCH',
          `/api/work-packages/${addressed}/steps/${phase}`,
          { estimateUnit: unit },
        ),
      ).toMatchObject({ status: 200 });
    expect(
      await fixture.harness.call(
        'manager',
        'PATCH',
        `/api/work-packages/${workPackageId}/steps/${stepId}`,
        { allowanceBps: 3000 },
      ),
    ).toMatchObject({ status: 200 });
    expect(
      await fixture.harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/undo`),
    ).toMatchObject({ status: 200 });
    await write(fixture, [{ kind: 'clearEstimate', workItemId: leafId, stepId }]);
    for (const unit of ['minutes', 'workdays'])
      expect(
        await fixture.harness.call(
          'manager',
          'PATCH',
          `/api/work-packages/${workPackageId}/steps/${stepId}`,
          { estimateUnit: unit },
        ),
      ).toMatchObject({ status: 200 });
    expect(
      await fixture.harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/undo`),
    ).toMatchObject({ status: 200 });
    expect(readEstimates(fixture, leafId)).toEqual([
      { optimistic: 1, realistic: 2, pessimistic: 3 },
    ]);
  });
}, 60000);

test('current structural replay retains its journal and facts while the required blockage writer is inactive', async () => {
  await withinPackageSteps(async (fixture) => {
    const leafId = await createLeaf(fixture);
    await write(fixture, [
      {
        kind: 'setEstimate',
        workItemId: leafId,
        stepId,
        days: { optimistic: 1, realistic: 2, pessimistic: 3 },
      },
    ]);
    await write(fixture, [{ kind: 'deleteWorkItem', workItemId: leafId, strategy: 'cascade' }]);
    const journal = fixture.harness.sqlite
      .query('SELECT * FROM command_journal ORDER BY seq')
      .all();
    const events = fixture.harness.sqlite.query('SELECT * FROM plan_event ORDER BY id').all(),
      pushes = [...fixture.pushes];
    expect(
      await fixture.harness.call('manager', 'POST', `/api/work-packages/${workPackageId}/undo`),
    ).toMatchObject({ status: 409, body: { error: 'step_blockage_inactive' } });
    expect(readEstimates(fixture, leafId)).toEqual([]);
    expect(
      fixture.harness.sqlite.query('SELECT id FROM work_item WHERE id=?').get(leafId),
    ).toBeNull();
    expect(
      fixture.harness.sqlite.query('SELECT * FROM command_journal ORDER BY seq').all(),
    ).toEqual(journal);
    expect(fixture.harness.sqlite.query('SELECT * FROM plan_event ORDER BY id').all()).toEqual(
      events,
    );
    expect(fixture.pushes).toEqual(pushes);
  });
}, 60000);
