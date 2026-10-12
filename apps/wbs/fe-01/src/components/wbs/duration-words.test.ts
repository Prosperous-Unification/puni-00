import { expect, it } from 'vitest';

import { minuteCharge, showDuration } from './duration-words';

it('reads native minute charges and workday figures with their units', () => {
  expect(showDuration({ unit: 'minutes', minutes: 40 })).toBe('40 min');
  expect(showDuration({ unit: 'minutes', minutes: 135 })).toBe('2 h 15 min');
  expect(showDuration({ unit: 'minutes', minutes: 120 })).toBe('2 h');
  expect(showDuration({ unit: 'minutes', minutes: 0 })).toBe('0 min');
  expect(showDuration({ unit: 'workdays', days: 1 })).toBe('1 d');
  expect(showDuration({ unit: 'workdays', days: 1.5 })).toBe('1.5 d');
});

it('refuses missing or mismatched native minute charges instead of reconstructing from days', () => {
  expect(() => minuteCharge({ finalDays: { dev: 1 / 12 } }, 'dev')).toThrow(
    'Missing native minute charge for dev',
  );
  expect(() =>
    minuteCharge({ finalDays: { dev: 1 }, charged: { dev: { unit: 'workdays', days: 1 } } }, 'dev'),
  ).toThrow('Missing native minute charge for dev');
  expect(minuteCharge({ finalDays: {}, charged: {} }, 'dev')).toBeUndefined();
  expect(
    minuteCharge(
      { finalDays: { dev: 1 / 12 }, charged: { dev: { unit: 'minutes', minutes: 40 } } },
      'dev',
    ),
  ).toEqual({ unit: 'minutes', minutes: 40 });
});

it('uses eight-hour workdays for native minute charges from one day onward', () => {
  expect(showDuration({ unit: 'minutes', minutes: 480 })).toBe('1 d');
  expect(showDuration({ unit: 'minutes', minutes: 720 })).toBe('1.5 d');
  expect(showDuration({ unit: 'minutes', minutes: 1200 })).toBe('2.5 d');
});
