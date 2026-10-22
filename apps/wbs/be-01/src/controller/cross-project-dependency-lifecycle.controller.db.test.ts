import type { PlanTransactionalStores, StoredTypedDependency } from '@wbs/core';
import { grantAdmission } from '@wbs/core';
import { createWorkingPlan } from '@wbs/core/module/plan-commands/working-plan.resource';
import { createDependencyContext } from '@wbs/core/service/dependency-context';
import { DependencyGraphGuard } from '@wbs/core/service/dependency-graph';
import { afterEach, expect, test } from 'bun:test';

import {
  closeFixture,
  harness,
  openFixture,
  readTables,
  requireOwnerEdit,
  runSemantic,
  seedIncidents,
} from './cross-project-dependency-fixture';
afterEach(closeFixture);
test('bound first-child incident transition derives both directions and retains exact creation evidence', async () => {
  const fixture = await openFixture();
  const boundary = harness.publicWrites();
  const owner = fixture.owner.projectId;
  const parent = fixture.owner.workItemId;
  const readStepId = (projectId: string) => {
    const step = harness.sqlite
      .query<{ id: string }, [string]>(
        'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
      )
      .get(projectId);
    if (step === null) throw new Error('fixture step missing');
    return step.id;
  };
  const incoming: StoredTypedDependency = {
    id: 'incoming',
    projectId: owner,
    predecessor: {
      ...fixture.predecessor,
      scope: 'node',
      stepId: readStepId(fixture.predecessor.projectId),
    },
    successor: { ...fixture.owner, scope: 'node', stepId: readStepId(owner) },
    type: 'SS',
  };
  const outgoing: StoredTypedDependency = {
    id: 'outgoing',
    projectId: fixture.successor.projectId,
    predecessor: { ...fixture.owner, scope: 'node', stepId: readStepId(owner) },
    successor: {
      ...fixture.successor,
      scope: 'node',
      stepId: readStepId(fixture.successor.projectId),
    },
    type: 'FF',
  };
  const stamp = { at: 100, by: fixture.principal.id };
  await boundary.uow.run(async (scope) => {
    await scope.stores.typedDependencies.add(incoming, stamp);
    await scope.stores.typedDependencies.add(outgoing, stamp);
    return { commit: true, value: undefined };
  });
  const before = [incoming, outgoing];
  const value = await boundary.uow.run(async (scope) => {
    const resolved = await boundary.commandAccess.resolve({
      kind: 'human',
      principal: fixture.principal,
      expectedAccess: fixture.expectedAccess,
    });
    if (!resolved.ok) throw new Error('fixture authority refused');
    await requireOwnerEdit(scope.stores, fixture);
    const granted = grantAdmission(owner, fixture.principal.id);
    const dependencies = createDependencyContext(
      scope.stores,
      {
        projectId: owner,
        actorId: fixture.principal.id,
        access: resolved.access,
        admission: granted.admission,
      },
      () => undefined,
      { kind: 'raw' },
    );
    try {
      for (const [testedOwner, testedActor] of [
        [fixture.successor.projectId, fixture.principal.id],
        [owner, 'rival'],
      ] as const) {
        const attempt: unknown = await dependencies.context.incidents
          .run(
            testedOwner,
            testedActor,
            { kind: 'fresh', fromWorkItemId: parent, toWorkItemId: 'first-child' },
            { at: 100, by: testedActor },
            () => Promise.resolve({ ok: false, detail: 'unexpected structure reached' }),
          )
          .then(
            (value) => value,
            (error: unknown) => error,
          );
        expect(attempt).toBeInstanceOf(Error);
        expect(attempt instanceof Error ? attempt.message : '').toBe(
          'incident transition owner or actor mismatch',
        );
      }
      const wrongStamp: unknown = await dependencies.context.incidents
        .run(
          owner,
          fixture.principal.id,
          { kind: 'fresh', fromWorkItemId: parent, toWorkItemId: 'first-child' },
          { at: 100, by: 'rival' },
          () => Promise.resolve({ ok: false, detail: 'unexpected structure reached' }),
        )
        .then(
          (value) => value,
          (error: unknown) => error,
        );
      expect(wrongStamp).toBeInstanceOf(Error);
      expect(wrongStamp instanceof Error ? wrongStamp.message : '').toBe(
        'incident transition mapping is malformed',
      );
      const transition = await dependencies.context.incidents.run(
        owner,
        fixture.principal.id,
        { kind: 'fresh', fromWorkItemId: parent, toWorkItemId: 'first-child' },
        stamp,
        async () => {
          const original = await scope.stores.workItems.findById(parent);
          if (original === null) throw new Error('fixture parent missing');
          await scope.stores.workItems.insert(
            {
              ...original,
              id: 'first-child',
              parentId: parent,
              position: 1,
              name: 'First child',
              revision: 0,
            },
            [],
            stamp,
          );
          return { ok: true as const };
        },
      );
      expect(transition.ok).toBe(true);
      if (!transition.ok) throw new Error('transition refused');
      expect(transition.evidence.receipts).toHaveLength(2);
      expect(transition.evidence.externalBefore.map(({ projectId }) => projectId).sort()).toEqual(
        [fixture.predecessor.projectId, fixture.successor.projectId].sort(),
      );
      return { commit: true, value: transition };
    } finally {
      dependencies.close();
    }
  });
  expect(value.ok).toBe(true);
  expect(
    await boundary.uow.run(async (scope) => ({
      commit: false,
      value: await scope.stores.typedDependencies.listIncident([owner]),
    })),
  ).toEqual(
    before.map((relationship) => ({
      ...relationship,
      predecessor:
        relationship.predecessor.projectId === owner
          ? { ...relationship.predecessor, workItemId: 'first-child' }
          : relationship.predecessor,
      successor:
        relationship.successor.projectId === owner
          ? { ...relationship.successor, workItemId: 'first-child' }
          : relationship.successor,
    })),
  );
  expect(
    harness.sqlite.query('SELECT created_at,created_by FROM external_dependency ORDER BY id').all(),
  ).toEqual([
    { created_at: 100, created_by: fixture.principal.id },
    { created_at: 100, created_by: fixture.principal.id },
  ]);
});

