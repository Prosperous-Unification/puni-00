import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Broadcaster } from '@wbs/core';
import {
  clockOf,
  createWorkingPlan,
  PlanCommandRunner,
  type PlanTransactionalStores,
  type Project,
  servicesOver,
  type Step,
  type WriteStamp,
} from '@wbs/core';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { expect, it } from 'bun:test';

import { runMigrations } from './migrate';
import { openSqliteSource } from './source';

const MIGRATIONS = new URL('../../../apps/be-01/drizzle', import.meta.url).pathname;
const OWNER = 'working-plan-order-owner';
const PROJECT = 'working-plan-order-project';
const ROW = 'working-plan-order-row';
const STEPS = ['step-A', 'step-a'] as const;
const STAMP: WriteStamp = { at: 1, by: OWNER };

const silentBroadcaster: Broadcaster = {
  publish: () => Promise.resolve(),
  latestSeq: () => Promise.resolve(-1),
};

it('keeps SQLite satellite order authoritative after a WorkingPlan patch refresh', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-working-plan-order-'));
  const path = join(directory, 'source.db');
  runMigrations(path, MIGRATIONS);
  const source = openSqliteSource({ dbPath: path });

  try {
    await source.stores.users.create(
      { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: STAMP.at },
      STAMP,
    );
    const project: Project = projectRow({ id: PROJECT, ownerId: OWNER });
    const steps: Step[] = STEPS.map((id) => ({
      id,
      projectId: PROJECT,
      name: id,
      position: 10,
    }));
    await source.stores.projects.create(project, steps, STAMP);
    await source.stores.workItems.insert(workItemRow({ id: ROW, projectId: PROJECT }), [], STAMP);

    for (const [index, stepId] of STEPS.entries()) {
      await source.stores.estimates.set(
        { workItemId: ROW, stepId, optimistic: index + 1, realistic: 2, pessimistic: 3 },
        STAMP,
      );
      await source.stores.actuals.set(
        { workItemId: ROW, stepId, days: index + 1, recordedAt: index + 1 },
        STAMP,
      );
      await source.stores.progress.set(
        { workItemId: ROW, stepId, state: 'in_progress', statedAt: index + 1 },
        STAMP,
      );
      await source.stores.measures.set(
        {
          workItemId: ROW,
          stepId,
          metric: 'token_estimate',
          value: index + 1,
          recordedAt: index + 1,
        },
        STAMP,
      );
    }

    const workingPlan = createWorkingPlan({ stores: source.stores }, PROJECT);
    await Promise.all([
      workingPlan.stores.workItems.listByProject(PROJECT),
      workingPlan.stores.estimates.listByProject(PROJECT),
      workingPlan.stores.actuals.listByProject(PROJECT),
      workingPlan.stores.progress.listByProject(PROJECT),
      workingPlan.stores.measures.listByProject(PROJECT),
    ]);
    expect(
      await workingPlan.stores.workItems.patch(ROW, { name: 'Patched' }, { at: 2, by: OWNER }),
    ).toMatchObject({ ok: true });

    const [estimates, actuals, progress, measures] = await Promise.all([
      source.stores.estimates.listByProject(PROJECT),
      source.stores.actuals.listByProject(PROJECT),
      source.stores.progress.listByProject(PROJECT),
      source.stores.measures.listByProject(PROJECT),
    ]);
    // Proof: the targeted SQLite readers' old localeCompare post-sort reversed
    // the retained step-A/step-a rows after this production WorkingPlan refresh.
    expect(await workingPlan.stores.estimates.listByProject(PROJECT)).toEqual(estimates);
    expect(await workingPlan.stores.actuals.listByProject(PROJECT)).toEqual(actuals);
    expect(await workingPlan.stores.progress.listByProject(PROJECT)).toEqual(progress);
    expect(await workingPlan.stores.measures.listByProject(PROJECT)).toEqual(measures);
    workingPlan.close();
  } finally {
    await source.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('keeps SQLite work-item order authoritative immediately after a runner insert', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-working-plan-insert-order-'));
  const path = join(directory, 'source.db');
  runMigrations(path, MIGRATIONS);
  const source = openSqliteSource({ dbPath: path });

  try {
    await source.stores.users.create(
      { id: OWNER, username: OWNER, passwordHash: 'x', createdAt: STAMP.at },
      STAMP,
    );
    const project: Project = projectRow({ id: PROJECT, ownerId: OWNER });
    const steps: Step[] = [{ id: 'step', projectId: PROJECT, name: 'Step', position: 10 }];
    await source.stores.projects.create(project, steps, STAMP);
    await source.stores.workItems.insert(
      workItemRow({ id: 'z-existing', projectId: PROJECT }),
      [],
      STAMP,
    );

    const ids = ['a-inserted', 'journal', 'event'];
    const clock = clockOf({
      now: () => 2,
      newId: () => {
        const id = ids.shift();
        if (id === undefined) throw new Error('runner minted an unexpected fourth id');
        return id;
      },
    });
    const compose = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
      servicesOver(stores, { clock, broadcast, scheduler: fastScheduler });
    const publicGraph = compose(source.stores, silentBroadcaster);
    const runner = new PlanCommandRunner({
      uow: source.uow,
      announcements: silentBroadcaster,
      publicServices: publicGraph,
      batchServices(scope, broadcast, workingPlan) {
        if (workingPlan === undefined) return compose(scope.stores, broadcast);
        const workItems = {
          ...workingPlan.stores.workItems,
          insert: async (
            ...parameters: Parameters<PlanTransactionalStores['workItems']['insert']>
          ) => {
            await workingPlan.stores.workItems.insert(...parameters);
            const retained = await workingPlan.stores.workItems.listByProject(PROJECT);
            const authoritative = await scope.stores.workItems.listByProject(PROJECT);
            // Proof: before adapter-authoritative reordering, RetainedRows appended
            // a-inserted and this received z-existing,a-inserted from the working plan.
            expect(retained).toEqual(authoritative);
            expect(retained.map(({ id }) => id)).toEqual(['a-inserted', 'z-existing']);
          },
        };
        return compose({ ...workingPlan.stores, workItems }, broadcast);
      },
    });

    expect(
      await runner.run(PROJECT, OWNER, [
        {
          kind: 'createWorkItem',
          parentId: null,
          afterId: 'z-existing',
          name: 'Inserted',
        },
      ]),
    ).toMatchObject({ ok: true });
  } finally {
    await source.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
