import {
  type Permission,
  type PertWeights,
  type ResolvedSetting,
  type ResolvedSettingMarker,
  resolveSetting,
} from '@wbs/domain';

import { AnnouncementCollector } from '../ports/announcement-collector';
import type { Clock } from '../ports/clock';
import type { CommandAccess } from '../ports/command-access';
import type { RefusedOrganizationAccess } from '../ports/organization-access';
import type { ProjectCaller } from '../ports/project-administration';
import { retainSettingStamp, type SettingTarget } from '../ports/setting-store';
import type { PlanTransactionalStores } from '../ports/stores';
import type { UnitOfWork } from '../ports/unit-of-work';
import type { Broadcaster } from '../ports/work-package-event';
import { authorize } from './authorize';

/** All catalogue values are detached and carry their actual captured provenance. */
export interface ProjectSettings {
  readonly timezone: ResolvedSetting<string>;
  readonly pertWeights: ResolvedSetting<PertWeights>;
  readonly allowedWorkItemTypes: ResolvedSetting<string[]>;
  readonly budgetFactor: ResolvedSetting<number>;
  readonly calendarMarkers: readonly ResolvedSettingMarker[];
}

export type ProjectSettingsOutcome =
  | { readonly ok: true; readonly settings: ProjectSettings }
  | RefusedOrganizationAccess
  | { readonly ok: false; readonly reason: 'not_found' }
  | { readonly ok: false; readonly reason: 'forbidden'; readonly permission: Permission }
  | { readonly ok: false; readonly reason: 'insufficient_scope' }
  | { readonly ok: false; readonly reason: 'invalid_value'; readonly key: 'budgetFactor' }
  | {
      readonly ok: false;
      readonly reason: 'not_overridable_here';
      readonly key: 'budgetFactor';
      readonly level: 'project';
    };

export type ProjectSettingsReadOutcome = Extract<
  ProjectSettingsOutcome,
  | { readonly ok: true }
  | { readonly refusal: string }
  | { readonly reason: 'not_found' | 'forbidden' }
>;

export interface ProjectSettingsOptions {
  readonly uow: UnitOfWork;
  readonly commandAccess: CommandAccess;
  readonly clock: Clock;
  readonly announcements: Broadcaster;
}

/**
 * Project-only settings vertical on the existing admitted Source owner. Read and
 * write both revalidate the complete caller there before structural target admission,
 * private snapshot decoding and resolution. A package PATCH never reaches this writer.
 */
export class ProjectSettingsPurpose {
  constructor(private readonly options: ProjectSettingsOptions) {}

  async read(caller: ProjectCaller, projectId: string): Promise<ProjectSettingsReadOutcome> {
    caller = structuredClone(caller);
    return await this.options.uow.run<ProjectSettingsReadOutcome>(async (scope) => {
      const resolved = await this.options.commandAccess.resolve(caller);
      if (!resolved.ok) return { commit: false, value: resolved };
      if (resolved.access.kind === 'legacy')
        return { commit: false, value: { ok: false, refusal: 'no_active_organization' } };
      const target = await scope.stores.settings.readTarget(
        { level: 'project', id: projectId },
        resolved.access.scope.organizationId,
      );
      if (target === null) return { commit: false, value: { ok: false, reason: 'not_found' } };
      const permission = await this.admitRead(scope.stores, caller, target);
      if (permission !== null) return { commit: false, value: permission };
      return {
        commit: false,
        value: { ok: true, settings: await this.project(scope.stores, target) },
      };
    });
  }

  async writeBudget(
    caller: ProjectCaller,
    projectId: string,
    budgetFactor: number | null,
  ): Promise<ProjectSettingsOutcome> {
    caller = structuredClone(caller);
    if (!caller.principal.scopes.includes('write'))
      return { ok: false, reason: 'insufficient_scope' };
    const stamp = retainSettingStamp(
      this.options.clock.stampFor(caller.principal.id),
      caller.principal.id,
    );
    const announcements = new AnnouncementCollector(this.options.announcements);
    const outcome = await this.options.uow.run<ProjectSettingsOutcome>(async (scope) => {
      const resolved = await this.options.commandAccess.resolve(caller);
      if (!resolved.ok) return { commit: false, value: resolved };
      if (resolved.access.kind === 'legacy')
        return { commit: false, value: { ok: false, refusal: 'no_active_organization' } };
      const target = await scope.stores.settings.readTarget(
        { level: 'project', id: projectId },
        resolved.access.scope.organizationId,
      );
      if (target === null) return { commit: false, value: { ok: false, reason: 'not_found' } };
      const visible = await this.admitRead(scope.stores, caller, target);
      if (visible !== null) return { commit: false, value: visible };
      const permitted = await authorize(
        scope.stores.accessDecisions,
        caller.principal,
        target,
        'project.manage_settings',
      );
      if (!permitted.ok) return { commit: false, value: permitted };
      const written = await scope.stores.settings.write(
        target,
        { key: 'budgetFactor', value: budgetFactor },
        stamp,
      );
      if (!written.ok) {
        if (written.reason === 'invalid_value')
          return {
            commit: false,
            value: { ok: false, reason: 'invalid_value', key: 'budgetFactor' },
          };
        return {
          commit: false,
          value: {
            ok: false,
            reason: 'not_overridable_here',
            key: 'budgetFactor',
            level: 'project',
          },
        };
      }
      const settings = await this.project(scope.stores, target);
      for (const changed of await scope.stores.settings.touchPackages(target, stamp))
        await announcements.publish(changed.workPackageId, changed.event);
      return { commit: true, value: { ok: true, settings } };
    });
    if (outcome.ok) await announcements.send();
    return outcome;
  }

  private async admitRead(
    stores: PlanTransactionalStores,
    caller: ProjectCaller,
    target: Extract<SettingTarget, { readonly kind: 'project' }>,
  ): Promise<Extract<
    ProjectSettingsReadOutcome,
    { readonly ok: false; readonly reason: string }
  > | null> {
    const permission = await authorize(
      stores.accessDecisions,
      caller.principal,
      target,
      'project.read',
    );
    if (permission.ok) return null;
    if (permission.reason === 'forbidden') return permission;
    const decisions = stores.accessDecisions;
    if (decisions === undefined) throw new Error('project settings grant decisions are absent');
    const readable = await decisions.readablePackageIds(
      caller.principal,
      target.chain.organizationId,
    );
    const children = await stores.settings.packageIds(target);
    return children.some((id) => readable.has(id))
      ? { ok: false, reason: 'forbidden', permission: 'project.read' }
      : { ok: false, reason: 'not_found' };
  }

  private async project(
    stores: PlanTransactionalStores,
    target: Extract<SettingTarget, { readonly kind: 'project' }>,
  ): Promise<ProjectSettings> {
    const snapshot = await stores.settings.capture(target);
    return {
      timezone: resolveSetting(target.chain, 'timezone', snapshot),
      pertWeights: resolveSetting(target.chain, 'pertWeights', snapshot),
      allowedWorkItemTypes: resolveSetting(target.chain, 'allowedWorkItemTypes', snapshot),
      budgetFactor: resolveSetting(target.chain, 'budgetFactor', snapshot),
      calendarMarkers: resolveSetting(target.chain, 'calendarMarkers', snapshot),
    };
  }
}
