import { createHash } from 'node:crypto';

import { describe, expect, it } from 'bun:test';

import { canonicalisePlanInput, serialiseCanonicalPlanInput } from './canonical-plan-input';
import { diffPlans } from './diff-plans';
import { normalisePlanInputForward } from './normalise-plan-input';
import { planFixtureRows } from './plan-fixture';
import { readSavedPlanInput, upgradeLocalPlanInputV9 } from './versioned-plan-input';

const fact = { workItemId: 'w2', stepId: 's1', maxParallel: 1 };
const rows = (stepParallels: readonly (typeof fact)[]) => ({ ...planFixtureRows, stepParallels });
const capture = () => canonicalisePlanInput(rows([fact]));

describe('saved sparse step parallelism', () => {
  it('captures ordered detached explicit facts including equality and sibling absence', () => {
    const supplied = [{ ...fact, stepId: 's2', maxParallel: 3 }, { ...fact }];
    const captured = canonicalisePlanInput(rows(supplied));
    expect(captured.schemaVersion).toBe(9);
    expect(captured.stepParallels).toEqual([fact, { ...fact, stepId: 's2', maxParallel: 3 }]);
    expect(captured).toEqual(canonicalisePlanInput(rows([...supplied].reverse())));
    supplied[1].maxParallel = 9;
    expect(captured.stepParallels[0]).toEqual(fact);
    expect(capture().stepParallels).toEqual([fact]);
    const changed = canonicalisePlanInput({
      ...rows([fact]),
      workItems: planFixtureRows.workItems.map((row) => ({ ...row, maxParallel: 4 })),
    });
    expect(changed.stepParallels).toEqual([fact]);
    const hash = (body: string) => createHash('sha256').update(body).digest('hex');
    expect(hash(serialiseCanonicalPlanInput(capture()))).not.toBe(
      hash(serialiseCanonicalPlanInput(canonicalisePlanInput(rows([])))),
    );
  });

  it('validates and captures the same maximum from a changing accessor', () => {
    let reads = 0;
    const supplied = {
      ...fact,
      get maxParallel() {
        reads += 1;
        return reads === 1 ? 2 : 1001;
      },
    };
    expect(canonicalisePlanInput(rows([supplied])).stepParallels).toEqual([
      { ...fact, maxParallel: 2 },
    ]);
    expect(reads).toBe(1);
  });

  it('upgrades schema7 to absent overrides without changing historical bytes', () => {
    const { stepParallels: ignored, ...earlier } = capture();
    expect(ignored).toEqual([fact]);
    const legacy = { ...earlier, schemaVersion: 7 };
    const bytes = JSON.stringify(legacy);
    const upgraded = normalisePlanInputForward(legacy, 7);
    expect(upgraded.schemaVersion).toBe(9);
    expect(upgraded.stepParallels).toEqual([]);
    expect(JSON.stringify(legacy)).toBe(bytes);
  });

  it('compares additions removals and maximum changes by structured pair', () => {
    const side = (facts: readonly (typeof fact)[]) => ({
      input: canonicalisePlanInput(rows(facts)),
      schedule: { present: false as const, absentReason: 'pending' },
    });
    expect(diffPlans(side([]), side([fact])).input).toEqual([
      { category: 'capacity', path: 'stepParallels[w2:s1]', left: undefined, right: fact },
    ]);
    expect(diffPlans(side([fact]), side([])).input).toEqual([
      { category: 'capacity', path: 'stepParallels[w2:s1]', left: fact, right: undefined },
    ]);
    expect(diffPlans(side([fact]), side([{ ...fact, maxParallel: 2 }])).input).toEqual([
      { category: 'capacity', path: 'stepParallels[w2:s1].maxParallel', left: 1, right: 2 },
    ]);
  });

  it('compares distinct tuples containing colons without losing an override', () => {
    const facts = [
      { workItemId: 'a', stepId: 'b:c', maxParallel: 1 },
      { workItemId: 'a:b', stepId: 'c', maxParallel: 2 },
      { workItemId: 'a', stepId: 'b%3Ac', maxParallel: 3 },
    ];
    const source = {
      ...planFixtureRows,
      workItems: [
        { ...planFixtureRows.workItems[0], id: 'a', parentId: null },
        { ...planFixtureRows.workItems[0], id: 'a:b', parentId: null },
      ],
      steps: ['b:c', 'c', 'b%3Ac'].map((id) => ({ ...planFixtureRows.steps[0], id })),
      stepParallels: facts,
    };
    const side = (stepParallels: typeof facts) => ({
      input: canonicalisePlanInput({ ...source, stepParallels }),
      schedule: { present: false as const, absentReason: 'pending' },
    });
    for (const [at, key, maximum] of [
      [0, 'a:b%3Ac', 1],
      [1, 'a%3Ab:c', 2],
      [2, 'a:b%253Ac', 3],
    ] as const) {
      expect(
        diffPlans(
          side(facts),
          side(facts.map((fact, index) => (index === at ? { ...fact, maxParallel: 4 } : fact))),
        ).input,
      ).toEqual([
        {
          category: 'capacity',
          path: `stepParallels[${key}].maxParallel`,
          left: maximum,
          right: 4,
        },
      ]);
    }
  });

  for (const [name, facts] of [
    ['missing', undefined],
    ['malformed', {}],
    ['null fact', [null]],
    ['duplicate', [fact, fact]],
    ['unknown owner', [{ ...fact, workItemId: 'absent' }]],
    ['parent owner', [{ ...fact, workItemId: 'w1' }]],
    ['unknown step', [{ ...fact, stepId: 'absent' }]],
    ['string maximum', [{ ...fact, maxParallel: '1' }]],
    ['fractional maximum', [{ ...fact, maxParallel: 1.5 }]],
    ['zero maximum', [{ ...fact, maxParallel: 0 }]],
    ['oversized maximum', [{ ...fact, maxParallel: 1001 }]],
    ['missing maximum', [{ workItemId: 'w2', stepId: 's1' }]],
  ] as const) {
    it(`refuses ${name} parallel facts at capture`, () => {
      expect(() =>
        canonicalisePlanInput({ ...planFixtureRows, stepParallels: facts } as never),
      ).toThrow(
        ['null fact', 'missing maximum', 'string maximum'].includes(name)
          ? 'step parallelism fact is malformed'
          : 'step parallelism',
      );
    });
    it(`refuses ${name} parallel facts at stored read`, () => {
      expect(() =>
        normalisePlanInputForward(
          { ...planFixtureRows, schemaVersion: 8, stepParallels: facts },
          8,
        ),
      ).toThrow(
        ['null fact', 'missing maximum', 'string maximum'].includes(name)
          ? 'step parallelism fact is malformed'
          : 'step parallelism',
      );
    });
  }

  for (const [name, change] of [
    ['owner list', { workItems: null }],
    ['step list', { steps: null }],
    ['owner row', { workItems: [null] }],
    ['step row', { steps: [null] }],
  ] as const) {
    it(`refuses malformed ${name} while validating stored parallel facts`, () => {
      expect(() =>
        normalisePlanInputForward(
          { ...planFixtureRows, schemaVersion: 8, stepParallels: [fact], ...change },
          8,
        ),
      ).toThrow('step parallelism');
    });
  }
});

