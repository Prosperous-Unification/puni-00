import { type } from 'arktype';

import type { ScopeChain } from '../access-role';
import { DEFAULT_PERT_WEIGHTS, PertWeights } from '../estimate';
import { isHexTriple } from '../marker-color';
import { isMarkerName } from '../marker-name';
import { isIsoDate, isTimezone } from '../workday';

export type SettingLevel = ScopeChain['level'];

/** One existing entity in the captured settings chain; entity admission belongs to its reader. */
export interface SettingScope {
  readonly level: SettingLevel;
  readonly id: string;
}

const pointMarker = type({
  '+': 'reject',
  id: 'string > 0',
  date: type('string').narrow(isIsoDate),
  name: type('string').narrow(isMarkerName),
  color: type('string').narrow(isHexTriple).or('null'),
  createdAt: type('number.integer').narrow(Number.isSafeInteger),
});

/** An owner-neutral stored point; its scope is captured beside it, never inferred from live state. */
export type SettingMarker = typeof pointMarker.infer;

function allowLevels(...levels: SettingLevel[]): ReadonlySet<SettingLevel> {
  return new Set(levels);
}

const pertDefault = { ...DEFAULT_PERT_WEIGHTS };

/**
 * The closed setting vocabulary, write levels and storage/resolution policy (E18/E43).
 * Project is each key's defined level, in addition to its overridable levels.
 * Null is a later clear-write operation, never a stored value. Mutable defaults
 * are returned detached; PERT defaults retain the coefficients captured at load.
 */
export const settingCatalogue = {
  timezone: {
    definedAt: 'project',
    overridableAt: allowLevels('organization', 'space', 'work_package'),
    resolution: 'nearest',
    storage: 'setting_value',
    value: type('string').narrow(isTimezone),
    defaultValue: 'UTC',
  },
  pertWeights: {
    definedAt: 'project',
    overridableAt: allowLevels('work_package'),
    resolution: 'nearest',
    storage: 'setting_value',
    value: PertWeights.onDeepUndeclaredKey('reject'),
    get defaultValue(): PertWeights {
      return { ...pertDefault };
    },
  },
  allowedWorkItemTypes: {
    definedAt: 'project',
    overridableAt: allowLevels('organization', 'space'),
    resolution: 'nearest',
    storage: 'setting_value',
    value: type('string > 0')
      .array()
      .narrow(
        (ids, context) =>
          new Set(ids).size === ids.length || context.mustBe('distinct directory type IDs'),
      ),
    get defaultValue(): string[] {
      return [];
    },
  },
  budgetFactor: {
    definedAt: 'project',
    overridableAt: allowLevels(),
    resolution: 'nearest',
    storage: 'setting_value',
    value: type('number > 0').and('number <= 1000'),
    defaultValue: 1,
  },
  calendarMarkers: {
    definedAt: 'project',
    overridableAt: allowLevels('organization', 'space', 'work_package'),
    resolution: 'additive',
    storage: 'calendar_marker',
    value: pointMarker.array(),
    point: pointMarker,
    get defaultValue(): SettingMarker[] {
      return [];
    },
  },
} as const;

export type SettingKey = keyof typeof settingCatalogue;
export type NearestSettingKey = Exclude<SettingKey, 'calendarMarkers'>;
