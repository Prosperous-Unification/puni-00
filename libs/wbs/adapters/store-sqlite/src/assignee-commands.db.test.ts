import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Scope, Source, TransactionalStores } from '@wbs/core';
import { CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { expectCreated } from '@wbs/core/testing/expect-created';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { runMigrations } from './migrate';
import { openSqliteSource } from './source';

const MIGRATIONS = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const F = 'account-f';
const G = 'account-g';

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
      const folder = mkdtempSync(join(tmpdir(), 'assignee-commands-'));
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
 * Root `P` over leaves `A`, `B`, `C` and non-leaf `D` over leaves `D1`, `D2`:
 * five leaves, the spec's "parent with five leaves". `P` is labelled with a
 * team none of the people belong to, and `B`'s Review is claimed by `claire`,
 * so a command that read either would show it.
 */
async function seeded(store: (typeof STORES)[number]) {
  const { source, isMemory, dispose } = store.open();
  const options = {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
    dependencyContext: createLocalDependencyContext(source.stores),
  };
  const graph = servicesOver(source.stores, options);
  for (const id of [F, G]) {
    await source.stores.users.create(
      { id, username: id, passwordHash: 'x', createdAt: 1 },
      { at: 1, by: id },
    );
  }
  const created = expectCreated(await graph.projects.create('Assignees', F));
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
  for (const id of ['kat', 'ada', 'bob', 'claire']) {
    await source.stores.directory.addPerson({ id, name: id, kind: 'person' }, [], { at: 1, by: F });
  }
  const bound = await source.stores.directory.patchPerson(
    'claire',
    { accountId: F },
    { at: 1, by: F },
  );
  if (!bound.ok) throw new Error(`binding claire was refused: ${bound.reason}`);
  await source.stores.directory.addTeam({ id: 'platform', name: 'Platform' }, { at: 1, by: F });
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: source.uow,
    announcements: options.broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(scope.stores, {
        ...options,
        broadcast: announcements,
        dependencyContext: createLocalDependencyContext(scope.stores),
      }),
  });
  const tree = await runner.run(projectId, F, [
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
    {
      kind: 'createWorkItem',
      ref: 'D',
      name: 'D',
      parentId: null,
      parentRef: 'P',
      afterId: null,
      afterRef: 'C',
    },
    {
      kind: 'createWorkItem',
      ref: 'D1',
      name: 'D1',
      parentId: null,
      parentRef: 'D',
      afterId: null,
    },
    {
      kind: 'createWorkItem',
      ref: 'D2',
      name: 'D2',
      parentId: null,
      parentRef: 'D',
      afterId: null,
      afterRef: 'D1',
    },
    { kind: 'patchWorkItem', workItemRef: 'P', patch: { teamIds: ['platform'] } },
  ]);
  if (!tree.ok) throw new Error(`the tree was refused: ${JSON.stringify(tree)}`);
  const ids = new Map(
    tree.results.flatMap((each) =>
      'id' in each && typeof each.id === 'string' && each.ref !== undefined
        ? [[each.ref, each.id] as const]
        : [],
    ),
  );
  const idOf = (ref: string): string => {
    const id = ids.get(ref);
    if (id === undefined) throw new Error(`no work item ${ref}`);
    return id;
  };
  const prior = await runner.run(projectId, F, [
    { kind: 'setAssignee', workItemId: idOf('A'), stepId: review, personId: 'ada' },
    { kind: 'setAssignee', workItemId: idOf('D1'), stepId: review, personId: 'bob' },
    { kind: 'setAssignee', workItemId: idOf('C'), stepId: dev, personId: 'bob' },
    {
      kind: 'claimWorkItem',
      workItemId: idOf('B'),
      personId: 'claire',
      steps: [review],
    },
  ]);
  if (!prior.ok) throw new Error(`the prior assignments were refused: ${JSON.stringify(prior)}`);
  /** Every assignment under `P`, as `ref:step:person`, sorted. */
  const assignments = async (): Promise<string[]> => {
    const refOf = new Map([...ids].map(([ref, id]) => [id, ref]));
    const stepOf = new Map([
      [dev, 'dev'],
      [review, 'review'],
    ]);
    const found = await source.stores.directory.assignmentsOf([...ids.values()]);
    return found
      .map(
        (each) =>
          `${refOf.get(each.workItemId) ?? '?'}:${stepOf.get(each.stepId) ?? '?'}:${each.personId}`,
      )
      .toSorted();
  };
  const entries = async () => (await source.stores.journal.entriesFor(projectId, F)).length;
  const close = async () => {
    await source.close();
    dispose();
  };
  return { graph, runner, projectId, dev, review, idOf, assignments, entries, close };
}

const BEFORE = ['A:review:ada', 'C:dev:bob', 'D1:review:bob'];

