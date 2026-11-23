import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect, test } from 'bun:test';

import { servicesOver } from '../compose';
import { createPlanCommandRunner } from '../module/plan-commands/composition';
import { LEGACY_EDIT_ADMISSION } from '../ports/edit-admission';
import type { StoredTypedDependency } from '../ports/typed-dependency-store';
import { createLocalDependencyContext } from '../service/dependency-context';
import { testClock } from './clock-fixture';
import { createCurrentPlanFixture } from './current-plan-fixture';
import { localCommandAccess } from './organization-access-fixture';
import { fastScheduler } from './scheduler-fixture';
import { workItemRow } from './work-item-fixture';

const organizationId = 'first-child-links-org';
const projectId = 'first-child-links-project';
const workPackageId = 'first-child-links-package';
const stepId = 'first-child-links-step';
const parentId = 'first-child-links-parent';
const predecessorId = 'first-child-links-predecessor';
const successorId = 'first-child-links-successor';
const unrelatedPredecessorId = 'first-child-links-unrelated-predecessor';
const unrelatedSuccessorId = 'first-child-links-unrelated-successor';
const stamp = { at: 100, by: 'first-child-links-author' };

type Attempt<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown };

async function capture<Value>(operation: () => Promise<Value>): Promise<Attempt<Value>> {
  try {
    return { ok: true, value: await operation() };
  } catch (cause: unknown) {
    return { ok: false, cause };
  }
}

function createPlan() {
  return createCurrentPlanFixture({
    organizationId,
    projectId,
    workPackage: workPackageRow({ id: workPackageId, projectId }),
    stamp,
    types: [],
    creatorGrant: { id: 'first-child-links-grant', auditId: 'first-child-links-audit' },
    boundSteps: [
      {
        definition: {
          id: stepId,
          code: stepId,
          name: 'Current relationship step',
          position: 10,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        binding: {
          bindingId: 'first-child-links-binding',
          scopeKind: 'project',
          scopeId: projectId,
          workItemTypeId: null,
          position: 10,
        },
      },
    ],
  });
}

type CurrentPlan = Awaited<ReturnType<typeof createPlan>>;

/** Real command transaction supplies the bound incident owner; local fixture admission grants no external authority. */
function commandRunner(plan: CurrentPlan) {
  const publicGraph = servicesOver(plan.source.stores, {
    admission: LEGACY_EDIT_ADMISSION,
    dependencyContext: createLocalDependencyContext(plan.source.stores),
    clock: testClock,
    broadcast: plan.broadcast,
    scheduler: fastScheduler,
  });
  return createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: plan.source.uow,
    announcements: plan.broadcast,
    publicServices: publicGraph,
    batchServices: (scope, broadcast, admission, dependencyContext) =>
      servicesOver(scope.stores, {
        admission,
        dependencyContext: { kind: 'bound', context: dependencyContext },
        clock: testClock,
        broadcast,
        scheduler: fastScheduler,
      }),
  });
}

async function withinPlan(act: (plan: CurrentPlan) => Promise<void>): Promise<void> {
  const plan = await createPlan();
  const execution = await capture(() => act(plan));
  const closing = await capture(plan.close);
  if (!execution.ok && !closing.ok)
    throw new AggregateError(
      [execution.cause, closing.cause],
      'first-child relationship owner and Source close failed',
      { cause: closing.cause },
    );
  if (!execution.ok) throw execution.cause;
  if (!closing.ok) throw closing.cause;
}

function node(workItemId: string): StoredTypedDependency['predecessor'] {
  return { workPackageId, workItemId, scope: 'node', stepId };
}

/** Literal endpoint roles are independent of the production remapping projection. */
function expectedRelationships(ownerId: string): StoredTypedDependency[] {
  return [
    {
      id: 'a-incoming',
      workPackageId,
      type: 'SS',
      predecessor: node(predecessorId),
      successor: node(ownerId),
    },
    {
      id: 'b-outgoing',
      workPackageId,
      type: 'FF',
      predecessor: node(ownerId),
      successor: node(successorId),
    },
    {
      id: 'c-unrelated',
      workPackageId,
      type: 'FS',
      predecessor: node(unrelatedPredecessorId),
      successor: node(unrelatedSuccessorId),
    },
  ];
}

async function revisionOf(plan: CurrentPlan, id: string): Promise<number> {
  const row = await plan.source.stores.workItems.findById(id);
  if (row === null) throw new Error('required relationship endpoint disappeared: ' + id);
  return row.revision;
}

