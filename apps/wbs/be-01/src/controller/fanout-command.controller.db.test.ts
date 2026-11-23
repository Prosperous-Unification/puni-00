import { afterEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
import { createFixturePackage, readFixturePackage } from '../testing/space-rollup';

const opened: OrganizationHarness[] = [];
afterEach(async () => {
  for (const harness of opened.splice(0)) await harness.closeComposed();
});

async function create(harness: OrganizationHarness, name: string) {
  const workPackageId = await createFixturePackage(harness, 'ada', name);
  const { steps } = await readFixturePackage(harness, 'ada', workPackageId);
  const step = steps.at(0);
  if (step === undefined) throw new Error('fanout fixture has no step');
  return { workPackageId, stepId: step.id };
}

/**
 * Seeds the asserted topology independently of creation-time/ID tie breaks.
 * Proof: tied timestamps and descending IDs failed the unranked endpoint case;
 * explicit ranks passed, and omitting production connection endpoints still failed it.
 */
function rankWorkPackages(harness: OrganizationHarness, workPackageIds: readonly string[]): void {
  for (const [index, workPackageId] of workPackageIds.entries())
    harness.sqlite.run(
      'INSERT INTO work_package_rank (work_package_id, organization_id, position, created_at, created_by) VALUES (?, ?, ?, 1, ?)',
      [workPackageId, 'org-a', index + 1, harness.userId('ada')],
    );
}

it('records a cold shared command fan-out without a preceding tree GET', async () => {
  let holdFirstPush = false;
  let releasePush!: () => void;
  let reachedPush!: () => void;
  const heldPush = new Promise<void>((resolve) => {
    releasePush = resolve;
  });
  const pushStarted = new Promise<void>((resolve) => {
    reachedPush = resolve;
  });
  const harness = OrganizationHarness.openComposed(
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    async () => {
      if (holdFirstPush) {
        holdFirstPush = false;
        reachedPush();
        await heldPush;
      }
      return Response.json({ delivered_to_sockets: 0 });
    },
  );
  opened.push(harness);
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
  harness.grantPermissions('org-a', 'ada', ['organization.manage_directory']);
  harness.grantPermissions('org-a', 'ada', ['organization.create_project']);
  harness.bind('ada', 'org-a');
  harness.activate();
  const upstream = await create(harness, 'Upstream');
  const downstream = await create(harness, 'Downstream');
  const setupAudits = harness.sqlite.query('SELECT * FROM organization_audit ORDER BY rowid').all();
  const lastSetupEvent = harness.sqlite
    .query<{ id: number }, []>('SELECT id FROM event_log ORDER BY id DESC LIMIT 1')
    .get();
  if (lastSetupEvent === null) throw new Error('catalogue setup event missing');
  rankWorkPackages(harness, [upstream.workPackageId, downstream.workPackageId]);
  harness.sqlite.run("INSERT INTO person (id, name) VALUES ('ana', 'Ana')");
  harness.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('ana', 'org-a', 'Ana')",
  );
  for (const [index, workPackage] of [upstream, downstream].entries()) {
    harness.sqlite.run(
      "UPDATE work_package SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
      [workPackage.workPackageId],
    );
    harness.sqlite.run(
      'INSERT INTO work_item (id, work_package_id, position, name) VALUES (?, ?, 10, ?)',
      [`row-${String(index)}`, workPackage.workPackageId, `row-${String(index)}`],
    );
    harness.sqlite.run(
      'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
      [`row-${String(index)}`, workPackage.stepId],
    );
    harness.sqlite.run(
      'INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)',
      [`row-${String(index)}`, workPackage.stepId, 'ana'],
    );
  }
  harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  holdFirstPush = true;
  const pending = harness.call(
    'ada',
    'POST',
    `/api/work-packages/${upstream.workPackageId}/commands`,
    {
      commands: [
        {
          kind: 'setEstimate',
          workItemId: 'row-0',
          stepId: upstream.stepId,
          days: { optimistic: 3, realistic: 3, pessimistic: 3 },
        },
      ],
    },
  );
  await pushStarted;
  // Proof: moving committed delivery inside the transaction holds its SQLite
  // write lock while transport waits, so this independent writer fails.
  try {
    harness.sqlite.run('UPDATE work_package SET name = ? WHERE id = ?', [
      'writer entered',
      upstream.workPackageId,
    ]);
  } finally {
    releasePush();
  }
  const answer = await pending;
  expect(answer.status).toBe(200);
  const events = harness.sqlite
    .query<{ message: string }, [string, number]>(
      'SELECT message FROM event_log WHERE subscription = ? AND id > ? ORDER BY seq',
    )
    .all(`work-package:${downstream.workPackageId}`, lastSetupEvent.id);
  expect(events.map(({ message }) => JSON.parse(message) as unknown)).toEqual([
    {
      type: 'elsewhere_changed',
      workPackageId: downstream.workPackageId,
      causeWorkPackageId: upstream.workPackageId,
    },
  ]);
  const twice = await harness.call(
    'ada',
    'POST',
    `/api/work-packages/${upstream.workPackageId}/commands`,
    {
      commands: [
        {
          kind: 'setEstimate',
          workItemId: 'row-0',
          stepId: upstream.stepId,
          days: { optimistic: 4, realistic: 4, pessimistic: 4 },
        },
        {
          kind: 'setEstimate',
          workItemId: 'row-0',
          stepId: upstream.stepId,
          days: { optimistic: 5, realistic: 5, pessimistic: 5 },
        },
      ],
    },
  );
  expect(twice.status).toBe(200);
  expect(
    harness.sqlite
      .query('SELECT * FROM event_log WHERE subscription = ? AND id > ? ORDER BY seq')
      .all(`work-package:${downstream.workPackageId}`, lastSetupEvent.id),
  ).toHaveLength(2);
  const roundTrip = await harness.call(
    'ada',
    'POST',
    `/api/work-packages/${upstream.workPackageId}/commands`,
    {
      commands: [
        {
          kind: 'setEstimate',
          workItemId: 'row-0',
          stepId: upstream.stepId,
          days: { optimistic: 6, realistic: 6, pessimistic: 6 },
        },
        {
          kind: 'setEstimate',
          workItemId: 'row-0',
          stepId: upstream.stepId,
          days: { optimistic: 5, realistic: 5, pessimistic: 5 },
        },
      ],
    },
  );
  expect(roundTrip.status).toBe(200);
  expect(
    harness.sqlite
      .query('SELECT * FROM event_log WHERE subscription = ? AND id > ? ORDER BY seq')
      .all(`work-package:${downstream.workPackageId}`, lastSetupEvent.id),
  ).toHaveLength(2);
  const beforeRefusal = [
    'estimate',
    'command_journal',
    'plan_event',
    'event_log',
    'event_sequencer',
  ].map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const refused = await harness.call(
    'ada',
    'POST',
    `/api/work-packages/${upstream.workPackageId}/commands`,
    {
      commands: [
        {
          kind: 'setEstimate',
          workItemId: 'row-0',
          stepId: upstream.stepId,
          days: { optimistic: 7, realistic: 7, pessimistic: 7 },
        },
        {
          kind: 'setEstimate',
          workItemId: 'absent',
          stepId: upstream.stepId,
          days: { optimistic: 8, realistic: 8, pessimistic: 8 },
        },
      ],
    },
  );
  expect(refused.status).toBe(404);
  expect(
    ['estimate', 'command_journal', 'plan_event', 'event_log', 'event_sequencer'].map((table) =>
      harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ),
  ).toEqual(beforeRefusal);
  const mixed = await harness.call(
    'ada',
    'POST',
    `/api/work-packages/${upstream.workPackageId}/commands`,
    {
      commands: [
        { kind: 'createPerson', ref: 'fresh-person', name: 'Fresh', teamIds: [] },
        {
          kind: 'setAssignee',
          workItemId: 'row-0',
          stepId: upstream.stepId,
          personId: null,
          personRef: 'fresh-person',
        },
        {
          kind: 'setEstimate',
          workItemId: 'row-0',
          stepId: upstream.stepId,
          days: { optimistic: 7, realistic: 7, pessimistic: 7 },
        },
      ],
    },
  );
  expect(mixed.status).toBe(200);
  expect(
    harness.sqlite
      .query<{ name: string }, []>(
        "SELECT person_organization.name FROM assignment JOIN person_organization ON person_organization.resource_id = assignment.person_id WHERE assignment.work_item_id = 'row-0'",
      )
      .get()?.name,
  ).toBe('Fresh');
  expect(
    harness.sqlite
      .query('SELECT * FROM event_log WHERE subscription = ? AND message LIKE ? ORDER BY seq')
      .all(`work-package:${downstream.workPackageId}`, '%elsewhere_changed%'),
  ).toHaveLength(3);
  const binding = harness.sqlite
    .query<{ id: string }, [string, string]>(
      "SELECT binding.id FROM step_binding AS binding JOIN work_package AS package ON package.project_id=binding.scope_id WHERE binding.scope_kind='project' AND binding.work_item_type_id IS NULL AND package.id=? AND binding.step_id=?",
    )
    .get(upstream.workPackageId, upstream.stepId);
  if (binding === null) throw new Error('upstream Dev binding absent');
  const unbindEffects = () =>
    [
      'step_binding',
      'work_package_step',
      'estimate',
      'assignment',
      'event_log',
      'event_sequencer',
    ].map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const beforeUnbind = unbindEffects();
  expect(
    await harness.call('ada', 'DELETE', `/api/organization/step-bindings/${binding.id}`, {
      dryRun: false,
    }),
  ).toEqual({
    status: 409,
    body: {
      error: 'step_nodes_in_use',
      count: 1,
      pairs: [
        {
          id: 'row-0',
          name: 'row-0',
          workPackageId: upstream.workPackageId,
          stepId: upstream.stepId,
          facts: ['estimate', 'assignment'],
        },
      ],
    },
  });
  expect(unbindEffects()).toEqual(beforeUnbind);
  expect(harness.sqlite.query('SELECT * FROM organization_audit ORDER BY rowid').all()).toEqual(
    setupAudits,
  );
  expect(
    harness.sqlite
      .query('SELECT * FROM event_log WHERE subscription = ? AND id > ? ORDER BY seq')
      .all(`work-package:${downstream.workPackageId}`, lastSetupEvent.id),
  ).toHaveLength(3);
});