for (const fault of ['existing-destination', 'foreign-destination', 'detached-child'] as const)
  test(`bound structural capability refuses ${fault} instead of admitting an arbitrary node retarget`, async () => {
    const fixture = await seedIncidents();
    const boundary = harness.publicWrites();
    const before = readTables();
    let structures = 0;
    const operation = boundary.uow.run(async (scope) => {
      const resolved = await boundary.commandAccess.resolve({
        kind: 'human',
        principal: fixture.principal,
        expectedAccess: fixture.expectedAccess,
      });
      if (!resolved.ok) throw new Error('fixture access refused');
      await requireOwnerEdit(scope.stores, fixture);
      const granted = grantAdmission(fixture.owner.projectId, fixture.principal.id);
      const opened = createDependencyContext(
        scope.stores,
        {
          projectId: fixture.owner.projectId,
          actorId: fixture.principal.id,
          access: resolved.access,
          admission: granted.admission,
        },
        () => undefined,
        { kind: 'raw' },
      );
      try {
        const toWorkItemId =
          fault === 'existing-destination'
            ? fixture.localPeer
            : fault === 'foreign-destination'
              ? fixture.successor.workItemId
              : 'detached-child';
        const transition = await opened.context.incidents.run(
          fixture.owner.projectId,
          fixture.principal.id,
          { kind: 'fresh', fromWorkItemId: fixture.owner.workItemId, toWorkItemId },
          { at: 30, by: fixture.principal.id },
          async () => {
            structures++;
            if (fault === 'detached-child') {
              const parent = await scope.stores.workItems.findById(fixture.owner.workItemId);
              if (parent === null) throw new Error('fixture parent missing');
              await scope.stores.workItems.insert(
                { ...parent, id: toWorkItemId, parentId: null, position: 100, name: 'wrong root' },
                [],
                { at: 30, by: fixture.principal.id },
              );
            }
            return { ok: true };
          },
        );
        return { commit: transition.ok, value: transition };
      } finally {
        opened.close();
      }
    });
    const failure: unknown = await operation.then(
      (value) => value,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure instanceof Error ? failure.message : '').toContain('incident mapping');
    expect(structures).toBe(fault === 'detached-child' ? 1 : 0);
    expect(readTables()).toEqual(before);
  });

