import type { CredentialPair } from '@wbs/contracts';
import type { PlanCommandKind } from '@wbs/contracts';
import { commandDefinitions } from '@wbs/contracts';
import type { ScopedDependencyEndpoint } from '@wbs/domain';

import type { ResourceAccess } from '../../ports/organization-access';
import type { PlanCommand } from '../../service/plan-command';
import type { ClaimRefusalOutcome } from '../work-item/claims';
import type {
  AppliedBase,
  AppliedCommand,
  MintedBase,
  PlanCommandServices,
  Refusal,
  ServiceRefusal,
} from './plan-commands.feature';

export type CommandFor<K extends PlanCommandKind> = PlanCommand & { kind: K };
export type AppliedFor<K extends PlanCommandKind> = AppliedCommand & { kind: K };
export type CommandBindings = {
  [K in PlanCommandKind]: (
    command: CommandFor<K>,
    context: CommandContext,
  ) => Promise<AppliedFor<K>>;
};

export function bindTypedEndpoint(
  endpoint: CommandFor<'addTypedDependency'>['predecessor'],
  context: CommandContext,
): ScopedDependencyEndpoint {
  // Proof: preserve-explicit-project bypass failed `mounted external authoring stays dormant`'s selected assertion
  // (actual SQLite boundary; watched 2026-10-22).
  const projectId = endpoint.projectId ?? context.requireProjectId();
  const workItemId = context.required(
    endpoint.workItemId,
    'workItemRef' in endpoint ? endpoint.workItemRef : undefined,
  );
  return endpoint.scope === 'whole'
    ? { scope: 'whole', projectId, workItemId }
    : { scope: endpoint.scope, projectId, workItemId, stepId: endpoint.stepId };
}

/** Stops one binding while retaining the command position and typed refusal. */
export class CommandRefused extends Error {
  constructor(
    readonly at: number,
    readonly kind: PlanCommandKind,
    readonly refusal: Refusal,
  ) {
    super(`${kind} at ${String(at)}: ${refusal.reason}`);
  }
}

/**
 * The batch-local authority shared by one command binding: actor and project,
 * ref lookup/minting, applied position, and service-refusal translation.
 */
export class CommandContext {
  constructor(
    readonly actorId: string,
    readonly projectId: string | null,
    readonly index: number,
    private readonly kind: PlanCommandKind,
    private readonly refs: Map<string, string>,
    /** The caller's organization access; directory commands write through it. */
    readonly access: ResourceAccess,
    /**
     * The request credential's upstream pair, or null for a first-party
     * session: what `claimWorkItem` reads the credential pin of (D6).
     */
    readonly credential: CredentialPair | null,
  ) {
    // Proof: removing registry-scope admission let a directory batch unfreeze a real plan row
    // and commit its preceding tag instead of refusing `project_required` at index 1.
    if (projectId === null && commandDefinitions[kind].scope === 'project') {
      this.refuse({ reason: 'project_required' });
    }
  }

  refuse(refusal: Refusal): never {
    throw new CommandRefused(this.index, this.kind, refusal);
  }

  requireProjectId(): string {
    if (this.projectId === null) this.refuse({ reason: 'project_required' });
    return this.projectId;
  }

  id(given: string | null | undefined, ref: string | undefined): string | null {
    if (ref !== undefined) {
      const minted = this.refs.get(ref);
      if (minted === undefined) this.refuse({ reason: 'unknown_ref' });
      return minted;
    }
    return given ?? null;
  }

  required(given: string | undefined, ref: string | undefined): string {
    const found = this.id(given, ref);
    if (found === null) this.refuse({ reason: 'missing_id' });
    return found;
  }

  ids(given: readonly string[] | undefined, named: readonly string[] | undefined): string[] {
    return [...(given ?? []), ...(named ?? []).map((ref) => this.required(undefined, ref))];
  }

  assertRefAvailable(ref: string | undefined): void {
    if (ref !== undefined && this.refs.has(ref)) this.refuse({ reason: 'duplicate_ref' });
  }

  mint(ref: string | undefined, created: string): MintedBase {
    if (ref !== undefined) {
      this.assertRefAvailable(ref);
      this.refs.set(ref, created);
    }
    return { index: this.index, ref, id: created };
  }

