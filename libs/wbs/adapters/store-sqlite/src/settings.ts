import type {
  SettingStore,
  SettingTarget,
  SettingWrite,
  SettingWritten,
  WriteStamp,
} from '@wbs/core';
import {
  type CapturedSetting,
  resolveSetting,
  settingCatalogue,
  type SettingLevel,
  type SettingScope,
  settingScopes,
  type SettingsSnapshot,
} from '@wbs/domain';
import { type } from '@wbs/validation';
import { type SQL, sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import { isScheduleEngine, isSolverObjective } from './optimizer-rows';

interface TargetRecord {
  readonly id: unknown;
  readonly organization_id: unknown;
  readonly actual_organization_id: unknown;
  readonly parent_id: unknown;
  readonly parent_organization_id: unknown;
  readonly project_id: unknown;
  readonly space_id: unknown;
  readonly actual_space_id: unknown;
  readonly space_organization_id: unknown;
  readonly restricted: unknown;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '')
    throw new Error('settings ' + label + ' is absent or malformed');
  return value;
}

function readSpace(row: TargetRecord, organizationId: string): string | null {
  if (row.space_id === null) return null;
  const spaceId = identity(row.space_id, 'project space');
  if (row.actual_space_id !== spaceId || row.space_organization_id !== organizationId)
    throw new Error('settings project space is absent, malformed or foreign');
  return spaceId;
}

function readLevel(value: unknown): SettingLevel {
  if (
    value === 'organization' ||
    value === 'space' ||
    value === 'project' ||
    value === 'work_package'
  )
    return value;
  throw new Error('stored setting scope kind is malformed');
}

function parseValue(value: unknown, key: string, scope: SettingScope): unknown {
  if (typeof value !== 'string')
    throw new Error(
      'stored setting JSON is not text: ' + key + ' at ' + scope.level + '/' + scope.id,
    );
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch (cause) {
    throw new Error(
      'stored setting JSON is malformed: ' + key + ' at ' + scope.level + '/' + scope.id,
      { cause },
    );
  }
}

/**
 * Raw settings on an existing admitted catalog connection. It owns no connection,
 * transaction or authority; public callers acquire the source's observation first.
 */
