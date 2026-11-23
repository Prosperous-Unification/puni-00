import { rejects } from 'node:assert/strict';

import { bindCatalogueStep, createProject } from '@wbs/contracts';
import { clockOf } from '@wbs/core';
import { StepCataloguePurpose } from '@wbs/core/service/step-catalogue-purpose';
import { suggestStepCode } from '@wbs/domain';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

const opened: OrganizationHarness[] = [];
afterEach(() => {
  for (const harness of opened.splice(0)) harness.close();
});

function bindProjectStep(
  harness: OrganizationHarness,
  projectId: string,
  name: string,
  code: string,
  position: number,
) {
  return harness.call('ada', bindCatalogueStep.method, bindCatalogueStep.path, {
    scopeKind: 'project',
    scopeId: projectId,
    workItemTypeId: null,
    position,
    define: { code, name, position, defaultEstimateUnit: 'workdays', defaultAllowanceBps: 0 },
  });
}

function renameStep(harness: OrganizationHarness, stepId: string, name: string) {
  return harness.call('ada', 'PATCH', `/api/organization/steps/${stepId}`, { name });
}

async function fixture(push?: () => Promise<Response>, onCaptured?: () => void) {
  const harness = OrganizationHarness.openComposed(
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    push,
    undefined,
    onCaptured,
  );
  // Synthetic stored authority supports fixture edges; the mounted writer still has dormant admission.
  seedDependencyAuthority(harness.databasePath());
  opened.push(harness);
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
  harness.grantPermissions('org-a', 'ada', [
    'organization.create_project',
    'organization.manage_settings',
    'package.manage_settings',
  ]);
  harness.bind('ada', 'org-a');
  harness.activate();
  const create = async (name: string) => {
    const created = await harness.call('ada', 'POST', '/api/projects', {
      name: `${name} engagement`,
      workPackage: { name },
    });
    if (created.status !== 201)
      throw new Error('fixture project birth refused', { cause: created });
    const checked = await createProject.responses[0].schema.validator['~standard'].validate(
      created.body,
    );
    if (checked.issues !== undefined)
      throw new Error('fixture project malformed', { cause: checked.issues });
    const { project, workPackage } = checked.value;
    if (workPackage === undefined) throw new Error('fixture project omitted work package');
    const bound = await bindProjectStep(
      harness,
      project.id,
      `${name} step`,
      suggestStepCode(name, new Set()),
      10,
    );
    if (bound.status !== 201) throw new Error('fixture step binding refused', { cause: bound });
    const binding = await bindCatalogueStep.responses[0].schema.validator['~standard'].validate(
      bound.body,
    );
    if (binding.issues !== undefined)
      throw new Error('fixture step binding malformed', { cause: binding.issues });
    const rowId = `${workPackage.id}-row`;
    harness.sqlite.run(
      'INSERT INTO work_item (id, work_package_id, position, name) VALUES (?, ?, 10, ?)',
      [rowId, workPackage.id, name],
    );
    return {
      id: workPackage.id,
      projectId: project.id,
      rowId,
      stepId: binding.value.binding.stepId,
    };
  };
  const upstream = await create('Upstream');
  const downstream = await create('Downstream');
  const tail = await create('Tail');
  const unrelated = await create('Unrelated');
  harness.organization('org-b');
  harness.member('org-b', 'ada', 'member', ['project-contributor', 'org-viewer']);
  harness.grantPermissions('org-b', 'ada', [
    'organization.create_project',
    'package.manage_settings',
  ]);
  harness.bind('ada', 'org-b');
  const foreign = await create('Protected foreign name');
  const foreignTail = await create('Protected foreign successor');
  harness.sqlite.run(
    `INSERT INTO external_dependency (id, organization_id, predecessor_work_package_id, successor_work_package_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES ('foreign-edge', 'org-b', ?, ?, ?, 'whole', ?, 'whole', 'FS')`,
    [foreign.id, foreignTail.id, foreign.rowId, foreignTail.rowId],
  );
  harness.bind('ada', 'org-a');
  const connect = (id: string, predecessor: typeof upstream, successor: typeof upstream) =>
    harness.sqlite.run(
      `INSERT INTO external_dependency (id, organization_id, predecessor_work_package_id, successor_work_package_id, predecessor_work_item_id, predecessor_scope, successor_work_item_id, successor_scope, type) VALUES (?, 'org-a', ?, ?, ?, 'whole', ?, 'whole', 'FS')`,
      [id, predecessor.id, successor.id, predecessor.rowId, successor.rowId],
    );
  connect('up-down', upstream, downstream);
  connect('down-tail', downstream, tail);
  const events = (workPackageId: string) =>
    harness.sqlite
      .query<{ message: string }, [string]>(
        "SELECT message FROM event_log WHERE subscription = ? AND message LIKE '%elsewhere_changed%' ORDER BY seq",
      )
      .all(`work-package:${workPackageId}`)
      .map(({ message }) => JSON.parse(message) as unknown);
  return { harness, upstream, downstream, tail, unrelated, foreign, events, connect };
}