it('records distinct sorted causes from a directory-only batch across old shared usage', async () => {
  const harness = OrganizationHarness.openComposed();
  opened.push(harness);
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
  harness.grantPermissions('org-a', 'ada', ['organization.manage_directory']);
  harness.grantPermissions('org-a', 'ada', ['organization.create_project']);
  harness.bind('ada', 'org-a');
  harness.activate();
  const workPackages: { workPackageId: string; stepId: string }[] = [];
  for (const name of ['A', 'B', 'C']) workPackages.push(await create(harness, name));
  rankWorkPackages(
    harness,
    workPackages.map((workPackage) => workPackage.workPackageId),
  );
  harness.sqlite.run("INSERT INTO person (id, name) VALUES ('ana', 'Ana')");
  harness.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('ana', 'org-a', 'Ana')",
  );
  for (const [index, workPackage] of workPackages.entries()) {
    harness.sqlite.run(
      "UPDATE work_package SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
      [workPackage.workPackageId],
    );
    harness.sqlite.run(
      'INSERT INTO work_item (id, work_package_id, position, name) VALUES (?, ?, 10, ?)',
      [`row-${String(index)}`, workPackage.workPackageId, `row-${String(index)}`],
    );
    harness.sqlite.run(
      'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
      [`row-${String(index)}`, workPackage.stepId],
    );
    harness.sqlite.run(
      'INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)',
      [`row-${String(index)}`, workPackage.stepId, 'ana'],
    );
  }
  harness.sqlite.run("INSERT INTO person (id, name) VALUES ('ben', 'Ben')");
  harness.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('ben', 'org-a', 'Ben')",
  );
  for (const [index, workPackage] of workPackages.entries()) {
    harness.sqlite.run(
      'INSERT INTO work_item (id, work_package_id, position, name) VALUES (?, ?, 20, ?)',
      [`ben-row-${String(index)}`, workPackage.workPackageId, `ben-row-${String(index)}`],
    );
    harness.sqlite.run(
      'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
      [`ben-row-${String(index)}`, workPackage.stepId],
    );
    harness.sqlite.run(
      'INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)',
      [`ben-row-${String(index)}`, workPackage.stepId, 'ben'],
    );
  }
  harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  const first = workPackages[0];
  const second = workPackages[1];
  const third = workPackages[2];
  const answer = await harness.call(
    'ada',
    'POST',
    `/api/work-packages/${first.workPackageId}/commands`,
    {
      commands: [
        { kind: 'deletePerson', personId: 'ana', cascade: true },
        { kind: 'deletePerson', personId: 'ben', cascade: true },
      ],
    },
  );
  expect(answer.status).toBe(200);
  const rows = harness.sqlite
    .query<{ subscription: string; message: string }, []>(
      "SELECT subscription, message FROM event_log WHERE message LIKE '%elsewhere_changed%' ORDER BY subscription, seq",
    )
    .all();
  const expected: [string, { type: string; workPackageId: string; causeWorkPackageId: string }][] =
    [
      [
        `work-package:${second.workPackageId}`,
        {
          type: 'elsewhere_changed',
          workPackageId: second.workPackageId,
          causeWorkPackageId: first.workPackageId,
        },
      ],
      [
        `work-package:${third.workPackageId}`,
        {
          type: 'elsewhere_changed',
          workPackageId: third.workPackageId,
          causeWorkPackageId: first.workPackageId,
        },
      ],
      [
        `work-package:${third.workPackageId}`,
        {
          type: 'elsewhere_changed',
          workPackageId: third.workPackageId,
          causeWorkPackageId: second.workPackageId,
        },
      ],
    ];
  const sortPair = (
    left: readonly [string, { causeWorkPackageId: string }],
    right: readonly [string, { causeWorkPackageId: string }],
  ) =>
    left[0].localeCompare(right[0]) ||
    left[1].causeWorkPackageId.localeCompare(right[1].causeWorkPackageId);
  expect(
    rows
      .map(
        ({ subscription, message }) =>
          [subscription, JSON.parse(message) as { causeWorkPackageId: string }] as const,
      )
      .sort(sortPair),
  ).toEqual(expected.sort(sortPair));
});

