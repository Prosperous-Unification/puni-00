import { describe, expect, it } from 'bun:test';

import { isAdmissibleSessionPolicy } from './session-policies';

describe('an admissible session policy', () => {
  it('takes bounds from 300 to 2,592,000 seconds, or none', () => {
    expect(
      isAdmissibleSessionPolicy({ maxSessionSeconds: 28_800, reauthenticateAfterSeconds: 3_600 }),
    ).toBe(true);
    expect(
      isAdmissibleSessionPolicy({ maxSessionSeconds: 300, reauthenticateAfterSeconds: null }),
    ).toBe(true);
    expect(
      isAdmissibleSessionPolicy({ maxSessionSeconds: null, reauthenticateAfterSeconds: 2_592_000 }),
    ).toBe(true);
    expect(
      isAdmissibleSessionPolicy({ maxSessionSeconds: null, reauthenticateAfterSeconds: null }),
    ).toBe(true);
  });

  it('refuses a bound out of range or not an integer', () => {
    for (const value of [299, 2_592_001, 3600.5, Number.NaN])
      expect(
        isAdmissibleSessionPolicy({ maxSessionSeconds: value, reauthenticateAfterSeconds: null }),
      ).toBe(false);
  });

  it('refuses an inverted policy', () => {
    expect(
      isAdmissibleSessionPolicy({ maxSessionSeconds: 3_600, reauthenticateAfterSeconds: 7_200 }),
    ).toBe(false);
  });
});
