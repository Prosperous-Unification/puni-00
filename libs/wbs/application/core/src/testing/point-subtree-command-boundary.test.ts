import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect, test } from 'bun:test';

import { servicesOver } from '../compose';
import { createPlanCommandRunner } from '../module/plan-commands/composition';
import { LEGACY_EDIT_ADMISSION } from '../ports/edit-admission';
import type { SubtreeStore } from '../ports/subtree-store';
import { createLocalDependencyContext } from '../service/dependency-context';
import { testClock } from './clock-fixture';
import { createCurrentPlanFixture } from './current-plan-fixture';
import { localCommandAccess } from './organization-access-fixture';
import { fastScheduler } from './scheduler-fixture';
import { workItemRow } from './work-item-fixture';

type Attempt<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown };
async function capture<Value>(operation: () => Promise<Value>): Promise<Attempt<Value>> {
  try {
    return { ok: true, value: await operation() };
  } catch (cause: unknown) {
    return { ok: false, cause };
  }
}

/** Actual command transaction/repair, with the existing explicit local-only admission fixture; no permission-policy claim. */
test('actual command undo rolls back a newly refused subtree actual without announcements', async () => {
  const stamp = { at: 100, by: 'actual-restore-command-author' };
  const organizationId = 'actual-restore-command-org',
    projectId = 'actual-restore-command-project',
    workPackageId = 'actual-restore-command-package';
  const stepId = 'actual-restore-command-step',
    bindingId = 'actual-restore-command-binding',
    workItemId = 'actual-restore-command-leaf';
  const plan = await createCurrentPlanFixture({
    organizationId,
    projectId,
    workPackage: workPackageRow({ id: workPackageId, projectId }),
    stamp,
    types: [],
    creatorGrant: { id: 'actual-restore-command-grant', auditId: 'actual-restore-command-audit' },
    boundSteps: [
      {
        definition: {
          id: stepId,
          code: stepId,
          name: 'Command restore',
          position: 10,
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 0,
        },
        binding: {
          bindingId,
          scopeKind: 'project',
          scopeId: projectId,
          workItemTypeId: null,
          position: 10,
        },
      },
    ],
  });
  const execution = await capture(async () => {
    const { source } = plan;
    const point = { workItemId, stepId, days: 2.5, recordedAt: 111 };
    await source.stores.workItems.insert(
      workItemRow({ id: workItemId, workPackageId, name: 'Actual deleted leaf' }),
      [],
      stamp,
    );
    expect(await source.stores.actuals.set(point, stamp)).toBe('written');
    expect(await source.stores.actuals.listByWorkPackage(workPackageId)).toEqual([point]);
    expect(plan.fixture.stepCatalogueEvidence().actuals).toEqual([point]);
    const publicGraph = servicesOver(source.stores, {
      admission: LEGACY_EDIT_ADMISSION,
      dependencyContext: createLocalDependencyContext(source.stores),
      clock: testClock,
      broadcast: plan.broadcast,
      scheduler: fastScheduler,
    });
    let isArmed = false;
    const refusals: unknown[] = [];
    const runner = createPlanCommandRunner({
      commandAccess: localCommandAccess,
      uow: source.uow,
      announcements: plan.broadcast,
      publicServices: publicGraph,
      batchServices: (scope, broadcast, admission, dependencyContext) => {
        const original = scope.stores.subtrees;
        const subtrees: SubtreeStore = {
          inspectFirstChild: (write, stamp) => original.inspectFirstChild(write, stamp),
          writeMove: (write, stamp) => original.writeMove(write, stamp),
          writeFirstChild: (write, stamp) => original.writeFirstChild(write, stamp),
          async insertSubtree(copy, writeStamp) {
            if (isArmed) {
              // This exact dependency runs after genuine structural admission, on the same borrowed writer.
              expect(
                await scope.stores.stepCatalogue.unbindStep(
                  organizationId,
                  bindingId,
                  { dryRun: false },
                  writeStamp,
                ),
              ).toEqual({
                kind: 'unbound',
                workPackageIds: [workPackageId],
                projectIds: [projectId],
              });
            }
            const written = await original.insertSubtree(copy, writeStamp);
            if (isArmed) refusals.push(written);
            return written;
          },
        };
        return servicesOver(
          { ...scope.stores, subtrees },
          {
            admission,
            dependencyContext: { kind: 'bound', context: dependencyContext },
            clock: testClock,
            broadcast,
            scheduler: fastScheduler,
          },
        );
      },
    });
    expect(
      await runner.run(workPackageId, stamp.by, [
        { kind: 'deleteWorkItem', workItemId, strategy: 'cascade' },
      ]),
    ).toMatchObject({ ok: true });
    expect(await source.stores.workItems.findById(workItemId)).toBeNull();
    expect(plan.fixture.stepCatalogueEvidence().actuals).toEqual([]);
    expect(await runner.undo(workPackageId, stamp.by)).toMatchObject({ ok: true });
    expect(plan.fixture.stepCatalogueEvidence().actuals).toEqual([point]);
    expect(await runner.redo(workPackageId, stamp.by)).toMatchObject({ ok: true });
    expect(await source.stores.workItems.findById(workItemId)).toBeNull();
    expect(plan.fixture.stepCatalogueEvidence().actuals).toEqual([]);
    const stack = { workPackageId, userId: stamp.by, personId: null };
    const beforeEntries = await source.stores.journal.entriesFor(stack);
    expect(beforeEntries).toHaveLength(1);
    const before = plan.fixture.stepCatalogueEvidence();
    const expected = structuredClone(before);
    // This fixture owns MemoryTables' complete detached snapshot. Validate its
    // journal boundary, then specify ONLY the documented stale-entry removal.
    const snapshot = expected.snapshot;
    if (typeof snapshot !== 'object' || snapshot === null)
      throw new Error('command snapshot is not a table graph');
    const journal: unknown = Reflect.get(snapshot, 'journal');
    if (typeof journal !== 'object' || journal === null)
      throw new Error('command snapshot has no journal');
    const entries: unknown = Reflect.get(journal, 'entries');
    if (!Array.isArray(entries)) throw new Error('command snapshot journal entries are not rows');
    expect(entries).toEqual(beforeEntries);
    Reflect.set(journal, 'entries', []);
    const rows = await source.stores.workItems.listByWorkPackage(workPackageId);
    const announcements = structuredClone(plan.broadcast.published);
    isArmed = true;
    expect(await runner.undo(workPackageId, stamp.by)).toMatchObject({
      ok: false,
      reason: 'stale_undo',
    });
    expect(refusals).toEqual([
      { kind: 'point_refused', fact: 'actual', workItemId, stepId, reason: 'step_not_resolved' },
    ]);
    expect(plan.fixture.stepCatalogueEvidence()).toEqual(expected);
    expect(await source.stores.workItems.listByWorkPackage(workPackageId)).toEqual(rows);
    expect(plan.broadcast.published).toEqual(announcements);
    // Refused undo intentionally consumes only its stale entry in the actual afterRollback repair window.
    expect(await source.stores.journal.entriesFor(stack)).toEqual([]);
  });
  const closing = await capture(plan.close);
  if (!execution.ok && !closing.ok)
    throw new AggregateError(
      [execution.cause, closing.cause],
      'subtree command owner and Source close failed',
      { cause: closing.cause },
    );
  if (!execution.ok) throw execution.cause;
  if (!closing.ok) throw closing.cause;
}, 30000);

