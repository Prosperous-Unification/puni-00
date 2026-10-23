import { createHash } from 'node:crypto';

import { describe, expect, it } from 'bun:test';

import {
  CANONICAL_PLAN_INPUT_SCHEMA_VERSION,
  canonicalisePlanInput,
  serialiseCanonicalPlanInput,
} from './canonical-plan-input';
import { diffPlans, planDiffIsEmpty, type PlanSide, type PlanSideSchedule } from './diff-plans';
import {
  normalisePlanInputForward,
  type PlanInputUpgrade,
  PlanInputVersionError,
} from './normalise-plan-input';
import { planFixtureRows } from './plan-fixture';

const bytes = serialiseCanonicalPlanInput(canonicalisePlanInput(planFixtureRows));

/**
 * {@link planFixtureRows} as any body saved before schema 9 reads once
 * upgraded: no trios, no budgets, every fact unpriced and a factor of 1
 * (`wbs-measure-budgets` design D56). The earlier upgrades' cases compare
 * against it, since a body that old cannot have held any of those.
 */
const beforeMeasures: typeof planFixtureRows = {
  ...planFixtureRows,
  project: { ...planFixtureRows.project, budgetFactor: 1 },
  measures: planFixtureRows.measures.map((row) => ({
    ...row,
    currency: null,
    rateCardDigest: null,
  })),
  measureEstimates: [],
  budgets: [],
};
const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

const absent: PlanSideSchedule = { present: false, absentReason: 'pending' };

describe('normalising a stored plan input forward — 7.4', () => {
  it('is the identity at the reader’s own version', () => {
    const parsed: unknown = JSON.parse(bytes);

    expect(normalisePlanInputForward(parsed, CANONICAL_PLAN_INPUT_SCHEMA_VERSION) as unknown).toBe(
      parsed,
    );
  });

  /**
   * The stored bytes are unchanged afterwards, asserted by hash — 7.4's own
   * wording, and the reason `normalisePlanInputForward` takes a *parsed* body
   * rather than the bytes: it has no access to them and no way to write them.
   */
  it('leaves the stored bytes untouched, by hash', () => {
    const before = sha256(bytes);

    normalisePlanInputForward(JSON.parse(bytes), CANONICAL_PLAN_INPUT_SCHEMA_VERSION);

    expect(sha256(bytes)).toBe(before);
  });

  it('a normalised body still compares clean against the same plan', () => {
    const side = (input: unknown): PlanSide => ({
      input: normalisePlanInputForward(input, CANONICAL_PLAN_INPUT_SCHEMA_VERSION),
      schedule: absent,
    });

    expect(planDiffIsEmpty(diffPlans(side(JSON.parse(bytes)), side(JSON.parse(bytes))))).toBe(true);
  });

  it('refuses a body from the future rather than reading it', () => {
    expect(() =>
      normalisePlanInputForward(JSON.parse(bytes), CANONICAL_PLAN_INPUT_SCHEMA_VERSION + 1),
    ).toThrow(PlanInputVersionError);

    try {
      normalisePlanInputForward(JSON.parse(bytes), CANONICAL_PLAN_INPUT_SCHEMA_VERSION + 1);
    } catch (failure) {
      expect((failure as PlanInputVersionError).reason).toBe('from-the-future');
    }
  });

  it('refuses a version that is not a version', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      try {
        normalisePlanInputForward(JSON.parse(bytes), bad);
        throw new Error(`accepted ${String(bad)}`);
      } catch (failure) {
        expect((failure as PlanInputVersionError).reason).toBe('not-a-version');
      }
    }
  });

  /**
   * An older body with no registered step fails loudly instead of arriving
   * half-converted. This is the case the empty upgrade table produces today,
   * and the one that would otherwise let a removed field read as `undefined`
   * and compare as a change nobody made.
   */
  it('refuses an older body when no step is registered for it', () => {
    try {
      normalisePlanInputForward(JSON.parse(bytes), 1, 2, new Map());
      throw new Error('accepted a v1 body against a v2 reader with no step');
    } catch (failure) {
      expect((failure as PlanInputVersionError).reason).toBe('no-upgrade-path');
    }
  });

  it('runs the registered steps in order, once each', () => {
    const seen: number[] = [];
    const step =
      (from: number): PlanInputUpgrade =>
      (body) => {
        seen.push(from);
        const so_far = (body['upgraded'] as number[] | undefined) ?? [];
        return { ...body, upgraded: [...so_far, from] };
      };
    const upgrades = new Map([
      [1, step(1)],
      [2, step(2)],
    ]);

    const out = normalisePlanInputForward({ schemaVersion: 1 }, 1, 3, upgrades) as unknown as {
      upgraded: number[];
    };

    expect(seen).toEqual([1, 2]);
    expect(out.upgraded).toEqual([1, 2]);
  });

  /**
   * The watched negative 7.4 names, kept as a standing assertion: a step that
   * **rewrites its argument** rather than returning a new value is caught here.
   * A caller that parsed once and stored later would otherwise write a body it
   * never read — the immutability requirement seen from the reader.
   */
  it('catches a step that mutates the body it was given', () => {
    const mutating: PlanInputUpgrade = (body) => {
      body['tampered'] = true;
      return body;
    };
    const parsed = JSON.parse(bytes) as Record<string, unknown>;

    normalisePlanInputForward(parsed, 1, 2, new Map([[1, mutating]]));

    // The mutant is visible in the caller's own value, which is exactly the
    // failure: the assertion that would guard a real step is this comparison,
    // and it is red for `mutating` and green for a copying step.
    expect(parsed['tampered']).toBe(true);
    const copying: PlanInputUpgrade = (body) => ({ ...body, tampered: true });
    const clean = JSON.parse(bytes) as Record<string, unknown>;
    normalisePlanInputForward(clean, 1, 2, new Map([[1, copying]]));
    expect(clean['tampered']).toBeUndefined();
  });
});