test('restricted readable remote successor permits derived handdown while ordinary foreign typed editing refuses', async () => {
  const fixture = await seedIncidents();
  await harness.register('grace');
  harness.member('org-a', 'grace', 'member');
  harness.sqlite
    .query(
      "UPDATE organization_membership SET role='member' WHERE organization_id='org-a' AND user_id=?",
    )
    .run(fixture.principal.id);
  harness.sqlite
    .query('UPDATE project SET owner_id=?,restricted=1 WHERE id IN (?,?)')
    .run(harness.userId('grace'), fixture.successor.projectId, fixture.secondSuccessor.projectId);
  expect(
    (
      await fixture.request(`/api/projects/${fixture.successor.projectId}/commands`, {
        commands: [
          {
            kind: 'patchWorkItem',
            workItemId: fixture.successor.workItemId,
            patch: { name: 'forbidden' },
          },
        ],
      })
    ).status,
  ).toBe(403);
  const before = readTables();
  expect(
    await runSemantic(fixture, (service) =>
      service.updateTypedDependency(
        fixture.successor.projectId,
        fixture.principal.id,
        'outgoing-1',
        {
          predecessor: { ...fixture.owner, scope: 'whole' },
          successor: { ...fixture.successor, scope: 'whole' },
          type: 'SS',
        },
      ),
    ),
  ).toMatchObject({ ok: false, reason: 'forbidden' });
  expect(readTables()).toEqual(before);
  const child = await runSemantic(fixture, (service) =>
    service.create(fixture.owner.projectId, fixture.principal.id, {
      parentId: fixture.owner.workItemId,
      afterId: null,
      name: 'Read permitted child',
    }),
  );
  expect(child.ok).toBe(true);
  expect(
    (
      await runSemantic(fixture, (service) =>
        service.undoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
      )
    ).ok,
  ).toBe(true);
  expect(
    (
      await runSemantic(fixture, (service) =>
        service.redoWithin(fixture.owner.projectId, fixture.principal.id, fixture.expectedAccess),
      )
    ).ok,
  ).toBe(true);
});