it('rename invalidates dependency label readers without retargeting or foreign delivery', async () => {
  const { harness, upstream, downstream, tail, foreign, events } = await fixture();
  const before = harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all();
  const answer = await harness.call('ada', 'PATCH', `/api/work-packages/${upstream.id}`, {
    name: 'Renamed upstream',
    abbreviation: 'REN',
  });
  expect(answer.status).toBe(200);
  for (const workPackage of [downstream, tail])
    expect(events(workPackage.id)).toEqual([
      { type: 'elsewhere_changed', workPackageId: workPackage.id, causeWorkPackageId: upstream.id },
    ]);
  expect(events(foreign.id)).toEqual([]);
  const abbreviationOnly = await harness.call('ada', 'PATCH', `/api/work-packages/${upstream.id}`, {
    abbreviation: 'NEXT',
  });
  expect(abbreviationOnly.status).toBe(200);
  for (const workPackage of [downstream, tail]) expect(events(workPackage.id)).toHaveLength(2);
  expect(events(foreign.id)).toEqual([]);
  expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
    before,
  );
  expect(JSON.stringify(events(downstream.id))).not.toContain('Protected foreign name');
});

it('dependency fanout delivery occurs after commit and writer release', async () => {
  const observer: { current?: () => void } = {};
  const { harness, upstream, downstream, events } = await fixture(() => {
    observer.current?.();
    return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
  });
  let deliveries = 0;
  observer.current = () => {
    const stored = harness.sqlite
      .query<{ name: string }, [string]>('SELECT name FROM work_package WHERE id = ?')
      .get(upstream.id);
    expect(stored?.name).toBe('Committed name');
    harness.sqlite.run('UPDATE work_package SET name = name WHERE id = ?', [downstream.id]);
    deliveries++;
  };
  const answer = await harness.call('ada', 'PATCH', `/api/work-packages/${upstream.id}`, {
    name: 'Committed name',
  });
  expect(answer.status).toBe(200);
  expect(deliveries).toBeGreaterThan(0);
  expect(events(downstream.id)).toHaveLength(1);
});

it('a rejected dependency command batch publishes nothing and rolls earlier mutations back', async () => {
  const { harness, upstream, downstream, tail, events } = await fixture();
  const before = [
    'estimate',
    'step_progress',
    'event_log',
    'event_sequencer',
    'command_journal',
    'plan_event',
  ].map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const answer = await harness.call('ada', 'POST', `/api/work-packages/${upstream.id}/commands`, {
    commands: [
      {
        kind: 'setEstimate',
        workItemId: upstream.rowId,
        stepId: upstream.stepId,
        days: { optimistic: 3, realistic: 3, pessimistic: 3 },
      },
      {
        kind: 'setEstimate',
        workItemId: 'absent',
        stepId: upstream.stepId,
        days: { optimistic: 4, realistic: 4, pessimistic: 4 },
      },
    ],
  });
  expect(answer.status).toBe(404);
  expect(
    [
      'estimate',
      'step_progress',
      'event_log',
      'event_sequencer',
      'command_journal',
      'plan_event',
    ].map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
  ).toEqual(before);
  expect(events(downstream.id)).toEqual([]);
  expect(events(tail.id)).toEqual([]);
});

