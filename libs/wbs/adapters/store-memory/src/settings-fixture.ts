import type {
  SettingStore,
  SettingTarget,
  SettingWrite,
  SettingWritten,
  WriteStamp,
} from '@wbs/core';
import {
  type CapturedSetting,
  settingCatalogue,
  type SettingScope,
  settingScopes,
  type SettingsSnapshot,
} from '@wbs/domain';
import { type } from '@wbs/validation';

import type { MemoryCalendarMarkerTable } from './calendar-marker-fixture';

interface MemorySettingValue {
  readonly scope: SettingScope;
  readonly key: string;
  value: unknown;
  revision: number;
  readonly createdAt: number;
  updatedAt: number;
  readonly createdBy: string | null;
}

/** Explicit entity state; empty construction creates no organization/project/space or authority. */
export interface MemorySettingTables {
  readonly values: Map<string, MemorySettingValue>;
}

export function memorySettingTables(): MemorySettingTables {
  return {
    values: new Map(),
  };
}

function scopeKey(scope: SettingScope, key: string): string {
  return JSON.stringify([scope.level, scope.id, key]);
}

/** Actual entity/marker readers close over the same staged MemoryState; no mirrored package authority. */
export interface MemorySettingEntities {
  organizationExists(id: string): boolean;
  readSpace(id: string): { readonly organizationId: unknown } | null;
  readProject(id: string): { readonly organizationId: unknown; readonly spaceId: unknown } | null;
  readPackage(id: string): {
    readonly organizationId: unknown;
    readonly projectId: unknown;
    readonly restricted: unknown;
  } | null;
  packageIds(): readonly string[];
  touchPackage(
    id: string,
    stamp: WriteStamp,
  ): Awaited<ReturnType<SettingStore['touchPackages']>>[number];
  readMarkers(): readonly { readonly scope: SettingScope; readonly marker: unknown }[];
}

/** Captures actual borrowed rows synchronously, reading values before the required marker reader; no callback escapes the caller's owner. */
export function captureMemorySettingsIn(
  tables: MemorySettingTables,
  chain: SettingTarget['chain'],
  readMarkers: () => readonly { readonly scope: SettingScope; readonly marker: unknown }[],
): SettingsSnapshot {
  const scopes = settingScopes(chain);
  const selected = (scope: SettingScope) =>
    scopes.some((own) => own.level === scope.level && own.id === scope.id);
  const values: CapturedSetting[] = [...tables.values.values()]
    .filter((row) => selected(row.scope))
    .map(({ scope, key, value }) => ({ scope, key, value }));
  return structuredClone({ values, markers: readMarkers().filter((row) => selected(row.scope)) });
}