  plain(): AppliedBase {
    return { index: this.index };
  }

  accept(outcome: { ok: true } | ServiceRefusal): void {
    if (!outcome.ok) this.refuseOutcome(outcome);
  }

  value<T>(outcome: { ok: true; value: T } | ServiceRefusal): T {
    return outcome.ok ? outcome.value : this.refuseOutcome(outcome);
  }

  /** {@link value} for a claim or release, whose refusals carry their own detail. */
  claimValue<T>(outcome: { ok: true; value: T } | ServiceRefusal | ClaimRefusalOutcome): T {
    if (outcome.ok) return outcome.value;
    switch (outcome.reason) {
      case 'not_startable':
        return this.refuse({ reason: outcome.reason, detail: { status: outcome.status } });
      case 'step_done':
        return this.refuse({ reason: outcome.reason, detail: { stepIds: [...outcome.stepIds] } });
      case 'already_claimed':
        // Proof: with holders replaced by [], both orders of claim-race.db.test.ts
        // failed: the loser did not name the winner; watched 2026-10-19.
        return this.refuse({
          reason: outcome.reason,
          detail: { holders: outcome.holders.map((holder) => ({ ...holder })) },
        });
      case 'inside_subtree_claim':
      case 'overlaps_subtree_claim':
        return this.refuse({ reason: outcome.reason, detail: { holder: { ...outcome.holder } } });
      case 'below_declared_demand':
        return this.refuse({
          reason: outcome.reason,
          detail: {
            resourceId: outcome.resourceId,
            asked: outcome.asked,
            declared: outcome.declared,
          },
        });
      case 'below_held_occupancy':
        // Proof: with `held` replaced by 0, `refuses a later claim asking for
        // less than its leaf holds` (resource-occupancy.db.test.ts) failed on
        // both stores; watched 2026-10-20.
        return this.refuse({
          reason: outcome.reason,
          detail: { resourceId: outcome.resourceId, asked: outcome.asked, held: outcome.held },
        });
      case 'resources_exhausted':
        // Proof: with holders replaced by [], `refuses the ninth claim on 32 GB
        // naming the eight holders` (resource-occupancy.db.test.ts) named
        // nobody; watched 2026-10-20.
        return this.refuse({
          reason: outcome.reason,
          detail: {
            resourceId: outcome.resourceId,
            asked: outcome.asked,
            free: outcome.free,
            holders: outcome.holders.map((holder) => ({ ...holder })),
          },
        });
      case 'resources_on_subtree':
      case 'person_not_bound':
      case 'credential_not_for_person':
      case 'parent_claim_unknown':
      case 'parent_claim_foreign':
      case 'parent_claim_not_ancestor':
      case 'item_done':
      case 'no_steps':
      case 'steps_on_subtree':
      case 'not_claimed_by':
        return this.refuse({ reason: outcome.reason });
      default:
        return this.refuseOutcome(outcome);
    }
  }

  requireValue<T>(value: T | null, refusal: Refusal): T {
    if (value === null) this.refuse(refusal);
    return value;
  }

