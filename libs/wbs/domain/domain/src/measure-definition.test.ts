import { describe, expect, it } from 'bun:test';

import {
  decideMeasureCreate,
  decideMeasurePatch,
  isCurrencyCode,
  isMeasureKey,
  isSeededMeasureKey,
  type MeasureDefinition,
  type MeasureDefinitionFields,
  nextMeasureOrder,
  refuseMeasureRemoval,
  SEEDED_MEASURE_DEFINITIONS,
} from './measure-definition';

/** The five seeded definitions as one organization holds them. */
const SEEDED: readonly MeasureDefinition[] = SEEDED_MEASURE_DEFINITIONS.map((fields) => ({
  id: `m-${fields.key}`,
  ...fields,
}));

function held(key: string): MeasureDefinition {
  const found = SEEDED.find((each) => each.key === key);
  if (found === undefined) throw new Error(`no seeded ${key}`);
  return found;
}

const GPU_MINUTES: MeasureDefinitionFields = {
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

describe('the seeded definitions', () => {
  it('seeds time, tokens, hours, cost and agent minutes in that order, time alone scheduling', () => {
    expect(SEEDED_MEASURE_DEFINITIONS.map(({ key, order }) => [key, order])).toEqual([
      ['time', 1],
      ['tokens', 2],
      ['hours', 3],
      ['cost', 4],
      ['agent_minutes', 5],
    ]);
    expect(
      SEEDED_MEASURE_DEFINITIONS.filter((each) => each.schedulesWork).map(
        ({ key, kind, showByDefault }) => ({ key, kind, showByDefault }),
      ),
    ).toEqual([{ key: 'time', kind: 'duration', showByDefault: true }]);
    expect(held('tokens')).toMatchObject({ kind: 'count', scale: 'integer', threePoint: true });
    expect(held('hours')).toMatchObject({ kind: 'duration', scale: 'real', threePoint: false });
    expect(held('cost')).toMatchObject({ kind: 'money', scale: 'integer', currency: 'USD' });
    expect(held('agent_minutes')).toMatchObject({
      kind: 'duration',
      scale: 'integer',
      derived: true,
      threePoint: false,
    });
    for (const each of SEEDED_MEASURE_DEFINITIONS) {
      expect(isMeasureKey(each.key)).toBe(true);
      expect(isSeededMeasureKey(each.key)).toBe(true);
      expect(decideMeasureCreate([], each)).toBeNull();
    }
    expect(isSeededMeasureKey('gpu_minutes')).toBe(false);
  });
});

describe('isMeasureKey and isCurrencyCode', () => {
  it('admits a lowercase slug of at most 40 characters and an ISO-shaped currency', () => {
    for (const key of ['time', 'gpu_minutes', 'a', 'k8s_pods', 'x'.repeat(40)])
      expect(isMeasureKey(key)).toBe(true);
    for (const key of ['', 'Time', '9lives', '_x', 'gpu-minutes', 'gpu minutes', 'x'.repeat(41), 3])
      expect(isMeasureKey(key)).toBe(false);
    expect(isCurrencyCode('EUR')).toBe(true);
    for (const code of ['eur', 'EURO', 'E1R', '', null]) expect(isCurrencyCode(code)).toBe(false);
  });
});

describe('decideMeasureCreate', () => {
  it('accepts a new key after the seeded five', () => {
    expect(decideMeasureCreate(SEEDED, GPU_MINUTES)).toBeNull();
    expect(nextMeasureOrder(SEEDED)).toBe(6);
    expect(nextMeasureOrder([])).toBe(1);
  });

  // Proof: with the key comparison removed from decideMeasureCreate, this case
  // answered null for a second `tokens`; watched 2026-10-23.
  it('refuses a key the organization already holds', () => {
    expect(decideMeasureCreate(SEEDED, { ...GPU_MINUTES, key: 'tokens' })).toBe(
      'measure_key_taken',
    );
  });

  // Proof: with the scheduling test removed from decideMeasureCreate, this case
  // answered null while time holds the flag; watched 2026-10-23.
  it('refuses a second scheduling measure', () => {
    expect(decideMeasureCreate(SEEDED, { ...GPU_MINUTES, schedulesWork: true })).toBe(
      'second_scheduling_measure',
    );
    expect(decideMeasureCreate([], { ...GPU_MINUTES, schedulesWork: true })).toBeNull();
  });

  // Proof: with either currency rule removed, its half of this case answered
  // null; watched 2026-10-23.
  it('requires a currency on money and refuses one elsewhere', () => {
    const fee = { ...GPU_MINUTES, key: 'fee', kind: 'money' as const };
    expect(decideMeasureCreate(SEEDED, fee)).toBe('currency_required');
    expect(decideMeasureCreate(SEEDED, { ...fee, currency: 'EUR' })).toBeNull();
    expect(decideMeasureCreate(SEEDED, { ...GPU_MINUTES, currency: 'EUR' })).toBe(
      'currency_forbidden',
    );
  });
});

describe('decideMeasurePatch', () => {
  it('renames, relabels, reorders and shows a measure by default', () => {
    expect(
      decideMeasurePatch(SEEDED, held('tokens'), {
        name: 'LLM tokens',
        unit: 'tok',
        order: 9,
        showByDefault: true,
        threePoint: false,
        key: 'tokens',
      }),
    ).toEqual({
      ok: true,
      next: {
        ...held('tokens'),
        name: 'LLM tokens',
        unit: 'tok',
        order: 9,
        showByDefault: true,
        threePoint: false,
      },
    });
  });

  // Proof: with the key comparison removed from decideMeasurePatch, the
  // renaming patch answered ok with key `llm_tokens`; watched 2026-10-23.
  it('refuses a patch that changes the key', () => {
    expect(decideMeasurePatch(SEEDED, held('tokens'), { key: 'llm_tokens' })).toEqual({
      ok: false,
      reason: 'measure_key_immutable',
    });
  });

  // Proof: with the kind and scale comparison removed, both patches answered
  // ok; watched 2026-10-23.
  it('refuses a patch that changes the kind or the scale', () => {
    expect(decideMeasurePatch(SEEDED, held('tokens'), { kind: 'money' })).toEqual({
      ok: false,
      reason: 'measure_shape_immutable',
    });
    expect(decideMeasurePatch(SEEDED, held('tokens'), { scale: 'real' })).toEqual({
      ok: false,
      reason: 'measure_shape_immutable',
    });
    expect(decideMeasurePatch(SEEDED, held('tokens'), { scale: 'integer' })).toMatchObject({
      ok: true,
    });
  });

  // Proof: with the other-holder test removed from decideMeasurePatch, the
  // tokens patch answered ok while time holds the flag; with the fixed-flag
  // test removed, time's clearing patch answered ok; watched 2026-10-23.
  it('refuses a second scheduling measure and keeps time scheduling', () => {
    expect(decideMeasurePatch(SEEDED, held('tokens'), { schedulesWork: true })).toEqual({
      ok: false,
      reason: 'second_scheduling_measure',
    });
    expect(decideMeasurePatch(SEEDED, held('time'), { schedulesWork: false })).toEqual({
      ok: false,
      reason: 'scheduling_measure_fixed',
    });
    expect(decideMeasurePatch(SEEDED, held('time'), { schedulesWork: true })).toMatchObject({
      ok: true,
    });
  });

  it('keeps a money measure priced and refuses a currency elsewhere', () => {
    expect(decideMeasurePatch(SEEDED, held('cost'), { currency: null })).toEqual({
      ok: false,
      reason: 'currency_required',
    });
    expect(decideMeasurePatch(SEEDED, held('cost'), { currency: 'EUR' })).toMatchObject({
      ok: true,
      next: { currency: 'EUR' },
    });
    expect(decideMeasurePatch(SEEDED, held('hours'), { currency: 'EUR' })).toEqual({
      ok: false,
      reason: 'currency_forbidden',
    });
  });
});

describe('refuseMeasureRemoval', () => {
  // Proof: with the seeded test removed from refuseMeasureRemoval, removing
  // `tokens` answered null; with the reference count ignored, the referenced
  // `gpu_minutes` answered null; watched 2026-10-23.
  it('refuses removing a seeded definition, or one anything references', () => {
    expect(refuseMeasureRemoval(held('tokens'), { references: 0 })).toBe('measure_in_use');
    const gpu = { id: 'm-gpu', ...GPU_MINUTES };
    expect(refuseMeasureRemoval(gpu, { references: 0 })).toBeNull();
    expect(refuseMeasureRemoval(gpu, { references: 3 })).toBe('measure_in_use');
  });
});