export function readSettingTargetIn(
  db: Pick<Drizzle, 'all'>,
  scope: { readonly level: 'organization'; readonly id: string },
  organizationId: string | null,
): Extract<SettingTarget, { readonly kind: 'organization' }> | null;
export function readSettingTargetIn(
  db: Pick<Drizzle, 'all'>,
  scope: { readonly level: 'space'; readonly id: string },
  organizationId: string | null,
): Extract<SettingTarget, { readonly kind: 'space' }> | null;
export function readSettingTargetIn(
  db: Pick<Drizzle, 'all'>,
  scope: { readonly level: 'project'; readonly id: string },
  organizationId: string | null,
): Extract<SettingTarget, { readonly kind: 'project' }> | null;
export function readSettingTargetIn(
  db: Pick<Drizzle, 'all'>,
  scope: { readonly level: 'work_package'; readonly id: string },
  organizationId: string | null,
): Extract<SettingTarget, { readonly kind: 'work_package' }> | null;
export function readSettingTargetIn(
  db: Pick<Drizzle, 'all'>,
  scope: SettingScope,
  organizationId: string | null,
): SettingTarget | null;
export function readSettingTargetIn(
  db: Pick<Drizzle, 'all'>,
  scope: SettingScope,
  organizationId: string | null,
): SettingTarget | null {
  let row: TargetRecord | undefined;
  switch (scope.level) {
    case 'organization':
      row = db
        .all<TargetRecord>(
          sql`
          SELECT id, id AS organization_id, id AS actual_organization_id, NULL AS parent_id, NULL AS parent_organization_id,
                 NULL AS project_id, NULL AS space_id, NULL AS actual_space_id,
                 NULL AS space_organization_id, NULL AS restricted
          FROM organization WHERE id = ${scope.id}`,
        )
        .at(0);
      break;
    case 'space':
      row = db
        .all<TargetRecord>(
          sql`
          SELECT selected.id, selected.organization_id, actual_organization.id AS actual_organization_id, NULL AS parent_id, NULL AS parent_organization_id,
                 NULL AS project_id, selected.id AS space_id, selected.id AS actual_space_id,
                 selected.organization_id AS space_organization_id, NULL AS restricted
          FROM space selected LEFT JOIN organization actual_organization ON actual_organization.id = selected.organization_id WHERE selected.id = ${scope.id}`,
        )
        .at(0);
      break;
    case 'project':
      row = db
        .all<TargetRecord>(
          sql`
          SELECT parent.id, parent.organization_id, actual_organization.id AS actual_organization_id, parent.id AS parent_id,
                 parent.organization_id AS parent_organization_id, parent.id AS project_id,
                 parent.space_id, actual_space.id AS actual_space_id,
                 actual_space.organization_id AS space_organization_id, NULL AS restricted
          FROM project parent LEFT JOIN organization actual_organization ON actual_organization.id = parent.organization_id LEFT JOIN space actual_space ON actual_space.id = parent.space_id
          WHERE parent.id = ${scope.id}`,
        )
        .at(0);
      break;
    case 'work_package':
      row = db
        .all<TargetRecord>(
          sql`
          SELECT wp.id, mapping.organization_id, actual_organization.id AS actual_organization_id, parent.id AS parent_id,
                 parent.organization_id AS parent_organization_id, wp.project_id,
                 parent.space_id, actual_space.id AS actual_space_id,
                 actual_space.organization_id AS space_organization_id, wp.restricted
          FROM work_package wp
          LEFT JOIN work_package_organization mapping ON mapping.resource_id = wp.id
          LEFT JOIN organization actual_organization ON actual_organization.id = mapping.organization_id
          LEFT JOIN project parent ON parent.id = wp.project_id
          LEFT JOIN space actual_space ON actual_space.id = parent.space_id
          WHERE wp.id = ${scope.id}`,
        )
        .at(0);
      break;
  }
  if (row === undefined) {
    const orphan = db
      .all<{ present: number }>(
        sql`
        SELECT 1 AS present FROM setting_value WHERE scope_kind = ${scope.level} AND scope_id = ${scope.id}
        UNION ALL
        SELECT 1 AS present FROM calendar_marker WHERE scope_kind = ${scope.level} AND scope_id = ${scope.id}
        LIMIT 1`,
      )
      .at(0);
    if (orphan !== undefined)
      throw new Error('stored settings name an absent ' + scope.level + '/' + scope.id);
    return null;
  }
  return settingTargetOf(row, scope, organizationId);
}

/** Shared structural decoder for direct target queries and in-statement package projections. */
function settingTargetOf(
  row: TargetRecord,
  scope: SettingScope,
  organizationId: string | null,
): SettingTarget | null {
  const actualOrganizationId = identity(row.organization_id, 'organization mapping');
  if (organizationId !== null && actualOrganizationId !== organizationId) return null;
  if (row.actual_organization_id !== actualOrganizationId)
    throw new Error('settings target organization ancestor is absent or malformed');
  if (identity(row.id, 'target identity') !== scope.id)
    throw new Error('settings target identity differs');
  if (scope.level === 'organization')
    return {
      kind: 'organization',
      chain: { level: 'organization', organizationId: actualOrganizationId },
    };
  if (scope.level === 'space')
    return {
      kind: 'space',
      chain: { level: 'space', organizationId: actualOrganizationId, spaceId: scope.id },
    };
  const projectId = identity(row.project_id, 'project identity');
  if (row.parent_id !== projectId || row.parent_organization_id !== actualOrganizationId)
    throw new Error('settings target parent is absent, malformed or foreign');
  const spaceId = readSpace(row, actualOrganizationId);
  if (scope.level === 'project')
    return {
      kind: 'project',
      chain: { level: 'project', organizationId: actualOrganizationId, spaceId, projectId },
    };
  if (row.restricted !== 0 && row.restricted !== 1)
    throw new Error('settings work package restriction is malformed');
  return {
    kind: 'work_package',
    chain: {
      level: 'work_package',
      organizationId: actualOrganizationId,
      spaceId,
      projectId,
      workPackageId: scope.id,
    },
    restricted: row.restricted === 1,
  };
}