it('keeps both changed connection endpoints as durable causes on assignment removal', async () => {
  const harness = OrganizationHarness.openComposed();
  opened.push(harness);
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
  harness.grantPermissions('org-a', 'ada', ['organization.manage_directory']);
  harness.grantPermissions('org-a', 'ada', ['organization.create_project']);
  harness.bind('ada', 'org-a');
  harness.activate();
  const workPackages: { workPackageId: string; stepId: string }[] = [];
  for (const name of ['A', 'B', 'C']) workPackages.push(await create(harness, name));
  rankWorkPackages(
    harness,
    workPackages.map((workPackage) => workPackage.workPackageId),
  );
  for (const [id, name] of [
    ['ana', 'Ana'],
    ['ben', 'Ben'],
  ]) {
    harness.sqlite.run('INSERT INTO person (id, name) VALUES (?, ?)', [id, name]);
    harness.sqlite.run(
      'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
      [id, 'org-a', name],
    );
  }
  for (const workPackage of workPackages)
    harness.sqlite.run(
      "UPDATE work_package SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
      [workPackage.workPackageId],
    );
  const rows: readonly [number, string, number][] = [
    [0, 'ana', 1],
    [1, 'ana', 1],
    [1, 'ben', 2],
    [2, 'ben', 1],
  ];
  for (const [workPackageIndex, personId, days] of rows) {
    const workPackage = workPackages[workPackageIndex];
    const workItemId = `topology-${String(workPackageIndex)}-${personId}`;
    harness.sqlite.run(
      'INSERT INTO work_item (id, work_package_id, position, name) VALUES (?, ?, ?, ?)',
      [workItemId, workPackage.workPackageId, personId === 'ana' ? 10 : 20, workItemId],
    );
    harness.sqlite.run(
      'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, ?, ?, ?)',
      [workItemId, workPackage.stepId, days, days, days],
    );
    harness.sqlite.run(
      'INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)',
      [workItemId, workPackage.stepId, personId],
    );
  }
  const bridgeWorkPackage = workPackages[1];
  harness.sqlite.run(
    'INSERT INTO dependency (id, work_package_id, predecessor_id, successor_id) VALUES (?, ?, ?, ?)',
    ['topology-bridge-order', bridgeWorkPackage.workPackageId, 'topology-1-ana', 'topology-1-ben'],
  );
  harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  const [upstream, bridge, downstream] = workPackages;
  const answer = await harness.call(
    'ada',
    'POST',
    `/api/work-packages/${bridge.workPackageId}/commands`,
    {
      commands: [
        {
          kind: 'setAssignee',
          workItemId: 'topology-1-ana',
          stepId: bridge.stepId,
          personId: null,
        },
      ],
    },
  );
  expect(answer.status).toBe(200);
  const pairs = harness.sqlite
    .query<{ subscription: string; message: string }, []>(
      "SELECT subscription, message FROM event_log WHERE message LIKE '%elsewhere_changed%' ORDER BY subscription, seq",
    )
    .all()
    .map(({ subscription, message }) => {
      const event = JSON.parse(message) as { workPackageId: string; causeWorkPackageId: string };
      return [subscription, event.workPackageId, event.causeWorkPackageId];
    });
  expect(pairs).toContainEqual([
    `work-package:${bridge.workPackageId}`,
    bridge.workPackageId,
    upstream.workPackageId,
  ]);
  expect(pairs).toContainEqual([
    `work-package:${downstream.workPackageId}`,
    downstream.workPackageId,
    upstream.workPackageId,
  ]);
  expect(pairs).toContainEqual([
    `work-package:${downstream.workPackageId}`,
    downstream.workPackageId,
    bridge.workPackageId,
  ]);
});