describe('explicit immutable sparse upgrade family', () => {
  it('advances7→8→9→10 only in memory and refuses legacy smuggling', () => {
    const current = capture();
    const body = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
    body['schemaVersion'] = 7;
    Reflect.deleteProperty(body, 'stepParallels');
    Reflect.deleteProperty(body, 'measureEstimates');
    Reflect.deleteProperty(body, 'budgets');
    Reflect.deleteProperty(body['project'] as object, 'budgetFactor');
    body['measures'] = (body['measures'] as Record<string, unknown>[]).map(
      ({ currency: _currency, rateCardDigest: _rateCardDigest, ...measure }) => measure,
    );
    const bytes = JSON.stringify(body);
    const eight = normalisePlanInputForward(body, 7, 8);
    expect(eight.schemaVersion).toBe(8);
    expect(eight.stepParallels).toEqual([]);
    const nine = normalisePlanInputForward(eight, 8);
    expect(nine.schemaVersion).toBe(9);
    expect(nine.stepParallels).toEqual([]);
    const ten = readSavedPlanInput(
      upgradeLocalPlanInputV9(nine as unknown as Record<string, unknown>),
      10,
    );
    expect(ten.schemaVersion).toBe(10);
    expect(ten.stepParallels).toEqual([]);
    expect(JSON.stringify(body)).toBe(bytes);
    for (const version of [1, 2, 3, 4, 5, 6, 7])
      expect(() =>
        normalisePlanInputForward(
          { ...body, schemaVersion: version, stepParallels: [fact] },
          version,
        ),
      ).toThrow('legacy plan input cannot carry step parallelism');
  });
  it('propagates unexpected sparse getter failures through the frozen reader', () => {
    const failure = new Error('unexpected sparse getter');
    const body = {
      ...capture(),
      stepParallels: [
        {
          ...fact,
          get maxParallel() {
            throw failure;
          },
        },
      ],
    };
    let thrown: unknown;
    try {
      readSavedPlanInput(body, 9);
    } catch (cause) {
      thrown = cause;
    }
    expect(thrown).toBe(failure);
  });
});
