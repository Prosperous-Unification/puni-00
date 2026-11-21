import type {
  NearestSettingKey,
  OrganizationChain,
  PertWeights,
  ProjectChain,
  ScopeChain,
  SettingScope,
  SettingsSnapshot,
  SpaceChain,
  WorkPackageChain,
} from '@wbs/domain';

import type { WorkPackageEvent } from './work-package-event';
import type { WriteStamp } from './write-stamp';

/** Structural evidence only; values and marker content are read after current admission. */
export type SettingTarget =
  | { readonly kind: 'organization'; readonly chain: OrganizationChain }
  | { readonly kind: 'space'; readonly chain: SpaceChain }
  | { readonly kind: 'project'; readonly chain: ProjectChain }
  | {
      readonly kind: 'work_package';
      readonly chain: WorkPackageChain;
      readonly restricted: boolean;
    };

/** Validated nearest-key writes; null deletes this target's override. */
export type SettingWrite =
  | { readonly key: 'timezone'; readonly value: string | null }
  | { readonly key: 'pertWeights'; readonly value: PertWeights | null }
  | { readonly key: 'allowedWorkItemTypes'; readonly value: readonly string[] | null }
  | { readonly key: 'budgetFactor'; readonly value: number | null };

export type SettingWritten =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'not_overridable_here';
      readonly key: NearestSettingKey;
      readonly level: ScopeChain['level'];
    }
  | { readonly ok: false; readonly reason: 'invalid_value'; readonly key: NearestSettingKey };

/**
 * Required raw settings evidence on its catalog owner's read or write snapshot.
 * Public purposes retain the complete caller and admit readTarget's narrow actual
 * target before capture. Borrowed catalogs never open a second connection.
 * Missing/corrupt owned ancestors or orphaned stored evidence throw; no column fallback.
 */
export interface SettingStore {
  /**
   * Reads actual mapping/parent/nullable space and restriction without private values.
   * A valid foreign mapping is null before its private parent/content is decoded.
   * organizationId:null is explicit legacy/internal addressing, never an authority grant.
   */
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
  /** Structural descendants for shell admission and affected-setting validation; no private DTO decoding. */
  packageIds(target: SettingTarget): Promise<readonly string[]>;
  /** Advances actual descendant revisions; returns detached settings announcements for post-commit delivery. */
  touchPackages(
    target: SettingTarget,
    stamp: WriteStamp,
  ): Promise<
    readonly {
      readonly workPackageId: string;
      readonly event: Extract<WorkPackageEvent, { readonly type: 'work_package_settings_changed' }>;
    }[]
  >;
  /** Already-admitted retained target only; returns detached applicable raw rows. */
  capture(target: SettingTarget): Promise<SettingsSnapshot>;
  /** Same admitted writer; preserves catalogue level rules and never writes an ancestor. */
  write(target: SettingTarget, change: SettingWrite, stamp: WriteStamp): Promise<SettingWritten>;
}

/** One retained act; unknown clocks and identity disagreement are trusted collaborator failures. */
export function retainSettingStamp(stamp: WriteStamp, actorId: string): WriteStamp {
  const retained = { ...stamp };
  if (retained.by !== actorId || actorId === '' || !Number.isSafeInteger(retained.at))
    throw new Error('settings write stamp is malformed or names another actor');
  return retained;
}
