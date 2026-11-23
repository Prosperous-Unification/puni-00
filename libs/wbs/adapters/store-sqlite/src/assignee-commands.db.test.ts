import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Scope, Source, TransactionalStores } from '@wbs/core';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { expectCreated } from '@wbs/core/testing/expect-created';
import { seedLegacyPackageParent as seedMemoryPackageParent } from '@wbs/core/testing/legacy-package-source-fixture';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { openSqliteSource } from './source';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { seedLegacyPackageParent as seedSqlitePackageParent } from './testing/legacy-package-parent';

const F = 'account-f';
const G = 'account-g';

/** Each store the conformance suite certifies, opened fresh for one test. */
const STORES: readonly {
  readonly name: string;
  readonly open: () => {
    source: Source<TransactionalStores>;
    seedParent: () => void;
    dispose: () => void;
  };
}[] = [
  {
    name: 'memory',
    open: () => {
      const fixture = openMemorySourceFixture();
      return {
        source: fixture.source,
        seedParent: () => {
          seedMemoryPackageParent(fixture, {
            organizationId: 'fixture-legacy-org',
            projectId: 'fixture-project',
            creator: F,
          });
          fixture.setPackageCreationMembers('fixture-legacy-org', [F, G]);
        },
        dispose: () => undefined,
      };
    },
  },
  {
    name: 'sqlite',
    open: () => {
      const folder = mkdtempSync(join(tmpdir(), 'assignee-commands-'));
      const dbPath = join(folder, 'plan.db');
      const custody = { hasUnknownOwner: false };
      try {
        migrateEmptyCatalogueFixture({ path: dbPath, directory: folder, reportedAt: 1 }, custody);
      } catch (cause: unknown) {
        // Proof: omitting this guard deleted the owned namespace after native close
        // returned then threw; the unchanged retention assertion failed in
        // mixed-occupancy-close-root-v258, then exact restoration passed.
        if (custody.hasUnknownOwner)
          throw new Error('assignee-commands fixture custody is unknown; retained ' + folder, {
            cause,
          });
        rmSync(folder, { recursive: true, force: true });
        throw cause;
      }
      return {
        source: openSqliteSource({
          dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
          dbPath,
        }),
        seedParent: () => {
          seedSqlitePackageParent(dbPath, 'fixture-legacy-org', 'fixture-project');
          const sqlite = openDatabase(dbPath);
          try {
            for (const id of [F, G])
              sqlite.run(
                "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES(?,?,'member',1)",
                ['fixture-legacy-org', id],
              );
          } finally {
            sqlite.close();
          }
        },
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
 * team none of the people belong to, so a command that read it would show it,
 * and `B`'s Review, unassigned, is claimed by `claire`.
 */
async function seeded(store: (typeof STORES)[number]) {
  const { source, seedParent, dispose } = store.open();
  const options = {
    admission: LEGACY_EDIT_ADMISSION,
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
  seedParent();
  for (const [id, code, name, position] of [
    ['fixture-dev', 'dev', 'Dev', 10],
    ['fixture-qa', 'qa', 'QA', 20],
  ] as const) {
    const defined = await source.stores.stepCatalogue.defineAndBindStep(
      'fixture-legacy-org',
      {
        id,
        code,
        name,
        position,
        defaultAllowancePercent: 0,
        defaultEstimateUnit: 'workdays',
      },
      {
        bindingId: id + ':binding',
        scopeKind: 'project',
        scopeId: 'fixture-project',
        workItemTypeId: null,
        position,
      },
      { at: 1, by: F },
    );
    if (!defined.ok) throw new Error('fixture definition refused: ' + defined.reason);
  }
  const created = expectCreated(await graph.workPackages.create('Assignees', 'fixture-project', F));
  const workPackageId = created.workPackage.id;
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
  const prior = await runner.run(workPackageId, F, [
    { kind: 'setAssignee', workItemId: idOf('A'), stepId: review, personId: 'ada' },
    { kind: 'setAssignee', workItemId: idOf('D1'), stepId: review, personId: 'bob' },
    { kind: 'setAssignee', workItemId: idOf('C'), stepId: dev, personId: 'bob' },
    // Review is already underway, so its claim continues work rather than starting out of order.
    { kind: 'setProgress', workItemId: idOf('B'), stepId: review, state: 'in_progress' },
    {
      kind: 'claimWorkItem',
      workItemId: idOf('B'),
      personId: 'claire',
      steps: [review],
      runId: 'run-b',
    },
  ]);
  if (!prior.ok) throw new Error(`the prior assignments were refused: ${JSON.stringify(prior)}`);
  const claireClaimId = prior.results
    .flatMap((each) => (each.kind === 'claimWorkItem' ? each.claimIds : []))
    .at(0);
  if (claireClaimId === undefined) throw new Error('claire holds no claim');
  /** claire's step claim on B's Review, as an entry of reassignedClaimedSteps names it. */
  const claire = { claimId: claireClaimId, personId: 'claire', runId: 'run-b' };
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
  const entries = async () =>
    (await source.stores.journal.entriesFor({ workPackageId, userId: F, personId: null })).length;
  const close = async () => {
    await source.close();
    dispose();
  };
  return { graph, runner, workPackageId, dev, review, idOf, assignments, entries, claire, close };
}

const BEFORE = ['A:review:ada', 'C:dev:bob', 'D1:review:bob'];

for (const store of STORES) {
  describe(`assignSubtree on the ${store.name} store`, () => {
    it('assigns Review on all five leaves in one entry, and undo restores the two that existed', async () => {
      const { runner, workPackageId, review, idOf, assignments, entries, close } =
        await seeded(store);
      try {
        expect(await assignments()).toEqual(BEFORE);
        const before = await entries();
        expect(
          await runner.run(workPackageId, F, [
            { kind: 'assignSubtree', workItemId: idOf('P'), stepId: review, personId: 'kat' },
          ]),
        ).toMatchObject({ ok: true, results: [{ index: 0, kind: 'assignSubtree' }] });
        expect(await entries()).toBe(before + 1);
        // Neither the team label on P nor claire's claim on B's Review refuses or
        // skips a leaf. Parents P and D get no assignment of their own.
        expect(await assignments()).toEqual([
          'A:review:kat',
          'B:review:kat',
          'C:dev:bob',
          'C:review:kat',
          'D1:review:kat',
          'D2:review:kat',
        ]);
        expect(await runner.undo(workPackageId, F)).toMatchObject({ ok: true });
        expect(await assignments()).toEqual(BEFORE);
        expect(await runner.redo(workPackageId, F)).toMatchObject({ ok: true });
        expect(await assignments()).toHaveLength(6);
      } finally {
        await close();
      }
    });

    it('lists the claimed step it took from its holder, and undo leaves the claim', async () => {
      const { graph, runner, workPackageId, review, idOf, assignments, claire, close } =
        await seeded(store);
      try {
        expect(
          await runner.run(workPackageId, F, [
            { kind: 'assignSubtree', workItemId: idOf('P'), stepId: review, personId: 'kat' },
          ]),
        ).toMatchObject({
          ok: true,
          results: [
            {
              kind: 'assignSubtree',
              reassignedClaimedSteps: [
                {
                  workItemId: idOf('B'),
                  stepId: review,
                  previousPersonId: null,
                  holder: claire,
                },
              ],
            },
          ],
        });
        expect(await assignments()).toContain('B:review:kat');
        expect(await runner.undo(workPackageId, F)).toMatchObject({ ok: true });
        expect(await assignments()).toEqual(BEFORE);
        expect(
          await graph.workItems.personWorkWithin(workPackageId, { kind: 'legacy' }, 'claire'),
        ).toMatchObject({ assignments: [], claims: [{ workItemId: idOf('B'), stepId: review }] });
      } finally {
        await close();
      }
    });

    it('lists no step assigned to its own holder, nor one whose assignee did not change', async () => {
      const { runner, workPackageId, review, idOf, claire, close } = await seeded(store);
      try {
        expect(
          await runner.run(workPackageId, F, [
            { kind: 'assignSubtree', workItemId: idOf('P'), stepId: review, personId: 'claire' },
          ]),
        ).toMatchObject({ ok: true, results: [{ reassignedClaimedSteps: [] }] });
        // claire is now B's assignee and holder; giving B to her again changes nothing.
        expect(
          await runner.run(workPackageId, F, [
            { kind: 'assignSubtree', workItemId: idOf('B'), stepId: review, personId: 'claire' },
          ]),
        ).toMatchObject({ ok: true, results: [{ reassignedClaimedSteps: [] }] });
        // Taken from her, the entry names her as the assignee before.
        expect(
          await runner.run(workPackageId, F, [
            { kind: 'assignSubtree', workItemId: idOf('B'), stepId: review, personId: null },
          ]),
        ).toMatchObject({
          ok: true,
          results: [
            {
              reassignedClaimedSteps: [
                {
                  workItemId: idOf('B'),
                  stepId: review,
                  previousPersonId: 'claire',
                  holder: claire,
                },
              ],
            },
          ],
        });
        // Cleared again, the step held by claire has the same assignee as before: not listed.
        expect(
          await runner.run(workPackageId, F, [
            { kind: 'assignSubtree', workItemId: idOf('B'), stepId: review, personId: null },
          ]),
        ).toMatchObject({ ok: true, results: [{ reassignedClaimedSteps: [] }] });
      } finally {
        await close();
      }
    });

    it('lists only a claim on the step it assigns: not a subtree claim, not another step', async () => {
      const { runner, workPackageId, dev, review, idOf, claire, close } = await seeded(store);
      try {
        // claire also holds the subtree D and A's Dev; neither is a claim on a leaf's Review.
        expect(
          await runner.run(workPackageId, F, [
            { kind: 'claimWorkItem', workItemId: idOf('D'), personId: 'claire' },
            { kind: 'claimWorkItem', workItemId: idOf('A'), personId: 'claire', steps: [dev] },
          ]),
        ).toMatchObject({ ok: true });
        expect(
          await runner.run(workPackageId, F, [
            { kind: 'assignSubtree', workItemId: idOf('P'), stepId: review, personId: 'kat' },
          ]),
        ).toMatchObject({
          ok: true,
          results: [
            {
              reassignedClaimedSteps: [
                { workItemId: idOf('B'), stepId: review, previousPersonId: null, holder: claire },
              ],
            },
          ],
        });
      } finally {
        await close();
      }
    });

    it('clears the step on every leaf with null, and undo puts each back', async () => {
      const { runner, workPackageId, review, idOf, assignments, close } = await seeded(store);
      try {
        expect(
          await runner.run(workPackageId, F, [
            { kind: 'assignSubtree', workItemId: idOf('D'), stepId: review, personId: null },
          ]),
        ).toMatchObject({ ok: true });
        expect(await assignments()).toEqual(['A:review:ada', 'C:dev:bob']);
        expect(await runner.undo(workPackageId, F)).toMatchObject({ ok: true });
        expect(await assignments()).toEqual(BEFORE);
      } finally {
        await close();
      }
    });

    it('assigns the item itself when it is a leaf', async () => {
      const { runner, workPackageId, dev, idOf, assignments, close } = await seeded(store);
      try {
        expect(
          await runner.run(workPackageId, F, [
            { kind: 'assignSubtree', workItemId: idOf('C'), stepId: dev, personId: 'kat' },
          ]),
        ).toMatchObject({ ok: true });
        expect(await assignments()).toEqual(['A:review:ada', 'C:dev:kat', 'D1:review:bob']);
        expect(await runner.undo(workPackageId, F)).toMatchObject({ ok: true });
        expect(await assignments()).toEqual(BEFORE);
      } finally {
        await close();
      }
    });

    it('refuses unknown_step and unknown_person as setAssignee does, writing nothing', async () => {
      const { runner, workPackageId, review, idOf, assignments, entries, close } =
        await seeded(store);
      try {
        const before = await entries();
        for (const [command, reason] of [
          [{ stepId: 'not-a-step', personId: 'kat' }, 'unknown_step'],
          [{ stepId: review, personId: 'nobody' }, 'unknown_person'],
        ] as const) {
          for (const kind of ['setAssignee', 'assignSubtree'] as const)
            expect(
              await runner.run(workPackageId, F, [{ kind, workItemId: idOf('P'), ...command }]),
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
      const { graph, review, idOf, entries, claire, close } = await seeded(store);
      try {
        const before = await entries();
        expect(await graph.workItems.assignSubtree(idOf('P'), F, 'not-a-step', 'kat')).toEqual({
          ok: false,
          reason: 'unknown_step',
        });
        expect(await graph.workItems.assignSubtree(idOf('P'), F, review, 'kat')).toEqual({
          ok: true,
          value: {
            reassignedClaimedSteps: [
              {
                workItemId: idOf('B'),
                stepId: review,
                previousPersonId: null,
                holder: claire,
              },
            ],
          },
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
      const { runner, workPackageId, review, idOf, assignments, close } = await seeded(store);
      try {
        expect(
          await runner.run(workPackageId, F, [
            { kind: 'assignSubtree', workItemId: idOf('P'), stepId: review, personId: 'kat' },
          ]),
        ).toMatchObject({ ok: true });
        expect(
          await runner.run(workPackageId, G, [
            { kind: 'setAssignee', workItemId: idOf('D2'), stepId: review, personId: 'ada' },
          ]),
        ).toMatchObject({ ok: true });
        const moved = await assignments();
        expect(moved).toContain('D2:review:ada');
        expect(await runner.undo(workPackageId, F)).toMatchObject({ ok: false });
        // All or none: no leaf goes back while one of them has moved on.
        expect(await assignments()).toEqual(moved);
      } finally {
        await close();
      }
    });
  });

  describe(`claimWorkItem with assign on the ${store.name} store`, () => {
    it('assigns the claimant to the steps it claims, and undo restores prior assignments', async () => {
      const { runner, workPackageId, review, idOf, assignments, close } = await seeded(store);
      try {
        // Both steps can be held together when Review is already underway.
        expect(
          await runner.run(workPackageId, F, [
            { kind: 'setProgress', workItemId: idOf('C'), stepId: review, state: 'in_progress' },
          ]),
        ).toMatchObject({ ok: true });
        expect(
          await runner.run(workPackageId, F, [
            { kind: 'claimWorkItem', workItemId: idOf('C'), personId: 'claire', assign: true },
          ]),
        ).toMatchObject({ ok: true });
        expect(await assignments()).toEqual([
          'A:review:ada',
          'C:dev:claire',
          'C:review:claire',
          'D1:review:bob',
        ]);
        expect(await runner.undo(workPackageId, F)).toMatchObject({ ok: true });
        expect(await assignments()).toEqual(BEFORE);
      } finally {
        await close();
      }
    });
  });
}
