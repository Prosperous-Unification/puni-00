import {
  cleanName,
  type EstimateUnit,
  isReservedStepCode,
  isStepCode,
  type Permission,
  type ResolvedStep,
  resolvePackageSteps,
  resolveSteps,
} from '@wbs/domain';

import type { AccessDecisions } from '../ports/access-decisions';
import type { Clock } from '../ports/clock';
import type { CommandAccess } from '../ports/command-access';
import type { RefusedOrganizationAccess } from '../ports/organization-access';
import type { ProjectCaller } from '../ports/project-administration';
import type { SettingTarget } from '../ports/setting-store';
import { retainSettingStamp } from '../ports/setting-store';
import type {
  CatalogueStepBinding,
  CatalogueWriteObservation,
  StepCatalogueRows,
  StepDefinition,
  StepDefinitionPatch,
  StepNodesInUse,
  StepScope,
  StepUnbindOptions,
  StepUnbindOutcome,
} from '../ports/step-catalogue';
import type { ProjectStepManifest } from '../ports/step-manifest';
import type { PlanTransactionalStores } from '../ports/stores';
import type { Scope, UnitOfWork } from '../ports/unit-of-work';
import { subscriptionFor, type WorkPackageEvent } from '../ports/work-package-event';
import { projectCatalogueBindings } from '../step-catalogue/step-catalogue';
import { projectReadableStepUsage } from '../step-catalogue/step-usage';
import { type Authorization, authorize, requireAccessDecisions } from './authorize';
import {
  type CommittedFanoutDelivery,
  type CommittedWorkPackageEvent,
  recordCommittedFanout,
} from './committed-fanout';

export type CatalogueReadRefusal =
  | RefusedOrganizationAccess
  | { readonly ok: false; readonly reason: 'not_found' }
  | { readonly ok: false; readonly reason: 'forbidden'; readonly permission: Permission };
export type CatalogueWriteRefusal =
  CatalogueReadRefusal | { readonly ok: false; readonly reason: 'insufficient_scope' };
type Refusal<Reason extends string> = Reason extends string
  ? { readonly ok: false; readonly reason: Reason }
  : never;

export interface CatalogueDefinitionDraft {
  readonly code: string;
  readonly name: string;
  readonly position: number;
  readonly defaultEstimateUnit: EstimateUnit;
  readonly defaultAllowancePercent: number;
}
export type CatalogueBindingDraft = StepScope & {
  readonly workItemTypeId: string | null;
  readonly position: number;
} & (
    | { readonly stepId: string; readonly define?: never }
    | { readonly define: CatalogueDefinitionDraft; readonly stepId?: never }
  );
export type CatalogueProjectUsage = ({ readonly ok: true } & StepNodesInUse) | CatalogueReadRefusal;
type ProjectAdmission =
  | {
      readonly ok: true;
      readonly target: Extract<SettingTarget, { kind: 'project' }>;
      readonly decisions: AccessDecisions;
    }
  | Extract<Authorization, { ok: false }>;
export type CatalogueProjectManifest =
  { readonly ok: true; readonly manifest: ProjectStepManifest } | CatalogueReadRefusal;
export type CatalogueProjectSteps =
  { readonly ok: true; readonly steps: readonly ResolvedStep[] } | CatalogueReadRefusal;
export type CatalogueRead =
  { readonly ok: true; readonly catalogue: StepCatalogueRows } | CatalogueReadRefusal;
export type CatalogueBound =
  | {
      readonly ok: true;
      readonly binding: CatalogueStepBinding;
      readonly definition?: StepDefinition;
    }
  | CatalogueWriteRefusal
  | Refusal<
      | 'name_required'
      | 'invalid_code'
      | 'reserved_code'
      | 'code_taken'
      | 'name_taken'
      | 'duplicate_binding'
    >;
export type CataloguePatched =
  | { readonly ok: true; readonly definition: StepDefinition }
  | CatalogueWriteRefusal
  | Refusal<'name_required' | 'invalid_body' | 'name_taken'>;
