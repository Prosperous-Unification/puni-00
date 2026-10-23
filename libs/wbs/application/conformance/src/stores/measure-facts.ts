import type { Stores } from '@wbs/core';
import type { MeasureDefinition } from '@wbs/domain';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import type { SeededPlan } from '../source-declaration';
import { CONFORMANCE_MEASURE_ORGANIZATIONS } from './measure-definitions';
import { type OpenCase, storeCase } from './store-case';

const { legacy: A, other: B } = CONFORMANCE_MEASURE_ORGANIZATIONS;

/** `gpu_minutes`, defined by both organizations under their own ids for the fact cases. */
const GPU: MeasureDefinition = {
  id: 'measure-facts-gpu',
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
};
const GPU_IN_B: MeasureDefinition = { ...GPU, id: 'measure-facts-gpu-b' };

/** A trio both estimate seeds write. */
const THREE_POINTS = { optimistic: 10, realistic: 20, pessimistic: 30 } as const;

/** What both stores throw for a defined key the owning organization does not hold. */
const UNDEFINED_KEY = 'is not defined by the organization owning work item';

const FACT_CASES = [
  'measures.set:defined-key',
  'directory.usageOfMeasure:facts',
  // The measure estimate cases (`wbs-measure-budgets` task 2.1) share the seed.
  'measures.set:legacy-estimate-replaces-trio',
  'measureEstimates.set:defined-key',
  'measureEstimates.set:three-point-clears-flag',
  'measureEstimates.moveAll:every-key',
  'directory.usageOfMeasure:estimates',
] as const;

/**
 * Whether a case needs the measure fact seed (`wbs-measure-budgets` task 1.3):
 * both {@link CONFORMANCE_MEASURE_ORGANIZATIONS}, the seed's first project
 * owned by the legacy one, and {@link seedMeasureFactCase}. The adapter maps
 * the project in its own way (SQLite's `project_organization`, memory's map).
 */
export function isMeasureFactCase(caseId: string): boolean {
  return (FACT_CASES as readonly string[]).includes(caseId);
}

/**
 * Defines `gpu_minutes` in both organizations and, for the usage case, writes
 * a `gpu_minutes` and a `token_actual` fact on the first project's first work
 * item. Runs after the adapter created the organizations and mapped the
 * project.
 *
 * @throws when a store refuses the seed.
 */
export async function seedMeasureFactCase(
  stores: Pick<Stores, 'directory' | 'measures' | 'measureEstimates'>,
  caseId: string,
  seed: SeededPlan,
): Promise<void> {
  for (const [organizationId, definition] of [
    [A, GPU],
    [B, GPU_IN_B],
  ] as const) {
    const added = await stores.directory.addMeasure(organizationId, definition, seed.stamps[0]);
    if (!added.ok) throw new Error(`gpu_minutes was refused in ${organizationId}: ${added.reason}`);
  }
  const node = { workItemId: seed.workItemIds[0][0], stepId: seed.stepIds[0][0] };
  if (caseId === 'directory.usageOfMeasure:estimates')
    await stores.measureEstimates.set(
      { ...node, key: 'gpu_minutes', ...THREE_POINTS, singlePoint: false },
      seed.stamps[0],
    );
  if (caseId === 'measures.set:legacy-estimate-replaces-trio')
    await stores.measureEstimates.set(
      { ...node, key: 'tokens', ...THREE_POINTS, singlePoint: false },
      seed.stamps[0],
    );
  if (caseId !== 'directory.usageOfMeasure:facts') return;
  const fact = {
    workItemId: seed.workItemIds[0][0],
    stepId: seed.stepIds[0][0],
    recordedAt: 1,
  };
  await stores.measures.set({ ...fact, metric: 'gpu_minutes', value: 3 }, seed.stamps[0]);
  await stores.measures.set({ ...fact, metric: 'token_actual', value: 5 }, seed.stamps[0]);
}

