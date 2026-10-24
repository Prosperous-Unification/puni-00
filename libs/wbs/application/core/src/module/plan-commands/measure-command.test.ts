import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import type { Scope } from '../../ports/unit-of-work';
import {
  CommandNormalizationError,
  normalizeCommand,
  type PlanCommand,
} from '../../service/command-normalizers';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { localCommandAccess } from '../../testing/organization-access-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { createPlanCommandRunner } from './composition';

const F = 'account-f';
const LEGACY = { kind: 'legacy' } as const;

/** A memory source, its legacy organization `org-legacy` unless `legacy` is false. */
async function seeded(legacy = true) {
  const fixture = openMemorySourceFixture();
  const source = fixture.source;
  if (legacy) fixture.addOrganization('org-legacy', { legacy: true });
  fixture.addOrganization('org-other', { legacy: false });
  const broadcast = recordingBroadcaster();
  const options = {
    dependencyContext: createLocalDependencyContext(source.stores),
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
  const runner = createPlanCommandRunner({
    uow: source.uow,
    commandAccess: localCommandAccess,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(scope.stores, {
        ...options,
        dependencyContext: createLocalDependencyContext(scope.stores),
        broadcast: announcements,
      }),
  });
  const listed = async () => {
    const answer = await graph.directory.measures.listWithin(LEGACY);
    if (!answer.ok) throw new Error(`the list was refused: ${answer.reason}`);
    return answer.value;
  };
  const keys = async () => (await listed()).map(({ key }) => key);
  const idOf = async (key: string) => {
    const found = (await listed()).find((each) => each.key === key);
    if (found === undefined) throw new Error(`no measure ${key}`);
    return found.id;
  };
  const run = (commands: readonly PlanCommand[]) => runner.runDirectory(F, commands);
  return { source, graph, run, listed, keys, idOf };
}

const GPU: PlanCommand = {
  kind: 'createMeasure',
  key: 'gpu_minutes',
  name: ' GPU minutes ',
  unit: 'min',
  measureKind: 'duration',
  scale: 'integer',
  threePoint: true,
};

const SEEDED_KEYS = ['time', 'tokens', 'hours', 'cost', 'agent_minutes'];

describe('the measure definition directory commands', () => {
  it('lists the five seeded definitions of the legacy organization in order', async () => {
    const { source, keys, listed } = await seeded();
    try {
      expect(await keys()).toEqual(SEEDED_KEYS);
      expect((await listed()).filter((each) => each.schedulesWork).map(({ key }) => key)).toEqual([
        'time',
      ]);
    } finally {
      await source.close();
    }
  });

  // Proof: with the memory state's measure copy removed from `replaceWith`,
  // this case read no `gpu_minutes` after its batch committed; watched
  // 2026-10-23.
  it('defines, patches and removes a measure, listing it after the seeded five', async () => {
    const { source, run, keys, listed, idOf } = await seeded();
    try {
      const created = await run([
        { ...GPU, ref: 'gpu' },
        { kind: 'patchMeasure', measureRef: 'gpu', patch: { name: 'GPU time', unit: 'm' } },
      ]);
      expect(created).toMatchObject({
        ok: true,
        undoable: false,
        results: [
          {
            index: 0,
            ref: 'gpu',
            entity: {
              key: 'gpu_minutes',
              name: 'GPU minutes',
              unit: 'min',
              kind: 'duration',
              scale: 'integer',
              threePoint: true,
              showByDefault: false,
              schedulesWork: false,
              derived: false,
              order: 6,
              currency: null,
            },
          },
          { index: 1, entity: { key: 'gpu_minutes', name: 'GPU time', unit: 'm', order: 6 } },
        ],
      });
      expect(await keys()).toEqual([...SEEDED_KEYS, 'gpu_minutes']);
      const gpu = await idOf('gpu_minutes');
      expect(
        await run([{ kind: 'patchMeasure', measureId: gpu, patch: { order: 0 } }]),
      ).toMatchObject({ ok: true });
      expect((await keys())[0]).toBe('gpu_minutes');
      expect(await run([{ kind: 'deleteMeasure', measureId: gpu }])).toMatchObject({ ok: true });
      expect(await keys()).toEqual(SEEDED_KEYS);
      expect((await listed()).length).toBe(5);
    } finally {
      await source.close();
    }
  });

  // Proof: with the create decision skipped in MeasureDefinitions.addWithin
  // and the memory index twin's scheduling test removed, the second scheduling
  // measure stored; either guard alone keeps this case green (two layers);
  // watched 2026-10-23.
  it('refuses a second scheduling measure and a taken key, writing nothing', async () => {
    const { source, run, keys } = await seeded();
    try {
      expect(await run([GPU, { ...GPU, key: 'gpu_hours', schedulesWork: true }])).toEqual({
        ok: false,
        at: 1,
        kind: 'createMeasure',
        reason: 'second_scheduling_measure',
      });
      expect(await run([{ ...GPU, key: 'tokens' }])).toEqual({
        ok: false,
        at: 0,
        kind: 'createMeasure',
        reason: 'measure_key_taken',
      });
      expect(await keys()).toEqual(SEEDED_KEYS);
    } finally {
      await source.close();
    }
  });

  // Proof: with the create decision skipped in MeasureDefinitions.addWithin,
  // the money definition without a currency stored; watched 2026-10-23.
  it('requires a currency on money and refuses one elsewhere', async () => {
    const { source, run, listed } = await seeded();
    try {
      const fee = { ...GPU, key: 'fee', measureKind: 'money', currency: null } as const;
      expect(await run([fee])).toMatchObject({ ok: false, reason: 'currency_required' });
      expect(await run([{ ...GPU, currency: 'EUR' }])).toMatchObject({
        ok: false,
        reason: 'currency_forbidden',
      });
      expect(await run([{ ...GPU, unit: '   ' }])).toMatchObject({
        ok: false,
        at: 0,
        reason: 'unit_required',
      });
      expect(await run([{ ...fee, currency: 'EUR' }])).toMatchObject({
        ok: true,
        results: [{ entity: { key: 'fee', kind: 'money', currency: 'EUR' } }],
      });
      expect((await listed()).length).toBe(6);
    } finally {
      await source.close();
    }
  });

  it('refuses a patch that would move the key, the shape or the scheduling measure', async () => {
    const { source, run, idOf, listed } = await seeded();
    try {
      const before = await listed();
      const tokens = await idOf('tokens');
      const cases: [PlanCommand, string][] = [
        [
          { kind: 'patchMeasure', measureId: tokens, patch: { schedulesWork: true } },
          'second_scheduling_measure',
        ],
        [
          { kind: 'patchMeasure', measureId: tokens, patch: { key: 'llm_tokens' } },
          'measure_key_immutable',
        ],
        [
          { kind: 'patchMeasure', measureId: tokens, patch: { kind: 'money' } },
          'measure_shape_immutable',
        ],
        [
          {
            kind: 'patchMeasure',
            measureId: await idOf('time'),
            patch: { schedulesWork: false },
          },
          'scheduling_measure_fixed',
        ],
        [
          { kind: 'patchMeasure', measureId: await idOf('cost'), patch: { currency: null } },
          'currency_required',
        ],
        [
          { kind: 'patchMeasure', measureId: await idOf('hours'), patch: { currency: 'EUR' } },
          'currency_forbidden',
        ],
        [{ kind: 'patchMeasure', measureId: tokens, patch: { unit: ' ' } }, 'unit_required'],
        [{ kind: 'patchMeasure', measureId: tokens, patch: {} }, 'nothing_to_change'],
        [{ kind: 'patchMeasure', measureId: tokens, patch: { name: '  ' } }, 'name_required'],
        [{ kind: 'patchMeasure', measureId: 'nothing', patch: { name: 'x' } }, 'not_found'],
        [
          { kind: 'patchMeasure', measureId: 'org-other:tokens', patch: { name: 'x' } },
          'not_found',
        ],
      ];
      for (const [command, reason] of cases)
        expect(await run([command]), reason).toMatchObject({ ok: false, at: 0, reason });
      expect(await listed()).toEqual(before);
    } finally {
      await source.close();
    }
  });

  // Proof: with the removal refusal skipped in MeasureDefinitions.removeWithin,
  // this case removed `tokens`; watched 2026-10-23.
  it('refuses removing a seeded definition', async () => {
    const { source, run, idOf, keys } = await seeded();
    try {
      for (const key of SEEDED_KEYS)
        expect(await run([{ kind: 'deleteMeasure', measureId: await idOf(key) }])).toMatchObject({
          ok: false,
          reason: 'measure_in_use',
        });
      expect(await run([{ kind: 'deleteMeasure', measureId: 'nothing' }])).toMatchObject({
        ok: false,
        reason: 'not_found',
      });
      expect(await keys()).toEqual(SEEDED_KEYS);
    } finally {
      await source.close();
    }
  });

  // Proof: with `ownerOf` answering a constant organization instead of the
  // legacy lookup, this case's list was answered instead of refused; watched
  // 2026-10-23.
  it('refuses every read and write under legacy access with no legacy organization', async () => {
    const { source, graph, run } = await seeded(false);
    try {
      expect(await graph.directory.measures.listWithin(LEGACY)).toEqual({
        ok: false,
        reason: 'organization_required',
      });
      for (const command of [
        GPU,
        { kind: 'patchMeasure', measureId: 'org-other:tokens', patch: { name: 'x' } },
        { kind: 'deleteMeasure', measureId: 'org-other:tokens' },
      ] as const satisfies readonly PlanCommand[])
        expect(await run([command])).toMatchObject({
          ok: false,
          at: 0,
          reason: 'organization_required',
        });
    } finally {
      await source.close();
    }
  });
});

describe('the measure command boundary', () => {
  // Proof: with each check of command-fields.ts's measure helpers reduced to
  // its type test, its row here normalized instead of throwing; watched
  // 2026-10-23.
  it('refuses a malformed key, unit, kind, scale, order or currency', () => {
    const create = { ...GPU };
    for (const [patch, reason] of [
      [{ key: 'GPU' }, 'key_must_be_a_measure_key'],
      [{ key: 'gpu-minutes' }, 'key_must_be_a_measure_key'],
      [{ key: 7 }, 'key_must_be_a_measure_key'],
      [{ unit: 'x'.repeat(41) }, 'unit_must_be_at_most_40_characters'],
      [{ unit: 3 }, 'unit_must_be_text'],
      [{ measureKind: 'speed' }, 'measureKind_must_be_duration_count_or_money'],
      [{ scale: 'float' }, 'scale_must_be_integer_or_real'],
      [{ order: -1 }, 'order_must_be_a_whole_number_from_0_to_1000000'],
      [{ order: 1.5 }, 'order_must_be_a_whole_number_from_0_to_1000000'],
      [{ order: 1_000_001 }, 'order_must_be_a_whole_number_from_0_to_1000000'],
      [{ currency: 'usd' }, 'currency_must_be_three_capital_letters'],
      [{ threePoint: 'yes' }, 'threePoint_must_be_true_or_false'],
    ] as const)
      expect(() => normalizeCommand('createMeasure', { ...create, ...patch })).toThrow(
        new CommandNormalizationError(reason),
      );
    expect(() =>
      normalizeCommand('patchMeasure', {
        kind: 'patchMeasure',
        measureId: 'm',
        patch: { measureKind: 'speed' },
      }),
    ).toThrow(new CommandNormalizationError('measureKind_must_be_duration_count_or_money'));
    expect(normalizeCommand('createMeasure', { ...create, unit: ' min ', order: 0 })).toMatchObject(
      { unit: 'min', order: 0 },
    );
  });
});
