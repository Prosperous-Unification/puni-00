import { createProject, createWorkPackage } from '@wbs/contracts';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;

beforeEach(async () => {
  harness = OrganizationHarness.openComposedWith({ withOptimizer: true, solverVersion: '0.4.0' });
  await harness.register('ada');
  harness.organization('capacity-org');
  harness.member('capacity-org', 'ada', 'admin', ['org-admin']);
  harness.bind('ada', 'capacity-org');
  harness.activate();
  // Synthetic authority exercises installed readers; it does not prove authoring activation.
  seedDependencyAuthority(harness.databasePath());
});

afterEach(async () => {
  await harness.closeComposed();
});

// Proof: removing resource work package scoping in connected-plan.ts made mounted A-1 start at 0 instead of 1 (capacity-resource-scope-fault.log).
test('mounted connected Fast keeps identical resource catalog IDs in distinct work package capacity pools', async () => {
  harness.sqlite.run(
    "INSERT INTO resource (id,name,kind,unit_label) VALUES ('machine','Machine','divisible','slots')",
  );
  harness.sqlite.run(
    "INSERT INTO resource_organization (resource_id,organization_id,name) VALUES ('machine','capacity-org','Machine')",
  );
  const create = async (name: string, units: number) => {
    const parent = await harness.call('ada', createProject.method, createProject.path, { name });
    expect(parent.status).toBe(201);
    const project = await createProject.responses[0].schema.validator['~standard'].validate(
      parent.body,
    );
    if (project.issues !== undefined) throw new Error('capacity fixture Project reply malformed');
    const projectId = project.value.project.id;
    const stepId = name.toLowerCase() + '-build';
    await harness.publicWrites().uow.run(async ({ stores }) => {
      const bound = await stores.stepCatalogue.defineAndBindStep(
        'capacity-org',
        {
          id: stepId,
          code: stepId,
          name: name + ' Build',
          position: 10,
          defaultAllowancePercent: 0,
          defaultEstimateUnit: 'workdays',
        },
        {
          bindingId: stepId + '-binding',
          scopeKind: 'project',
          scopeId: projectId,
          workItemTypeId: null,
          position: 10,
        },
        { at: 1, by: harness.userId('ada') },
      );
      if (!bound.ok) throw new Error('capacity fixture step binding refused: ' + bound.reason);
      return { commit: true, value: undefined };
    });
    const answer = await harness.call('ada', createWorkPackage.method, createWorkPackage.path, {
      projectId,
      name,
    });
    expect(answer.status).toBe(200);
    const created = await createWorkPackage.responses[0].schema.validator['~standard'].validate(
      answer.body,
    );
    if (created.issues !== undefined)
      throw new Error('capacity fixture Work Package reply malformed');
    expect(created.value.steps.map(({ id }) => id)).toEqual([stepId]);
    const workPackageId = created.value.workPackage.id;
    harness.sqlite.run(
      "UPDATE work_package SET start_date='2026-10-05',schedule_engine='fast',optimization_enabled=0,estimate_rounding='exact' WHERE id=?",
      [workPackageId],
    );
    harness.sqlite.run(
      "INSERT INTO work_package_resource_capacity (work_package_id,resource_id,units) VALUES (?,'machine',?)",
      [workPackageId, units],
    );
    for (const position of [0, 1]) {
      const id = `${name}-${String(position)}`;
      harness.sqlite.run(
        'INSERT INTO work_item (id,work_package_id,position,name) VALUES (?,?,?,?)',
        [id, workPackageId, position, id],
      );
      harness.sqlite.run(
        'INSERT INTO estimate (work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,1,1,1)',
        [id, stepId],
      );
      harness.sqlite.run(
        "INSERT INTO work_item_resource_demand (work_item_id,resource_id,units) VALUES (?,'machine',1)",
        [id],
      );
    }
    return { workPackageId, stepId };
  };
  const a = await create('A', 1);
  const b = await create('B', 2);
  // SS connects the component without delaying B behind A's competing second leaf.
  harness.sqlite.run(
    "INSERT INTO external_dependency (id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('bridge','capacity-org',?,?,'A-0','B-0','whole','whole','SS')",
    [a.workPackageId, b.workPackageId],
  );

  for (const [workPackage, name, units, starts] of [
    [a, 'A', 1, [0, 1]],
    [b, 'B', 2, [0, 0]],
  ] as const) {
    const tree = await harness.call(
      'ada',
      'GET',
      `/api/work-packages/${workPackage.workPackageId}/work-items`,
    );
    expect(tree.status).toBe(200);
    expect(tree.body).toMatchObject({
      workItems: starts.map((earliestStart, position) => ({
        id: `${name}-${String(position)}`,
        workPackageId: workPackage.workPackageId,
        schedule: { earliestStart, earliestFinish: earliestStart + 1 },
      })),
      ...(name === 'A'
        ? { resourceLabels: [{ id: 'machine', name: 'Machine', unitLabel: 'slots' }] }
        : {}),
      slices: starts.map((earliestStart, position) => ({
        workItemId: `${name}-${String(position)}`,
        stepId: workPackage.stepId,
        earliestStart,
        earliestFinish: earliestStart + 1,
        ...(name === 'A' && position === 1
          ? { capacityResource: { resourceId: 'machine', units: 1 } }
          : {}),
      })),
    });
    expect(
      await harness.call('ada', 'GET', `/api/work-packages/${workPackage.workPackageId}/resources`),
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