/** Actual command transaction/repair, with the existing explicit local-only admission fixture; no permission-policy claim. */
test('actual command undo rolls back a newly refused subtree progress without announcements', async () => {
  const stamp = { at: 100, by: 'progress-restore-command-author' };
  const organizationId = 'progress-restore-command-org',
    projectId = 'progress-restore-command-project',
    workPackageId = 'progress-restore-command-package';
  const stepId = 'progress-restore-command-step',
    bindingId = 'progress-restore-command-binding',
    workItemId = 'progress-restore-command-leaf';
  const plan = await createCurrentPlanFixture({
    organizationId,
    projectId,
    workPackage: workPackageRow({ id: workPackageId, projectId }),
    stamp,
    types: [],
    creatorGrant: {
      id: 'progress-restore-command-grant',
      auditId: 'progress-restore-command-audit',
    },
    boundSteps: [
      {
        definition: {
          id: stepId,
          code: stepId,
          name: 'Command restore',
          position: 10,
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 0,
        },
        binding: {
          bindingId,
          scopeKind: 'project',
          scopeId: projectId,
          workItemTypeId: null,
          position: 10,
        },
      },
    ],
  });
  const execution = await capture(async () => {
    const { source } = plan;
    const point = { workItemId, stepId, state: 'in_progress' as const, statedAt: 112 };
    await source.stores.workItems.insert(
      workItemRow({ id: workItemId, workPackageId, name: 'Actual deleted leaf' }),
      [],
      stamp,
    );
    expect(await source.stores.progress.set(point, stamp)).toBe('written');
    expect(await source.stores.progress.listByWorkPackage(workPackageId)).toEqual([point]);
    expect(plan.fixture.stepCatalogueEvidence().progress).toEqual([point]);
    const publicGraph = servicesOver(source.stores, {
      admission: LEGACY_EDIT_ADMISSION,
      dependencyContext: createLocalDependencyContext(source.stores),
      clock: testClock,
      broadcast: plan.broadcast,
      scheduler: fastScheduler,
    });
    let isArmed = false;
    const refusals: unknown[] = [];
    const runner = createPlanCommandRunner({
      commandAccess: localCommandAccess,
      uow: source.uow,
      announcements: plan.broadcast,
      publicServices: publicGraph,
      batchServices: (scope, broadcast, admission, dependencyContext) => {
        const original = scope.stores.subtrees;
        const subtrees: SubtreeStore = {
          inspectFirstChild: (write, stamp) => original.inspectFirstChild(write, stamp),
          writeMove: (write, stamp) => original.writeMove(write, stamp),
          writeFirstChild: (write, stamp) => original.writeFirstChild(write, stamp),
          async insertSubtree(copy, writeStamp) {
            if (isArmed) {
              // This exact dependency runs after genuine structural admission, on the same borrowed writer.
              expect(
                await scope.stores.stepCatalogue.unbindStep(
                  organizationId,
                  bindingId,
                  { dryRun: false },
                  writeStamp,
                ),
              ).toEqual({
                kind: 'unbound',
                workPackageIds: [workPackageId],
                projectIds: [projectId],
              });
            }
            const written = await original.insertSubtree(copy, writeStamp);
            if (isArmed) refusals.push(written);
            return written;
          },
        };
        return servicesOver(
          { ...scope.stores, subtrees },
          {
            admission,
            dependencyContext: { kind: 'bound', context: dependencyContext },
            clock: testClock,
            broadcast,
            scheduler: fastScheduler,
          },
        );
      },
    });
    expect(
      await runner.run(workPackageId, stamp.by, [
        { kind: 'deleteWorkItem', workItemId, strategy: 'cascade' },
      ]),
    ).toMatchObject({ ok: true });
    expect(await source.stores.workItems.findById(workItemId)).toBeNull();
    expect(plan.fixture.stepCatalogueEvidence().progress).toEqual([]);
    expect(await runner.undo(workPackageId, stamp.by)).toMatchObject({ ok: true });
    expect(plan.fixture.stepCatalogueEvidence().progress).toEqual([point]);
    expect(await runner.redo(workPackageId, stamp.by)).toMatchObject({ ok: true });
    expect(await source.stores.workItems.findById(workItemId)).toBeNull();
    expect(plan.fixture.stepCatalogueEvidence().progress).toEqual([]);
    const stack = { workPackageId, userId: stamp.by, personId: null };
    const beforeEntries = await source.stores.journal.entriesFor(stack);
    expect(beforeEntries).toHaveLength(1);
    const before = plan.fixture.stepCatalogueEvidence();
    const expected = structuredClone(before);
    // This fixture owns MemoryTables' complete detached snapshot. Validate its
    // journal boundary, then specify ONLY the documented stale-entry removal.
    const snapshot = expected.snapshot;
    if (typeof snapshot !== 'object' || snapshot === null)
      throw new Error('command snapshot is not a table graph');
    const journal: unknown = Reflect.get(snapshot, 'journal');
    if (typeof journal !== 'object' || journal === null)
      throw new Error('command snapshot has no journal');
    const entries: unknown = Reflect.get(journal, 'entries');
    if (!Array.isArray(entries)) throw new Error('command snapshot journal entries are not rows');
    expect(entries).toEqual(beforeEntries);
    Reflect.set(journal, 'entries', []);
    const rows = await source.stores.workItems.listByWorkPackage(workPackageId);
    const announcements = structuredClone(plan.broadcast.published);
    isArmed = true;
    expect(await runner.undo(workPackageId, stamp.by)).toMatchObject({
      ok: false,
      reason: 'stale_undo',
    });
    expect(refusals).toEqual([
      { kind: 'point_refused', fact: 'progress', workItemId, stepId, reason: 'step_not_resolved' },
    ]);
    expect(plan.fixture.stepCatalogueEvidence()).toEqual(expected);
    expect(await source.stores.workItems.listByWorkPackage(workPackageId)).toEqual(rows);
    expect(plan.broadcast.published).toEqual(announcements);
    // Refused undo intentionally consumes only its stale entry in the actual afterRollback repair window.
    expect(await source.stores.journal.entriesFor(stack)).toEqual([]);
  });
  const closing = await capture(plan.close);
  if (!execution.ok && !closing.ok)
    throw new AggregateError(
      [execution.cause, closing.cause],
      'subtree command owner and Source close failed',
      { cause: closing.cause },
    );
  if (!execution.ok) throw execution.cause;
  if (!closing.ok) throw closing.cause;
}, 30000);