export type CatalogueRetired =
  { readonly ok: true } | CatalogueWriteRefusal | Refusal<'step_bound'>;
export type CatalogueReordered =
  { readonly ok: true } | CatalogueWriteRefusal | Refusal<'stale_order'>;
export type CatalogueUnbound =
  | CatalogueWriteRefusal
  | ({ readonly ok: false; readonly reason: 'step_nodes_in_use' } & StepNodesInUse)
  | { readonly ok: true; readonly kind: 'unbound' }
  | ({ readonly ok: true } & Extract<StepUnbindOutcome, { readonly kind: 'preview' }>);
export interface StepCataloguePurposeOptions {
  readonly uow: UnitOfWork;
  readonly commandAccess: CommandAccess;
  readonly clock: Clock;
  readonly delivery: CommittedFanoutDelivery;
}

/**
 * Current global metadata and scope binding admission on one Source write loan.
 * The retained request context is revalidated there; body scope IDs grant no authority.
 * A space is first resolved in the selected organization, then its actual owner is
 * checked for organization.manage_spaces. No project or space grant is synthesized.
 * Definition defaults never traverse a package value writer or an estimate veto.
 * The same write loan records direct and dependent-plan events. Delivery starts
 * after that loan commits and releases the writer.
 */
export class StepCataloguePurpose {
  constructor(private readonly options: StepCataloguePurposeOptions) {}

  async read(caller: ProjectCaller): Promise<CatalogueRead> {
    caller = structuredClone(caller);
    return await this.options.uow.run<CatalogueRead>(async ({ stores }) => {
      const admitted = await this.resolve(caller);
      if (!admitted.ok) return { commit: false, value: admitted };
      const permission = await authorize(
        stores.accessDecisions,
        caller.principal,
        { kind: 'organization', organizationId: admitted.organizationId },
        'organization.read',
      );
      if (!permission.ok) return { commit: false, value: permission };
      const catalogue = await stores.stepCatalogue.readCatalogue(admitted.organizationId);
      if (catalogue === null) throw new Error('admitted catalogue organization disappeared');
      return { commit: false, value: { ok: true, catalogue } };
    });
  }

  /**
   * Reads selected-type provenance on the admitted actual project chain, including empty projects.
   * A readable child exposes only the project shell: without project.read, refuses forbidden
   * before type lookup. Unrelated readable children never expose a hidden project.
   */
  async readProjectSteps(
    caller: ProjectCaller,
    projectId: string,
    typeId?: string,
  ): Promise<CatalogueProjectSteps> {
    caller = structuredClone(caller);
    return await this.options.uow.run<CatalogueProjectSteps>(async ({ stores }) => {
      const admitted = await this.resolve(caller);
      if (!admitted.ok) return { commit: false, value: admitted };
      const project = await this.admitProject(stores, caller, admitted.organizationId, projectId);
      if (!project.ok) return { commit: false, value: project };
      const { target } = project;
      if (typeId !== undefined) {
        const types = await stores.directory.listInOrganization(
          'workItemTypes',
          admitted.organizationId,
        );
        // Proof: omitting type ownership admitted a foreign type as200instead of404; exact restore passed (verification-project-step-read-20261119.json).
        if (!types.some((type) => type.id === typeId))
          return { commit: false, value: { ok: false, reason: 'not_found' } };
      }
      const catalogue = await stores.stepCatalogue.readCatalogue(admitted.organizationId);
      if (catalogue === null)
        throw new Error('admitted project catalogue organization disappeared');
      const bindings = projectCatalogueBindings(
        admitted.organizationId,
        catalogue.bindings,
        new Map(catalogue.definitions.map((definition) => [definition.id, definition])),
      );
      const steps = resolveSteps(
        target.chain,
        typeId === undefined ? { kind: 'untyped' } : { kind: 'typed', typeId },
        bindings,
      );
      return { commit: false, value: { ok: true, steps } };
    });
  }

