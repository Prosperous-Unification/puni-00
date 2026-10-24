import type { DirectoryStore } from '@wbs/core';
import { type MeasureDefinition, SEEDED_MEASURE_DEFINITIONS } from '@wbs/domain';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { type OpenCase, storeCase } from './store-case';

/**
 * The two organizations every source holds for the measure definition cases
 * (`wbs-measure-budgets` D1): `legacy` marked legacy, `other` not, each with
 * the five seeded definitions its creation wrote.
 */
export const CONFORMANCE_MEASURE_ORGANIZATIONS = {
  legacy: 'org-measure-legacy',
  other: 'org-measure-other',
} as const;

/** Whether a case needs {@link CONFORMANCE_MEASURE_ORGANIZATIONS} before it opens. */
export function isMeasureDefinitionCase(caseId: string): boolean {
  return /^directory\.[a-zA-Z]+Measures?:/.test(caseId);
}

const { legacy: A, other: B } = CONFORMANCE_MEASURE_ORGANIZATIONS;

const GPU: MeasureDefinition = {
  id: 'measure-gpu',
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

/** The organization's definition keyed `key`, refusing a store that lost it. */
async function heldIn(port: DirectoryStore, organizationId: string, key: string) {
  const found = (await port.listMeasures(organizationId)).find((each) => each.key === key);
  if (found === undefined) throw new Error(`${organizationId} holds no ${key}`);
  return found;
}

/** The shared measure definition cases of the `directory` family. */
export function directoryMeasureRegistrations(
  open: OpenCase<'directory'>,
): readonly CaseRegistration[] {
  return [
    storeCase(
      'directory',
      'directory.listMeasures:seeded-per-organization',
      open,
      async ({ port }) => {
        expect(await port.legacyOrganizationId()).toBe(A);
        const listedA = await port.listMeasures(A);
        const listedB = await port.listMeasures(B);
        for (const listed of [listedA, listedB]) {
          expect(listed.map(({ id: _id, ...fields }) => fields)).toEqual([
            ...SEEDED_MEASURE_DEFINITIONS,
          ]);
          expect(new Set(listed.map(({ id }) => id)).size).toBe(5);
        }
        const idsOfB = new Set(listedB.map(({ id }) => id));
        expect(listedA.filter(({ id }) => idsOfB.has(id))).toEqual([]);
        expect(await port.listMeasures('org-nowhere')).toEqual([]);
      },
    ),
    storeCase('directory', 'directory.addMeasure:index-backstop', open, async ({ port, seed }) => {
      expect(await port.addMeasure(A, GPU, seed.stamps[0])).toEqual({ ok: true, measure: GPU });
      expect(await port.addMeasure(A, { ...GPU, id: 'measure-gpu-again' }, seed.stamps[0])).toEqual(
        { ok: false, reason: 'measure_key_taken' },
      );
      expect(
        await port.addMeasure(
          A,
          { ...GPU, id: 'measure-scheduling', key: 'gpu_hours', schedulesWork: true },
          seed.stamps[0],
        ),
      ).toEqual({ ok: false, reason: 'second_scheduling_measure' });
      // Keys are per organization: B takes the same key under its own id.
      const inB = { ...GPU, id: 'measure-gpu-b' };
      expect(await port.addMeasure(B, inB, seed.stamps[0])).toEqual({ ok: true, measure: inB });
      expect((await port.listMeasures(A)).map(({ key }) => key)).toEqual([
        ...SEEDED_MEASURE_DEFINITIONS.map(({ key }) => key),
        'gpu_minutes',
      ]);
      expect((await port.listMeasures(B)).length).toBe(6);
    }),
    storeCase(
      'directory',
      'directory.patchMeasure:scoped-key-frozen',
      open,
      async ({ port, seed }) => {
        const tokens = await heldIn(port, A, 'tokens');
        const renamed = { ...tokens, key: 'llm_tokens', name: 'LLM tokens', order: 9 };
        expect(await port.patchMeasure(A, renamed, seed.stamps[1])).toEqual({
          ok: true,
          measure: { ...tokens, name: 'LLM tokens', order: 9 },
        });
        expect(await heldIn(port, A, 'tokens')).toMatchObject({ name: 'LLM tokens', order: 9 });
        expect(
          await port.patchMeasure(A, { ...tokens, schedulesWork: true }, seed.stamps[1]),
        ).toEqual({ ok: false, reason: 'second_scheduling_measure' });
        const foreign = await heldIn(port, B, 'tokens');
        expect(await port.patchMeasure(A, { ...foreign, name: 'Stolen' }, seed.stamps[1])).toEqual({
          ok: false,
          reason: 'not_found',
        });
        expect((await heldIn(port, B, 'tokens')).name).toBe('Tokens');
      },
    ),
    storeCase('directory', 'directory.patchMeasure:shape-frozen', open, async ({ port, seed }) => {
      const tokens = await heldIn(port, A, 'tokens');
      for (const changed of [
        { ...tokens, kind: 'money' as const, currency: 'USD' },
        { ...tokens, scale: 'real' as const },
        { ...tokens, derived: true },
      ])
        expect(
          await port.patchMeasure(A, changed, seed.stamps[1]).then(
            () => 'written',
            (err: unknown) => (err instanceof Error ? err.message : 'not an Error'),
          ),
        ).toBe('measure key, organization, kind, scale and derived are immutable');
      expect(await heldIn(port, A, 'tokens')).toEqual(tokens);
    }),
    storeCase('directory', 'directory.removeMeasure:scoped', open, async ({ port, seed }) => {
      const inB = { ...GPU, id: 'measure-gpu-b' };
      expect((await port.addMeasure(A, GPU, seed.stamps[0])).ok).toBe(true);
      expect((await port.addMeasure(B, inB, seed.stamps[0])).ok).toBe(true);
      expect(await port.usageOfMeasure(A, GPU.id)).toEqual({ references: 0 });
      expect(await port.removeMeasure(A, inB.id, seed.stamps[1])).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(await port.removeMeasure(A, GPU.id, seed.stamps[1])).toEqual({ ok: true });
      expect(await port.removeMeasure(A, GPU.id, seed.stamps[1])).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect((await port.listMeasures(A)).length).toBe(5);
      expect((await port.listMeasures(B)).map(({ id }) => id)).toContain(inB.id);
    }),
  ];
}