it.each([false, true])(
  'mounted completion refreshes successor-only readiness with shared mode %s',
  async (shared) => {
    const { harness, upstream, downstream, tail, foreign, events } = await fixture();
    if (shared) harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    harness.sqlite.run("UPDATE work_item SET readiness = 'ready'");
    harness.sqlite.run(
      "UPDATE external_dependency SET predecessor_scope = 'node', predecessor_step_id = ?, successor_scope = 'node', successor_step_id = ? WHERE id = 'up-down'",
      [upstream.stepId, downstream.stepId],
    );
    harness.sqlite.run(
      "UPDATE external_dependency SET predecessor_scope = 'node', predecessor_step_id = ?, successor_scope = 'node', successor_step_id = ? WHERE id = 'down-tail'",
      [downstream.stepId, tail.stepId],
    );
    const before = await harness.call(
      'ada',
      'GET',
      `/api/work-packages/${downstream.id}/work-items?full=true`,
    );
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({
      workItems: [{ id: downstream.rowId, nodeReadings: { [downstream.stepId]: 'unknown' } }],
    });
    const answer = await harness.call('ada', 'POST', `/api/work-packages/${upstream.id}/commands`, {
      commands: [
        { kind: 'setProgress', workItemId: upstream.rowId, stepId: upstream.stepId, state: 'done' },
      ],
    });
    expect(answer.status).toBe(200);
    expect(
      harness.sqlite
        .query('SELECT state FROM step_progress WHERE work_item_id = ? AND step_id = ?')
        .get(upstream.rowId, upstream.stepId),
    ).toEqual({ state: 'done' });
    for (const workPackage of [downstream, tail])
      expect(events(workPackage.id)).toEqual([
        {
          type: 'elsewhere_changed',
          workPackageId: workPackage.id,
          causeWorkPackageId: upstream.id,
        },
      ]);
    expect(events(foreign.id)).toEqual([]);
    const refreshed = await harness.call(
      'ada',
      'GET',
      `/api/work-packages/${downstream.id}/work-items?full=true`,
    );
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      workItems: [{ id: downstream.rowId, nodeReadings: { [downstream.stepId]: 'waiting' } }],
    });
  },
);

it('mounted shared-person bridge carries a label change across an external edge', async () => {
  const { harness, upstream, downstream, tail, events } = await fixture();
  harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  harness.sqlite.run("DELETE FROM external_dependency WHERE id = 'up-down'");
  harness.sqlite.run("INSERT INTO person (id, name) VALUES ('ana', 'Ana')");
  harness.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('ana', 'org-a', 'Ana')",
  );
  for (const workPackage of [upstream, downstream])
    harness.sqlite.run(
      'INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)',
      [workPackage.rowId, workPackage.stepId, 'ana'],
    );
  const answer = await harness.call('ada', 'PATCH', `/api/work-packages/${upstream.id}`, {
    name: 'Changed over person bridge',
  });
  expect(answer.status).toBe(200);
  for (const workPackage of [downstream, tail])
    expect(events(workPackage.id)).toEqual([
      { type: 'elsewhere_changed', workPackageId: workPackage.id, causeWorkPackageId: upstream.id },
    ]);
});

it.each([false, true])(
  'rank reversal invalidates the dependency component with shared mode %s',
  async (shared) => {
    const { harness, upstream, downstream, tail, foreign, unrelated, events } = await fixture();
    harness.sqlite.run(
      "UPDATE organization_membership SET role = 'admin' WHERE organization_id = 'org-a'",
    );
    if (shared) {
      harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      harness.sqlite.run("DELETE FROM external_dependency WHERE id = 'down-tail'");
      harness.sqlite.run("INSERT INTO person (id, name) VALUES ('rank-bridge', 'Bridge')");
      harness.sqlite.run(
        "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('rank-bridge', 'org-a', 'Bridge')",
      );
      for (const workPackage of [downstream, tail])
        harness.sqlite.run(
          "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, 'rank-bridge')",
          [workPackage.rowId, workPackage.stepId],
        );
    }
    harness.grantPermissions('org-a', 'ada', ['organization.manage_spaces']);
    const move = (id: string, afterWorkPackageId: string | null) =>
      harness.call('ada', 'POST', `/api/organization/work-packages/${id}/rank`, {
        afterWorkPackageId,
      });
    const unchanged = [upstream, downstream, tail, foreign].map(({ id }) => events(id));
    expect((await move(unrelated.id, null)).status).toBe(200);
    expect([upstream, downstream, tail, foreign].map(({ id }) => events(id))).toEqual(unchanged);
    expect((await move(foreign.id, null)).status).toBe(404);
    expect([upstream, downstream, tail, foreign].map(({ id }) => events(id))).toEqual(unchanged);
    expect((await move(downstream.id, null)).status).toBe(200);
    expect(events(upstream.id)).toEqual([
      { type: 'elsewhere_changed', workPackageId: upstream.id, causeWorkPackageId: downstream.id },
    ]);
    expect(events(downstream.id)).toEqual([
      { type: 'elsewhere_changed', workPackageId: downstream.id, causeWorkPackageId: upstream.id },
    ]);
    expect(events(tail.id)).toHaveLength(2);
    expect(events(unrelated.id)).toEqual([]);
    expect(events(foreign.id)).toEqual([]);
    const after = [upstream, downstream, tail].map(({ id }) => events(id));
    expect((await move(downstream.id, downstream.id)).status).toBe(200);
    expect([upstream, downstream, tail].map(({ id }) => events(id))).toEqual(after);
  },
);