  /** Reads protected usage after actual project admission; private children affect neither count nor response limit. */
  async readProjectUsage(
    caller: ProjectCaller,
    projectId: string,
    stepId: string,
  ): Promise<CatalogueProjectUsage> {
    caller = structuredClone(caller);
    return await this.options.uow.run<CatalogueProjectUsage>(async ({ stores }) => {
      const admitted = await this.resolve(caller);
      if (!admitted.ok) return { commit: false, value: admitted };
      const project = await this.admitProject(stores, caller, admitted.organizationId, projectId);
      if (!project.ok) return { commit: false, value: project };
      const { target, decisions } = project;
      const captured = await stores.stepCatalogue.readUsage(admitted.organizationId);
      if (captured === null) throw new Error('admitted usage organization disappeared');
      // Proof: bypassing project reachability admitted a foreign step as200/count0
      // instead of404; exact restore passed (verification-project-usage-read-20261119.json).
      if (
        !resolvePackageSteps(target.chain, captured.bindings).some((step) => step.stepId === stepId)
      )
        return { commit: false, value: { ok: false, reason: 'not_found' } };
      const readable = await decisions.readablePackageIds(
        caller.principal,
        admitted.organizationId,
      );
      const usage = projectReadableStepUsage(
        captured.packages,
        captured.bindings,
        captured.facts,
        projectId,
        stepId,
        readable,
      );
      return { commit: false, value: { ok: true, ...usage } };
    });
  }

  /** Reads revision and every typed/untyped mapping on the same admitted owner, including empty projects. */
  async readProjectManifest(
    caller: ProjectCaller,
    projectId: string,
  ): Promise<CatalogueProjectManifest> {
    caller = structuredClone(caller);
    return await this.options.uow.run<CatalogueProjectManifest>(async ({ stores }) => {
      const admitted = await this.resolve(caller);
      if (!admitted.ok) return { commit: false, value: admitted };
      const project = await this.admitProject(stores, caller, admitted.organizationId, projectId);
      if (!project.ok) return { commit: false, value: project };
      const manifest = await stores.stepCatalogue.readManifest(admitted.organizationId, projectId);
      if (manifest === null) throw new Error('admitted manifest project disappeared');
      return { commit: false, value: { ok: true, manifest } };
    });
  }

  /** Actual same-owner project admission shared by all catalogue reads; readable children expose only a shell. */
  private async admitProject(
    stores: PlanTransactionalStores,
    caller: ProjectCaller,
    organizationId: string,
    projectId: string,
  ): Promise<ProjectAdmission> {
    const target = await stores.settings.readTarget(
      { level: 'project', id: projectId },
      organizationId,
    );
    // Proof: this target refusal's prior project-step owner changed foreign404to500
    // when omitted (verification-project-step-read-20261119.json); extraction preserves the same target lookup.
    if (target === null) return { ok: false, reason: 'not_found' };
    const decisions = requireAccessDecisions(stores.accessDecisions);
    const permission = await authorize(decisions, caller.principal, target, 'project.read');
    // Proof: bypassing this shared denial published a manifest as200to a package-only
    // reader instead of403; exact restore passed (verification-project-manifest-20261119.json).
    if (!permission.ok) {
      if (permission.reason === 'not_found') {
        const readable = await decisions.readablePackageIds(caller.principal, organizationId);
        const children = await stores.settings.packageIds(target);
        // Proof: prior mounted shell owners caught visible403to404 and unrelated-child404to403;
        // exact restores are retained in verification-project-shell-read-20261119.json.
        if (children.some((id) => readable.has(id)))
          return { ok: false, reason: 'forbidden', permission: 'project.read' };
      }
      return permission;
    }
    return { ok: true, target, decisions };
  }