/** The measure-family fact case: a defined key stored, read, replaced and removed. */
export function measureFactRegistrations(open: OpenCase<'measures'>): readonly CaseRegistration[] {
  return [
    // `tokens` and `token_actual` (and `hours`/`hours_actual`) name one row
    // in every store method (design D18), whoever owns the project.
    storeCase('measures', 'measures.set:alias-one-row', open, async ({ port, seed }) => {
      const [projectId] = seed.projectIds;
      const workItemId = seed.workItemIds[0][0];
      const stepId = seed.stepIds[0][0];
      const fact = { workItemId, stepId, recordedAt: 1 };
      await port.set({ ...fact, metric: 'tokens', value: 3 }, seed.stamps[0]);
      await port.set({ ...fact, metric: 'token_actual', value: 4 }, seed.stamps[0]);
      await port.set({ ...fact, metric: 'hours_actual', value: 1.5 }, seed.stamps[0]);
      await port.set({ ...fact, metric: 'hours', value: 2.5 }, seed.stamps[0]);
      expect(await port.listByProject(projectId)).toEqual([
        { ...fact, metric: 'hours_actual', value: 2.5 },
        { ...fact, metric: 'token_actual', value: 4 },
      ]);
      await port.remove(workItemId, stepId, 'tokens', seed.stamps[1]);
      await port.remove(workItemId, stepId, 'hours', seed.stamps[1]);
      expect(await port.listByProject(projectId)).toEqual([]);
    }),
    storeCase('measures', 'measures.set:defined-key', open, async ({ port, seed }) => {
      const [owned, unowned] = seed.projectIds;
      const workItemId = seed.workItemIds[0][0];
      const stepId = seed.stepIds[0][0];
      expect((await port.definitionsFor(owned))?.map(({ key }) => key)).toEqual([
        'time',
        'tokens',
        'hours',
        'cost',
        'agent_minutes',
        'gpu_minutes',
      ]);
      expect(await port.definitionsFor(unowned)).toBeNull();
      await port.set(
        { workItemId, stepId, metric: 'gpu_minutes', value: 3, recordedAt: 1 },
        seed.stamps[0],
      );
      await port.set(
        { workItemId, stepId, metric: 'token_actual', value: 5, recordedAt: 1 },
        seed.stamps[0],
      );
      await port.set(
        { workItemId, stepId, metric: 'gpu_minutes', value: 4, recordedAt: 2 },
        seed.stamps[1],
      );
      const read = [
        { workItemId, stepId, metric: 'gpu_minutes', value: 4, recordedAt: 2 },
        { workItemId, stepId, metric: 'token_actual', value: 5, recordedAt: 1 },
      ];
      expect(await port.listByProject(owned)).toEqual(read);
      expect(await port.listByWorkItems(owned, [workItemId])).toEqual(read);
      // A key the owning organization does not define is a caller fault.
      expect(
        await port
          .set(
            { workItemId, stepId, metric: 'story_points', value: 1, recordedAt: 3 },
            seed.stamps[1],
          )
          .then(
            () => 'written',
            (err: unknown) => (err instanceof Error ? err.message : 'not an Error'),
          ),
      ).toContain(UNDEFINED_KEY);
      // And so is any defined key on a project no organization owns.
      expect(
        await port
          .set(
            {
              workItemId: seed.workItemIds[1][0],
              stepId: seed.stepIds[1][0],
              metric: 'gpu_minutes',
              value: 1,
              recordedAt: 3,
            },
            seed.stamps[1],
          )
          .then(
            () => 'written',
            (err: unknown) => (err instanceof Error ? err.message : 'not an Error'),
          ),
      ).toContain(UNDEFINED_KEY);
      await port.remove(workItemId, stepId, 'story_points', seed.stamps[1]);
      await port.remove(workItemId, stepId, 'gpu_minutes', seed.stamps[1]);
      expect(await port.listByProject(owned)).toEqual([read[1]]);
    }),
    // A legacy token estimate written over a three-point tokens trio replaces
    // it with the single figure, and its removal takes the trio (design D28).
    storeCase(
      'measures',
      'measures.set:legacy-estimate-replaces-trio',
      open,
      async ({ port, seed, readers }) => {
        const [owned] = seed.projectIds;
        const node = { workItemId: seed.workItemIds[0][0], stepId: seed.stepIds[0][0] };
        expect(await readers.measureEstimates.listByProject(owned)).toEqual([
          { ...node, key: 'tokens', ...THREE_POINTS, singlePoint: false },
        ]);
        await port.set(
          { ...node, metric: 'token_estimate', value: 40, recordedAt: 1 },
          seed.stamps[1],
        );
        expect(await readers.measureEstimates.listByProject(owned)).toEqual([
          {
            ...node,
            key: 'tokens',
            optimistic: 40,
            realistic: 40,
            pessimistic: 40,
            singlePoint: true,
          },
        ]);
        await port.remove(node.workItemId, node.stepId, 'token_estimate', seed.stamps[1]);
        expect(await readers.measureEstimates.listByProject(owned)).toEqual([]);
      },
    ),
  ];
}

/** The directory-family fact case: a definition's usage counts its facts, its organization's only. */
export function directoryMeasureFactRegistrations(
  open: OpenCase<'directory'>,
): readonly CaseRegistration[] {
  return [
    storeCase('directory', 'directory.usageOfMeasure:facts', open, async ({ port }) => {
      const idOf = async (organizationId: string, key: string) => {
        const found = (await port.listMeasures(organizationId)).find((each) => each.key === key);
        if (found === undefined) throw new Error(`${organizationId} holds no ${key}`);
        return found.id;
      };
      expect(await port.usageOfMeasure(A, GPU.id)).toEqual({ references: 1 });
      expect(await port.usageOfMeasure(A, await idOf(A, 'tokens'))).toEqual({ references: 1 });
      expect(await port.usageOfMeasure(A, await idOf(A, 'hours'))).toEqual({ references: 0 });
      expect(await port.usageOfMeasure(B, GPU_IN_B.id)).toEqual({ references: 0 });
      expect(await port.usageOfMeasure(B, GPU.id)).toEqual({ references: 0 });
    }),
    // A trio references its definition as a fact does (`wbs-measure-budgets` D1).
    storeCase('directory', 'directory.usageOfMeasure:estimates', open, async ({ port }) => {
      expect(await port.usageOfMeasure(A, GPU.id)).toEqual({ references: 1 });
      expect(await port.usageOfMeasure(B, GPU_IN_B.id)).toEqual({ references: 0 });
      expect(await port.usageOfMeasure(B, GPU.id)).toEqual({ references: 0 });
    }),
  ];
}