it('number-only edits refresh dependency labels without retargeting or foreign events', async () => {
  const { harness, upstream, downstream, tail, foreign, events } = await fixture();
  harness.sqlite.run('UPDATE work_item SET frozen_number = ? WHERE id = ?', [
    '090',
    upstream.rowId,
  ]);
  const incoming = (body: unknown) =>
    (body as { connectedDependencies: readonly { id: string }[] }).connectedDependencies.find(
      ({ id }) => id === 'up-down',
    );
  const relationships = harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all();
  const before = await harness.call(
    'ada',
    'GET',
    `/api/work-packages/${downstream.id}/work-items?full=true`,
  );
  expect(before.status).toBe(200);
  expect(incoming(before.body)).toMatchObject({
    id: 'up-down',
    predecessor: {
      endpoint: { workItemId: upstream.rowId },
      workItemNumber: '090',
      qualifiedReference: 'UPS.090',
    },
  });
  const changed = await harness.call('ada', 'POST', `/api/work-packages/${upstream.id}/commands`, {
    commands: [{ kind: 'unfreezeWorkItem', workItemId: upstream.rowId }],
  });
  expect(changed.status).toBe(200);
  // Proof: dropping incident traversal made this mounted number-only command retain no successor events.
  for (const workPackage of [downstream, tail])
    expect(events(workPackage.id)).toEqual([
      { type: 'elsewhere_changed', workPackageId: workPackage.id, causeWorkPackageId: upstream.id },
    ]);
  expect(events(foreign.id)).toEqual([]);
  expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
    relationships,
  );
  const refreshed = await harness.call(
    'ada',
    'GET',
    `/api/work-packages/${downstream.id}/work-items?full=true`,
  );
  expect(refreshed.status).toBe(200);
  expect(incoming(refreshed.body)).toMatchObject({
    id: 'up-down',
    predecessor: {
      endpoint: { workItemId: upstream.rowId },
      workItemNumber: '010',
      qualifiedReference: 'UPS.010',
    },
  });
});

it.each([false, true])(
  'project step binding refreshes connected whole readiness (shared=%s)',
  async (shared) => {
    const { harness, upstream, downstream, tail, unrelated, foreign, events } = await fixture();
    if (shared) harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    harness.sqlite.run("UPDATE work_item SET readiness = 'ready'");
    harness.sqlite.run(
      "INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, 'done', 1)",
      [upstream.rowId, upstream.stepId],
    );
    expect(harness.sqlite.query('SELECT COUNT(*) AS count FROM assignment').get()).toEqual({
      count: 0,
    });
    const relationships = harness.sqlite
      .query('SELECT * FROM external_dependency ORDER BY id')
      .all();
    const read = () =>
      harness.call('ada', 'GET', `/api/work-packages/${downstream.id}/work-items?full=true`);
    expect((await read()).body).toMatchObject({
      workItems: [{ id: downstream.rowId, nodeReadings: { [downstream.stepId]: 'waiting' } }],
    });
    const added = await bindProjectStep(harness, upstream.projectId, 'Release', 'release', 20);
    expect(added.status).toBe(201);
    for (const workPackage of [downstream, tail])
      expect(events(workPackage.id)).toEqual([
        {
          type: 'elsewhere_changed',
          workPackageId: workPackage.id,
          causeWorkPackageId: upstream.id,
        },
      ]);
    expect(events(upstream.id)).toEqual([]);
    expect(events(unrelated.id)).toEqual([]);
    expect(events(foreign.id)).toEqual([]);
    expect(
      harness.sqlite
        .query("SELECT COUNT(*) AS count FROM event_log WHERE message LIKE '%elsewhere_changed%'")
        .get(),
    ).toEqual({ count: 2 });
    expect((await read()).body).toMatchObject({
      workItems: [{ id: downstream.rowId, nodeReadings: { [downstream.stepId]: 'unknown' } }],
    });
    expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
      relationships,
    );
    const previous = harness.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all();
    expect(
      (await bindProjectStep(harness, upstream.projectId, 'Release again', 'release', 30)).status,
    ).toBe(409);
    expect((await bindProjectStep(harness, upstream.projectId, ' ', 'empty', 30)).status).toBe(422);
    expect(harness.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all()).toEqual(previous);
  },
);