  async bind(caller: ProjectCaller, draft: CatalogueBindingDraft): Promise<CatalogueBound> {
    caller = structuredClone(caller);
    draft = structuredClone(draft);
    if (!caller.principal.scopes.includes('write'))
      return { ok: false, reason: 'insufficient_scope' };
    const stamp = retainSettingStamp(
      this.options.clock.stampFor(caller.principal.id),
      caller.principal.id,
    );
    const events: CommittedWorkPackageEvent[] = [];
    const outcome = await this.options.uow.run<CatalogueBound>(async (scope) => {
      const { stores } = scope;
      const admitted = await this.resolve(caller);
      if (!admitted.ok) return { commit: false, value: admitted };
      const permission = await this.admitScope(stores, caller, admitted.organizationId, draft);
      if (!permission.ok) return { commit: false, value: permission };
      const observation = this.observeWrite(scope, admitted.organizationId, events);
      const binding = {
        bindingId: this.options.clock.newId(),
        scopeKind: draft.scopeKind,
        scopeId: draft.scopeId,
        workItemTypeId: draft.workItemTypeId,
        position: draft.position,
      };
      if (draft.define !== undefined) {
        const name = cleanName(draft.define.name);
        if (name === null) return { commit: false, value: { ok: false, reason: 'name_required' } };
        if (!isStepCode(draft.define.code))
          return { commit: false, value: { ok: false, reason: 'invalid_code' } };
        if (isReservedStepCode(draft.define.code))
          return { commit: false, value: { ok: false, reason: 'reserved_code' } };
        const created = await stores.stepCatalogue.defineAndBindStep(
          admitted.organizationId,
          { ...draft.define, id: this.options.clock.newId(), name },
          binding,
          stamp,
          observation.beforeWrite,
        );
        if (!created.ok) return { commit: false, value: created };
        await observation.record(created.workPackageIds);
        return {
          commit: true,
          value: { ok: true, definition: created.definition, binding: created.binding },
        };
      }
      const bound = await stores.stepCatalogue.bindStep(
        admitted.organizationId,
        { ...binding, stepId: draft.stepId },
        stamp,
        observation.beforeWrite,
      );
      if (!bound.ok) return { commit: false, value: bound };
      await observation.record(bound.workPackageIds);
      return { commit: true, value: { ok: true, binding: bound.binding } };
    });
    if (events.length > 0) await this.options.delivery.deliverCommitted(events);
    return outcome;
  }

  async patch(
    caller: ProjectCaller,
    stepId: string,
    patch: StepDefinitionPatch,
  ): Promise<CataloguePatched> {
    caller = structuredClone(caller);
    patch = { ...patch };
    if (!caller.principal.scopes.includes('write'))
      return { ok: false, reason: 'insufficient_scope' };
    if (
      patch.name === undefined &&
      patch.defaultEstimateUnit === undefined &&
      patch.defaultAllowancePercent === undefined
    )
      return { ok: false, reason: 'invalid_body' };
    const stamp = retainSettingStamp(
      this.options.clock.stampFor(caller.principal.id),
      caller.principal.id,
    );
    const events: CommittedWorkPackageEvent[] = [];
    const outcome = await this.options.uow.run<CataloguePatched>(async (scope) => {
      const { stores } = scope;
      const admitted = await this.resolve(caller);
      if (!admitted.ok) return { commit: false, value: admitted };
      const permission = await authorize(
        stores.accessDecisions,
        caller.principal,
        { kind: 'organization', organizationId: admitted.organizationId },
        'organization.manage_settings',
      );
      if (!permission.ok) return { commit: false, value: permission };
      const observation = this.observeWrite(scope, admitted.organizationId, events);
      const name = patch.name === undefined ? undefined : cleanName(patch.name);
      if (name === null) return { commit: false, value: { ok: false, reason: 'name_required' } };
      const updated = await stores.stepCatalogue.patchStepDefinition(
        admitted.organizationId,
        stepId,
        { ...patch, ...(name === undefined ? {} : { name }) },
        stamp,
        observation.beforeWrite,
      );
      if (!updated.ok) return { commit: false, value: updated };
      await observation.record(updated.workPackageIds);
      return { commit: true, value: { ok: true, definition: updated.definition } };
    });
    if (events.length > 0) await this.options.delivery.deliverCommitted(events);
    return outcome;
  }