/** Catches missing incoming/outgoing remaps, altered creation evidence, unrelated-edge mutation and stale retained endpoint revisions. */
test('actual first-child command remaps local incoming and outgoing nodes through undo and redo while an unrelated edge stays exact', async () => {
  await withinPlan(async (plan) => {
    const { source } = plan;
    const rowIds = [
      predecessorId,
      parentId,
      successorId,
      unrelatedPredecessorId,
      unrelatedSuccessorId,
    ];
    for (const [index, id] of rowIds.entries()) {
      await source.stores.workItems.insert(
        workItemRow({
          id,
          workPackageId,
          name: id,
          position: (index + 1) * 10,
        }),
        [],
        stamp,
      );
      expect(await source.stores.estimates.readTarget(id, stepId)).toMatchObject({
        kind: 'resolved',
        step: { stepId },
      });
    }
    const original = expectedRelationships(parentId);
    for (const relationship of original)
      await source.stores.typedDependencies.add(relationship, stamp);
    expect(await source.stores.typedDependencies.listIncident([workPackageId])).toEqual(original);
    for (const relationship of original)
      expect(await source.stores.typedDependencies.incidents.capture(relationship.id)).toEqual({
        dependency: relationship,
        createdAt: stamp.at,
        createdBy: stamp.by,
      });
    // No point fact can mask a missing relationship's structural protection.
    expect(await source.stores.estimates.listByWorkPackage(workPackageId)).toEqual([]);
    expect(await source.stores.actuals.listByWorkPackage(workPackageId)).toEqual([]);
    expect(await source.stores.progress.listByWorkPackage(workPackageId)).toEqual([]);

    const runner = commandRunner(plan);
    expect(
      await runner.run(workPackageId, stamp.by, [
        {
          kind: 'patchWorkItem',
          workItemId: parentId,
          patch: { notes: 'healthy connected command' },
        },
      ]),
    ).toMatchObject({ ok: true });
    expect((await source.stores.workItems.findById(parentId))?.notes).toBe(
      'healthy connected command',
    );
    expect(await source.stores.typedDependencies.listIncident([workPackageId])).toEqual(original);
    const originalPredecessor = await revisionOf(plan, predecessorId);
    const originalSuccessor = await revisionOf(plan, successorId);
    const unrelatedRows = await source.stores.workItems.listByIds(workPackageId, [
      unrelatedPredecessorId,
      unrelatedSuccessorId,
    ]);
    expect(unrelatedRows).toHaveLength(2);
    const catalogue = await source.stores.stepCatalogue.readCatalogue(organizationId);
    const packageValues = plan.fixture.stepCatalogueEvidence().packageValues;
    const stack = { workPackageId, userId: stamp.by, personId: null };
    const beforeJournal = await source.stores.journal.entriesFor(stack);
    expect(beforeJournal).toHaveLength(1);
    const beforeAnnouncements = plan.broadcast.published.length;

    const created = await runner.run(workPackageId, stamp.by, [
      {
        kind: 'createWorkItem',
        ref: 'child',
        parentId,
        afterId: null,
        name: 'Connected first child',
      },
      {
        kind: 'patchWorkItem',
        workItemRef: 'child',
        patch: { notes: 'retained graph after remapping' },
      },
    ]);
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) throw new Error('lawful connected first-child command was refused');
    const child = created.results.at(0);
    if (child?.kind !== 'createWorkItem')
      throw new Error('connected first-child response is absent');

    const assertRelationships = async (ownerId: string, transitions: number) => {
      const expected = expectedRelationships(ownerId);
      expect(await source.stores.typedDependencies.listIncident([workPackageId])).toEqual(expected);
      expect(
        (await source.stores.typedDependencies.listByWorkPackage(workPackageId)).sort(
          (left, right) => left.id.localeCompare(right.id),
        ),
      ).toEqual(expected);
      for (const relationship of expected)
        expect(await source.stores.typedDependencies.incidents.capture(relationship.id)).toEqual({
          dependency: relationship,
          createdAt: stamp.at,
          createdBy: stamp.by,
        });
      expect(await revisionOf(plan, predecessorId)).toBe(originalPredecessor + transitions);
      expect(await revisionOf(plan, successorId)).toBe(originalSuccessor + transitions);
      expect(
        await source.stores.workItems.listByIds(workPackageId, [
          unrelatedPredecessorId,
          unrelatedSuccessorId,
        ]),
      ).toEqual(unrelatedRows);
      expect(await source.stores.stepCatalogue.readCatalogue(organizationId)).toEqual(catalogue);
      expect(plan.fixture.stepCatalogueEvidence().packageValues).toEqual(packageValues);
      expect(await source.stores.estimates.listByWorkPackage(workPackageId)).toEqual([]);
    };

    await assertRelationships(child.id, 1);
    expect(await source.stores.workItems.findById(child.id)).toMatchObject({
      parentId,
      notes: 'retained graph after remapping',
    });
    expect(await source.stores.journal.entriesFor(stack)).toHaveLength(beforeJournal.length + 1);
    expect(plan.broadcast.published.length).toBeGreaterThan(beforeAnnouncements);

    expect(await runner.undo(workPackageId, stamp.by)).toMatchObject({ ok: true });
    expect(await source.stores.workItems.findById(child.id)).toBeNull();
    await assertRelationships(parentId, 2);

    expect(await runner.redo(workPackageId, stamp.by)).toMatchObject({ ok: true });
    expect(await source.stores.workItems.findById(child.id)).toMatchObject({
      parentId,
      notes: 'retained graph after remapping',
    });
    await assertRelationships(child.id, 3);
  });
}, 30000);

