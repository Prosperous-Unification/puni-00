import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PlanCommand, Scope, Source, TransactionalStores } from '@wbs/core';
import { CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { canonicalScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { runMigrations } from './migrate';
import { openSqliteSource } from './source';

const MIGRATIONS = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const F = 'account-f';
const G = 'account-g';
const RAM = 'resource-ram';
const WORKTREE = 'resource-worktree';
const DISK = 'resource-disk';
const LEAVES = 10;

/** Each store the conformance suite certifies, opened fresh for one test. */
const STORES: readonly {
  readonly name: string;
  readonly open: () => {
    source: Source<TransactionalStores>;
    isMemory: boolean;
    dispose: () => void;
  };
}[] = [
  {
    name: 'memory',
    open: () => ({
      source: openMemorySourceFixture().source,
      isMemory: true,
      dispose: () => undefined,
    }),
  },
  {
    name: 'sqlite',
    open: () => {
      const folder = mkdtempSync(join(tmpdir(), 'resource-occupancy-'));
      const dbPath = join(folder, 'plan.db');
      runMigrations(dbPath, MIGRATIONS);
      return {
        source: openSqliteSource({ dbPath }),
        isMemory: false,
        dispose: () => {
          rmSync(folder, { recursive: true, force: true });
        },
      };
    },
  },
];

/**
 * Ten leaves `L0`…`L9`, agents `a0`…`a9` bound to account F and `g0` bound to
 * account G, and three resources: RAM (GB), a worktree slot and a disk nobody
 * states a capacity for. Capacities and demands are each case's own.
 */
async function seeded(store: (typeof STORES)[number]) {
  const { source, isMemory, dispose } = store.open();
  const options = {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  };
  const graph = servicesOver(source.stores, options);
  for (const id of [F, G]) {
    await source.stores.users.create(
      { id, username: id, passwordHash: 'x', createdAt: 1 },
      { at: 1, by: id },
    );
  }
  const created = await graph.projects.create('Occupancy', F);
  const projectId = created.project.id;
  if (isMemory) {
    // The memory source keeps a project's steps apart from the step table its progress reads.
    for (const step of created.steps) {
      await source.stores.steps.add(
        { id: step.id, projectId, name: step.name, allowancePercent: 0, estimateUnit: 'workdays' },
        { at: 1, by: F },
      );
    }
  }
  const [dev, review] = created.steps.map(({ id }) => id);
  const agents = [...Array.from({ length: LEAVES }, (_, index) => `a${String(index)}`), 'g0'];
  for (const id of agents) {
    await source.stores.directory.addPerson({ id, name: `agent ${id}`, kind: 'agent' }, [], {
      at: 1,
      by: F,
    });
    const bound = await source.stores.directory.patchPerson(
      id,
      { accountId: id === 'g0' ? G : F },
      { at: 1, by: F },
    );
    if (!bound.ok) throw new Error(`binding ${id} was refused: ${bound.reason}`);
  }
  for (const resource of [
    { id: RAM, name: 'h2puni ram', kind: 'divisible' as const, unitLabel: 'GB' },
    { id: WORKTREE, name: 'h2puni worktree', kind: 'divisible' as const, unitLabel: 'slot' },
    { id: DISK, name: 'h2puni disk', kind: 'divisible' as const, unitLabel: 'GB' },
  ]) {
    const added = await source.stores.directory.addResource(resource, { at: 1, by: F });
    if (!added.ok) throw new Error(`resource ${resource.id} was refused`);
  }
  const runner = createPlanCommandRunner({
    uow: source.uow,
    announcements: options.broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(scope.stores, { ...options, broadcast: announcements }),
  });
  const tree = await runner.run(
    projectId,
    F,
    Array.from({ length: LEAVES }, (_, index): PlanCommand => ({
      kind: 'createWorkItem',
      ref: `L${String(index)}`,
      name: `Leaf ${String(index)}`,
      parentId: null,
      afterId: null,
    })),
  );
  if (!tree.ok) throw new Error(`the tree was refused: ${JSON.stringify(tree)}`);
  const leaf = (index: number): string => {
    const id = tree.results[index]?.id;
    if (id === undefined) throw new Error(`no leaf ${String(index)}`);
    return id;
  };
  const run = (commands: PlanCommand[], actor = F) => runner.run(projectId, actor, commands);
  const claim = (
    index: number,
    personId: string,
    extra: Partial<Extract<PlanCommand, { kind: 'claimWorkItem' }>> = {},
  ): PlanCommand => ({ kind: 'claimWorkItem', workItemId: leaf(index), personId, ...extra });
  const release = (index: number, personId: string): PlanCommand => ({
    kind: 'releaseWorkItem',
    workItemId: leaf(index),
    personId,
  });
  /** The occupied units of one resource, 0 when nothing holds it. */
  const occupied = async (resourceId: string): Promise<number> =>
    (await graph.workItems.occupancyOf(projectId)).occupied.find(
      (each) => each.resourceId === resourceId,
    )?.occupied ?? 0;
  const close = async () => {
    await source.close();
    dispose();
  };
  return {
    source,
    graph,
    runner,
    projectId,
    dev,
    review,
    leaf,
    run,
    claim,
    release,
    occupied,
    close,
  };
}

for (const store of STORES) {
  describe(`claim occupancy on the ${store.name} store`, () => {
    it('acquires the declared demand and reads it per project and per resource', async () => {
      const { graph, projectId, run, claim, occupied, leaf, close } = await seeded(store);
      try {
        await run([
          { kind: 'setResourceCapacity', resourceId: RAM, units: 32 },
          { kind: 'setDemand', workItemId: leaf(0), resourceId: RAM, units: 4 },
        ]);
        const claimed = await run([claim(0, 'a0', { runId: 'run-0' })]);
        expect(claimed).toMatchObject({
          ok: true,
          results: [{ kind: 'claimWorkItem', acquired: [{ resourceId: RAM, units: 4 }] }],
        });
        expect(await occupied(RAM)).toBe(4);
        expect(await graph.workItems.occupancyOf(projectId)).toEqual({
          occupied: [
            {
              resourceId: RAM,
              occupied: 4,
              holders: [{ personId: 'a0', runId: 'run-0', workItemId: leaf(0) }],
            },
          ],
          free: [{ resourceId: RAM, units: 28 }],
        });
      } finally {
        await close();
      }
    });

    // Scenario: Twelve agents and 32 GB.
    it('refuses the ninth claim on 32 GB naming the eight holders', async () => {
      const { run, claim, leaf, occupied, close } = await seeded(store);
      try {
        await run([
          { kind: 'setResourceCapacity', resourceId: RAM, units: 32 },
          ...Array.from({ length: 9 }, (_, index): PlanCommand => ({
            kind: 'setDemand',
            workItemId: leaf(index),
            resourceId: RAM,
            units: 4,
          })),
        ]);
        for (let index = 0; index < 8; index += 1)
          expect(await run([claim(index, `a${String(index)}`)])).toMatchObject({ ok: true });
        const ninth = await run([claim(8, 'a8')]);
        expect(ninth).toEqual({
          ok: false,
          at: 0,
          kind: 'claimWorkItem',
          reason: 'resources_exhausted',
          detail: {
            resourceId: RAM,
            asked: 4,
            free: 0,
            holders: Array.from({ length: 8 }, (_, index) => ({
              personId: `a${String(index)}`,
              name: `agent a${String(index)}`,
              runId: null,
              workItemId: leaf(index),
            })).sort((left, right) => left.workItemId.localeCompare(right.workItemId)),
          },
        });
        expect(await occupied(RAM)).toBe(32);
      } finally {
        await close();
      }
    });

    // Scenarios: Two steps of one leaf share one occupancy; Release of the last claim frees the units.
    it('shares one occupancy between two steps and frees it on the last release only', async () => {
      const { run, claim, release, dev, review, leaf, occupied, close } = await seeded(store);
      try {
        await run([
          { kind: 'setResourceCapacity', resourceId: WORKTREE, units: 1 },
          { kind: 'setDemand', workItemId: leaf(0), resourceId: WORKTREE, units: 1 },
        ]);
        expect(await run([claim(0, 'a0', { steps: [dev] })])).toMatchObject({ ok: true });
        expect(await run([claim(0, 'a1', { steps: [review] })])).toMatchObject({
          ok: true,
          results: [{ acquired: [] }],
        });
        expect(await occupied(WORKTREE)).toBe(1);
        expect(await run([release(0, 'a0')])).toMatchObject({ ok: true });
        expect(await occupied(WORKTREE)).toBe(1);
        // Still held: another leaf cannot take the one worktree.
        await run([{ kind: 'setDemand', workItemId: leaf(1), resourceId: WORKTREE, units: 1 }]);
        expect(await run([claim(1, 'a2')])).toMatchObject({ reason: 'resources_exhausted' });
        expect(await run([release(0, 'a1')])).toMatchObject({ ok: true });
        expect(await occupied(WORKTREE)).toBe(0);
        expect(await run([claim(1, 'a2')])).toMatchObject({ ok: true });
      } finally {
        await close();
      }
    });

    // R4 on a held leaf: a later claim's larger ask is acquired whole or refused.
    for (const [capacity, expected] of [
      [8, 'acquired'],
      [6, 'refused'],
    ] as const)
      it(`expands a held leaf's units on a later claim's ask, or refuses it (capacity ${String(capacity)})`, async () => {
        const { run, claim, dev, review, leaf, occupied, close } = await seeded(store);
        try {
          await run([
            { kind: 'setResourceCapacity', resourceId: RAM, units: capacity },
            { kind: 'setDemand', workItemId: leaf(0), resourceId: RAM, units: 4 },
          ]);
          expect(await run([claim(0, 'a0', { steps: [dev] })])).toMatchObject({ ok: true });
          const expanded = await run([
            claim(0, 'a1', { steps: [review], resources: [{ resourceId: RAM, units: 8 }] }),
          ]);
          if (expected === 'acquired') {
            expect(expanded).toMatchObject({
              ok: true,
              results: [{ acquired: [{ resourceId: RAM, units: 4 }] }],
            });
            expect(await occupied(RAM)).toBe(8);
          } else {
            expect(expanded).toMatchObject({
              ok: false,
              reason: 'resources_exhausted',
              detail: { resourceId: RAM, asked: 8, free: 6 },
            });
            expect(await occupied(RAM)).toBe(4);
          }
        } finally {
          await close();
        }
      });

    it('refuses a later claim asking for less than its leaf holds', async () => {
      const { run, claim, dev, review, leaf, occupied, close } = await seeded(store);
      try {
        await run([{ kind: 'setDemand', workItemId: leaf(0), resourceId: RAM, units: 4 }]);
        await run([claim(0, 'a0', { steps: [dev], resources: [{ resourceId: RAM, units: 6 }] })]);
        expect(
          await run([
            claim(0, 'a1', { steps: [review], resources: [{ resourceId: RAM, units: 5 }] }),
          ]),
        ).toEqual({
          ok: false,
          at: 0,
          kind: 'claimWorkItem',
          reason: 'below_held_occupancy',
          detail: { resourceId: RAM, asked: 5, held: 6 },
        });
        expect(await occupied(RAM)).toBe(6);
      } finally {
        await close();
      }
    });

    // Scenario: Asking for more than declared.
    it('holds what resources asks above the declared demand, and refuses asking less', async () => {
      const { run, claim, leaf, occupied, close } = await seeded(store);
      try {
        await run([
          { kind: 'setResourceCapacity', resourceId: RAM, units: 8 },
          { kind: 'setDemand', workItemId: leaf(0), resourceId: RAM, units: 2 },
          { kind: 'setDemand', workItemId: leaf(1), resourceId: RAM, units: 2 },
        ]);
        expect(await run([claim(0, 'a0', { resources: [{ resourceId: RAM, units: 1 }] })])).toEqual(
          {
            ok: false,
            at: 0,
            kind: 'claimWorkItem',
            reason: 'below_declared_demand',
            detail: { resourceId: RAM, asked: 1, declared: 2 },
          },
        );
        expect(
          await run([claim(0, 'a0', { resources: [{ resourceId: RAM, units: 6 }] })]),
        ).toMatchObject({ ok: true, results: [{ acquired: [{ resourceId: RAM, units: 6 }] }] });
        expect(await occupied(RAM)).toBe(6);
        expect(
          await run([claim(1, 'a1', { resources: [{ resourceId: RAM, units: 3 }] })]),
        ).toMatchObject({
          reason: 'resources_exhausted',
          detail: { resourceId: RAM, asked: 3, free: 2 },
        });
      } finally {
        await close();
      }
    });

    it('refuses resources naming an absent resource, or more than one unit of an exclusive one', async () => {
      const { source, run, claim, occupied, close } = await seeded(store);
      try {
        const stage = { id: 'resource-stage', name: 'staging', kind: 'exclusive' as const };
        await source.stores.directory.addResource({ ...stage, unitLabel: 'env' }, { at: 1, by: F });
        expect(
          await run([claim(0, 'a0', { resources: [{ resourceId: 'no-such', units: 1 }] })]),
        ).toMatchObject({ ok: false, reason: 'unknown_resource' });
        expect(
          await run([claim(0, 'a0', { resources: [{ resourceId: stage.id, units: 2 }] })]),
        ).toMatchObject({ ok: false, reason: 'exclusive_demand_is_one' });
        expect(await occupied(stage.id)).toBe(0);
      } finally {
        await close();
      }
    });

    // Scenario: Unstated capacity never refuses.
    it('applies a claim on a resource whose capacity the project never stated', async () => {
      const { run, claim, leaf, occupied, close } = await seeded(store);
      try {
        await run([
          { kind: 'setDemand', workItemId: leaf(0), resourceId: DISK, units: 900 },
          { kind: 'setDemand', workItemId: leaf(1), resourceId: DISK, units: 900 },
        ]);
        expect(await run([claim(0, 'a0')])).toMatchObject({ ok: true });
        expect(await run([claim(1, 'a1')])).toMatchObject({ ok: true });
        expect(await occupied(DISK)).toBe(1800);
      } finally {
        await close();
      }
    });

    // Scenario: Undo.
    it('undo of a claim takes its occupancy; redo re-acquires it', async () => {
      const { runner, projectId, run, claim, leaf, occupied, close } = await seeded(store);
      try {
        await run([
          { kind: 'setResourceCapacity', resourceId: RAM, units: 4 },
          { kind: 'setDemand', workItemId: leaf(0), resourceId: RAM, units: 4 },
        ]);
        await run([claim(0, 'a0')]);
        expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
        expect(await occupied(RAM)).toBe(0);
        expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
        expect(await occupied(RAM)).toBe(4);
      } finally {
        await close();
      }
    });

    it('redo of a claim is refused resources_exhausted once another leaf took the units', async () => {
      const { runner, projectId, run, claim, leaf, occupied, close } = await seeded(store);
      try {
        await run([
          { kind: 'setResourceCapacity', resourceId: RAM, units: 4 },
          { kind: 'setDemand', workItemId: leaf(0), resourceId: RAM, units: 4 },
          { kind: 'setDemand', workItemId: leaf(1), resourceId: RAM, units: 4 },
        ]);
        await run([claim(0, 'a0')]);
        expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
        expect(await run([claim(1, 'g0')], G)).toMatchObject({ ok: true });
        const redone = await runner.redo(projectId, F);
        expect(redone).toMatchObject({ ok: false, reason: 'stale_undo' });
        expect(redone.ok ? null : redone.detail).toBe(
          'resources_exhausted: that needs 4 GB of “h2puni ram” and 0 are free now.',
        );
        expect(await occupied(RAM)).toBe(4);
      } finally {
        await close();
      }
    });

    it('undo of a release re-acquires the units', async () => {
      const { runner, projectId, run, claim, release, leaf, occupied, close } = await seeded(store);
      try {
        await run([
          { kind: 'setResourceCapacity', resourceId: RAM, units: 4 },
          { kind: 'setDemand', workItemId: leaf(0), resourceId: RAM, units: 4 },
        ]);
        await run([claim(0, 'a0')]);
        await run([release(0, 'a0')]);
        expect(await occupied(RAM)).toBe(0);
        expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
        expect(await occupied(RAM)).toBe(4);
      } finally {
        await close();
      }
    });

    it('undo of a cascading release re-acquires leaf by leaf, refused once the second leaf no longer fits', async () => {
      const { runner, projectId, run, claim, leaf, occupied, close } = await seeded(store);
      try {
        const tree = await run([
          { kind: 'createWorkItem', ref: 'P', name: 'P', parentId: null, afterId: null },
          {
            kind: 'createWorkItem',
            ref: 'X',
            name: 'X',
            parentId: null,
            parentRef: 'P',
            afterId: null,
          },
          {
            kind: 'createWorkItem',
            ref: 'Y',
            name: 'Y',
            parentId: null,
            parentRef: 'P',
            afterId: null,
          },
          { kind: 'setResourceCapacity', resourceId: RAM, units: 8 },
          { kind: 'setDemand', workItemRef: 'X', resourceId: RAM, units: 4 },
          { kind: 'setDemand', workItemRef: 'Y', resourceId: RAM, units: 4 },
          { kind: 'setDemand', workItemId: leaf(1), resourceId: RAM, units: 4 },
        ]);
        if (!tree.ok) throw new Error(`the tree was refused: ${JSON.stringify(tree)}`);
        const [parent, x, y] = tree.results.map(({ id }) => id ?? '');
        const subtree = await run([{ kind: 'claimWorkItem', workItemId: parent, personId: 'a0' }]);
        if (!subtree.ok)
          throw new Error(`the subtree claim was refused: ${JSON.stringify(subtree)}`);
        const applied = subtree.results[0];
        const parentClaim = applied.kind === 'claimWorkItem' ? applied.claimIds[0] : undefined;
        if (parentClaim === undefined) throw new Error('the subtree claim wrote no claim');
        for (const [workItemId, personId] of [
          [x, 'a1'],
          [y, 'a2'],
        ] as const)
          expect(
            await run([{ kind: 'claimWorkItem', workItemId, personId, parentClaim }]),
          ).toMatchObject({ ok: true });
        expect(await occupied(RAM)).toBe(8);
        expect(
          await run([{ kind: 'releaseWorkItem', workItemId: parent, personId: 'a0' }]),
        ).toMatchObject({ ok: true });
        expect(await occupied(RAM)).toBe(0);
        expect(await run([claim(1, 'g0')], G)).toMatchObject({ ok: true });
        const undone = await runner.undo(projectId, F);
        expect(undone).toMatchObject({ ok: false, reason: 'stale_undo' });
        expect(undone.ok ? null : undone.detail).toStartWith('resources_exhausted:');
        expect(await occupied(RAM)).toBe(4);
      } finally {
        await close();
      }
    });

    it('hands a leaf’s demand down to its first child, keeping the occupancy, and back on undo', async () => {
      const { source, runner, projectId, run, claim, leaf, occupied, close } = await seeded(store);
      try {
        await run([{ kind: 'setDemand', workItemId: leaf(0), resourceId: RAM, units: 4 }]);
        await run([claim(0, 'a0')]);
        const demands = async () =>
          (await source.stores.demands.listByProject(projectId)).map(
            ({ workItemId, units }) =>
              `${workItemId === leaf(0) ? 'parent' : 'child'}:${String(units)}`,
          );
        const split = await run([
          { kind: 'createWorkItem', ref: 'c', name: 'Child', parentId: leaf(0), afterId: null },
        ]);
        expect(split).toMatchObject({ ok: true });
        expect(await demands()).toEqual(['child:4']);
        expect(await occupied(RAM)).toBe(4);
        expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
        expect(await demands()).toEqual(['parent:4']);
        expect(await occupied(RAM)).toBe(4);
        expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
        expect(await demands()).toEqual(['child:4']);
      } finally {
        await close();
      }
    });

    it('refuses deleting a resource a claim holds, counting it, and cascades on confirmation', async () => {
      const { runner, run, claim, occupied, close } = await seeded(store);
      try {
        await run([claim(0, 'a0', { resources: [{ resourceId: WORKTREE, units: 1 }] })]);
        expect(
          await runner.runDirectory(F, [{ kind: 'deleteResource', resourceId: WORKTREE }]),
        ).toMatchObject({
          ok: false,
          reason: 'in_use',
          detail: { counts: { demands: 0, capacities: 0, occupancies: 1 } },
        });
        expect(await occupied(WORKTREE)).toBe(1);
        expect(
          await runner.runDirectory(F, [
            { kind: 'deleteResource', resourceId: WORKTREE, cascade: true },
          ]),
        ).toMatchObject({ ok: true });
        expect(await occupied(WORKTREE)).toBe(0);
      } finally {
        await close();
      }
    });

    // Design R5: the engines level demands and never read a claim.
    it('leaves the canonical schedule input unchanged by a claim that occupies units', async () => {
      const { graph, projectId, run, claim, dev, review, leaf, occupied, close } =
        await seeded(store);
      try {
        await run([
          { kind: 'setResourceCapacity', resourceId: RAM, units: 8 },
          { kind: 'setDemand', workItemId: leaf(0), resourceId: RAM, units: 4 },
          // Stated already, so the claim states no progress of its own.
          { kind: 'setProgress', workItemId: leaf(0), stepId: dev, state: 'in_progress' },
          { kind: 'setProgress', workItemId: leaf(0), stepId: review, state: 'in_progress' },
        ]);
        const input = async () => {
          const read = await graph.workItems.scheduleInput(projectId);
          if (read === null) throw new Error('the project has no schedule input');
          return canonicalScheduleInput(read);
        };
        const before = await input();
        expect(await run([claim(0, 'a0')])).toMatchObject({ ok: true });
        expect(await occupied(RAM)).toBe(4);
        expect(await input()).toBe(before);
      } finally {
        await close();
      }
    });
  });
}