  async retire(caller: ProjectCaller, stepId: string): Promise<CatalogueRetired> {
    caller = structuredClone(caller);
    if (!caller.principal.scopes.includes('write'))
      return { ok: false, reason: 'insufficient_scope' };
    const stamp = retainSettingStamp(
      this.options.clock.stampFor(caller.principal.id),
      caller.principal.id,
    );
    return await this.options.uow.run<CatalogueRetired>(async ({ stores }) => {
      const admitted = await this.resolve(caller);
      if (!admitted.ok) return { commit: false, value: admitted };
      const permission = await authorize(
        stores.accessDecisions,
        caller.principal,
        { kind: 'organization', organizationId: admitted.organizationId },
        'organization.manage_settings',
      );
      if (!permission.ok) return { commit: false, value: permission };
      const retired = await stores.stepCatalogue.retireStepDefinition(
        admitted.organizationId,
        stepId,
        stamp,
      );
      return { commit: retired.ok, value: retired };
    });
  }

  /** Resolves scope permission and exact current binding membership under the same retained write loan. */
  async reorder(
    caller: ProjectCaller,
    bindingScope: StepScope,
    ids: readonly string[],
  ): Promise<CatalogueReordered> {
    caller = structuredClone(caller);
    bindingScope = { ...bindingScope };
    ids = [...ids];
    if (!caller.principal.scopes.includes('write'))
      return { ok: false, reason: 'insufficient_scope' };
    const stamp = retainSettingStamp(
      this.options.clock.stampFor(caller.principal.id),
      caller.principal.id,
    );
    const events: CommittedWorkPackageEvent[] = [];
    const outcome = await this.options.uow.run<CatalogueReordered>(async (scope) => {
      const { stores } = scope;
      const admitted = await this.resolve(caller);
      if (!admitted.ok) return { commit: false, value: admitted };
      const permission = await this.admitScope(
        stores,
        caller,
        admitted.organizationId,
        bindingScope,
      );
      // Proof: omitting denial made the mounted reader organization reorder return204instead of403; exact restore passed (verification-reorder-20261119.json).
      if (!permission.ok) return { commit: false, value: permission };
      const observation = this.observeWrite(scope, admitted.organizationId, events);
      const changed = await stores.stepCatalogue.reorderBindings(
        admitted.organizationId,
        bindingScope,
        ids,
        stamp,
        observation.beforeWrite,
      );
      if (!changed.ok) return { commit: false, value: changed };
      await observation.record(changed.workPackageIds);
      return { commit: true, value: { ok: true } };
    });
    if (events.length > 0) await this.options.delivery.deliverCommitted(events);
    return outcome;
  }

  /** Resolve the binding's current scope and preview/remove it on the same serialized write loan. */
  async unbind(
    caller: ProjectCaller,
    bindingId: string,
    options: StepUnbindOptions,
  ): Promise<CatalogueUnbound> {
    caller = structuredClone(caller);
    options = { ...options };
    if (!caller.principal.scopes.includes('write'))
      return { ok: false, reason: 'insufficient_scope' };
    const stamp = retainSettingStamp(
      this.options.clock.stampFor(caller.principal.id),
      caller.principal.id,
    );
    const events: CommittedWorkPackageEvent[] = [];
    const outcome = await this.options.uow.run<CatalogueUnbound>(async (scope) => {
      const { stores } = scope;
      const admitted = await this.resolve(caller);
      if (!admitted.ok) return { commit: false, value: admitted };
      const catalogue = await stores.stepCatalogue.readCatalogue(admitted.organizationId);
      if (catalogue === null) throw new Error('admitted catalogue organization disappeared');
      const binding = catalogue.bindings.find((binding) => binding.bindingId === bindingId);
      if (binding === undefined)
        return { commit: false, value: { ok: false, reason: 'not_found' } };
      const permission = await this.admitScope(stores, caller, admitted.organizationId, binding);
      // Proof: omitting this denial made the mounted stored-scope unbind admission test return200 for a reader instead of403; exact restore passed (verification-unbind-20261119.json).
      if (!permission.ok) return { commit: false, value: permission };
      const observation = this.observeWrite(scope, admitted.organizationId, events);
      const changed = await stores.stepCatalogue.unbindStep(
        admitted.organizationId,
        bindingId,
        options,
        stamp,
        observation.beforeWrite,
      );
      switch (changed.kind) {
        case 'not_found':
          return { commit: false, value: { ok: false, reason: 'not_found' } };
        case 'step_nodes_in_use':
          return {
            commit: false,
            value: {
              ok: false,
              reason: 'step_nodes_in_use',
              count: changed.count,
              pairs: changed.pairs,
            },
          };
        case 'preview':
          return { commit: false, value: { ok: true, ...changed } };
        case 'unbound':
          await observation.record(changed.workPackageIds);
          return { commit: true, value: { ok: true, kind: 'unbound' } };
        default: {
          const impossible: never = changed;
          throw new Error('Unknown catalogue unbind outcome: ' + String(impossible));
        }
      }
    });
    if (events.length > 0) await this.options.delivery.deliverCommitted(events);
    return outcome;
  }