  private refuseOutcome(outcome: ServiceRefusal): never {
    if (
      outcome.reason === 'descendant_step_on_leaf' ||
      outcome.reason === 'node_on_parent' ||
      outcome.reason === 'referenced_by_external_dependency'
    ) {
      // Proof: bypassing this guard made the command-boundary negative throw
      // CommandRefused instead of naming absent relationship ids; watched 2026-09-27.
      if (outcome.dependencyIds === undefined)
        throw new Error('Endpoint refusal requires relationship ids');
      return this.refuse({
        reason: outcome.reason,
        detail: { dependencyIds: outcome.dependencyIds },
      });
    }
    if (outcome.reason === 'referenced_by_step_parallel') {
      // Proof: replacing nodes with [] failed the mounted exact 409 assertion, 2026-10-17.
      return this.refuse({
        reason: outcome.reason,
        detail: { nodes: outcome.nodes.map(({ workItemId, stepId }) => ({ workItemId, stepId })) },
      });
    }
    if (outcome.reason === 'destination_claimed' || outcome.reason === 'children_claimed') {
      return this.refuse({
        reason: outcome.reason,
        detail: { holders: outcome.holders.map((holder) => ({ ...holder })) },
      });
    }
    if (outcome.reason === 'taken') {
      return this.refuse({ reason: 'taken', detail: { name: outcome.name } });
    }
    if (outcome.reason === 'in_use') {
      // Proof: with the counts dropped here, `refuses removing a demanded resource,
      // naming 2 demands, 0 capacities, 0 occupancies` (resource-command.test.ts)
      // received no counts; watched 2026-10-20.
      return this.refuse(
        'counts' in outcome
          ? { reason: 'in_use', detail: { usage: outcome.usage, counts: outcome.counts } }
          : { reason: 'in_use', detail: { usage: outcome.usage } },
      );
    }
    if (outcome.reason === 'deadline_before_project_start') {
      // Proof: deleting this guard threw Malformed deadline refusal resolved in the runner negative.
      if (typeof outcome.workItemId !== 'string' || typeof outcome.projectDayZero !== 'string') {
        throw new Error('Deadline refusal requires work item and project day zero');
      }
      return this.refuse({
        reason: outcome.reason,
        detail: { workItemId: outcome.workItemId, projectDayZero: outcome.projectDayZero },
      });
    }
    return this.refuse({ reason: outcome.reason });
  }
}

type NamedDirectoryCreateKind = 'createTag' | 'createWorkItemType' | 'createService';
type NamedDirectoryPatchKind = 'patchTag' | 'patchWorkItemType' | 'patchService';
type NamedDirectoryDeleteKind = 'deleteTag' | 'deleteWorkItemType' | 'deleteService';

async function createDirectoryEntry<
  Kind extends NamedDirectoryCreateKind,
  Entity extends { id: string },
>(
  context: CommandContext,
  command: { kind: Kind; ref?: string; name: string },
  create: (actorId: string, name: string) => Promise<Entity | null>,
): Promise<MintedBase & { kind: Kind; entity: Entity }> {
  context.assertRefAvailable(command.ref);
  const entity = context.requireValue(await create(context.actorId, command.name), {
    reason: 'name_required',
  });
  return { ...context.mint(command.ref, entity.id), kind: command.kind, entity };
}

async function patchDirectoryEntry<Kind extends NamedDirectoryPatchKind, Entity>(
  context: CommandContext,
  command: { kind: Kind; name: string },
  id: string | undefined,
  ref: string | undefined,
  patch: (
    id: string,
    actorId: string,
    name: string,
  ) => Promise<{ ok: true; value: Entity } | ServiceRefusal>,
): Promise<AppliedBase & { kind: Kind; entity: Entity }> {
  const entity = context.value(
    await patch(context.required(id, ref), context.actorId, command.name),
  );
  return { ...context.plain(), kind: command.kind, entity };
}

async function deleteDirectoryEntry<Kind extends NamedDirectoryDeleteKind>(
  context: CommandContext,
  command: { kind: Kind; cascade?: boolean },
  id: string | undefined,
  ref: string | undefined,
  remove: (id: string, actorId: string, cascade: boolean) => Promise<{ ok: true } | ServiceRefusal>,
): Promise<AppliedBase & { kind: Kind }> {
  context.accept(
    await remove(context.required(id, ref), context.actorId, command.cascade ?? false),
  );
  return { ...context.plain(), kind: command.kind };
}