export function captureSettingsIn(db: Drizzle, target: SettingTarget): SettingsSnapshot {
  const scopes = settingScopes(target.chain);
  const encodedScopes = JSON.stringify(scopes);
  const values = db.all<{
    scope_kind: unknown;
    scope_id: unknown;
    key: unknown;
    value_json: unknown;
  }>(sql`
      SELECT value.scope_kind, value.scope_id, value.key, value.value_json
      FROM setting_value value
      JOIN json_each(${encodedScopes}) selected
        ON value.scope_kind = json_extract(selected.value, '$.level')
       AND value.scope_id = json_extract(selected.value, '$.id')
      ORDER BY value.scope_kind, value.scope_id, value.key`);
  const captured: CapturedSetting[] = values.map((row) => {
    const scope = { level: readLevel(row.scope_kind), id: identity(row.scope_id, 'stored scope') };
    const key = identity(row.key, 'stored key');
    return { scope, key, value: parseValue(row.value_json, key, scope) };
  });
  const markers = db.all<{
    scope_kind: unknown;
    scope_id: unknown;
    id: unknown;
    date: unknown;
    name: unknown;
    color: unknown;
    created_at: unknown;
  }>(sql`
      SELECT marker.scope_kind, marker.scope_id, marker.id, marker.date, marker.name, marker.color, marker.created_at
      FROM calendar_marker marker
      JOIN json_each(${encodedScopes}) selected
        ON marker.scope_kind = json_extract(selected.value, '$.level')
       AND marker.scope_id = json_extract(selected.value, '$.id')
      ORDER BY marker.date, marker.created_at, marker.id`);
  return {
    values: captured,
    markers: markers.map((row) => ({
      scope: { level: readLevel(row.scope_kind), id: identity(row.scope_id, 'marker scope') },
      marker: {
        id: row.id,
        date: row.date,
        name: row.name,
        color: row.color,
        createdAt: row.created_at,
      },
    })),
  };
}

export function writeSettingIn(
  db: Drizzle,
  target: SettingTarget,
  change: SettingWrite,
  stamp: WriteStamp,
): SettingWritten {
  const entry = settingCatalogue[change.key];
  const level = target.chain.level;
  if (entry.definedAt !== level && !entry.overridableAt.has(level))
    return { ok: false, reason: 'not_overridable_here', key: change.key, level };
  if (change.value !== null && entry.value(change.value) instanceof type.errors)
    return { ok: false, reason: 'invalid_value', key: change.key };
  const scope = settingScopes(target.chain).at(0);
  if (scope === undefined) throw new Error('settings target has no own scope');
  if (change.value === null) {
    db.run(
      sql`DELETE FROM setting_value WHERE scope_kind = ${scope.level} AND scope_id = ${scope.id} AND key = ${change.key}`,
    );
  } else {
    db.run(sql`
        INSERT INTO setting_value(scope_kind,scope_id,key,value_json,revision,created_at,updated_at,created_by)
        VALUES(${scope.level},${scope.id},${change.key},${JSON.stringify(change.value)},0,${stamp.at},${stamp.at},${stamp.by})
        ON CONFLICT(scope_kind,scope_id,key) DO UPDATE SET
          value_json=excluded.value_json, revision=setting_value.revision+1, updated_at=excluded.updated_at`);
  }
  return { ok: true };
}