  /** Records both kinds of invalidation on the mutation's writer after capturing actual changes. */
  private observeWrite(scope: Scope, organizationId: string, events: CommittedWorkPackageEvent[]) {
    const { eventLog } = scope.stores;
    const now = () => this.options.delivery.now();
    let recordDependents: (() => Promise<readonly CommittedWorkPackageEvent[]>) | undefined;
    const beforeWrite: CatalogueWriteObservation = {
      async capture() {
        const capture = scope.fanoutCapture;
        // Proof: making absent capture optional committed the rename in the real Source write.
        if (capture === undefined) throw new Error('catalogue writer lacks dependency capture');
        const before = await capture.capture(organizationId);
        recordDependents = async () =>
          await recordCommittedFanout(eventLog, before, await capture.capture(organizationId), now);
      },
    };
    return {
      beforeWrite,
      async record(workPackageIds: readonly string[]) {
        for (const workPackageId of workPackageIds) {
          const event: WorkPackageEvent = { type: 'step_catalogue_changed' };
          const recorded = await eventLog.recordEvent(subscriptionFor(workPackageId), event, now());
          events.push({ workPackageId, event, recorded });
        }
        if (recordDependents !== undefined)
          for (const dependent of await recordDependents()) events.push(dependent);
      },
    };
  }

  private async resolve(caller: ProjectCaller) {
    const resolved = await this.options.commandAccess.resolve(caller);
    if (!resolved.ok) return resolved;
    if (resolved.access.kind === 'legacy')
      return { ok: false, refusal: 'no_active_organization' } as const;
    return { ok: true, organizationId: resolved.access.scope.organizationId } as const;
  }

  private async admitScope(
    stores: PlanTransactionalStores,
    caller: ProjectCaller,
    organizationId: string,
    scope: StepScope,
  ) {
    if (scope.scopeKind === 'project') {
      const target = await stores.settings.readTarget(
        { level: 'project', id: scope.scopeId },
        organizationId,
      );
      if (target === null) return { ok: false, reason: 'not_found' } as const;
      return await authorize(
        stores.accessDecisions,
        caller.principal,
        target,
        'project.manage_settings',
      );
    }
    const target =
      scope.scopeKind === 'space'
        ? await stores.settings.readTarget({ level: 'space', id: scope.scopeId }, organizationId)
        : await stores.settings.readTarget(
            { level: 'organization', id: scope.scopeId },
            organizationId,
          );
    if (target === null) return { ok: false, reason: 'not_found' } as const;
    return await authorize(
      stores.accessDecisions,
      caller.principal,
      { kind: 'organization', organizationId: target.chain.organizationId },
      scope.scopeKind === 'space' ? 'organization.manage_spaces' : 'organization.manage_settings',
    );
  }
}
