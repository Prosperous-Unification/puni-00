import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { servicesOver } from '../../compose';
import type { ClaimStore } from '../../ports/claim-store';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import type { Scope } from '../../ports/unit-of-work';
import {
  CommandNormalizationError,
  normalizeCommand,
  type PlanCommand,
} from '../../service/command-normalizers';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';
import { createPlanCommandRunner } from './composition';

const F = 'account-f';

/**
 * A project with its starting steps; root `080` with leaves `080.25` and
 * `080.26`, a free leaf `090`, and the person `claire` to claim them.
 */
async function seeded() {
  const source = openMemorySource();
  const broadcast = recordingBroadcaster();
  const options = {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast,
    scheduler: fastScheduler,
  };
  const graph = servicesOver(source.stores, options);
  await source.stores.users.create(
    { id: F, username: F, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: F },
  );
  const created = await graph.projects.create('Resources', F);
  const projectId = created.project.id;
  for (const step of created.steps) {
    await source.stores.steps.add(
      { id: step.id, projectId, name: step.name, allowancePercent: 0, estimateUnit: 'workdays' },
      { at: 1, by: F },
    );
  }
  const steps = (await source.stores.projects.stepsOf(projectId)).map(({ id }) => id);
  for (const row of [
    workItemRow({ id: '080', projectId, parentId: null, position: 1, name: 'Platform' }),
    workItemRow({ id: '080.25', projectId, parentId: '080', position: 1, name: 'Build' }),
    workItemRow({ id: '080.26', projectId, parentId: '080', position: 2, name: 'Test' }),
    workItemRow({ id: '090', projectId, parentId: null, position: 2, name: 'Deploy' }),
  ])
    await source.stores.workItems.insert(row, [], { at: 1, by: F });
  await source.stores.directory.addPerson({ id: 'claire', name: 'claire', kind: 'agent' }, [], {
    at: 1,
    by: F,
  });
  // `claire` is bound to the account writing, so the account may claim as her.
  const bound = (claims: ClaimStore): ClaimStore => ({
    listByProject: (id) => claims.listByProject(id),
    listStampedByProject: (id) => claims.listStampedByProject(id),
    findById: (id, claimId) => claims.findById(id, claimId),
    occupancyOf: (id) => claims.occupancyOf(id),
    add: (written, stated, stamp, occupancy) => claims.add(written, stated, stamp, occupancy),
    remove: (removed, cleared, stamp) => claims.remove(removed, cleared, stamp),
    moveAll: (fromWorkItemId, toWorkItemId, stamp) =>
      claims.moveAll(fromWorkItemId, toWorkItemId, stamp),
    boundAccountOf: (personId) => Promise.resolve(personId === 'claire' ? F : null),
    pinnedPersonOf: () => Promise.resolve(null),
  });
  const runner = createPlanCommandRunner({
    uow: source.uow,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(
        { ...scope.stores, claims: bound(scope.stores.claims) },
        { ...options, broadcast: announcements },
      ),
  });
  const demands = () => source.stores.demands.listByProject(projectId);
  const capacities = () => graph.capacity.listResourceCapacitiesFor(projectId);
  const entries = async () => (await source.stores.journal.entriesFor(projectId, F)).length;
  /** Creates the two resources the cases use and answers their ids. */
  const declare = async () => {
    const answer = await runner.runDirectory(F, [
      {
        kind: 'createResource',
        ref: 'ram',
        name: 'h2puni ram',
        resourceKind: 'divisible',
        unitLabel: 'GB',
      },
      {
        kind: 'createResource',
        ref: 'stage',
        name: 'staging',
        resourceKind: 'exclusive',
        unitLabel: 'env',
      },
    ]);
    if (!answer.ok) throw new Error(`resources were refused: ${answer.reason}`);
    const [ram, stage] = answer.results.map(({ id }) => id);
    if (ram === undefined || stage === undefined) throw new Error('resources minted no ids');
    return { ram, stage };
  };
  return { source, graph, runner, projectId, steps, demands, capacities, entries, declare };
}

