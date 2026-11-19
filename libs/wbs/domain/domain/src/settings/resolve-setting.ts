import type { ScopeChain } from '../access-role';
import type { PertWeights } from '../estimate';
import {
  settingCatalogue,
  type SettingKey,
  type SettingMarker,
  type SettingScope,
} from './catalogue';

/** Raw setting_value evidence; key/value are validated once by {@link resolveSetting}. */
export interface CapturedSetting {
  readonly scope: SettingScope;
  readonly key: string;
  readonly value: unknown;
}

/**
 * One chain's coherently captured rows. The source reader establishes entity
 * existence/organization ownership; raw stored values are decoded by the pure resolver.
 */
export interface SettingsSnapshot {
  readonly values: readonly CapturedSetting[];
  readonly markers: readonly { readonly scope: SettingScope; readonly marker: unknown }[];
}

export interface ResolvedSetting<Value> {
  readonly value: Value;
  readonly provenance: SettingScope | { readonly level: 'default' };
}

export interface ResolvedSettingMarker {
  readonly marker: SettingMarker;
  readonly provenance: SettingScope;
}

type ParsedSetting =
  | { readonly key: 'timezone'; readonly scope: SettingScope; readonly value: string }
  | { readonly key: 'pertWeights'; readonly scope: SettingScope; readonly value: PertWeights }
  | { readonly key: 'allowedWorkItemTypes'; readonly scope: SettingScope; readonly value: string[] }
  | { readonly key: 'budgetFactor'; readonly scope: SettingScope; readonly value: number };

type Resolution =
  | ResolvedSetting<string>
  | ResolvedSetting<PertWeights>
  | ResolvedSetting<string[]>
  | ResolvedSetting<number>
  | readonly ResolvedSettingMarker[];

/** Walks precisely to the target's own level, nearest first; a null space adds no frame. */
function readScopes(chain: ScopeChain): readonly SettingScope[] {
  const organization: SettingScope = { level: 'organization', id: chain.organizationId };
  switch (chain.level) {
    case 'organization':
      return [organization];
    case 'space':
      return [{ level: 'space', id: chain.spaceId }, organization];
    case 'project':
      return [
        { level: 'project', id: chain.projectId },
        ...(chain.spaceId === null ? [] : [{ level: 'space' as const, id: chain.spaceId }]),
        organization,
      ];
    case 'work_package':
      return [
        { level: 'work_package', id: chain.workPackageId },
        { level: 'project', id: chain.projectId },
        ...(chain.spaceId === null ? [] : [{ level: 'space' as const, id: chain.spaceId }]),
        organization,
      ];
  }
}

function isSameScope(left: SettingScope, right: SettingScope): boolean {
  return left.level === right.level && left.id === right.id;
}

function assertScope(scopes: readonly SettingScope[], scope: SettingScope, key: string): void {
  if (!scopes.some((candidate) => isSameScope(candidate, scope)))
    throw new Error(
      'stored setting ' +
        key +
        ' has a scope outside its captured chain: ' +
        scope.level +
        '/' +
        scope.id,
    );
}

function readValue<Value>(row: CapturedSetting, parse: (candidate: unknown) => Value): Value {
  try {
    return parse(row.value);
  } catch (cause) {
    throw new Error(
      'invalid stored setting ' + row.key + ' at ' + row.scope.level + '/' + row.scope.id,
      { cause },
    );
  }
}

function readSetting(row: CapturedSetting): ParsedSetting {
  switch (row.key) {
    case 'timezone':
      return {
        key: 'timezone',
        scope: row.scope,
        value: readValue(row, (candidate) => settingCatalogue.timezone.value.assert(candidate)),
      };
    case 'pertWeights':
      return {
        key: 'pertWeights',
        scope: row.scope,
        value: readValue(row, (candidate) => settingCatalogue.pertWeights.value.assert(candidate)),
      };
    case 'allowedWorkItemTypes':
      return {
        key: 'allowedWorkItemTypes',
        scope: row.scope,
        value: readValue(row, (candidate) =>
          settingCatalogue.allowedWorkItemTypes.value.assert(candidate),
        ),
      };
    case 'budgetFactor':
      return {
        key: 'budgetFactor',
        scope: row.scope,
        value: readValue(row, (candidate) => settingCatalogue.budgetFactor.value.assert(candidate)),
      };
    default:
      throw new Error('unknown or additive key in stored setting_value: ' + row.key);
  }
}

function resolveNearest<Value>(
  scopes: readonly SettingScope[],
  rows: readonly { readonly scope: SettingScope; readonly value: Value }[],
  defaultValue: Value,
): ResolvedSetting<Value> {
  for (const scope of scopes) {
    const row = rows.find((candidate) => isSameScope(candidate.scope, scope));
    if (row !== undefined) return { value: structuredClone(row.value), provenance: { ...scope } };
  }
  return { value: structuredClone(defaultValue), provenance: { level: 'default' } };
}

