import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { ownTestSource } from '@wbs/store-memory/testing/owned-source-fixture';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { LEGACY_EDIT_ADMISSION } from '../../ports/edit-admission';
import type { Scope } from '../../ports/unit-of-work';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { bindFixtureSteps } from '../../testing/bound-package-fixture';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { expectCreated } from '../../testing/expect-created';
import { seedLegacyPackageParent } from '../../testing/legacy-package-source-fixture';
import { localCommandAccess } from '../../testing/organization-access-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { createPlanCommandRunner } from './composition';

const F = 'account-f';
/** Three of these side by side fit the calendar; one person doing all three in turn does not. */
const HUGE = { optimistic: 30_000_000, realistic: 30_000_000, pessimistic: 30_000_000 };

/**
 * Root `P` over three independent leaves, each estimated {@link HUGE} on Dev,
 * starting 2026-01-05 (an undated plan has no calendar to run past): in parallel the plan fits, assigned to one person it
 * runs past the calendar (the same overflow `work-item.controller.test.ts`
 * reaches by chaining three such leaves).
 */
async function seeded() {
  const fixture = openMemorySourceFixture();
  const source = ownTestSource(fixture.source);
  const options = {
    admission: LEGACY_EDIT_ADMISSION,
    clock: testClock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  };
  const graph = servicesOver(source.stores, {
    ...options,
    dependencyContext: createLocalDependencyContext(source.stores),
  });
  await source.stores.users.create(
    { id: F, username: F, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: F },
  );
  seedLegacyPackageParent(fixture, {
    organizationId: 'fixture-legacy-org',
    projectId: 'fixture-project',
    creator: F,
  });
  await bindFixtureSteps(
    source,
    'fixture-legacy-org',
    [
      {
        definition: {
          id: 'command-dev',
          name: 'Dev',
          code: 'dev',
          position: 10,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        binding: {
          bindingId: 'command-dev-binding',
          scopeKind: 'project',
          scopeId: 'fixture-project',
          workItemTypeId: null,
          position: 10,
        },
      },
      {
        definition: {
          id: 'command-qa',
          name: 'QA',
          code: 'qa',
          position: 20,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        binding: {
          bindingId: 'command-qa-binding',
          scopeKind: 'project',
          scopeId: 'fixture-project',
          workItemTypeId: null,
          position: 20,
        },
      },
    ],
    { at: 1, by: F },
  );
  const created = expectCreated(await graph.workPackages.create('Calendar', 'fixture-project', F));
  const workPackageId = created.workPackage.id;

  const dated = await graph.workPackages.update(workPackageId, F, { startDate: '2026-01-05' });
  if (!dated.ok) throw new Error('the start date was refused');
  const [dev] = created.steps.map(({ id }) => id);
  await source.stores.directory.addPerson({ id: 'kat', name: 'kat', kind: 'agent' }, [], {
    at: 1,
    by: F,
  });
  const bound = await source.stores.directory.patchPerson(
    'kat',
    { accountId: F },
    { at: 1, by: F },
  );
  if (!bound.ok) throw new Error('binding kat was refused');
  fixture.ownPersonInOrganization('kat', 'fixture-legacy-org', [F]);
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: source.uow,
    announcements: options.broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(scope.stores, {
        dependencyContext: createLocalDependencyContext(scope.stores),
        ...options,
        broadcast: announcements,
      }),
  });
  const tree = await runner.run(workPackageId, F, [
    { kind: 'createWorkItem', ref: 'P', name: 'P', parentId: null, afterId: null },
    { kind: 'createWorkItem', ref: 'A', name: 'A', parentId: null, parentRef: 'P', afterId: null },
    {
      kind: 'createWorkItem',
      ref: 'B',
      name: 'B',
      parentId: null,
      parentRef: 'P',
      afterId: null,
      afterRef: 'A',
    },
    {
      kind: 'createWorkItem',
      ref: 'C',
      name: 'C',
      parentId: null,
      parentRef: 'P',
      afterId: null,
      afterRef: 'B',
    },
    ...['A', 'B', 'C'].map((ref) => ({
      kind: 'setEstimate' as const,
      workItemRef: ref,
      stepId: dev,
      days: HUGE,
    })),
  ]);
  if (!tree.ok) throw new Error(`the tree was refused: ${JSON.stringify(tree)}`);
  const idOf = (ref: string): string => {
    const found = tree.results.find((each) => 'ref' in each && each.ref === ref);
    if (found === undefined || !('id' in found) || typeof found.id !== 'string')
      throw new Error(`no work item ${ref}`);
    return found.id;
  };
  return { source, runner, workPackageId, dev, idOf };
}

describe('assignments that run the plan past the calendar', () => {
  it('refuses assignSubtree with calendar_range and writes nothing', async () => {
    const { source, runner, workPackageId, dev, idOf } = await seeded();
    try {
      expect(
        await runner.run(workPackageId, F, [
          { kind: 'assignSubtree', workItemId: idOf('P'), stepId: dev, personId: 'kat' },
        ]),
      ).toMatchObject({ ok: false, at: 0, kind: 'assignSubtree', reason: 'calendar_range' });
      expect(await source.stores.directory.assignmentsOf(['A', 'B', 'C'].map(idOf))).toEqual([]);
    } finally {
      await source.close();
    }
  });

  it('refuses a claim that assigns past the calendar, and admits the same claim without assign', async () => {
    const { source, runner, workPackageId, dev, idOf } = await seeded();
    try {
      expect(
        await runner.run(workPackageId, F, [
          { kind: 'setAssignee', workItemId: idOf('A'), stepId: dev, personId: 'kat' },
          { kind: 'setAssignee', workItemId: idOf('B'), stepId: dev, personId: 'kat' },
        ]),
      ).toMatchObject({ ok: true });
      const claim = {
        kind: 'claimWorkItem' as const,
        workItemId: idOf('C'),
        personId: 'kat',
        steps: [dev],
      };
      expect(await runner.run(workPackageId, F, [{ ...claim, assign: true }])).toMatchObject({
        ok: false,
        at: 0,
        kind: 'claimWorkItem',
        reason: 'calendar_range',
      });
      expect(await source.stores.claims.listByWorkPackage(workPackageId)).toEqual([]);
      expect(await runner.run(workPackageId, F, [claim])).toMatchObject({ ok: true });
    } finally {
      await source.close();
    }
  });
});
