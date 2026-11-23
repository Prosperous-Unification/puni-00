import { expect, it } from 'bun:test';

import { DEFAULT_PERT_WEIGHTS } from '../estimate';
import { settingCatalogue } from './catalogue';

it('declares precisely the five scoped settings and their storage families', () => {
  expect(Object.keys(settingCatalogue).sort()).toEqual([
    'allowedWorkItemTypes',
    'budgetFactor',
    'calendarMarkers',
    'pertWeights',
    'timezone',
  ]);
  for (const key of ['timezone', 'pertWeights', 'allowedWorkItemTypes', 'budgetFactor'] as const) {
    expect(settingCatalogue[key].definedAt).toBe('project');
    expect(settingCatalogue[key].resolution).toBe('nearest');
    expect(settingCatalogue[key].storage).toBe('setting_value');
  }
  expect(settingCatalogue.calendarMarkers.definedAt).toBe('project');
  expect(settingCatalogue.calendarMarkers.resolution).toBe('additive');
  expect(settingCatalogue.calendarMarkers.storage).toBe('calendar_marker');
  expect([...settingCatalogue.timezone.overridableAt]).toEqual([
    'organization',
    'space',
    'work_package',
  ]);
  expect([...settingCatalogue.calendarMarkers.overridableAt]).toEqual([
    'organization',
    'space',
    'work_package',
  ]);
  expect([...settingCatalogue.allowedWorkItemTypes.overridableAt]).toEqual([
    'organization',
    'space',
  ]);
  expect([...settingCatalogue.pertWeights.overridableAt]).toEqual(['work_package']);
  expect([...settingCatalogue.budgetFactor.overridableAt]).toEqual([]);
});

it.each([
  ['UTC', true],
  ['Europe/Kyiv', true],
  ['Kyiv', false],
  ['', false],
  [null, false],
])('validates timezone %j without inventing aliases', (value, accepted) => {
  expect(settingCatalogue.timezone.value.allows(value)).toBe(accepted);
});

it.each([
  [{ optimistic: 2, realistic: 3, pessimistic: 0 }, true],
  [{ optimistic: 0, realistic: 0, pessimistic: 1 }, true],
  [{ optimistic: 0, realistic: 0, pessimistic: 0 }, false],
  [{ optimistic: -1, realistic: 4, pessimistic: 1 }, false],
  [{ optimistic: Infinity, realistic: 4, pessimistic: 1 }, false],
  [{ optimistic: Number.MAX_VALUE, realistic: Number.MAX_VALUE, pessimistic: 1 }, false],
])('preserves the existing PERT coefficient meaning for %j', (value, accepted) => {
  expect(settingCatalogue.pertWeights.value.allows(value)).toBe(accepted);
});

it.each([
  ['zero', 0, false],
  ['negative', -1, false],
  ['positive fraction', 0.001, true],
  ['upper bound', 1000, true],
  ['above upper bound', 1000.001, false],
  ['Infinity', Infinity, false],
  ['NaN', NaN, false],
  ['numeric string', '1', false],
])('validates budget factor at %s', (_label, value, accepted) => {
  expect(settingCatalogue.budgetFactor.value.allows(value)).toBe(accepted);
});

it.each([
  [[], true],
  [['type-a', 'type-b'], true],
  [['type-a', 'type-a'], false],
  [[''], false],
  [null, false],
])('validates a distinct directory type set %j', (value, accepted) => {
  expect(settingCatalogue.allowedWorkItemTypes.value.allows(value)).toBe(accepted);
});

it('returns detached defaults captured independently of the legacy mutable coefficient object', () => {
  const original = { ...DEFAULT_PERT_WEIGHTS };
  try {
    DEFAULT_PERT_WEIGHTS.optimistic = 99;
    const first = settingCatalogue.pertWeights.defaultValue;
    expect(first).toEqual({ optimistic: 1, realistic: 4, pessimistic: 1 });
    first.optimistic = 88;
    expect(settingCatalogue.pertWeights.defaultValue).toEqual({
      optimistic: 1,
      realistic: 4,
      pessimistic: 1,
    });
    settingCatalogue.allowedWorkItemTypes.defaultValue.push('caller');
    expect(settingCatalogue.allowedWorkItemTypes.defaultValue).toEqual([]);
    expect(settingCatalogue.timezone.defaultValue).toBe('UTC');
    expect(settingCatalogue.budgetFactor.defaultValue).toBe(1);
    expect(settingCatalogue.calendarMarkers.defaultValue).toEqual([]);
  } finally {
    Object.assign(DEFAULT_PERT_WEIGHTS, original);
  }
});