for (const fault of [
  'after-detach',
  'after-structure',
  'second-reattach',
  'final-graph-delivery',
] as const)
  test(`incident transition rolls back every table and held announcement on ${fault}`, async () => {
    const fixture = await seedIncidents();
    const before = readTables();
    let detached = 0;
    let restored = 0;
    let finalReads = 0;
    let observedStores: PlanTransactionalStores | undefined;
    // This saved method is invoked with .call(this), preserving the real graph receiver.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalCycle = DependencyGraphGuard.prototype.findCycle;
    if (fault === 'final-graph-delivery')
      DependencyGraphGuard.prototype.findCycle = async function (projectId, change) {
        const cycle = await originalCycle.call(this, projectId, change);
        if (change === undefined) {
          finalReads++;
          if (observedStores === undefined) throw new Error('fixture staged stores absent');
          expect(
            (await observedStores.typedDependencies.listIncident([projectId]))
              .filter(
                (relationship) =>
                  relationship.predecessor.projectId !== relationship.successor.projectId,
              )
              .map(({ id }) => id),
          ).toEqual(
            fixture.links
              .filter(
                (relationship) =>
                  relationship.predecessor.projectId !== relationship.successor.projectId,
              )
              .map(({ id }) => id)
              .sort(),
          );
          throw new Error('injected final graph delivery failure');
        }
        return cycle;
      };
    try {
      const operation = runSemantic(
        fixture,
        async (service) => {
          const patched = await service.patch(fixture.ancestor, fixture.principal.id, {
            notes: 'preceding patch must roll back',
          });
          if (!patched.ok) return patched;
          return service.create(fixture.owner.projectId, fixture.principal.id, {
            parentId: fixture.owner.workItemId,
            afterId: null,
            name: 'Must roll back child',
          });
        },
        (stores) => {
          observedStores = stores;
          return {
            ...stores,
            typedDependencies: {
              listIncident: (ids) => stores.typedDependencies.listIncident(ids),
              listByProject: (id) => stores.typedDependencies.listByProject(id),
              add: (row, stamp) => stores.typedDependencies.add(row, stamp),
              update: (row, stamp) => stores.typedDependencies.update(row, stamp),
              remove: (id, stamp) => stores.typedDependencies.remove(id, stamp),
              removeAllFor: (ids, stamp) => stores.typedDependencies.removeAllFor(ids, stamp),
              incidents: {
                capture: (id) => stores.typedDependencies.incidents.capture(id),
                detach: async (receipt) => {
                  await stores.typedDependencies.incidents.detach(receipt);
                  detached++;
                  if (fault === 'after-detach') throw new Error('injected after detach failure');
                },
                restore: async (receipt, previous, stamp) => {
                  if (fault === 'after-structure') {
                    expect(
                      (await stores.workItems.listByProject(fixture.owner.projectId)).filter(
                        (row) => row.parentId === fixture.owner.workItemId,
                      ),
                    ).toHaveLength(1);
                    throw new Error('injected after structure failure');
                  }
                  if (fault === 'second-reattach' && restored === 1) {
                    expect(
                      (
                        await stores.typedDependencies.listIncident([fixture.owner.projectId])
                      ).filter(({ id }) => ['incoming', 'outgoing-1', 'outgoing-2'].includes(id)),
                    ).toHaveLength(1);
                    throw new Error('injected second reattachment failure');
                  }
                  await stores.typedDependencies.incidents.restore(receipt, previous, stamp);
                  restored++;
                },
              },
            },
          };
        },
      );
      const failure: unknown = await operation.then(
        (value) => value,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(failure instanceof Error ? failure.message : '').toContain('injected');
      expect(detached).toBe(fault === 'after-detach' ? 1 : 3);
      if (fault === 'final-graph-delivery') {
        expect(finalReads).toBe(1);
        expect(restored).toBe(3);
      }
      expect(readTables()).toEqual(before);
    } finally {
      DependencyGraphGuard.prototype.findCycle = originalCycle;
    }
  });

for (const finding of ['node_on_parent', 'cycle', 'self_node'] as const)
  test(`incident final graph result refuses ${finding} atomically with held announcements`, async () => {
    const fixture = await seedIncidents();
    const before = readTables();
    let observedStores: PlanTransactionalStores | undefined;
    let finalReads = 0;
    const assertRestored = async (projectId: string) => {
      finalReads++;
      if (observedStores === undefined) throw new Error('fixture staged stores absent');
      expect(
        (await observedStores.typedDependencies.listIncident([projectId]))
          .filter(
            (relationship) =>
              relationship.predecessor.projectId !== relationship.successor.projectId,
          )
          .map(({ id }) => id)
          .sort(),
      ).toEqual(
        fixture.links
          .filter(
            (relationship) =>
              relationship.predecessor.projectId !== relationship.successor.projectId,
          )
          .map(({ id }) => id)
          .sort(),
      );
    };
    // Saved methods retain their real graph receiver via .call(this).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalConflict = DependencyGraphGuard.prototype.findEndpointConflict;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalCycle = DependencyGraphGuard.prototype.findCycle;
    if (finding === 'node_on_parent')
      DependencyGraphGuard.prototype.findEndpointConflict = async function (projectId, change) {
        const conflict = await originalConflict.call(this, projectId, change);
        if (change !== undefined) return conflict;
        await assertRestored(projectId);
        return { reason: 'node_on_parent', dependencyIds: ['incoming'] };
      };
    else
      DependencyGraphGuard.prototype.findCycle = async function (projectId, change) {
        const cycle = await originalCycle.call(this, projectId, change);
        if (change !== undefined) return cycle;
        await assertRestored(projectId);
        return { kind: finding, relationshipIds: ['incoming'] };
      };
    try {
      // runSemantic checks the held broadcaster remains empty even when the command refuses.
      const outcome = await runSemantic(
        fixture,
        async (service) => {
          const patched = await service.patch(fixture.ancestor, fixture.principal.id, {
            notes: 'preceding patch must roll back',
          });
          if (!patched.ok) return patched;
          return service.create(fixture.owner.projectId, fixture.principal.id, {
            parentId: fixture.owner.workItemId,
            afterId: null,
            name: 'Returned graph finding must refuse',
          });
        },
        (stores) => {
          observedStores = stores;
          return stores;
        },
      );
      expect({
        outcome,
        changed: JSON.stringify(readTables()) !== JSON.stringify(before),
      }).toMatchObject({
        outcome: { ok: false, reason: finding },
        changed: false,
      });
      expect(finalReads).toBe(1);
      expect(readTables()).toEqual(before);
    } finally {
      DependencyGraphGuard.prototype.findEndpointConflict = originalConflict;
      DependencyGraphGuard.prototype.findCycle = originalCycle;
    }
  });

test('incident transition refuses delivery after its genuine retained refresh resumes across graph closure', async () => {
  const fixture = await openFixture();
  const boundary = harness.publicWrites();
  const owner = fixture.owner.projectId;
  const step = harness.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
    )
    .get(owner);
  if (step === null) throw new Error('fixture step missing');
  await boundary.uow.run(async (scope) => {
    await scope.stores.typedDependencies.add(
      {
        id: 'outgoing',
        projectId: fixture.successor.projectId,
        predecessor: { ...fixture.owner, scope: 'node', stepId: step.id },
        successor: { ...fixture.successor, scope: 'whole' },
        type: 'FS',
      },
      { at: 10, by: fixture.principal.id },
    );
    return { commit: true, value: undefined };
  });
  const before = readTables();
  let entered!: () => void;
  let release!: () => void;
  let closeGraph: (() => void) | undefined;
  const readEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const readRelease = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = boundary.uow.run(async (scope) => {
    const resolved = await boundary.commandAccess.resolve({
      kind: 'human',
      principal: fixture.principal,
      expectedAccess: fixture.expectedAccess,
    });
    if (!resolved.ok) throw new Error('fixture current authority refused');
    await requireOwnerEdit(scope.stores, fixture);
    const granted = grantAdmission(owner, fixture.principal.id);
    const plan = createWorkingPlan(scope, owner);
    await plan.stores.workItems.listByProject(owner);
    const opened = createDependencyContext(
      scope.stores,
      {
        projectId: owner,
        actorId: fixture.principal.id,
        access: resolved.access,
        admission: granted.admission,
      },
      () => undefined,
      {
        kind: 'owner',
        refresh: async (ids) => {
          await plan.refreshRows(ids);
          entered();
          await readRelease;
        },
      },
    );
    closeGraph = () => {
      opened.close();
    };
    try {
      const transition = await opened.context.incidents.run(
        owner,
        fixture.principal.id,
        { kind: 'fresh', fromWorkItemId: fixture.owner.workItemId, toWorkItemId: 'refresh-child' },
        { at: 20, by: fixture.principal.id },
        async () => {
          const parent = await plan.stores.workItems.findById(fixture.owner.workItemId);
          if (parent === null) throw new Error('fixture parent missing');
          await plan.stores.workItems.insert(
            {
              ...parent,
              id: 'refresh-child',
              parentId: parent.id,
              position: 1,
              name: 'refresh child',
              revision: 0,
            },
            [],
            { at: 20, by: fixture.principal.id },
          );
          return { ok: true };
        },
      );
      return { commit: transition.ok, value: transition };
    } finally {
      opened.close();
      plan.close();
      granted.expire();
    }
  });
  await readEntered;
  if (closeGraph === undefined) throw new Error('fixture graph closure missing');
  closeGraph();
  release();
  const failure: unknown = await pending.then(
    (value) => value,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(Error);
  expect(failure instanceof Error ? failure.message : '').toBe('dependency context is closed');
  expect(readTables()).toEqual(before);
});

for (const delivery of ['wrong-owner', 'foreign-source-project'] as const)
  test(`incident enumeration refuses ${delivery} delivery through the real scoped adapter boundary`, async () => {
    const fixture = await seedIncidents();
    const before = readTables();
    const operation = runSemantic(
      fixture,
      async (service) => {
        const patched = await service.patch(fixture.ancestor, fixture.principal.id, {
          notes: 'must roll back',
        });
        if (!patched.ok) return patched;
        return service.create(fixture.owner.projectId, fixture.principal.id, {
          parentId: fixture.owner.workItemId,
          afterId: null,
          name: 'Concealed child',
        });
      },
      (stores) => ({
        ...stores,
        typedDependencies: new Proxy(stores.typedDependencies, {
          get(target, key) {
            if (key === 'listIncident')
              return async (ids: readonly string[]) =>
                (await target.listIncident(ids)).map((relationship) =>
                  relationship.id !== 'outgoing-1'
                    ? relationship
                    : delivery === 'wrong-owner'
                      ? { ...relationship, projectId: fixture.owner.projectId }
                      : {
                          ...relationship,
                          predecessor: {
                            ...relationship.predecessor,
                            projectId: fixture.successor.projectId,
                          },
                        },
                );
            const member: unknown = Reflect.get(target, key);
            return typeof member === 'function'
              ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
              : member;
          },
        }),
      }),
    );
    const failure: unknown = await operation.then(
      (value) => value,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure instanceof Error ? failure.message : '').toBe(
      'incident enumeration returned inconsistent project ownership',
    );
    expect(readTables()).toEqual(before);
  });

test('modeled structural refusal makes the compound capability refuse at its top level and rolls back detached links', async () => {
  const fixture = await openFixture();
  const boundary = harness.publicWrites();
  const owner = fixture.owner.projectId;
  const step = harness.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
    )
    .get(owner);
  if (step === null) throw new Error('fixture step missing');
  await boundary.uow.run(async (scope) => {
    await scope.stores.typedDependencies.add(
      {
        id: 'outgoing',
        projectId: fixture.successor.projectId,
        predecessor: { ...fixture.owner, scope: 'node', stepId: step.id },
        successor: { ...fixture.successor, scope: 'whole' },
        type: 'FS',
      },
      { at: 10, by: fixture.principal.id },
    );
    return { commit: true, value: undefined };
  });
  const before = readTables();
  const transition = await boundary.uow.run(async (scope) => {
    const resolved = await boundary.commandAccess.resolve({
      kind: 'human',
      principal: fixture.principal,
      expectedAccess: fixture.expectedAccess,
    });
    if (!resolved.ok) throw new Error('fixture authority refused');
    await requireOwnerEdit(scope.stores, fixture);
    const grant = grantAdmission(owner, fixture.principal.id);
    const opened = createDependencyContext(
      scope.stores,
      {
        projectId: owner,
        actorId: fixture.principal.id,
        access: resolved.access,
        admission: grant.admission,
      },
      () => undefined,
      { kind: 'raw' },
    );
    try {
      await scope.stores.workItems.patch(
        fixture.owner.workItemId,
        { notes: 'preceding patch must roll back' },
        { at: 20, by: fixture.principal.id },
      );
      const outcome = await opened.context.incidents.run(
        owner,
        fixture.principal.id,
        { kind: 'fresh', fromWorkItemId: fixture.owner.workItemId, toWorkItemId: 'refused-child' },
        { at: 20, by: fixture.principal.id },
        () => Promise.resolve({ ok: false as const, detail: 'controlled structural refusal' }),
      );
      return { commit: outcome.ok, value: outcome };
    } finally {
      opened.close();
      grant.expire();
    }
  });
  expect({
    transition,
    changed: JSON.stringify(readTables()) !== JSON.stringify(before),
  }).toMatchObject({
    transition: {
      ok: false,
      reason: 'structure_refused',
      value: { ok: false, detail: 'controlled structural refusal' },
    },
    changed: false,
  });
  expect(readTables()).toEqual(before);
});