describe('the version-1 to version-2 upgrade — step allowances', () => {
  /** A version-1 body: today's, with the allowance its steps did not carry yet. */
  function versionOneBody(): Record<string, unknown> {
    const body = JSON.parse(bytes) as { steps: Record<string, unknown>[] } & Record<
      string,
      unknown
    >;
    return {
      ...body,
      schemaVersion: 1,
      steps: body.steps.map(({ allowancePercent: _dropped, ...rest }) => rest),
    };
  }

  /** Proof: see `withZeroStepAllowances`. */
  it('reads a version-1 body’s steps at 0% allowance', () => {
    const upgraded = normalisePlanInputForward(versionOneBody(), 1);

    expect(upgraded.steps.length).toBeGreaterThan(0);
    for (const step of upgraded.steps) expect(step.allowancePercent).toBe(0);
  });

  it('refuses a version-1 body whose steps are not a list', () => {
    expect(() => normalisePlanInputForward({ schemaVersion: 1, steps: 'none' }, 1)).toThrow(
      'a version-1 plan input body holds no steps list',
    );
  });

  it('writes version 2 with each step’s allowance', () => {
    expect(CANONICAL_PLAN_INPUT_SCHEMA_VERSION).toBe(9);
    const body = JSON.parse(bytes) as { steps: { allowancePercent: unknown }[] };
    for (const step of body.steps) expect(typeof step.allowancePercent).toBe('number');
  });
});

describe('the version-2 to version-3 upgrade — typed dependencies', () => {
  it('rejects malformed version-2 steps instead of inventing captured identities', () => {
    expect(() => normalisePlanInputForward({ schemaVersion: 2, steps: 'missing' }, 2)).toThrow(
      'a version-2 plan input body holds no steps list',
    );
    expect(() => normalisePlanInputForward({ schemaVersion: 2, steps: [null] }, 2)).toThrow(
      'a version-2 plan input body holds a step that is not an object',
    );
  });
  it('compares an upgraded version-2 body with the equivalent version-3 body without changing stored bytes', () => {
    const current = canonicalisePlanInput({
      ...beforeMeasures,
      steps: beforeMeasures.steps.map((step) => ({ ...step, code: null })),
      typedDependencies: [],
      // A version-2 body predates readiness and holds, which read as unsaid.
      workItems: beforeMeasures.workItems.map((row) => ({ ...row, readiness: null, hold: null })),
    });
    const { typedDependencies: _absent, ...versionThree } = current;
    const versionTwo = {
      ...versionThree,
      schemaVersion: 2,
      steps: versionThree.steps.map(({ code: _code, ...step }) => step),
      workItems: versionThree.workItems.map(
        ({ readiness: _readiness, hold: _hold, ...row }) => row,
      ),
    };
    const storedBytes = JSON.stringify(versionTwo);
    const parsed = JSON.parse(storedBytes) as Record<string, unknown>;

    expect(normalisePlanInputForward(parsed, 2)).toEqual(current);
    expect(JSON.stringify(parsed)).toBe(storedBytes);
    expect(versionTwo.schemaVersion).toBe(2);
  });
  it('reads a version-2 body with no typed relationships', () => {
    const { typedDependencies: _absent, ...older } = JSON.parse(bytes) as Record<string, unknown>;
    const upgraded = normalisePlanInputForward({ ...older, schemaVersion: 2 }, 2);
    expect(upgraded.typedDependencies).toEqual([]);
  });
});