it.each([false, true])(
  'catalogue step rename refreshes connected labels without retargeting (shared=%s)',
  async (shared) => {
    const { harness, upstream, downstream, tail, unrelated, foreign, events } = await fixture();
    if (shared) harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    harness.sqlite.run(
      "UPDATE external_dependency SET predecessor_scope = 'node', predecessor_step_id = ? WHERE id = 'up-down'",
      [upstream.stepId],
    );
    expect(harness.sqlite.query('SELECT COUNT(*) AS count FROM assignment').get()).toEqual({
      count: 0,
    });
    const relationships = harness.sqlite
      .query('SELECT * FROM external_dependency ORDER BY id')
      .all();
    const read = () =>
      harness.call('ada', 'GET', `/api/work-packages/${downstream.id}/work-items?full=true`);
    const before = (await read()).body as {
      connectedDependencies: {
        id: string;
        predecessor: {
          endpoint: unknown;
          step: { id: string; name: string };
          qualifiedReference: string;
        };
      }[];
    };
    expect(before).toMatchObject({
      workItems: [{ id: downstream.rowId, nodeReadings: { [downstream.stepId]: 'unknown' } }],
    });
    const previousLink = before.connectedDependencies.find(({ id }) => id === 'up-down');
    if (previousLink === undefined) throw new Error('step fixture missing incoming relationship');
    const renamed = await renameStep(harness, upstream.stepId, 'Renamed prerequisite step');
    expect(renamed.status).toBe(200);
    for (const workPackage of [downstream, tail])
      expect(events(workPackage.id)).toEqual([
        {
          type: 'elsewhere_changed',
          workPackageId: workPackage.id,
          causeWorkPackageId: upstream.id,
        },
      ]);
    expect(events(upstream.id)).toEqual([]);
    expect(events(unrelated.id)).toEqual([]);
    expect(events(foreign.id)).toEqual([]);
    expect(
      harness.sqlite
        .query("SELECT COUNT(*) AS count FROM event_log WHERE message LIKE '%elsewhere_changed%'")
        .get(),
    ).toEqual({ count: 2 });
    const refreshed = await read();
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      workItems: [{ id: downstream.rowId, nodeReadings: { [downstream.stepId]: 'unknown' } }],
    });
    const refreshedLink = (refreshed.body as typeof before).connectedDependencies.find(
      ({ id }) => id === 'up-down',
    );
    expect(refreshedLink).toMatchObject({
      id: 'up-down',
      predecessor: {
        endpoint: previousLink.predecessor.endpoint,
        step: { id: upstream.stepId, name: 'Renamed prerequisite step' },
        qualifiedReference: previousLink.predecessor.qualifiedReference,
      },
    });
    expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
      relationships,
    );
    expect((await renameStep(harness, upstream.stepId, 'Renamed prerequisite step')).status).toBe(
      200,
    );
    expect((await renameStep(harness, upstream.stepId, ' ')).status).toBe(422);
    for (const workPackage of [downstream, tail]) expect(events(workPackage.id)).toHaveLength(1);
  },
);