/** Fixture-backed same-catalog settings; cloned/replaced with the enclosing MemoryState. */
export function inMemorySettings(
  tables: MemorySettingTables,
  entities: MemorySettingEntities,
): SettingStore {
  function readTarget(
    scope: { readonly level: 'organization'; readonly id: string },
    organizationId: string | null,
  ): Promise<Extract<SettingTarget, { readonly kind: 'organization' }> | null>;
  function readTarget(
    scope: { readonly level: 'space'; readonly id: string },
    organizationId: string | null,
  ): Promise<Extract<SettingTarget, { readonly kind: 'space' }> | null>;
  function readTarget(
    scope: { readonly level: 'project'; readonly id: string },
    organizationId: string | null,
  ): Promise<Extract<SettingTarget, { readonly kind: 'project' }> | null>;
  function readTarget(
    scope: { readonly level: 'work_package'; readonly id: string },
    organizationId: string | null,
  ): Promise<Extract<SettingTarget, { readonly kind: 'work_package' }> | null>;
  function readTarget(
    scope: SettingScope,
    organizationId: string | null,
  ): Promise<SettingTarget | null>;
  async function readTarget(
    scope: SettingScope,
    organizationId: string | null,
  ): Promise<SettingTarget | null> {
    scope = { ...scope };
    await Promise.resolve();
    const ownOrganization = (written: unknown): string => {
      if (typeof written !== 'string' || written === '')
        throw new Error('settings organization mapping is absent or malformed');
      return written;
    };
    const requireOrganization = (id: string) => {
      if (!entities.organizationExists(id))
        throw new Error('settings target organization ancestor is absent');
    };
    const spaceOf = (project: { readonly spaceId: unknown }, owner: string): string | null => {
      if (project.spaceId === null) return null;
      if (typeof project.spaceId !== 'string' || project.spaceId === '')
        throw new Error('settings project space is malformed');
      if (entities.readSpace(project.spaceId)?.organizationId !== owner)
        throw new Error('settings project space is absent or foreign');
      return project.spaceId;
    };
    let target: SettingTarget | null = null;
    switch (scope.level) {
      case 'organization':
        if (entities.organizationExists(scope.id))
          target = {
            kind: 'organization',
            chain: { level: 'organization', organizationId: scope.id },
          };
        break;
      case 'space': {
        const space = entities.readSpace(scope.id);
        if (space === null) break;
        const owner = ownOrganization(space.organizationId);
        if (organizationId !== null && owner !== organizationId) return null;
        requireOrganization(owner);
        target = {
          kind: 'space',
          chain: { level: 'space', organizationId: owner, spaceId: scope.id },
        };
        break;
      }
      case 'project': {
        const project = entities.readProject(scope.id);
        if (project === null) break;
        const owner = ownOrganization(project.organizationId);
        if (organizationId !== null && owner !== organizationId) return null;
        requireOrganization(owner);
        target = {
          kind: 'project',
          chain: {
            level: 'project',
            organizationId: owner,
            spaceId: spaceOf(project, owner),
            projectId: scope.id,
          },
        };
        break;
      }
      case 'work_package': {
        const workPackage = entities.readPackage(scope.id);
        if (workPackage === null) break;
        const owner = ownOrganization(workPackage.organizationId);
        if (organizationId !== null && owner !== organizationId) return null;
        requireOrganization(owner);
        if (typeof workPackage.projectId !== 'string' || workPackage.projectId === '')
          throw new Error('settings package parent identity is malformed');
        const project = entities.readProject(workPackage.projectId);
        if (project?.organizationId !== owner)
          throw new Error('settings package parent is absent or foreign');
        if (workPackage.restricted !== true && workPackage.restricted !== false)
          throw new Error('settings package restriction is malformed');
        target = {
          kind: 'work_package',
          chain: {
            level: 'work_package',
            organizationId: owner,
            spaceId: spaceOf(project, owner),
            projectId: workPackage.projectId,
            workPackageId: scope.id,
          },
          restricted: workPackage.restricted,
        };
        break;
      }
    }
    if (target === null) {
      const hasValue = [...tables.values.values()].some(
        (row) => row.scope.level === scope.level && row.scope.id === scope.id,
      );
      const hasMarker = entities
        .readMarkers()
        .some((row) => row.scope.level === scope.level && row.scope.id === scope.id);
      if (hasValue || hasMarker)
        throw new Error('stored settings name an absent ' + scope.level + '/' + scope.id);
      return null;
    }
    return organizationId !== null && target.chain.organizationId !== organizationId
      ? null
      : structuredClone(target);
  }
  return {
    readTarget,
    async touchPackages(target, stamp) {
      target = structuredClone(target);
      stamp = { ...stamp };
      const ids = await this.packageIds(target);
      return ids.map((id) => entities.touchPackage(id, stamp));
    },
    async packageIds(target) {
      target = structuredClone(target);
      const ids: string[] = [];
      for (const id of entities.packageIds()) {
        const row = entities.readPackage(id);
        if (row === null) throw new Error('listed settings package is absent');
        const parent =
          typeof row.projectId === 'string' ? entities.readProject(row.projectId) : null;
        if (
          (target.kind === 'work_package' && id !== target.chain.workPackageId) ||
          (target.kind === 'project' && row.projectId !== target.chain.projectId) ||
          (target.kind === 'space' && parent?.spaceId !== target.chain.spaceId) ||
          (target.kind === 'organization' &&
            row.organizationId !== target.chain.organizationId &&
            parent?.organizationId !== target.chain.organizationId)
        )
          continue;
        const own = await readTarget({ level: 'work_package', id }, target.chain.organizationId);
        if (own === null) continue;
        if (
          (target.kind === 'work_package' &&
            own.chain.workPackageId !== target.chain.workPackageId) ||
          (target.kind === 'project' && own.chain.projectId !== target.chain.projectId) ||
          (target.kind === 'space' && own.chain.spaceId !== target.chain.spaceId)
        )
          continue;
        ids.push(id);
      }
      return ids.sort();
    },
    async capture(target): Promise<SettingsSnapshot> {
      target = structuredClone(target);
      await Promise.resolve();
      return captureMemorySettingsIn(tables, target.chain, () => entities.readMarkers());
    },
    async write(
      target: SettingTarget,
      change: SettingWrite,
      stamp: WriteStamp,
    ): Promise<SettingWritten> {
      target = structuredClone(target);
      change = structuredClone(change);
      stamp = { ...stamp };
      await Promise.resolve();
      const entry = settingCatalogue[change.key];
      const level = target.chain.level;
      if (entry.definedAt !== level && !entry.overridableAt.has(level))
        return { ok: false, reason: 'not_overridable_here', key: change.key, level };
      if (change.value !== null && entry.value(change.value) instanceof type.errors)
        return { ok: false, reason: 'invalid_value', key: change.key };
      const scope = settingScopes(target.chain).at(0);
      if (scope === undefined) throw new Error('settings target has no own scope');
      const key = scopeKey(scope, change.key);
      if (change.value === null) tables.values.delete(key);
      else {
        const previous = tables.values.get(key);
        tables.values.set(key, {
          scope: { ...scope },
          key: change.key,
          value: structuredClone(change.value),
          revision: previous === undefined ? 0 : previous.revision + 1,
          createdAt: previous === undefined ? stamp.at : previous.createdAt,
          updatedAt: stamp.at,
          createdBy: previous === undefined ? stamp.by : previous.createdBy,
        });
      }
      return { ok: true };
    },
  };
}

/** Deletes only live rows owned by a removed entity; historical migration evidence is a separate store. */
export function clearMemorySettings(
  tables: MemorySettingTables,
  markers: MemoryCalendarMarkerTable,
  scope: SettingScope,
): void {
  for (const [key, row] of tables.values)
    if (row.scope.level === scope.level && row.scope.id === scope.id) tables.values.delete(key);
  for (const [id, row] of markers.held)
    if (row.scope.level === scope.level && row.scope.id === scope.id) markers.held.delete(id);
}