for (const missing of ['redo peer', 'undo child'] as const) {
  test(
    'actual first-child replay still refuses an absent ' +
      missing +
      ' outside its exact restoration',
    async () => {
      await withinPlan(async (plan) => {
        const { source } = plan;
        for (const [index, id] of [
          predecessorId,
          parentId,
          successorId,
          unrelatedPredecessorId,
          unrelatedSuccessorId,
        ].entries()) {
          await source.stores.workItems.insert(
            workItemRow({ id, workPackageId, name: id, position: (index + 1) * 10 }),
            [],
            stamp,
          );
          expect(await source.stores.estimates.readTarget(id, stepId)).toMatchObject({
            kind: 'resolved',
          });
        }
        for (const relationship of expectedRelationships(parentId))
          await source.stores.typedDependencies.add(relationship, stamp);
        const runner = commandRunner(plan);
        const created = await runner.run(workPackageId, stamp.by, [
          {
            kind: 'createWorkItem',
            ref: 'child',
            parentId,
            afterId: null,
            name: 'Current replay child',
          },
        ]);
        expect(created).toMatchObject({ ok: true });
        if (!created.ok) throw new Error('healthy first-child replay prerequisite refused');
        const child = created.results.at(0);
        if (child?.kind !== 'createWorkItem')
          throw new Error('healthy first-child replay child missing');
        expect(await source.stores.typedDependencies.listIncident([workPackageId])).toEqual(
          expectedRelationships(child.id),
        );
        expect(await runner.undo(workPackageId, stamp.by)).toMatchObject({ ok: true });
        expect(await source.stores.typedDependencies.listIncident([workPackageId])).toEqual(
          expectedRelationships(parentId),
        );
        expect(await runner.redo(workPackageId, stamp.by)).toMatchObject({ ok: true });
        expect(await source.stores.typedDependencies.listIncident([workPackageId])).toEqual(
          expectedRelationships(child.id),
        );

        if (missing === 'redo peer') {
          expect(await runner.undo(workPackageId, stamp.by)).toMatchObject({ ok: true });
          await source.stores.typedDependencies.remove('c-unrelated', stamp);
          await source.stores.workItems.remove([unrelatedSuccessorId], [], stamp);
          expect(await source.stores.workItems.findById(unrelatedSuccessorId)).toBeNull();
          expect(await source.stores.typedDependencies.listIncident([workPackageId])).toEqual(
            expectedRelationships(parentId).slice(0, 2),
          );
        } else {
          await source.stores.typedDependencies.remove('a-incoming', stamp);
          await source.stores.typedDependencies.remove('b-outgoing', stamp);
          await source.stores.workItems.remove([child.id], [], stamp);
          expect(await source.stores.workItems.findById(child.id)).toBeNull();
          expect(await source.stores.typedDependencies.listIncident([workPackageId])).toEqual(
            expectedRelationships(parentId).slice(2),
          );
        }

        const stack = { workPackageId, userId: stamp.by, personId: null };
        const entries = await source.stores.journal.entriesFor(stack);
        expect(entries).toHaveLength(1);
        const entry = entries.at(0);
        if (entry === undefined) throw new Error('replay prerequisite journal vanished');
        expect(entry.undone).toBe(missing === 'redo peer');
        const expected = plan.fixture.stepCatalogueEvidence();
        // The complete detached graph changes only by the documented stale-entry
        // repair. No expected fact, relationship, row or event is removed here.
        const snapshot = expected.snapshot;
        if (typeof snapshot !== 'object' || snapshot === null)
          throw new Error('replay snapshot is not a table graph');
        const journal: unknown = Reflect.get(snapshot, 'journal');
        if (typeof journal !== 'object' || journal === null)
          throw new Error('replay snapshot journal is absent');
        const savedEntries: unknown = Reflect.get(journal, 'entries');
        if (!Array.isArray(savedEntries)) throw new Error('replay snapshot entries are not rows');
        expect(savedEntries).toEqual(entries);
        Reflect.set(journal, 'entries', []);
        const announcements = structuredClone(plan.broadcast.published);
        const refusal =
          missing === 'redo peer'
            ? await runner.redo(workPackageId, stamp.by)
            : await runner.undo(workPackageId, stamp.by);
        expect(refusal).toEqual({
          ok: false,
          reason: 'stale_undo',
          entryId: entry.id,
          detail: 'a local dependency endpoint changed or was removed.',
        });
        expect(plan.fixture.stepCatalogueEvidence()).toEqual(expected);
        expect(await source.stores.journal.entriesFor(stack)).toEqual([]);
        expect(plan.broadcast.published).toEqual(announcements);
      });
    },
    30000,
  );
}