for (const store of STORES) {
  describe(`assignSubtree on the ${store.name} store`, () => {
    it('assigns Review on all five leaves in one entry, and undo restores the two that existed', async () => {
      const { runner, projectId, review, idOf, assignments, entries, close } = await seeded(store);
      try {
        expect(await assignments()).toEqual(BEFORE);
        const before = await entries();
        expect(
          await runner.run(projectId, F, [
            { kind: 'assignSubtree', workItemId: idOf('P'), stepId: review, personId: 'kat' },
          ]),
        ).toMatchObject({ ok: true, results: [{ index: 0, kind: 'assignSubtree' }] });
        expect(await entries()).toBe(before + 1);
        // The team label on P and claire's claim on B's Review change nothing:
        // neither is read. Parents P and D get no assignment of their own.
        expect(await assignments()).toEqual([
          'A:review:kat',
          'B:review:kat',
          'C:dev:bob',
          'C:review:kat',
          'D1:review:kat',
          'D2:review:kat',
        ]);
        expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
        expect(await assignments()).toEqual(BEFORE);
        expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
        expect(await assignments()).toHaveLength(6);
      } finally {
        await close();
      }
    });

    it('clears the step on every leaf with null, and undo puts each back', async () => {
      const { runner, projectId, review, idOf, assignments, close } = await seeded(store);
      try {
        expect(
          await runner.run(projectId, F, [
            { kind: 'assignSubtree', workItemId: idOf('D'), stepId: review, personId: null },
          ]),
        ).toMatchObject({ ok: true });
        expect(await assignments()).toEqual(['A:review:ada', 'C:dev:bob']);
        expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
        expect(await assignments()).toEqual(BEFORE);
      } finally {
        await close();
      }
    });

    it('assigns the item itself when it is a leaf', async () => {
      const { runner, projectId, dev, idOf, assignments, close } = await seeded(store);
      try {
        expect(
          await runner.run(projectId, F, [
            { kind: 'assignSubtree', workItemId: idOf('C'), stepId: dev, personId: 'kat' },
          ]),
        ).toMatchObject({ ok: true });
        expect(await assignments()).toEqual(['A:review:ada', 'C:dev:kat', 'D1:review:bob']);
        expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
        expect(await assignments()).toEqual(BEFORE);
      } finally {
        await close();
      }
    });

    it('refuses unknown_step and unknown_person as setAssignee does, writing nothing', async () => {
      const { runner, projectId, review, idOf, assignments, entries, close } = await seeded(store);
      try {
        const before = await entries();
        for (const [command, reason] of [
          [{ stepId: 'not-a-step', personId: 'kat' }, 'unknown_step'],
          [{ stepId: review, personId: 'nobody' }, 'unknown_person'],
        ] as const) {
          for (const kind of ['setAssignee', 'assignSubtree'] as const)
            expect(
              await runner.run(projectId, F, [{ kind, workItemId: idOf('P'), ...command }]),
            ).toMatchObject({ ok: false, at: 0, kind, reason });
        }
        expect(await assignments()).toEqual(BEFORE);
        expect(await entries()).toBe(before);
      } finally {
        await close();
      }
    });
  });

  describe(`assignSubtree on the ${store.name} store, beyond the batch`, () => {
    it('answers unknown_step from the service itself, before any write', async () => {
      const { graph, review, idOf, entries, close } = await seeded(store);
      try {
        const before = await entries();
        expect(await graph.workItems.assignSubtree(idOf('P'), F, 'not-a-step', 'kat')).toEqual({
          ok: false,
          reason: 'unknown_step',
        });
        expect(await graph.workItems.assignSubtree(idOf('P'), F, review, 'kat')).toEqual({
          ok: true,
          value: null,
        });
        expect(await entries()).toBe(before + 1);
      } finally {
        await close();
      }
    });

    // The memory source keeps no work-item revisions, so only SQLite can tell an
    // undo its leaves moved on since (the same split claim-command.test.ts states).
    const onRevisions = store.name === 'sqlite' ? it : it.skip;
    onRevisions('refuses a stale undo once another account changed one of its leaves', async () => {
      const { runner, projectId, review, idOf, assignments, close } = await seeded(store);
      try {
        expect(
          await runner.run(projectId, F, [
            { kind: 'assignSubtree', workItemId: idOf('P'), stepId: review, personId: 'kat' },
          ]),
        ).toMatchObject({ ok: true });
        expect(
          await runner.run(projectId, G, [
            { kind: 'setAssignee', workItemId: idOf('D2'), stepId: review, personId: 'ada' },
          ]),
        ).toMatchObject({ ok: true });
        const moved = await assignments();
        expect(moved).toContain('D2:review:ada');
        expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
        // All or none: no leaf goes back while one of them has moved on.
        expect(await assignments()).toEqual(moved);
      } finally {
        await close();
      }
    });
  });

  describe(`claimWorkItem with assign on the ${store.name} store`, () => {
    it('assigns the claimant to the steps it claims, and undo removes both', async () => {
      const { runner, projectId, idOf, assignments, close } = await seeded(store);
      try {
        expect(
          await runner.run(projectId, F, [
            { kind: 'claimWorkItem', workItemId: idOf('C'), personId: 'claire', assign: true },
          ]),
        ).toMatchObject({ ok: true });
        expect(await assignments()).toEqual([
          'A:review:ada',
          'C:dev:claire',
          'C:review:claire',
          'D1:review:bob',
        ]);
        expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
        expect(await assignments()).toEqual(BEFORE);
      } finally {
        await close();
      }
    });
  });
}
