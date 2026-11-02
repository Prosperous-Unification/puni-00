import { expect, test } from 'bun:test';

import { parseAnalyticsRegionResponse } from './analytics-region';

const database = { month: '2026-11', refreshDue: '2026-12-01', updateDue: false };

test('regional response accepts only categories and maintenance metadata', () => {
  for (const region of ['consent-required', 'elsewhere', 'unknown'] as const)
    expect(parseAnalyticsRegionResponse({ region, database })).toEqual({ region, database });
  expect(parseAnalyticsRegionResponse({ region: 'unknown', database: null })).toEqual({
    region: 'unknown',
    database: null,
  });
});

test('malformed or identifying regional responses cannot grant permission', () => {
  for (const value of [
    null,
    [],
    {},
    { region: 'US', database },
    { region: 'elsewhere', database: null },
    { region: 'elsewhere', database, country: 'US' },
    { region: 'elsewhere', database: { ...database, ip: '8.8.8.8' } },
    { region: 'elsewhere', database: { ...database, month: '2026-13' } },
    { region: 'elsewhere', database: { ...database, refreshDue: '2026-12-32' } },
    { region: 'elsewhere', database: { ...database, refreshDue: '2026-11-01' } },
    { region: 'elsewhere', database: { ...database, updateDue: 'false' } },
  ])
    expect(() => parseAnalyticsRegionResponse(value)).toThrow('Invalid analytics region');
});
