import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
afterEach(async () => {
  await harness.closeComposed();
});

async function open(mode: 'isolated' | 'shared', days: number) {
  harness = OrganizationHarness.openComposedWith({ withOptimizer: false });
  seedDependencyAuthority(harness.databasePath());
  await harness.register('ada');
  harness.organization('calendar-org');
  harness.member('calendar-org', 'ada', 'member', ['project-contributor', 'org-viewer']);
  harness.grantPermissions('calendar-org', 'ada', ['organization.create_project']);
  harness.bind('ada', 'calendar-org');
  harness.activate();
  harness.sqlite.run('UPDATE organization SET shared_people=? WHERE id=?', [
    mode === 'shared' ? 1 : 0,
    'calendar-org',
  ]);
  const endpoints: { workPackageId: string; stepId: string; workItemId: string }[] = [];
  for (const [name, start] of [
    ['Monday', '2026-10-19'],
    ['Wednesday', '2026-10-21'],
  ]) {
    expect(await harness.call('ada', 'POST', '/api/work-packages', { name })).toMatchObject({
      status: 200,
    });
    const workPackage = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM work_package WHERE name=?')
      .get(name);
    if (workPackage === null) throw new Error('missing calendar fixture work package');
    const step = harness.sqlite
      .query<{ id: string }, [string]>(
        'SELECT id FROM step WHERE work_package_id=? ORDER BY position LIMIT 1',
      )
      .get(workPackage.id);
    if (step === null) throw new Error('missing calendar fixture step');
    harness.sqlite.run(
      "UPDATE work_package SET start_date=?,estimate_method='realistic',estimate_rounding='exact' WHERE id=?",
      [start, workPackage.id],
    );
    harness.sqlite.run(
      'INSERT INTO work_item(id,work_package_id,position,name,readiness) VALUES (?,?,10,?,?)',
      [name, workPackage.id, name, 'ready'],
    );
    harness.sqlite.run(
      'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,?,?,?)',
      [name, step.id, days, days, days],
    );
    endpoints.push({ workPackageId: workPackage.id, stepId: step.id, workItemId: name });
  }
  const monday = endpoints.at(0);
  const wednesday = endpoints.at(1);
  if (monday === undefined || wednesday === undefined)
    throw new Error('missing calendar fixture pair');
  harness.sqlite.run(
    "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('calendar-fs','calendar-org',?,?,?,?,'whole','whole','FS')",
    [monday.workPackageId, wednesday.workPackageId, monday.workItemId, wednesday.workItemId],
  );
  return { monday, wednesday };
}

async function read(workPackageId: string) {
  const answer = await harness.call(
    'ada',
    'GET',
    `/api/work-packages/${workPackageId}/work-items?full=true`,
  );
  expect(answer.status).toBe(200);
  return answer.body;
}