it('invalidates connected plans after existing step bind, reorder and unbind', async () => {
  const { harness, upstream, downstream, tail, unrelated, foreign, events } = await fixture();
  const scope = { scopeKind: 'project', scopeId: upstream.projectId };
  const initial = harness.sqlite
    .query<{ id: string }, [string, string]>(
      'SELECT id FROM step_binding WHERE scope_id=? AND step_id=?',
    )
    .get(upstream.projectId, upstream.stepId);
  if (initial === null) throw new Error('fixture project binding missing');
  const kind = { type: 'elsewhere_changed', causeWorkPackageId: upstream.id };
  const expectFanout = (count: number) => {
    for (const { id } of [downstream, tail])
      expect(events(id)).toEqual(
        Array.from({ length: count }, () => ({ ...kind, workPackageId: id })),
      );
    for (const { id } of [upstream, unrelated, foreign]) expect(events(id)).toEqual([]);
  };
  const added = await harness.call('ada', bindCatalogueStep.method, bindCatalogueStep.path, {
    ...scope,
    workItemTypeId: null,
    position: 20,
    stepId: unrelated.stepId,
  });
  expect(added.status).toBe(201);
  const decoded = await bindCatalogueStep.responses[0].schema.validator['~standard'].validate(
    added.body,
  );
  if (decoded.issues !== undefined)
    throw new Error('fixture binding reply malformed', { cause: decoded.issues });
  const bindingId = decoded.value.binding.bindingId;
  expectFanout(1);
  const reorder = () =>
    harness.call('ada', 'POST', '/api/organization/step-bindings/reorder', {
      ...scope,
      ids: [bindingId, initial.id],
    });
  expect((await reorder()).status).toBe(204);
  expectFanout(2);
  expect((await reorder()).status).toBe(204);
  expectFanout(2);
  expect(
    (
      await harness.call('ada', 'DELETE', `/api/organization/step-bindings/${bindingId}`, {
        dryRun: false,
      })
    ).status,
  ).toBe(204);
  expectFanout(3);
});

it('refuses a catalogue rename when the writer lacks dependency capture', async () => {
  const { harness, upstream, downstream, tail, events } = await fixture();
  const writes = harness.publicWrites();
  const delivery = writes.committedFanout;
  if (delivery === undefined) throw new Error('fixture omitted committed event delivery');
  const purpose = new StepCataloguePurpose({
    commandAccess: writes.commandAccess,
    uow: { run: (act) => writes.uow.run(({ stores }) => act({ stores })) },
    delivery,
    clock: clockOf({ now: () => 100, newId: () => crypto.randomUUID() }),
  });
  const principal = await harness.authenticatedCommandPrincipal('ada', '');
  const readName = () =>
    harness.sqlite
      .query<{ name: string }, [string]>('SELECT name FROM step_definition WHERE id=?')
      .get(upstream.stepId);
  expect(readName()).toEqual({ name: 'Upstream step' });
  await rejects(
    purpose.patch(
      {
        kind: 'human',
        principal,
        expectedAccess: {
          kind: 'scoped',
          principal: { id: principal.id },
          scope: { organizationId: 'org-a', userId: principal.id, cap: null },
        },
      },
      upstream.stepId,
      { name: 'Unobserved rename' },
    ),
    /catalogue writer lacks dependency capture/,
  );
  expect(readName()).toEqual({ name: 'Upstream step' });
  expect(events(downstream.id)).toEqual([]);
  expect(events(tail.id)).toEqual([]);
});

it.each(['add', 'rename'] as const)(
  'catalogue step %s rolls back the write and first fanout row when the second insert fails',
  async (mutation) => {
    let pushes = 0;
    const { harness, upstream, downstream, tail, events } = await fixture(() => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    });
    const tables = [
      'step_definition',
      'step_binding',
      'work_package_step',
      'work_package',
      'work_item',
      'event_log',
      'event_sequencer',
      'command_journal',
      'plan_event',
      'organization_audit',
    ];
    const snapshot = () =>
      tables.map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    const previousPushes = pushes;
    harness.sqlite.run(`CREATE TRIGGER reject_second_step_fanout BEFORE INSERT ON event_log
      WHEN NEW.message LIKE '%elsewhere_changed%' AND
        (SELECT COUNT(*) FROM event_log WHERE message LIKE '%elsewhere_changed%') >= 1
      BEGIN SELECT RAISE(ABORT, 'injected second step fanout insert failure'); END`);
    const answer =
      mutation === 'add'
        ? await bindProjectStep(harness, upstream.projectId, 'Rolled back addition', 'rollback', 20)
        : await renameStep(harness, upstream.stepId, 'Rolled back rename');
    expect(answer.status).toBe(500);
    expect(snapshot()).toEqual(before);
    expect(events(downstream.id)).toEqual([]);
    expect(events(tail.id)).toEqual([]);
    expect(pushes).toBe(previousPushes);
  },
);