describe('the resource directory commands', () => {
  it('declares a host’s RAM, lists it, and refuses a second of one name as taken', async () => {
    const { source, graph, runner } = await seeded();
    try {
      const created = await runner.runDirectory(F, [
        {
          kind: 'createResource',
          name: ' h2puni ram ',
          resourceKind: 'divisible',
          unitLabel: 'GB',
        },
      ]);
      expect(created).toMatchObject({
        ok: true,
        results: [{ index: 0, entity: { name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' } }],
      });
      const listed = await graph.directory.listWithin('resources', { kind: 'legacy' });
      expect(listed.map(({ name, kind, unitLabel }) => ({ name, kind, unitLabel }))).toEqual([
        { name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' },
      ]);
      // A team create answers the held row; a resource's would hand back a kind
      // and unit the caller did not ask for, so it is refused the way a taken
      // team name is refused on rename.
      expect(
        await runner.runDirectory(F, [
          {
            kind: 'createResource',
            name: 'h2puni ram',
            resourceKind: 'exclusive',
            unitLabel: 'slot',
          },
        ]),
      ).toEqual({
        ok: false,
        at: 0,
        kind: 'createResource',
        reason: 'taken',
        detail: { name: 'h2puni ram' },
      });
      expect(await graph.directory.listWithin('resources', { kind: 'legacy' })).toEqual(listed);
      expect(
        await runner.runDirectory(F, [
          { kind: 'createResource', name: '  ', resourceKind: 'divisible', unitLabel: 'GB' },
        ]),
      ).toMatchObject({ ok: false, reason: 'name_required' });
    } finally {
      await source.close();
    }
  });

  it('renames a resource and changes its unit label, keeping its kind', async () => {
    const { source, graph, runner, declare } = await seeded();
    try {
      const { ram, stage } = await declare();
      expect(
        await runner.runDirectory(F, [
          { kind: 'patchResource', resourceId: ram, patch: { name: 'h2puni memory' } },
          { kind: 'patchResource', resourceId: ram, patch: { unitLabel: 'MB' } },
        ]),
      ).toMatchObject({
        ok: true,
        results: [
          { entity: { id: ram, name: 'h2puni memory', kind: 'divisible', unitLabel: 'GB' } },
          { entity: { id: ram, name: 'h2puni memory', kind: 'divisible', unitLabel: 'MB' } },
        ],
      });
      expect(
        await runner.runDirectory(F, [
          { kind: 'patchResource', resourceId: stage, patch: { name: 'h2puni memory' } },
        ]),
      ).toMatchObject({ ok: false, reason: 'taken', detail: { name: 'h2puni memory' } });
      expect(
        await runner.runDirectory(F, [{ kind: 'patchResource', resourceId: stage, patch: {} }]),
      ).toMatchObject({ ok: false, reason: 'nothing_to_change' });
      expect(
        await runner.runDirectory(F, [
          { kind: 'patchResource', resourceId: 'nothing', patch: { unitLabel: 'x' } },
        ]),
      ).toMatchObject({ ok: false, reason: 'not_found' });
      const kinds = (await graph.directory.listWithin('resources', { kind: 'legacy' })).map(
        ({ id, kind }) => ({ id, kind }),
      );
      expect(kinds).toContainEqual({ id: ram, kind: 'divisible' });
      expect(kinds).toContainEqual({ id: stage, kind: 'exclusive' });
    } finally {
      await source.close();
    }
  });

  it('refuses a patch naming the kind at the command boundary', () => {
    expect(() =>
      normalizeCommand('patchResource', {
        kind: 'patchResource',
        resourceId: 'r',
        patch: { name: 'renamed', resourceKind: 'exclusive' },
      }),
    ).toThrow(new CommandNormalizationError('kind_is_immutable'));
    expect(() =>
      normalizeCommand('createResource', {
        kind: 'createResource',
        name: 'disk',
        resourceKind: 'renewable',
        unitLabel: 'h',
      }),
    ).toThrow(new CommandNormalizationError('resourceKind_must_be_exclusive_or_divisible'));
    expect(() =>
      normalizeCommand('createResource', {
        kind: 'createResource',
        name: 'disk',
        resourceKind: 'divisible',
        unitLabel: 'x'.repeat(41),
      }),
    ).toThrow(new CommandNormalizationError('unitLabel_must_be_at_most_40_characters'));
  });

  it('refuses removing a demanded resource, naming 2 demands, 0 capacities, 0 occupancies', async () => {
    const { source, graph, runner, projectId, demands, declare } = await seeded();
    try {
      const { ram } = await declare();
      await runner.run(projectId, F, [
        { kind: 'setDemand', workItemId: '080.25', resourceId: ram, units: 4 },
        { kind: 'setDemand', workItemId: '090', resourceId: ram, units: 2 },
      ]);
      const refused = await runner.runDirectory(F, [{ kind: 'deleteResource', resourceId: ram }]);
      expect(refused).toMatchObject({
        ok: false,
        at: 0,
        kind: 'deleteResource',
        reason: 'in_use',
        detail: {
          counts: { demands: 2, capacities: 0, occupancies: 0 },
          usage: {
            members: [],
            projects: [
              {
                id: projectId,
                workItems: [
                  {
                    id: '080.25',
                    number: '010.1',
                    name: 'Build',
                    effects: [{ kind: 'demand_removed', units: 4 }],
                  },
                  {
                    id: '090',
                    number: '020',
                    name: 'Deploy',
                    effects: [{ kind: 'demand_removed', units: 2 }],
                  },
                ],
              },
            ],
          },
        },
      });
      expect((await graph.directory.listWithin('resources', { kind: 'legacy' })).length).toBe(2);
      expect(await demands()).toHaveLength(2);
    } finally {
      await source.close();
    }
  });

  it('removes a resource with cascade, taking its demands and capacities with it', async () => {
    const { source, graph, runner, projectId, demands, capacities, declare } = await seeded();
    try {
      const { ram, stage } = await declare();
      await runner.run(projectId, F, [
        { kind: 'setDemand', workItemId: '080.25', resourceId: ram, units: 4 },
        { kind: 'setResourceCapacity', resourceId: ram, units: 32 },
        { kind: 'setResourceCapacity', resourceId: stage, units: 1 },
      ]);
      // A capacity alone keeps the resource in use: the counts name it.
      expect(
        await runner.runDirectory(F, [{ kind: 'deleteResource', resourceId: stage }]),
      ).toMatchObject({
        ok: false,
        reason: 'in_use',
        detail: { counts: { demands: 0, capacities: 1, occupancies: 0 } },
      });
      expect(
        await runner.runDirectory(F, [{ kind: 'deleteResource', resourceId: ram, cascade: true }]),
      ).toMatchObject({ ok: true });
      expect(await demands()).toEqual([]);
      expect(await capacities()).toEqual([{ resourceId: stage, units: 1 }]);
      expect(
        (await graph.directory.listWithin('resources', { kind: 'legacy' })).map(({ id }) => id),
      ).toEqual([stage]);
      expect(
        await runner.runDirectory(F, [{ kind: 'deleteResource', resourceId: ram, cascade: true }]),
      ).toMatchObject({ ok: false, reason: 'not_found' });
    } finally {
      await source.close();
    }
  });
});

describe('setResourceCapacity', () => {
  it('states, zeroes, remembers and clears one pair, journalling nothing', async () => {
    const { source, runner, projectId, capacities, entries, declare } = await seeded();
    try {
      const { ram, stage } = await declare();
      const before = await entries();
      expect(
        await runner.run(projectId, F, [
          { kind: 'setResourceCapacity', resourceId: ram, units: 32 },
          { kind: 'setResourceCapacity', resourceId: stage, units: 0 },
        ]),
      ).toMatchObject({ ok: true });
      // Resource-id order, as the store promises.
      expect(await capacities()).toEqual(
        [
          { resourceId: ram, units: 32 },
          { resourceId: stage, units: 0 },
        ].sort((left, right) => left.resourceId.localeCompare(right.resourceId)),
      );
      // Remembered: no leaf demands RAM, and the number stays until cleared.
      await runner.run(projectId, F, [
        { kind: 'setDemand', workItemId: '090', resourceId: ram, units: 4 },
        { kind: 'setDemand', workItemId: '090', resourceId: ram, units: null },
      ]);
      expect(await capacities()).toContainEqual({ resourceId: ram, units: 32 });
      await runner.run(projectId, F, [
        { kind: 'setResourceCapacity', resourceId: ram, units: null },
      ]);
      expect(await capacities()).toEqual([{ resourceId: stage, units: 0 }]);
      expect(
        await runner.run(projectId, F, [
          { kind: 'setResourceCapacity', resourceId: 'nothing', units: 1 },
        ]),
      ).toMatchObject({ ok: false, reason: 'unknown_resource' });
      // The two demand writes journalled; the three capacity batches did not.
      expect((await entries()) - before).toBe(1);
    } finally {
      await source.close();
    }
  });

  it('refuses units below 0 or above the bound at the command boundary', () => {
    for (const [units, reason] of [
      [-1, 'units_must_be_a_whole_number_from_0'],
      [1.5, 'units_must_be_a_whole_number_from_0'],
      ['3', 'units_must_be_a_whole_number_from_0'],
      [1_000_000_001, 'units_must_be_at_most_1000000000'],
    ] as const)
      expect(() =>
        normalizeCommand('setResourceCapacity', {
          kind: 'setResourceCapacity',
          resourceId: 'r',
          units,
        }),
      ).toThrow(new CommandNormalizationError(reason));
    expect(() =>
      normalizeCommand('setResourceCapacity', { kind: 'setResourceCapacity', resourceId: 'r' }),
    ).toThrow(new CommandNormalizationError('units_required'));
  });
});

describe('setDemand', () => {
  it('states, replaces and removes a demand, each one undoable entry', async () => {
    const { source, runner, projectId, demands, entries, declare } = await seeded();
    try {
      const { ram } = await declare();
      const before = await entries();
      await runner.run(projectId, F, [
        { kind: 'setDemand', workItemId: '080.25', resourceId: ram, units: 4 },
      ]);
      await runner.run(projectId, F, [
        { kind: 'setDemand', workItemId: '080.25', resourceId: ram, units: 6 },
      ]);
      expect(await demands()).toEqual([{ workItemId: '080.25', resourceId: ram, units: 6 }]);
      expect((await entries()) - before).toBe(2);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await demands()).toEqual([{ workItemId: '080.25', resourceId: ram, units: 4 }]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await demands()).toEqual([]);
      expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
      expect(await demands()).toEqual([{ workItemId: '080.25', resourceId: ram, units: 4 }]);
      await runner.run(projectId, F, [
        { kind: 'setDemand', workItemId: '080.25', resourceId: ram, units: null },
      ]);
      expect(await demands()).toEqual([]);
      expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
      expect(await demands()).toEqual([{ workItemId: '080.25', resourceId: ram, units: 4 }]);
    } finally {
      await source.close();
    }
  });

  it('refuses 2 units on an exclusive resource, writing nothing', async () => {
    const { source, runner, projectId, demands, entries, declare } = await seeded();
    try {
      const { stage } = await declare();
      const before = await entries();
      expect(
        await runner.run(projectId, F, [
          { kind: 'setDemand', workItemId: '090', resourceId: stage, units: 2 },
        ]),
      ).toEqual({
        ok: false,
        at: 0,
        kind: 'setDemand',
        reason: 'exclusive_demand_is_one',
      });
      expect(await demands()).toEqual([]);
      expect(await entries()).toBe(before);
      expect(
        await runner.run(projectId, F, [
          { kind: 'setDemand', workItemId: '090', resourceId: stage, units: 1 },
        ]),
      ).toMatchObject({ ok: true });
      expect(await demands()).toEqual([{ workItemId: '090', resourceId: stage, units: 1 }]);
      expect(
        await runner.run(projectId, F, [
          { kind: 'setDemand', workItemId: '090', resourceId: 'nothing', units: 1 },
        ]),
      ).toMatchObject({ ok: false, reason: 'unknown_resource' });
    } finally {
      await source.close();
    }
  });

  it('keeps a parent’s demand on the parent: its leaves state none and no date moves', async () => {
    const { source, graph, runner, projectId, demands, declare } = await seeded();
    try {
      const { ram } = await declare();
      const before = await graph.workItems.tree(projectId);
      await runner.run(projectId, F, [
        { kind: 'setDemand', workItemId: '080', resourceId: ram, units: 2 },
      ]);
      expect(await demands()).toEqual([{ workItemId: '080', resourceId: ram, units: 2 }]);
      const after = await graph.workItems.tree(projectId);
      if (before === null || after === null || 'kind' in before || 'kind' in after)
        throw new Error('the plan read was unavailable');
      expect(after.slices).toEqual(before.slices);
      expect(after.workItems.map(({ id, dates }) => ({ id, dates }))).toEqual(
        before.workItems.map(({ id, dates }) => ({ id, dates })),
      );
    } finally {
      await source.close();
    }
  });

  it('constrains nothing without a stated capacity: a demanding leaf is still claimed', async () => {
    const { source, runner, projectId, declare } = await seeded();
    try {
      const { ram } = await declare();
      expect(
        await runner.run(projectId, F, [
          { kind: 'setDemand', workItemId: '090', resourceId: ram, units: 4 },
          { kind: 'claimWorkItem', workItemId: '090', personId: 'claire' },
        ]),
      ).toMatchObject({ ok: true, results: [{ index: 0 }, { index: 1, alreadyHeld: false }] });
    } finally {
      await source.close();
    }
  });

  it('goes with its work item', async () => {
    const { source, runner, projectId, demands, declare } = await seeded();
    try {
      const { ram, stage } = await declare();
      await runner.run(projectId, F, [
        { kind: 'setDemand', workItemId: '080.25', resourceId: ram, units: 4 },
        { kind: 'setDemand', workItemId: '090', resourceId: stage, units: 1 },
        { kind: 'deleteWorkItem', workItemId: '080.25' },
      ]);
      expect(await demands()).toEqual([{ workItemId: '090', resourceId: stage, units: 1 }]);
    } finally {
      await source.close();
    }
  });

  it('holds every stored demand at 1 unit or more, exactly 1 on an exclusive resource, after any sequence', async () => {
    const write = fc.record({
      workItemId: fc.constantFrom('080', '080.25', '080.26', '090'),
      resource: fc.constantFrom('ram' as const, 'stage' as const),
      units: fc.oneof(fc.integer({ min: -2, max: 6 }), fc.constant(null), fc.constant(1.5)),
    });
    await fc.assert(
      fc.asyncProperty(fc.array(write, { minLength: 1, maxLength: 12 }), async (writes) => {
        const { source, runner, projectId, demands, declare } = await seeded();
        try {
          const ids = await declare();
          for (const each of writes) {
            let command: PlanCommand;
            try {
              command = normalizeCommand('setDemand', {
                kind: 'setDemand',
                workItemId: each.workItemId,
                resourceId: ids[each.resource],
                units: each.units,
              });
            } catch (refused) {
              if (refused instanceof CommandNormalizationError) continue;
              throw refused;
            }
            await runner.run(projectId, F, [command]);
            for (const held of await demands()) {
              expect(Number.isSafeInteger(held.units)).toBe(true);
              expect(held.units).toBeGreaterThanOrEqual(1);
              if (held.resourceId === ids.stage) expect(held.units).toBe(1);
            }
          }
        } finally {
          await source.close();
        }
      }),
      { numRuns: 40 },
    );
  });
});
