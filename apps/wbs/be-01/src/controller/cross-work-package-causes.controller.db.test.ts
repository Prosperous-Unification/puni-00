import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

const opened: OrganizationHarness[] = [];
afterEach(() => {
  for (const harness of opened.splice(0)) harness.close();
});

async function fixture() {
  const harness = OrganizationHarness.openComposed();
  // Synthetic stored authority supports fixture edges; the mounted writer still has dormant admission.
  seedDependencyAuthority(harness.databasePath());
  opened.push(harness);
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
  harness.grantPermissions('org-a', 'ada', [
    'organization.create_project',
    'package.manage_settings',
  ]);
  harness.bind('ada', 'org-a');
  harness.activate();
  const create = async (name: string) => {
    const answer = await harness.call('ada', 'POST', '/api/work-packages', { name });
    expect(answer.status).toBe(200);
    const body = answer.body as { workPackage: { id: string }; steps: { id: string }[] };
    const step = body.steps.at(0);
    if (step === undefined) throw new Error('work package fixture omitted step');
    harness.sqlite.run(
      'INSERT INTO work_item (id, work_package_id, position, name) VALUES (?, ?, 10, ?)',
      [`${body.workPackage.id}-row`, body.workPackage.id, name],
    );
    return { id: body.workPackage.id, rowId: `${body.workPackage.id}-row`, stepId: step.id };
  };
  const upstream = await create('Upstream');
  const downstream = await create('Downstream');
  const tail = await create('Tail');
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
  return { harness, upstream, downstream, tail, foreign, foreignTail, events };
}

/**
 * Each cause must reach both the immediate successor and the transitive tail.
 * Proof: replacing the captured scheduler hash with a constant loses estimate
 * and capacity events; independently omitting startDate, scheduleEngine or
 * scheduleObjective loses that cause’s events in both capacity modes. Truncating
 * dependency traversal to the cause loses the tail for all ten mounted cases.
 * Watched failures: cross-work-package-dependencies/evidence/task-5-2-causes.
 */
for (const cause of ['estimate', 'calendar', 'capacity', 'engine', 'objective'])
  for (const shared of [false, true])
    it(`${cause} scheduling edit invalidates dependency readers in ${shared ? 'shared' : 'isolated'} mode`, async () => {
      const { harness, upstream, downstream, tail, foreign, foreignTail, events } = await fixture();
      if (shared)
        harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      harness.sqlite.run("INSERT INTO service_team (id, name) VALUES ('cause-team', 'Cause team')");
      harness.sqlite.run(
        "INSERT INTO service_team_organization (resource_id, organization_id, name) VALUES ('cause-team', 'org-a', 'Cause team')",
      );
      // Existing optimized selection represents a persisted setting on a box without
      // an optimizer; switching back to Fast is an admitted production operation.
      harness.sqlite.run("UPDATE work_package SET schedule_engine = 'optimized' WHERE id = ?", [
        upstream.id,
      ]);
      const created = await harness.call('ada', 'POST', '/api/work-packages', {
        name: 'Unconnected observer',
      });
      expect(created.status).toBe(200);
      const unrelated = (created.body as { workPackage: { id: string } }).workPackage.id;
      const endpoints = harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all();
      const mutate = async (cause: string) => {
        if (cause === 'estimate')
          return harness.call('ada', 'POST', `/api/work-packages/${upstream.id}/commands`, {
            commands: [
              {
                kind: 'setEstimate',
                workItemId: upstream.rowId,
                stepId: upstream.stepId,
                days: { optimistic: 3, realistic: 4, pessimistic: 5 },
              },
            ],
          });
        if (cause === 'capacity')
          return harness.call('ada', 'POST', `/api/work-packages/${upstream.id}/commands`, {
            commands: [{ kind: 'setCapacity', teamId: 'cause-team', size: 2 }],
          });
        const patches: Record<string, unknown> = {
          calendar: { startDate: '2026-10-26' },
          engine: { scheduleEngine: 'fast' },
          objective: { scheduleObjective: 'time' },
        };
        const patch = patches[cause];
        if (patch === undefined) throw new Error(`unknown scheduling cause ${cause}`);
        return harness.call('ada', 'PATCH', `/api/work-packages/${upstream.id}`, patch);
      };

      expect(await mutate(cause)).toMatchObject({ status: 200 });

      for (const workPackage of [downstream, tail])
        expect(events(workPackage.id)).toEqual([
          {
            type: 'elsewhere_changed',
            workPackageId: workPackage.id,
            causeWorkPackageId: upstream.id,
          },
        ]);
      for (const workPackageId of [upstream.id, foreign.id, foreignTail.id, unrelated])
        expect(events(workPackageId)).toEqual([]);
      // Repeating a successful write is not another scheduling change.
      expect(await mutate(cause)).toMatchObject({ status: 200 });
      for (const workPackage of [downstream, tail]) expect(events(workPackage.id)).toHaveLength(1);
      for (const workPackageId of [upstream.id, foreign.id, foreignTail.id, unrelated])
        expect(events(workPackageId)).toEqual([]);
      expect(harness.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(
        endpoints,
      );
    });
