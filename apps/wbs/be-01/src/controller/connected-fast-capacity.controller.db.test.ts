import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;

beforeEach(async () => {
  harness = OrganizationHarness.openComposedWith({ withOptimizer: true, solverVersion: '0.4.0' });
  await harness.register('ada');
  harness.organization('capacity-org');
  harness.member('capacity-org', 'ada', 'admin');
  harness.bind('ada', 'capacity-org');
  harness.activate();
  // Synthetic authority exercises installed readers; it does not prove authoring activation.
  seedDependencyAuthority(harness.databasePath());
});

afterEach(async () => {
  await harness.closeComposed();
});

// Proof: removing resource project scoping in connected-plan.ts made mounted A-1 start at 0 instead of 1 (capacity-resource-scope-fault.log).
test('mounted connected Fast keeps identical resource catalog IDs in distinct project capacity pools', async () => {
  harness.sqlite.run(
    "INSERT INTO resource (id,name,kind,unit_label) VALUES ('machine','Machine','divisible','slots')",
  );
  harness.sqlite.run(
    "INSERT INTO resource_organization (resource_id,organization_id,name) VALUES ('machine','capacity-org','Machine')",
  );
  const create = async (name: string, units: number) => {
    const answer = await harness.call('ada', 'POST', '/api/projects', { name });
    expect(answer.status).toBe(200);
    const created = answer.body as { project: { id: string }; steps: { id: string }[] };
    const projectId = created.project.id;
    const stepId = created.steps[0].id;
    harness.sqlite.run('DELETE FROM step WHERE project_id=? AND id<>?', [projectId, stepId]);
    harness.sqlite.run(
      "UPDATE project SET start_date='2026-10-05',schedule_engine='fast',optimization_enabled=0,estimate_rounding='exact' WHERE id=?",
      [projectId],
    );
    harness.sqlite.run(
      "INSERT INTO project_resource_capacity (project_id,resource_id,units) VALUES (?,'machine',?)",
      [projectId, units],
    );
    for (const position of [0, 1]) {
      const id = `${name}-${String(position)}`;
      harness.sqlite.run('INSERT INTO work_item (id,project_id,position,name) VALUES (?,?,?,?)', [
        id,
        projectId,
        position,
        id,
      ]);
      harness.sqlite.run(
        'INSERT INTO estimate (work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,1,1,1)',
        [id, stepId],
      );
      harness.sqlite.run(
        "INSERT INTO work_item_resource_demand (work_item_id,resource_id,units) VALUES (?,'machine',1)",
        [id],
      );
    }
    return { projectId, stepId };
  };
  const a = await create('A', 1);
  const b = await create('B', 2);
  // SS connects the component without delaying B behind A's competing second leaf.
  harness.sqlite.run(
    "INSERT INTO external_dependency (id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('bridge','capacity-org',?,?,'A-0','B-0','whole','whole','SS')",
    [a.projectId, b.projectId],
  );

  for (const [project, name, units, starts] of [
    [a, 'A', 1, [0, 1]],
    [b, 'B', 2, [0, 0]],
  ] as const) {
    const tree = await harness.call('ada', 'GET', `/api/projects/${project.projectId}/work-items`);
    expect(tree.status).toBe(200);
    expect(tree.body).toMatchObject({
      workItems: starts.map((earliestStart, position) => ({
        id: `${name}-${String(position)}`,
        projectId: project.projectId,
        schedule: { earliestStart, earliestFinish: earliestStart + 1 },
      })),
      ...(name === 'A'
        ? { resourceLabels: [{ id: 'machine', name: 'Machine', unitLabel: 'slots' }] }
        : {}),
      slices: starts.map((earliestStart, position) => ({
        workItemId: `${name}-${String(position)}`,
        stepId: project.stepId,
        earliestStart,
        earliestFinish: earliestStart + 1,
        ...(name === 'A' && position === 1
          ? { capacityResource: { resourceId: 'machine', units: 1 } }
          : {}),
      })),
    });
    expect(
      await harness.call('ada', 'GET', `/api/projects/${project.projectId}/resources`),
    ).toMatchObject({
      status: 200,
      body: {
        resources: [{ id: 'machine' }],
        capacities: [{ resourceId: 'machine', units }],
        demands: [
          { workItemId: `${name}-0`, resourceId: 'machine', units: 1 },
          { workItemId: `${name}-1`, resourceId: 'machine', units: 1 },
        ],
      },
    });
  }
});