/** Builds one command handler per registry kind over the batch's admitted service graph. */
export function bindCommands(graph: PlanCommandServices): CommandBindings {
  const { workItems, directory, capacity, priorityBands } = graph;
  return {
    createWorkItem: async (command, context) => {
      // Proof: deferring this check until minting let the invalid parent reach the service first
      // and returned `not_found` instead of `duplicate_ref` for the second create.
      context.assertRefAvailable(command.ref);
      const created = context.value(
        await workItems.create(context.requireProjectId(), context.actorId, {
          parentId: context.id(command.parentId, command.parentRef),
          afterId: context.id(command.afterId, command.afterRef),
          ...(command.name === undefined ? {} : { name: command.name }),
          ...(command.notes === undefined ? {} : { notes: command.notes }),
          ...(command.priority === undefined ? {} : { priority: command.priority }),
        }),
      );
      return { ...context.mint(command.ref, created.id), kind: command.kind };
    },
    patchWorkItem: async (command, context) => {
      const { serviceRefs, tagRefs, teamRefs, typeRefs, ...patch } = command.patch;
      const resolved = {
        ...patch,
        ...(serviceRefs === undefined
          ? {}
          : { serviceIds: context.ids(patch.serviceIds, serviceRefs) }),
        ...(tagRefs === undefined ? {} : { tagIds: context.ids(patch.tagIds, tagRefs) }),
        ...(teamRefs === undefined ? {} : { teamIds: context.ids(patch.teamIds, teamRefs) }),
        ...(typeRefs === undefined ? {} : { typeIds: context.ids(patch.typeIds, typeRefs) }),
      };
      context.value(
        await workItems.patch(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          resolved,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    moveWorkItem: async (command, context) => {
      context.value(
        await workItems.move(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          {
            parentId: context.id(command.parentId, command.parentRef),
            afterId: context.id(command.afterId, command.afterRef),
          },
          context.access,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    duplicateWorkItem: async (command, context) => {
      context.assertRefAvailable(command.ref);
      const copy = context.value(
        await workItems.duplicate(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
        ),
      );
      return { ...context.mint(command.ref, copy.id), kind: command.kind };
    },
    deleteWorkItem: async (command, context) => {
      context.value(
        await workItems.remove(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.strategy ?? null,
          context.access,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    setEstimate: async (command, context) => {
      context.value(
        await workItems.setEstimate(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
          command.days,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    clearEstimate: async (command, context) => {
      context.value(
        await workItems.clearEstimate(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    setActual: async (command, context) => {
      context.value(
        await workItems.setActual(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
          command.days,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    clearActual: async (command, context) => {
      context.value(
        await workItems.clearActual(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    setProgress: async (command, context) => {
      context.value(
        await workItems.setProgress(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
          command.state,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    setStepBlocked: async (command, context) => {
      context.value(
        await workItems.setStepBlocked(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
          command.isBlocked,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    clearProgress: async (command, context) => {
      context.value(
        await workItems.clearProgress(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    startAttempt: async (command, context) => {
      context.value(
        await workItems.startAttempt(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
          {
            ...(command.at === undefined ? {} : { at: command.at }),
            ...(command.executorPersonId === undefined
              ? {}
              : { executorPersonId: command.executorPersonId }),
            ...(command.reference === undefined ? {} : { reference: command.reference }),
            ...(command.note === undefined ? {} : { note: command.note }),
          },
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    endAttempt: async (command, context) => {
      context.value(
        await workItems.endAttempt(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
          {
            outcome: command.outcome,
            ...(command.at === undefined ? {} : { at: command.at }),
            ...(command.reference === undefined ? {} : { reference: command.reference }),
            ...(command.note === undefined ? {} : { note: command.note }),
          },
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    removeAttempt: async (command, context) => {
      context.value(
        await workItems.removeAttempt(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
          command.attemptNumber,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    setStatus: async (command, context) => {
      context.value(
        await workItems.setStatus(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.status,
          command.on,
          command.factStart,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    setMeasure: async (command, context) => {
      context.value(
        await workItems.setMeasure(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
          command.metric,
          command.value,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    clearMeasure: async (command, context) => {
      context.value(
        await workItems.clearMeasure(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
          command.metric,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    setAssignee: async (command, context) => {
      context.value(
        await workItems.assign(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
          context.id(command.personId, command.personRef),
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    assignSubtree: async (command, context) => {
      context.value(
        await workItems.assignSubtree(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          command.stepId,
          context.id(command.personId, command.personRef),
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    claimWorkItem: async (command, context) => {
      const claimed = context.claimValue(
        await workItems.claim(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          {
            personId: context.required(command.personId, command.personRef),
            stepIds: command.steps ?? null,
            runId: command.runId ?? null,
            parentClaimId: command.parentClaim ?? null,
            assign: command.assign ?? false,
            resources: command.resources ?? null,
          },
          context.access,
          context.credential,
        ),
      );
      return {
        ...context.plain(),
        kind: command.kind,
        alreadyHeld: claimed.alreadyHeld,
        claimIds: [...claimed.claimIds],
        assignedStepIds: [...claimed.assignedStepIds],
        acquired: claimed.acquired.map((each) => ({ ...each })),
      };
    },
    releaseWorkItem: async (command, context) => {
      context.claimValue(
        await workItems.release(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          {
            personId: context.required(command.personId, command.personRef),
            stepIds: command.steps ?? null,
          },
          context.access,
          context.credential,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    addDependency: async (command, context) => {
      // Proof: routing this legacy command to addTypedDependency made `keeps legacy
      // addDependency semantics and stores no typed row` receive 404 instead of 200; watched 2026-09-27.
      context.value(
        await workItems.addDependency(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          context.required(command.predecessorId, command.predecessorRef),
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    removeDependency: async (command, context) => {
      context.value(
        await workItems.removeDependency(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          context.required(command.predecessorId, command.predecessorRef),
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    addTypedDependency: async (command, context) => {
      const id = context.value(
        await workItems.addTypedDependency(context.requireProjectId(), context.actorId, {
          predecessor: bindTypedEndpoint(command.predecessor, context),
          successor: bindTypedEndpoint(command.successor, context),
          type: command.type,
        }),
      );
      return { ...context.mint(undefined, id), kind: command.kind };
    },
    updateTypedDependency: async (command, context) => {
      context.value(
        await workItems.updateTypedDependency(
          context.requireProjectId(),
          context.actorId,
          command.dependencyId,
          {
            predecessor: bindTypedEndpoint(command.predecessor, context),
            successor: bindTypedEndpoint(command.successor, context),
            type: command.type,
          },
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    removeTypedDependency: async (command, context) => {
      context.value(
        await workItems.removeTypedDependency(
          context.requireProjectId(),
          context.actorId,
          command.dependencyId,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    arrangeBySchedule: async (command, context) => {
      context.value(await workItems.arrangeBySchedule(context.requireProjectId(), context.actorId));
      return { ...context.plain(), kind: command.kind };
    },
    freezeProject: async (command, context) => {
      context.value(await workItems.freeze(context.requireProjectId(), context.actorId));
      return { ...context.plain(), kind: command.kind };
    },
    unfreezeProject: async (command, context) => {
      context.value(await workItems.unfreezeProject(context.requireProjectId(), context.actorId));
      return { ...context.plain(), kind: command.kind };
    },
    unfreezeWorkItem: async (command, context) => {
      context.value(
        await workItems.unfreeze(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    setCapacity: async (command, context) => {
      context.value(
        await capacity.set(
          context.requireProjectId(),
          context.actorId,
          context.required(command.teamId, command.teamRef),
          command.size,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    setResourceCapacity: async (command, context) => {
      context.value(
        await capacity.setForResource(
          context.requireProjectId(),
          context.actorId,
          context.required(command.resourceId, command.resourceRef),
          command.units,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    setDemand: async (command, context) => {
      context.value(
        await workItems.setDemand(
          context.required(command.workItemId, command.workItemRef),
          context.actorId,
          context.required(command.resourceId, command.resourceRef),
          command.units,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    setStepAllowance: async (command, context) => {
      context.value(
        await workItems.setStepAllowance(
          context.requireProjectId(),
          context.actorId,
          command.stepId,
          command.allowancePercent,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    setPriorityBands: async (command, context) => {
      context.value(
        await priorityBands.set(context.requireProjectId(), context.actorId, command.bands),
      );
      return { ...context.plain(), kind: command.kind };
    },
    createTeam: async (command, context) => {
      context.assertRefAvailable(command.ref);
      const team = context.requireValue(
        await directory.addWithin('teams', context.actorId, command.name, context.access),
        { reason: 'name_required' },
      );
      return {
        ...context.mint(command.ref, team.id),
        kind: command.kind,
        entity: team,
      };
    },
    patchTeam: async (command, context) => {
      const team = context.value(
        await directory.patchTeamWithin(
          context.required(command.teamId, command.teamRef),
          context.actorId,
          command.patch,
          context.access,
        ),
      );
      return { ...context.plain(), kind: command.kind, entity: team };
    },
    deleteTeam: async (command, context) => {
      context.accept(
        await directory.removeWithin(
          'teams',
          context.required(command.teamId, command.teamRef),
          context.actorId,
          command.cascade ?? false,
          context.access,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    createPerson: async (command, context) => {
      context.assertRefAvailable(command.ref);
      const person = context.value(
        await directory.addPersonWithin(
          context.actorId,
          command.name,
          context.ids(command.teamIds, command.teamRefs),
          context.access,
        ),
      );
      return {
        ...context.mint(command.ref, person.id),
        kind: command.kind,
        entity: person,
      };
    },
    patchPerson: async (command, context) => {
      const person = context.value(
        await directory.patchPersonWithin(
          context.required(command.personId, command.personRef),
          context.actorId,
          command.patch,
          context.access,
        ),
      );
      return { ...context.plain(), kind: command.kind, entity: person };
    },
    deletePerson: async (command, context) => {
      context.accept(
        await directory.removeWithin(
          'people',
          context.required(command.personId, command.personRef),
          context.actorId,
          command.cascade ?? false,
          context.access,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
    createTag: (command, context) =>
      createDirectoryEntry(context, command, (actorId, name) =>
        directory.addWithin('tags', actorId, name, context.access),
      ),
    patchTag: (command, context) =>
      patchDirectoryEntry(context, command, command.tagId, command.tagRef, (id, actorId, name) =>
        directory.renameWithin('tags', id, actorId, name, context.access),
      ),
    deleteTag: (command, context) =>
      deleteDirectoryEntry(
        context,
        command,
        command.tagId,
        command.tagRef,
        (id, actorId, cascade) =>
          directory.removeWithin('tags', id, actorId, cascade, context.access),
      ),
    createWorkItemType: (command, context) =>
      createDirectoryEntry(context, command, (actorId, name) =>
        directory.addWithin('workItemTypes', actorId, name, context.access),
      ),
    patchWorkItemType: (command, context) =>
      patchDirectoryEntry(context, command, command.typeId, command.typeRef, (id, actorId, name) =>
        directory.renameWithin('workItemTypes', id, actorId, name, context.access),
      ),
    deleteWorkItemType: (command, context) =>
      deleteDirectoryEntry(
        context,
        command,
        command.typeId,
        command.typeRef,
        (id, actorId, cascade) =>
          directory.removeWithin('workItemTypes', id, actorId, cascade, context.access),
      ),
    createService: (command, context) =>
      createDirectoryEntry(context, command, (actorId, name) =>
        directory.addWithin('services', actorId, name, context.access),
      ),
    patchService: (command, context) =>
      patchDirectoryEntry(
        context,
        command,
        command.serviceId,
        command.serviceRef,
        (id, actorId, name) =>
          directory.renameWithin('services', id, actorId, name, context.access),
      ),
    deleteService: (command, context) =>
      deleteDirectoryEntry(
        context,
        command,
        command.serviceId,
        command.serviceRef,
        (id, actorId, cascade) =>
          directory.removeWithin('services', id, actorId, cascade, context.access),
      ),
    createResource: async (command, context) => {
      context.assertRefAvailable(command.ref);
      const resource = context.value(
        await directory.addResourceWithin(
          context.actorId,
          { name: command.name, kind: command.resourceKind, unitLabel: command.unitLabel },
          context.access,
        ),
      );
      return { ...context.mint(command.ref, resource.id), kind: command.kind, entity: resource };
    },
    patchResource: async (command, context) => {
      const resource = context.value(
        await directory.patchResourceWithin(
          context.required(command.resourceId, command.resourceRef),
          context.actorId,
          command.patch,
          context.access,
        ),
      );
      return { ...context.plain(), kind: command.kind, entity: resource };
    },
    deleteResource: async (command, context) => {
      context.accept(
        await directory.removeResourceWithin(
          context.required(command.resourceId, command.resourceRef),
          context.actorId,
          command.cascade ?? false,
          context.access,
        ),
      );
      return { ...context.plain(), kind: command.kind };
    },
  };
}

/** Calls the binding selected by the command's own discriminator. */
export function applyCommand<K extends PlanCommandKind>(
  bindings: CommandBindings,
  command: CommandFor<K>,
  context: CommandContext,
): Promise<AppliedFor<K>> {
  return bindings[command.kind](command, context);
}
