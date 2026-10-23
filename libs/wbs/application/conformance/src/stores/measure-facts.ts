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

/** What both stores throw for a defined key the owning organization does not hold. */
const UNDEFINED_KEY = 'is not defined by the organization owning work item';

const FACT_CASES = ['measures.set:defined-key', 'directory.usageOfMeasure:facts'] as const;

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
  stores: Pick<Stores, 'directory' | 'measures'>,
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
  ];
}