/** Actual command transaction/repair, with the existing explicit local-only admission fixture; no permission-policy claim. */
test('actual command undo rolls back a newly refused subtree measure without announcements', async () => {
  const stamp = { at: 100, by: 'measure-restore-command-author' };
  const organizationId = 'measure-restore-command-org',
    projectId = 'measure-restore-command-project',
    workPackageId = 'measure-restore-command-package';
  const stepId = 'measure-restore-command-step',
    bindingId = 'measure-restore-command-binding',
    workItemId = 'measure-restore-command-leaf';
  const plan = await createCurrentPlanFixture({
    organizationId,
    projectId,
    workPackage: workPackageRow({ id: workPackageId, projectId }),
    stamp,
    types: [],
    creatorGrant: { id: 'measure-restore-command-grant', auditId: 'measure-restore-command-audit' },
    boundSteps: [
      {
        definition: {
          id: stepId,
          code: stepId,
          name: 'Command restore',
          position: 10,
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 0,
        },
        binding: {
          bindingId,
          scopeKind: 'project',
          scopeId: projectId,
          workItemTypeId: null,
          position: 10,
        },
      },
    ],
  });
  const execution = await capture(async () => {
    const { source } = plan;
    const point = {
      workItemId,
      stepId,
      metric: 'token_actual' as const,
      value: 3,
      recordedAt: 113,
    };
    await source.stores.workItems.insert(
      workItemRow({ id: workItemId, workPackageId, name: 'Actual deleted leaf' }),
      [],
      stamp,
    );
    expect(await source.stores.measures.set(point, stamp)).toBe('written');
    expect(await source.stores.measures.listByWorkPackage(workPackageId)).toEqual([point]);
    expect(plan.fixture.stepCatalogueEvidence().tuples.measures).toEqual([
      { ...point, currency: null, rateCardDigest: null },
    ]);
    const publicGraph = servicesOver(source.stores, {
      admission: LEGACY_EDIT_ADMISSION,
      dependencyContext: createLocalDependencyContext(source.stores),
      clock: testClock,
      broadcast: plan.broadcast,
      scheduler: fastScheduler,
    });
    let isArmed = false;
    const refusals: unknown[] = [];
    const runner = createPlanCommandRunner({
      commandAccess: localCommandAccess,
      uow: source.uow,
      announcements: plan.broadcast,
      publicServices: publicGraph,
      batchServices: (scope, broadcast, admission, dependencyContext) => {
        const original = scope.stores.subtrees;
        const subtrees: SubtreeStore = {
          inspectFirstChild: (write, stamp) => original.inspectFirstChild(write, stamp),
          writeMove: (write, stamp) => original.writeMove(write, stamp),
          writeFirstChild: (write, stamp) => original.writeFirstChild(write, stamp),
          async insertSubtree(copy, writeStamp) {
            if (isArmed) {
              // This exact dependency runs after genuine structural admission, on the same borrowed writer.
              expect(
                await scope.stores.stepCatalogue.unbindStep(
                  organizationId,
                  bindingId,
                  { dryRun: false },
                  writeStamp,
                ),
              ).toEqual({
                kind: 'unbound',
                workPackageIds: [workPackageId],
                projectIds: [projectId],
              });
            }
            const written = await original.insertSubtree(copy, writeStamp);
            if (isArmed) refusals.push(written);
            return written;
          },
        };
        return servicesOver(
          { ...scope.stores, subtrees },
          {
            admission,
            dependencyContext: { kind: 'bound', context: dependencyContext },
            clock: testClock,
            broadcast,
            scheduler: fastScheduler,
          },
        );
      },
    });
    expect(
      await runner.run(workPackageId, stamp.by, [
        { kind: 'deleteWorkItem', workItemId, strategy: 'cascade' },
      ]),
    ).toMatchObject({ ok: true });
    expect(await source.stores.workItems.findById(workItemId)).toBeNull();
    expect(plan.fixture.stepCatalogueEvidence().tuples.measures).toEqual([]);
    expect(await runner.undo(workPackageId, stamp.by)).toMatchObject({ ok: true });
    expect(plan.fixture.stepCatalogueEvidence().tuples.measures).toEqual([
      { ...point, currency: null, rateCardDigest: null },
    ]);
    expect(await runner.redo(workPackageId, stamp.by)).toMatchObject({ ok: true });
    expect(await source.stores.workItems.findById(workItemId)).toBeNull();
    expect(plan.fixture.stepCatalogueEvidence().tuples.measures).toEqual([]);
    const stack = { workPackageId, userId: stamp.by, personId: null };
    const beforeEntries = await source.stores.journal.entriesFor(stack);
    expect(beforeEntries).toHaveLength(1);
    const before = plan.fixture.stepCatalogueEvidence();
    const expected = structuredClone(before);
    // This fixture owns MemoryTables' complete detached snapshot. Validate its
    // journal boundary, then specify ONLY the documented stale-entry removal.
    const snapshot = expected.snapshot;
    if (typeof snapshot !== 'object' || snapshot === null)
      throw new Error('command snapshot is not a table graph');
    const journal: unknown = Reflect.get(snapshot, 'journal');
    if (typeof journal !== 'object' || journal === null)
      throw new Error('command snapshot has no journal');
    const entries: unknown = Reflect.get(journal, 'entries');
    if (!Array.isArray(entries)) throw new Error('command snapshot journal entries are not rows');
    expect(entries).toEqual(beforeEntries);
    Reflect.set(journal, 'entries', []);
    const rows = await source.stores.workItems.listByWorkPackage(workPackageId);
    const announcements = structuredClone(plan.broadcast.published);
    isArmed = true;
    expect(await runner.undo(workPackageId, stamp.by)).toMatchObject({
      ok: false,
      reason: 'stale_undo',
    });
    expect(refusals).toEqual([
      { kind: 'point_refused', fact: 'measure', workItemId, stepId, reason: 'step_not_resolved' },
    ]);
    expect(plan.fixture.stepCatalogueEvidence()).toEqual(expected);
    expect(await source.stores.workItems.listByWorkPackage(workPackageId)).toEqual(rows);
    expect(plan.broadcast.published).toEqual(announcements);
    // Refused undo intentionally consumes only its stale entry in the actual afterRollback repair window.
    expect(await source.stores.journal.entriesFor(stack)).toEqual([]);
  });
  const closing = await capture(plan.close);
  if (!execution.ok && !closing.ok)
    throw new AggregateError(
      [execution.cause, closing.cause],
      'subtree command owner and Source close failed',
      { cause: closing.cause },
    );
  if (!execution.ok) throw execution.cause;
  if (!closing.ok) throw closing.cause;
}, 30000);