/** Addresses only structural descendants on this same owner; each current mapping stays strict. */
export function settingPackageIdsIn(db: Drizzle, target: SettingTarget): readonly string[] {
  let addressed: SQL;
  switch (target.kind) {
    case 'organization':
      addressed = sql`parent.organization_id = ${target.chain.organizationId} OR mapping.organization_id = ${target.chain.organizationId}`;
      break;
    case 'space':
      addressed = sql`parent.space_id = ${target.chain.spaceId}`;
      break;
    case 'project':
      addressed = sql`wp.project_id = ${target.chain.projectId}`;
      break;
    case 'work_package':
      addressed = sql`wp.id = ${target.chain.workPackageId}`;
      break;
  }
  const candidates = db.all<{ id: unknown }>(sql`
    SELECT wp.id FROM work_package wp
    LEFT JOIN project parent ON parent.id = wp.project_id
    LEFT JOIN work_package_organization mapping ON mapping.resource_id = wp.id
    WHERE ${addressed} ORDER BY wp.id`);
  const ids: string[] = [];
  for (const row of candidates) {
    const id = identity(row.id, 'descendant package identity');
    const current = readSettingTargetIn(
      db,
      { level: 'work_package', id },
      target.chain.organizationId,
    );
    if (current !== null) ids.push(id);
  }
  return ids;
}

/** Raw borrowed catalog wrapper; public purposes own the snapshot and admission. */
export class SettingRepository implements SettingStore {
  constructor(private readonly db: Drizzle) {}
  readTarget(
    scope: { readonly level: 'organization'; readonly id: string },
    organizationId: string | null,
  ): Promise<Extract<SettingTarget, { readonly kind: 'organization' }> | null>;
  readTarget(
    scope: { readonly level: 'space'; readonly id: string },
    organizationId: string | null,
  ): Promise<Extract<SettingTarget, { readonly kind: 'space' }> | null>;
  readTarget(
    scope: { readonly level: 'project'; readonly id: string },
    organizationId: string | null,
  ): Promise<Extract<SettingTarget, { readonly kind: 'project' }> | null>;
  readTarget(
    scope: { readonly level: 'work_package'; readonly id: string },
    organizationId: string | null,
  ): Promise<Extract<SettingTarget, { readonly kind: 'work_package' }> | null>;
  readTarget(scope: SettingScope, organizationId: string | null): Promise<SettingTarget | null>;
  readTarget(scope: SettingScope, organizationId: string | null): Promise<SettingTarget | null> {
    scope = { ...scope };
    return Promise.resolve().then(() => readSettingTargetIn(this.db, scope, organizationId));
  }
  packageIds(target: SettingTarget): Promise<readonly string[]> {
    target = structuredClone(target);
    return Promise.resolve().then(() => settingPackageIdsIn(this.db, target));
  }
  touchPackages(
    target: SettingTarget,
    stamp: WriteStamp,
  ): ReturnType<SettingStore['touchPackages']> {
    target = structuredClone(target);
    stamp = { ...stamp };
    return Promise.resolve().then(() =>
      settingPackageIdsIn(this.db, target).map((id) => {
        const row = this.db.get<
          | {
              optimization_enabled: unknown;
              schedule_engine: unknown;
              schedule_objective: unknown;
            }
          | undefined
        >(sql`
        SELECT optimization_enabled,schedule_engine,schedule_objective FROM work_package WHERE id = ${id}`);
        if (
          row === undefined ||
          (row.optimization_enabled !== 0 && row.optimization_enabled !== 1) ||
          typeof row.schedule_engine !== 'string' ||
          !isScheduleEngine(row.schedule_engine) ||
          typeof row.schedule_objective !== 'string' ||
          !isSolverObjective(row.schedule_objective)
        )
          throw new Error('settings descendant optimizer state is absent or malformed');
        this.db.run(
          sql`UPDATE work_package SET revision = revision + 1, updated_at = ${stamp.at} WHERE id = ${id}`,
        );
        return {
          workPackageId: id,
          event: {
            type: 'work_package_settings_changed' as const,
            optimizationEnabled: row.optimization_enabled === 1,
            scheduleEngine: row.schedule_engine,
            scheduleObjective: row.schedule_objective,
          },
        };
      }),
    );
  }
  capture(target: SettingTarget): Promise<SettingsSnapshot> {
    target = structuredClone(target);
    return Promise.resolve().then(() => captureSettingsIn(this.db, target));
  }
  write(target: SettingTarget, change: SettingWrite, stamp: WriteStamp): Promise<SettingWritten> {
    target = structuredClone(target);
    change = structuredClone(change);
    stamp = { ...stamp };
    return Promise.resolve().then(() => writeSettingIn(this.db, target, change, stamp));
  }
}