/**
 * The measure estimate family (`wbs-measure-budgets` task 2.1): trios keyed by
 * definition, the legacy token estimate as the single-point tokens trio, and
 * the hand-down's move of every key.
 */
export function measureEstimateRegistrations(
  open: OpenCase<'measureEstimates'>,
): readonly CaseRegistration[] {
  return [
    storeCase(
      'measureEstimates',
      'measureEstimates.set:defined-key',
      open,
      async ({ port, seed }) => {
        const [owned, unowned] = seed.projectIds;
        const node = { workItemId: seed.workItemIds[0][0], stepId: seed.stepIds[0][0] };
        const gpu = { ...node, key: 'gpu_minutes', ...THREE_POINTS, singlePoint: false };
        expect(await port.set(gpu, seed.stamps[0])).toBe('written');
        expect(await port.set({ ...gpu, pessimistic: 45 }, seed.stamps[1])).toBe('written');
        expect(await port.listByProject(owned)).toEqual([{ ...gpu, pessimistic: 45 }]);
        const thrown = (estimate: typeof gpu) =>
          port.set(estimate, seed.stamps[1]).then(
            () => 'written',
            (err: unknown) => (err instanceof Error ? err.message : 'not an Error'),
          );
        expect(await thrown({ ...gpu, key: 'story_points' })).toContain(UNDEFINED_KEY);
        const elsewhere = { workItemId: seed.workItemIds[1][0], stepId: seed.stepIds[1][0] };
        // An unowned project estimates tokens alone (design D19).
        expect(await thrown({ ...gpu, ...elsewhere })).toContain(UNDEFINED_KEY);
        const tokens = { ...elsewhere, key: 'tokens', ...THREE_POINTS, singlePoint: false };
        expect(await port.set(tokens, seed.stamps[1])).toBe('written');
        expect(await port.listByProject(unowned)).toEqual([tokens]);
        await port.remove(node.workItemId, node.stepId, 'gpu_minutes', seed.stamps[1]);
        await port.remove(node.workItemId, node.stepId, 'story_points', seed.stamps[1]);
        expect(await port.listByProject(owned)).toEqual([]);
      },
    ),
    storeCase(
      'measureEstimates',
      'measureEstimates.set:three-point-clears-flag',
      open,
      async ({ port, seed, readers }) => {
        const [owned] = seed.projectIds;
        const node = { workItemId: seed.workItemIds[0][0], stepId: seed.stepIds[0][0] };
        const single = {
          ...node,
          key: 'tokens',
          optimistic: 40,
          realistic: 40,
          pessimistic: 40,
          singlePoint: true,
        };
        expect(await port.set(single, seed.stamps[0])).toBe('written');
        expect(await port.listByProject(owned)).toEqual([single]);
        // The single-point trio is the legacy token estimate the old release reads.
        expect(await readers.measures.listByProject(owned)).toEqual([
          { ...node, metric: 'token_estimate', value: 40, recordedAt: seed.stamps[0].at },
        ]);
        const ranged = { ...node, key: 'tokens', ...THREE_POINTS, singlePoint: false };
        expect(await port.set(ranged, seed.stamps[1])).toBe('written');
        expect(await port.listByProject(owned)).toEqual([ranged]);
        expect(await readers.measures.listByProject(owned)).toEqual([]);
        await port.remove(node.workItemId, node.stepId, 'tokens', seed.stamps[1]);
        expect(await port.listByProject(owned)).toEqual([]);
      },
    ),
    storeCase(
      'measureEstimates',
      'measureEstimates.moveAll:every-key',
      open,
      async ({ port, seed }) => {
        const [owned] = seed.projectIds;
        const [from, to] = seed.workItemIds[0];
        const stepId = seed.stepIds[0][0];
        await port.set(
          { workItemId: from, stepId, key: 'gpu_minutes', ...THREE_POINTS, singlePoint: false },
          seed.stamps[0],
        );
        await port.set(
          { workItemId: from, stepId, key: 'tokens', ...THREE_POINTS, singlePoint: false },
          seed.stamps[0],
        );
        await port.moveAll(from, to, seed.stamps[1]);
        expect(await port.listByProject(owned)).toEqual([
          { workItemId: to, stepId, key: 'gpu_minutes', ...THREE_POINTS, singlePoint: false },
          { workItemId: to, stepId, key: 'tokens', ...THREE_POINTS, singlePoint: false },
        ]);
      },
    ),
  ];
}
