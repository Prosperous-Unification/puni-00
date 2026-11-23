import { describe, expect, it, vi } from 'vitest';

import { EstimateUnitConflict, refusingApi } from './refusing-api';

const step = {
  id: 'dev',
  name: 'Development',
  estimateUnit: 'workdays' as const,
  allowancePercent: 0,
};

describe('retained package step-value facade boundary', () => {
  it('retains exact allowance precision and the existing step response projection', async () => {
    const setStepAllowance = vi.fn(
      (_workPackageId: string, _stepId: string, allowancePercent: number) =>
        Promise.resolve({ ...step, allowancePercent }),
    );
    const api = refusingApi({ setStepAllowance });
    await expect(api.setStepAllowance('package-a', 'dev', 12.34)).resolves.toEqual({
      ...step,
      allowancePercent: 12.34,
    });
    expect(setStepAllowance).toHaveBeenCalledExactlyOnceWith('package-a', 'dev', 12.34);
  });
  for (const percent of [-1, 1000.01, 12.345, NaN]) {
    it(
      'refuses invalid allowance ' + String(percent) + ' before the stated answer mutates',
      async () => {
        const setStepAllowance = vi.fn(() => Promise.resolve(step));
        const api = refusingApi({ setStepAllowance });
        await expect(api.setStepAllowance('package-a', 'dev', percent)).rejects.toThrow(
          'invalid_allowance',
        );
        expect(setStepAllowance).not.toHaveBeenCalled();
      },
    );
  }
  it('refuses a foreign estimate unit before the stated answer mutates', async () => {
    const setStepUnit = vi.fn(() => Promise.resolve(step));
    const api = refusingApi({ setStepUnit });
    await expect(api.setStepUnit('package-a', 'dev', 'hours' as never)).rejects.toThrow(
      'fake_invalid_request',
    );
    expect(setStepUnit).not.toHaveBeenCalled();
  });
  it('refuses an absent facade unit even though the HTTP patch has optional fields', async () => {
    const setStepUnit = vi.fn(() => Promise.resolve(step));
    const api = refusingApi({ setStepUnit });
    await expect(api.setStepUnit('package-a', 'dev', undefined as never)).rejects.toThrow(
      'fake_invalid_request',
    );
    expect(setStepUnit).not.toHaveBeenCalled();
  });
  it('preserves the current unit answer and the modeled estimate-count conflict', async () => {
    const setStepUnit = vi.fn(() => Promise.resolve({ ...step, estimateUnit: 'minutes' as const }));
    await expect(
      refusingApi({ setStepUnit }).setStepUnit('package-a', 'dev', 'minutes'),
    ).resolves.toEqual({ ...step, estimateUnit: 'minutes' });
    expect(setStepUnit).toHaveBeenCalledExactlyOnceWith('package-a', 'dev', 'minutes');
    const refused = refusingApi({ setStepUnit: () => Promise.reject(new EstimateUnitConflict(3)) });
    await expect(refused.setStepUnit('package-a', 'dev', 'minutes')).rejects.toThrow(
      'estimates_present',
    );
  });
  it('refuses malformed stated values before a screen reads them', async () => {
    const api = refusingApi({
      setStepAllowance: () => Promise.resolve({ ...step, allowancePercent: '12.34' } as never),
    });
    await expect(api.setStepAllowance('package-a', 'dev', 12.34)).rejects.toThrow(
      'fake_invalid_response',
    );
  });
});

it('refuses a malformed estimate-count refusal at the current boundary', async () => {
  const api = refusingApi({
    setStepUnit: () => Promise.reject(new EstimateUnitConflict('three' as never)),
  });
  await expect(api.setStepUnit('package-a', 'dev', 'minutes')).rejects.toThrow(
    'fake_invalid_response',
  );
});

for (const percent of [0, 1000]) {
  it('preserves exact valid allowance limit ' + String(percent), async () => {
    const setStepAllowance = vi.fn(
      (_packageId: string, _stepId: string, allowancePercent: number) =>
        Promise.resolve({ ...step, allowancePercent }),
    );
    const api = refusingApi({ setStepAllowance });
    await expect(api.setStepAllowance('package-a', 'dev', percent)).resolves.toEqual({
      ...step,
      allowancePercent: percent,
    });
    expect(setStepAllowance).toHaveBeenCalledExactlyOnceWith('package-a', 'dev', percent);
  });
}
