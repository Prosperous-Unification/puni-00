import { createHash } from 'node:crypto';

import { describe, expect, it } from 'bun:test';

import { canonicalisePlanInput, serialiseCanonicalPlanInput } from './canonical-plan-input';
import { diffPlans } from './diff-plans';
import { normalisePlanInputForward } from './normalise-plan-input';
import { planFixtureRows } from './plan-fixture';

const fact = { workItemId: 'w2', stepId: 's1', blockedAt: -3 };
const input = () => canonicalisePlanInput({ ...planFixtureRows, stepBlockages: [fact] });

describe('saved direct step blockage', () => {
  it('captures sorted direct facts and changes saved bytes', () => {
    const facts = [fact, { ...fact, stepId: 's2', blockedAt: 12 }];
    const capture = canonicalisePlanInput({ ...planFixtureRows, stepBlockages: facts });
    const hash = (body: unknown) => createHash('sha256').update(JSON.stringify(body)).digest('hex');
    expect(hash(capture)).not.toBe(
      hash(canonicalisePlanInput({ ...planFixtureRows, stepBlockages: [] })),
    );
    expect(capture.schemaVersion).toBe(8);
    expect(capture.stepBlockages).toEqual(facts);
    expect(
      canonicalisePlanInput({ ...planFixtureRows, stepBlockages: [...facts].reverse() }),
    ).toEqual(capture);
    expect(serialiseCanonicalPlanInput(capture)).not.toBe(
      serialiseCanonicalPlanInput(canonicalisePlanInput({ ...planFixtureRows, stepBlockages: [] })),
    );
  });

  it('retains direct facts on done nodes without deriving proxy facts', () => {
    const captured = canonicalisePlanInput({
      ...planFixtureRows,
      stepBlockages: [fact],
      stepValues: planFixtureRows.stepValues.map((row) => ({ ...row, progress: 'done' as const })),
    });
    expect(captured.stepBlockages).toEqual([fact]);
  });

  it('upgrades schema6 without mutating stored facts or bytes', () => {
    const { stepBlockages: omitted, ...legacy } = input();
    expect(omitted).toEqual([fact]);
    const body = { ...legacy, schemaVersion: 6 };
    const bytes = JSON.stringify(body);
    expect(normalisePlanInputForward(body, 6).stepBlockages).toEqual([]);
    expect(JSON.stringify(body)).toBe(bytes);
  });

  it('compares additions, removals and time changes by owner and step', () => {
    const side = (stepBlockages: readonly (typeof fact)[]) => ({
      input: canonicalisePlanInput({ ...planFixtureRows, stepBlockages }),
      schedule: { present: false as const, absentReason: 'pending' },
    });
    expect(diffPlans(side([]), side([fact])).input).toEqual([
      { category: 'progress', path: 'stepBlockages[w2:s1]', left: undefined, right: fact },
    ]);
    expect(diffPlans(side([fact]), side([])).input[0]?.path).toBe('stepBlockages[w2:s1]');
    expect(diffPlans(side([fact]), side([{ ...fact, blockedAt: 4 }])).input).toEqual([
      { category: 'progress', path: 'stepBlockages[w2:s1].blockedAt', left: -3, right: 4 },
    ]);
  });

  for (const [name, facts] of [
    ['missing', undefined],
    ['malformed', {}],
    ['null fact', [null]],
    ['duplicate', [fact, fact]],
    ['unknown owner', [{ ...fact, workItemId: 'absent' }]],
    ['parent owner', [{ ...fact, workItemId: 'w1' }]],
    ['unknown step', [{ ...fact, stepId: 'absent' }]],
    ['fractional time', [{ ...fact, blockedAt: 1.5 }]],
    ['unsafe time', [{ ...fact, blockedAt: Number.MAX_SAFE_INTEGER + 1 }]],
    ['missing time', [{ workItemId: 'w2', stepId: 's1' }]],
  ] as const) {
    it(`refuses ${name} current facts on capture`, () => {
      const body = { ...planFixtureRows, stepBlockages: facts };
      expect(() => canonicalisePlanInput(body as never)).toThrow('step blockage');
    });
    it(`refuses ${name} current facts on stored read`, () => {
      const body = { ...planFixtureRows, stepBlockages: facts, schemaVersion: 7 };
      expect(() => normalisePlanInputForward(body, 7)).toThrow('step blockage');
    });
  }
});

for (const [name, change] of [
  ['owner list', { workItems: null }],
  ['step list', { steps: null }],
  ['owner row', { workItems: [null] }],
  ['step row', { steps: [null] }],
] as const) {
  it(`refuses malformed ${name} while checking stored direct facts`, () => {
    expect(() =>
      normalisePlanInputForward(
        { ...planFixtureRows, schemaVersion: 7, stepBlockages: [fact], ...change },
        7,
      ),
    ).toThrow('step blockage');
  });
}