it.each(['add', 'rename'] as const)(
  'catalogue step %s delivers only after its step and complete fanout commit and writer release',
  async (mutation) => {
    const observer: { current?: () => void } = {};
    const { harness, upstream, downstream, tail, events } = await fixture(() => {
      observer.current?.();
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    });
    let deliveries = 0;
    observer.current = () => {
      const written = harness.sqlite
        .query<{ name: string }, [string]>(
          "SELECT definition.name FROM step_definition definition JOIN work_package_step value ON value.step_id=definition.id WHERE value.work_package_id=? AND definition.name='Committed step'",
        )
        .get(upstream.id);
      expect(written).toEqual({ name: 'Committed step' });
      expect(events(downstream.id)).toEqual([
        {
          type: 'elsewhere_changed',
          workPackageId: downstream.id,
          causeWorkPackageId: upstream.id,
        },
      ]);
      expect(events(tail.id)).toEqual([
        { type: 'elsewhere_changed', workPackageId: tail.id, causeWorkPackageId: upstream.id },
      ]);
      harness.sqlite.run('UPDATE work_package SET name = name WHERE id = ?', [downstream.id]);
      deliveries += 1;
    };
    const answer =
      mutation === 'add'
        ? await bindProjectStep(harness, upstream.projectId, 'Committed step', 'committed', 20)
        : await renameStep(harness, upstream.stepId, 'Committed step');
    observer.current = undefined;
    expect(answer.status).toBe(mutation === 'add' ? 201 : 200);
    expect(deliveries).toBeGreaterThan(0);
  },
);

it.each(['add', 'rename'] as const)(
  'catalogue step %s preserves service refusals before broken capture and rolls back a valid write',
  async (mutation) => {
    let armed = false;
    let captures = 0;
    let pushes = 0;
    const { harness, upstream, foreign } = await fixture(
      () => {
        pushes += 1;
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      },
      () => {
        if (armed) {
          captures += 1;
          throw new Error('injected step capture failure');
        }
      },
    );
    const tables = [
      'step_definition',
      'step_binding',
      'work_package_step',
      'work_package',
      'work_item',
      'external_dependency',
      'event_log',
      'event_sequencer',
      'command_journal',
      'plan_event',
      'organization_audit',
    ];
    const snapshot = () =>
      tables.map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    const previousPushes = pushes;
    armed = true;
    const add = (name: string, code: string) =>
      bindProjectStep(harness, upstream.projectId, name, code, 20);
    if (mutation === 'add') {
      expect((await add(' ', 'blank')).status).toBe(422);
      expect((await add('Invalid code', 'bad code')).status).toBe(422);
      expect((await add('Reserved code', 's2')).status).toBe(422);
      expect((await add('Duplicate code', 'upstream')).status).toBe(409);
    } else {
      expect((await renameStep(harness, upstream.stepId, ' ')).status).toBe(422);
      expect((await renameStep(harness, upstream.stepId, 'Downstream step')).status).toBe(409);
      expect((await renameStep(harness, upstream.stepId, 'Upstream step')).status).toBe(200);
      expect((await renameStep(harness, foreign.stepId, 'Foreign organization step')).status).toBe(
        404,
      );
      expect((await renameStep(harness, 'absent-step', 'Absent step')).status).toBe(404);
    }
    expect(captures).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(pushes).toBe(previousPushes);
    const valid =
      mutation === 'add'
        ? await add('Valid addition', 'valid')
        : await renameStep(harness, upstream.stepId, 'Valid rename');
    expect(valid.status).toBe(500);
    expect(captures).toBe(1);
    expect(snapshot()).toEqual(before);
    expect(pushes).toBe(previousPushes);
  },
);
