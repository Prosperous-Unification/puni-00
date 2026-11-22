import { describe, expect, it } from 'bun:test';

import {
  type ClaimTarget,
  type MeasurementRow,
  readMeasurement,
} from './shared-occupancy-measurement';

const targets: ClaimTarget[] = Array.from({ length: 200 }, (_, index) => ({
  workPackageId: 'P1',
  workItemId: `L${String(index)}`,
  personId: `A${String(index)}`,
  steps: ['dev', 'qa'],
}));

function samples(stated = 40, unstated = 40): MeasurementRow[] {
  return targets.flatMap((target, index): MeasurementRow[] => {
    const pair = index + 1;
    const arms = pair % 2 === 1 ? (['D', 'U'] as const) : (['U', 'D'] as const);
    return arms.map((arm, order) => ({
      phase: 'measured',
      pair,
      order: order + 1,
      arm,
      target,
      durationMs: index < 198 ? (arm === 'D' ? stated : unstated) : index + 100,
      claim: {
        alreadyHeld: false,
        ids: [`c${String(index)}-dev`, `c${String(index)}-qa`],
        rows: target.steps.map((stepId) => ({
          id: `c${String(index)}-${stepId}`,
          stepId,
          workItemId: target.workItemId,
          personId: target.personId,
          resourceId: 'RAM',
          units: 1,
        })),
      },
    }));
  });
}

describe('paired occupancy measurement receipts', () => {
  it('reads the third-largest sample and a negative delta without rounding', () => {
    expect(readMeasurement(samples(39.995, 40), targets, 'RAM')).toMatchObject({
      statedMs: { p50: 39.995, p99: 39.995 },
      unstatedMs: { p50: 40, p99: 40 },
      passes: true,
    });
  });

  it('fails when only the 5 ms limit is exceeded', () => {
    expect(readMeasurement(samples(46, 40), targets, 'RAM')).toMatchObject({
      withinMilliseconds: false,
      withinPercent: true,
      passes: false,
    });
  });

  it('fails when only the 25 percent limit is exceeded', () => {
    expect(readMeasurement(samples(10.1, 8), targets, 'RAM')).toMatchObject({
      withinMilliseconds: true,
      withinPercent: false,
      passes: false,
    });
  });

  it.each([
    [45, 40],
    [10, 8],
    [25, 20],
  ])('passes at an exact limit (%s and %s ms)', (stated, unstated) => {
    expect(readMeasurement(samples(stated, unstated), targets, 'RAM').passes).toBe(true);
  });

  it('refuses a claim on the wrong leaf', () => {
    const rows = samples();
    const [first] = rows;
    first.claim.rows[0].workItemId = 'wrong-leaf';
    expect(() => readMeasurement(rows, targets, 'RAM')).toThrow('committed rows');
  });

  it('refuses a repeated no-op claim', () => {
    const rows = samples();
    rows[0].claim.alreadyHeld = true;
    expect(() => readMeasurement(rows, targets, 'RAM')).toThrow('no-op');
  });

  it('refuses an incomplete arm', () => {
    expect(() => readMeasurement(samples().slice(0, -1), targets, 'RAM')).toThrow('400');
  });

  it('refuses swapped order even with complete arms', () => {
    const rows = samples();
    [rows[0], rows[1]] = [rows[1], rows[0]];
    expect(() => readMeasurement(rows, targets, 'RAM')).toThrow('pair/order');
  });

  it.each([0, -1, Infinity, NaN])('refuses invalid duration %s', (durationMs) => {
    const rows = samples();
    rows[0].durationMs = durationMs;
    expect(() => readMeasurement(rows, targets, 'RAM')).toThrow('duration');
  });
});