// Proof: substituting Wednesday for member anchors failed 6/8 mounted cases; rounding projected starts failed 4/8.
for (const mode of ['isolated', 'shared'] as const) {
  test(`${mode} mounted calendars preserve fractional FS boundary from both work package targets`, async () => {
    const { monday, wednesday } = await open(mode, 2.5);
    expect(await read(monday.workPackageId)).toMatchObject({
      scheduleError: null,
      workItems: [
        {
          id: 'Monday',
          schedule: { earliestStart: 0, earliestFinish: 2.5 },
          dates: { startsOn: '2026-10-19', endsOn: '2026-10-21' },
        },
      ],
      connectedDependencies: [{ id: 'calendar-fs' }],
    });
    expect(await read(wednesday.workPackageId)).toMatchObject({
      scheduleError: null,
      workItems: [
        {
          id: 'Wednesday',
          schedule: { earliestStart: 0.5, earliestFinish: 3 },
          dates: { startsOn: '2026-10-21', endsOn: '2026-10-23' },
        },
      ],
      connectedDependencies: [{ id: 'calendar-fs' }],
    });
  });

  // Proof: deleting the leaf-floor loop failed both mounted Wednesday-floor cases.
  test(`${mode} mounted Wednesday floor binds after short Monday predecessor`, async () => {
    const { monday, wednesday } = await open(mode, 1);
    expect(await read(wednesday.workPackageId)).toMatchObject({
      scheduleError: null,
      workItems: [
        {
          id: 'Wednesday',
          schedule: { earliestStart: 0, earliestFinish: 1 },
          dates: { startsOn: '2026-10-21', endsOn: '2026-10-21' },
        },
      ],
    });
    expect(await read(monday.workPackageId)).toMatchObject({
      scheduleError: null,
      workItems: [{ id: 'Monday', schedule: { earliestStart: 0, earliestFinish: 1 } }],
    });
  });

  // Proof: omitting deadline shift and rolling weekend deadlines forward each failed both lateBy assertions.
  test(`${mode} mounted weekend floor and deadline use the Wednesday anchor`, async () => {
    const { monday, wednesday } = await open(mode, 2.5);
    harness.sqlite.run(
      "UPDATE work_item SET start_no_earlier_than='2026-10-24',deadline='2026-10-25' WHERE id='Wednesday'",
    );
    const tree = await read(wednesday.workPackageId);
    expect(tree).toMatchObject({
      scheduleError: null,
      workItems: [
        {
          id: 'Wednesday',
          schedule: { earliestStart: 3, earliestFinish: 5.5 },
          dates: { startsOn: '2026-10-26', endsOn: '2026-10-28' },
        },
      ],
    });
    expect(tree).toMatchObject({
      slices: expect.arrayContaining([
        expect.objectContaining({
          workItemId: 'Wednesday',
          stepId: wednesday.stepId,
          earliestStart: 3,
          earliestFinish: 5.5,
          lateBy: 3,
          boundBy: 'notBefore',
        }),
      ]) as unknown,
    });
    expect(await read(monday.workPackageId)).toMatchObject({
      scheduleError: null,
      workItems: [{ id: 'Monday', schedule: { earliestFinish: 2.5 } }],
    });
  });

  // Proof: defaulting missing anchors to Monday failed both explicit-unavailable cases.
  test(`${mode} mounted missing connected anchor stays explicit and unrelated undated work package stays outside`, async () => {
    const { monday, wednesday } = await open(mode, 2.5);
    expect(
      await harness.call('ada', 'POST', '/api/work-packages', { name: 'Unrelated undated' }),
    ).toMatchObject({ status: 200 });
    const unrelated = harness.sqlite
      .query<{ id: string }, []>("SELECT id FROM work_package WHERE name='Unrelated undated'")
      .get();
    if (unrelated === null) throw new Error('missing unrelated fixture work package');
    expect(
      await harness.call('ada', 'POST', `/api/work-packages/${unrelated.id}/commands`, {
        commands: [{ kind: 'createWorkItem', name: 'Undated independent work' }],
      }),
    ).toMatchObject({ status: 200 });
    expect(await read(wednesday.workPackageId)).toMatchObject({
      scheduleError: null,
      workItems: [{ schedule: { earliestStart: 0.5 } }],
    });
    harness.sqlite.run('UPDATE work_package SET start_date=NULL WHERE id=?', [
      monday.workPackageId,
    ]);
    for (const endpoint of [monday, wednesday]) {
      expect(await read(endpoint.workPackageId)).toMatchObject({
        scheduleError: {
          kind: 'dependency_calendar_missing',
          workPackages: [{ workPackageId: monday.workPackageId, name: 'Monday' }],
        },
        slices: [],
        workItems: [
          {
            id: endpoint.workItemId,
            schedule: null,
            dates: null,
            nodeReadings: { [endpoint.stepId]: 'unknown' },
          },
        ],
        connectedDependencies: [{ id: 'calendar-fs' }],
      });
    }
  });
}