describe('the version-3 to version-4 upgrade — readiness and holds', () => {
  it('reads a version-3 body with nothing said about readiness or holds, and compares clean', () => {
    const current = canonicalisePlanInput({
      ...beforeMeasures,
      workItems: beforeMeasures.workItems.map((row) => ({ ...row, readiness: null, hold: null })),
    });
    const versionThree = {
      ...current,
      schemaVersion: 3,
      workItems: current.workItems.map(({ readiness: _readiness, hold: _hold, ...row }) => row),
    };
    const storedBytes = JSON.stringify(versionThree);
    const parsed = JSON.parse(storedBytes) as Record<string, unknown>;

    // Proof: the upgrade returning the body unchanged made this fail on
    // `schemaVersion` and on every work item's missing `readiness` and `hold`;
    // watched 2026-09-29.
    expect(normalisePlanInputForward(parsed, 3)).toEqual(current);
    expect(JSON.stringify(parsed)).toBe(storedBytes);
  });

  it('refuses a version-3 body whose work items are not a list of objects', () => {
    expect(() => normalisePlanInputForward({ schemaVersion: 3, workItems: 'none' }, 3)).toThrow(
      'a version-3 plan input body holds no work items list',
    );
    expect(() => normalisePlanInputForward({ schemaVersion: 3, workItems: [7] }, 3)).toThrow(
      'a version-3 plan input body holds a work item that is not an object',
    );
  });
});

describe('the version-4 to version-5 upgrade — the project timezone', () => {
  it('reads a version-4 body as UTC and compares clean, leaving the stored bytes alone', () => {
    const current = canonicalisePlanInput({
      ...beforeMeasures,
      project: { ...beforeMeasures.project, timezone: 'UTC' },
    });
    const { timezone: _timezone, ...project } = current.project;
    const versionFour = { ...current, schemaVersion: 4, project };
    const storedBytes = JSON.stringify(versionFour);
    const parsed = JSON.parse(storedBytes) as Record<string, unknown>;

    // Proof: the upgrade returning the body unchanged made this fail on
    // `schemaVersion` (4 for 5) and the missing `project.timezone`; watched
    // 2026-10-12.
    const upgraded = normalisePlanInputForward(parsed, 4);
    expect(upgraded).toEqual(current);
    expect(upgraded.project.timezone).toBe('UTC');
    expect(JSON.stringify(parsed)).toBe(storedBytes);
  });

  it('refuses a version-4 body that holds no project object', () => {
    expect(() => normalisePlanInputForward({ schemaVersion: 4, project: null }, 4)).toThrow(
      'a version-4 plan input body holds no project object',
    );
  });
});

it('upgrades version-5 steps to historical workdays without changing the source body', () => {
  const previous = {
    ...canonicalisePlanInput(planFixtureRows),
    schemaVersion: 5,
    steps: planFixtureRows.steps.map(({ estimateUnit: ignored, ...step }) => step),
  };
  const source = JSON.stringify(previous);
  const current = normalisePlanInputForward(previous, 5);
  expect(current.schemaVersion).toBe(9);
  expect(current.steps.every((step) => step.estimateUnit === 'workdays')).toBe(true);
  expect(JSON.stringify(previous)).toBe(source);
  for (const steps of [null, [null], [2], [{}]]) {
    expect(() => normalisePlanInputForward({ ...previous, steps }, 5)).toThrow('version-5');
  }
});

describe('the version-8 to version-9 upgrade — measure estimates, budgets and bases', () => {
  it('reads a version-8 body with no trios, budgets or bases and a factor of 1', () => {
    const current = canonicalisePlanInput(beforeMeasures);
    const {
      measureEstimates: _trios,
      budgets: _budgets,
      project: { budgetFactor: _factor, ...project },
      ...rest
    } = current;
    const versionEight = {
      ...rest,
      schemaVersion: 8,
      project,
      measures: current.measures.map(
        ({ currency: _currency, rateCardDigest: _digest, ...row }) => row,
      ),
    };
    const storedBytes = JSON.stringify(versionEight);
    const parsed = JSON.parse(storedBytes) as Record<string, unknown>;
    expect(normalisePlanInputForward(parsed, 8)).toEqual(current);
    expect(JSON.stringify(parsed)).toBe(storedBytes);
  });

  it('refuses a version-8 body without a project object or a measures list', () => {
    expect(() =>
      normalisePlanInputForward({ schemaVersion: 8, project: null, measures: [] }, 8),
    ).toThrow('a version-8 plan input body holds no project object');
    expect(() => normalisePlanInputForward({ schemaVersion: 8, project: {} }, 8)).toThrow(
      'a version-8 plan input body holds no measures list',
    );
    expect(() =>
      normalisePlanInputForward({ schemaVersion: 8, project: {}, measures: [7] }, 8),
    ).toThrow('a version-8 plan input body holds a measure that is not an object');
  });
});