/** One admitted package's derived scalar projection; no legacy-column fallback. */
export function resolvePackageSettingsIn(db: Drizzle, id: string) {
  const target = readSettingTargetIn(db, { level: 'work_package', id }, null);
  if (target === null) throw new Error('settings package ' + id + ' is absent');
  const snapshot = captureSettingsIn(db, target);
  return {
    timezone: resolveSetting(target.chain, 'timezone', snapshot).value,
    pertWeights: resolveSetting(target.chain, 'pertWeights', snapshot).value,
    budgetFactor: resolveSetting(target.chain, 'budgetFactor', snapshot).value,
  };
}

/**
 * Same-statement scalar evidence for the non-zoned WorkPackage DTO. Timezone belongs to
 * the explicit timezoneOf/resolvePackageSettingsIn purpose, so these reads never capture
 * its values. Unknown keys still reach validation; no per-row query or variable-sized binds.
 * Proof: V115 nonzoned-selection admitted a malformed timezone into the non-zoned read;
 * unknown-key-retention hid a future key and lost the required refusal in the same real reader.
 */
export const PACKAGE_SETTING_PROJECTION = sql<string>`(
  SELECT json_object(
    'target', json_object('id', work_package.id, 'organization_id', mapping.organization_id,
      'actual_organization_id', actual_organization.id, 'parent_id', parent.id,
      'parent_organization_id', parent.organization_id, 'project_id', work_package.project_id,
      'space_id', parent.space_id, 'actual_space_id', actual_space.id,
      'space_organization_id', actual_space.organization_id, 'restricted', work_package.restricted),
    'values', json((SELECT json_group_array(json_object('scope_kind', value.scope_kind,
      'scope_id', value.scope_id, 'key', value.key, 'value_json', value.value_json))
      FROM setting_value value WHERE value.key <> 'timezone' AND (
        (value.scope_kind = 'work_package' AND value.scope_id = work_package.id) OR
        (value.scope_kind = 'project' AND value.scope_id = work_package.project_id) OR
        (value.scope_kind = 'space' AND value.scope_id = parent.space_id) OR
        (value.scope_kind = 'organization' AND value.scope_id = mapping.organization_id)))))
  FROM (SELECT 1) one_row
  LEFT JOIN work_package_organization mapping ON mapping.resource_id = work_package.id
  LEFT JOIN organization actual_organization ON actual_organization.id = mapping.organization_id
  LEFT JOIN project parent ON parent.id = work_package.project_id
  LEFT JOIN space actual_space ON actual_space.id = parent.space_id
)`;

const packageSettingProjection = type({
  target: {
    id: 'unknown',
    organization_id: 'unknown',
    actual_organization_id: 'unknown',
    parent_id: 'unknown',
    parent_organization_id: 'unknown',
    project_id: 'unknown',
    space_id: 'unknown',
    actual_space_id: 'unknown',
    space_organization_id: 'unknown',
    restricted: 'unknown',
  },
  values: type({
    scope_kind: 'unknown',
    scope_id: 'unknown',
    key: 'unknown',
    value_json: 'unknown',
  }).array(),
});

/** Validates the retained non-zoned chain and resolves only fields published by WorkPackage. */
export function projectPackageSettings(encoded: string, id: string) {
  const parsed: unknown = JSON.parse(encoded);
  const captured = packageSettingProjection.assert(parsed);
  const target = settingTargetOf(captured.target, { level: 'work_package', id }, null);
  if (target === null) throw new Error('projected package settings target is absent');
  const snapshot: SettingsSnapshot = {
    values: captured.values.map((row) => {
      const scope = {
        level: readLevel(row.scope_kind),
        id: identity(row.scope_id, 'stored scope'),
      };
      const key = identity(row.key, 'stored key');
      return { scope, key, value: parseValue(row.value_json, key, scope) };
    }),
    markers: [],
  };
  return {
    pertWeights: resolveSetting(target.chain, 'pertWeights', snapshot).value,
    budgetFactor: resolveSetting(target.chain, 'budgetFactor', snapshot).value,
  };
}