/** Binary UTF-8 ordering matches SQLite TEXT/BINARY even for retained non-ASCII IDs. */
function compareText(left: string, right: string): number {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  for (const [index, byte] of leftBytes.entries()) {
    const other = rightBytes.at(index);
    if (other === undefined) return 1;
    if (byte !== other) return byte < other ? -1 : 1;
  }
  return leftBytes.length < rightBytes.length ? -1 : 0;
}

export function resolveSetting(
  chain: ScopeChain,
  key: 'timezone',
  snapshot: SettingsSnapshot,
): ResolvedSetting<string>;
export function resolveSetting(
  chain: ScopeChain,
  key: 'pertWeights',
  snapshot: SettingsSnapshot,
): ResolvedSetting<PertWeights>;
export function resolveSetting(
  chain: ScopeChain,
  key: 'allowedWorkItemTypes',
  snapshot: SettingsSnapshot,
): ResolvedSetting<string[]>;
export function resolveSetting(
  chain: ScopeChain,
  key: 'budgetFactor',
  snapshot: SettingsSnapshot,
): ResolvedSetting<number>;
export function resolveSetting(
  chain: ScopeChain,
  key: 'calendarMarkers',
  snapshot: SettingsSnapshot,
): readonly ResolvedSettingMarker[];
export function resolveSetting(
  chain: ScopeChain,
  key: SettingKey,
  snapshot: SettingsSnapshot,
): Resolution;
/**
 * Resolves one key from an admitted snapshot, preserving default/level provenance.
 * All supplied rows validate before selection, so a nearer value cannot hide a
 * corrupt ancestor. Calendar points add across levels in date/createdAt/id order;
 * repeated global marker IDs are corruption, never shadowing or deduplication.
 * Inputs/results are detached. This pure function proves no live entity existence.
 * @throws for unknown/additive setting_value keys, malformed values, forbidden or
 * off-chain scopes, duplicate scope/key rows or duplicate marker identities.
 */
export function resolveSetting(
  chain: ScopeChain,
  key: SettingKey,
  snapshot: SettingsSnapshot,
): Resolution {
  const scopes = readScopes(structuredClone(chain));
  const captured = structuredClone(snapshot);
  const seen = new Set<string>();
  const rows = captured.values.map((raw) => {
    assertScope(scopes, raw.scope, raw.key);
    const row = readSetting(raw);
    const definition = settingCatalogue[row.key];
    if (row.scope.level !== definition.definedAt && !definition.overridableAt.has(row.scope.level))
      throw new Error(
        'stored setting ' +
          row.key +
          ' is not overridable at ' +
          row.scope.level +
          '/' +
          row.scope.id,
      );
    const identity = JSON.stringify([row.scope.level, row.scope.id, row.key]);
    if (seen.has(identity)) throw new Error('duplicate stored setting ' + identity);
    seen.add(identity);
    return row;
  });
  const markerIds = new Set<string>();
  const markers: ResolvedSettingMarker[] = captured.markers.map((row) => {
    assertScope(scopes, row.scope, 'calendarMarkers');
    let marker: SettingMarker;
    try {
      marker = settingCatalogue.calendarMarkers.point.assert(row.marker);
    } catch (cause) {
      throw new Error('invalid stored marker at ' + row.scope.level + '/' + row.scope.id, {
        cause,
      });
    }
    if (markerIds.has(marker.id)) throw new Error('duplicate stored marker ' + marker.id);
    markerIds.add(marker.id);
    return { marker, provenance: { ...row.scope } };
  });
  switch (key) {
    case 'timezone':
      return resolveNearest(
        scopes,
        rows.filter((row) => row.key === 'timezone'),
        settingCatalogue.timezone.defaultValue,
      );
    case 'pertWeights':
      return resolveNearest(
        scopes,
        rows.filter((row) => row.key === 'pertWeights'),
        settingCatalogue.pertWeights.defaultValue,
      );
    case 'allowedWorkItemTypes':
      return resolveNearest(
        scopes,
        rows.filter((row) => row.key === 'allowedWorkItemTypes'),
        settingCatalogue.allowedWorkItemTypes.defaultValue,
      );
    case 'budgetFactor':
      return resolveNearest(
        scopes,
        rows.filter((row) => row.key === 'budgetFactor'),
        settingCatalogue.budgetFactor.defaultValue,
      );
    case 'calendarMarkers':
      return markers.sort(
        (left, right) =>
          compareText(left.marker.date, right.marker.date) ||
          left.marker.createdAt - right.marker.createdAt ||
          compareText(left.marker.id, right.marker.id),
      );
  }
}

/** Shared captured-chain ordering for storage adapters; does not resolve or admit authority. */
export { readScopes as settingScopes };
