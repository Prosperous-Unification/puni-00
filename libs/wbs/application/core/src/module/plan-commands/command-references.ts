import type { OrganizationScope } from '@wbs/domain';

import type { DirectoryCatalog } from '../../ports/directory-values';
import type { ProjectCrossReferenceKind } from '../../ports/project-values';
import type { PlanCommand } from '../../service/plan-command';
import type { DirectoryRefusal, MeasureRefusalReason } from '../directory/directory.resource';
import type { WorkItemRefusal } from '../work-item/work-item.resource';
import type { CommandContext } from './command-bindings';
import type { PlanCommandServices } from './plan-command-graph';

export type PlainReason =
  | Exclude<
      WorkItemRefusal,
      | 'deadline_before_project_start'
      | 'descendant_step_on_leaf'
      | 'node_on_parent'
      | 'mixed_rate_cards'
    >
  | DirectoryRefusal
  | MeasureRefusalReason
  | 'calendar_range'
  | 'too_many_commands'
  | 'project_required'
  | 'unknown_ref'
  | 'missing_id'
  | 'person_required'
  | 'duplicate_ref';
/**
 * Refuses a command naming a row or step outside the project, for the
 * references a command can name without leaving them in the project's final
 * state — a removed dependency's predecessor, a cleared value's step, a
 * placement's parent or sibling — which the closure check after the command
 * would never see — and a capacity's team, which a cleared capacity leaves
 * nowhere at all.
 */
export async function refuseForeignReferences(
  graph: PlanCommandServices,
  projectId: string,
  command: PlanCommand,
  context: CommandContext,
  scope: OrganizationScope,
): Promise<void> {
  const named = (id: unknown, ref: unknown): string | null =>
    context.id(typeof id === 'string' ? id : undefined, typeof ref === 'string' ? ref : undefined);
  const rows = [
    'predecessorId' in command || 'predecessorRef' in command
      ? named(
          'predecessorId' in command ? command.predecessorId : undefined,
          'predecessorRef' in command ? command.predecessorRef : undefined,
        )
      : null,
    'parentId' in command || 'parentRef' in command
      ? named(
          'parentId' in command ? command.parentId : undefined,
          'parentRef' in command ? command.parentRef : undefined,
        )
      : null,
    'afterId' in command || 'afterRef' in command
      ? named(
          'afterId' in command ? command.afterId : undefined,
          'afterRef' in command ? command.afterRef : undefined,
        )
      : null,
  ];
  // Proof: skipping this check made `refuses a foreign predecessor, parent,
  // sibling and step even where the final state would not show it` in
  // `command-organization.controller.db.test.ts` answer 200 instead of 404
  // for the removed foreign dependency; watched 2026-09-27.
  // Proof (2026-10-16 extraction): replacing this guard with false made the
  // same mounted SQLite test accept removeDependency with a foreign predecessor
  // (200 instead of 404 not_found); restoring the extracted guard passes.
  for (const id of rows) {
    if (id !== null && !(await graph.workItems.hasWorkItemInProject(projectId, id))) {
      context.refuse({ reason: 'not_found' });
    }
  }
  // Proof: skipping this check made `refuses clearing a foreign team's
  // capacity as it refuses an absent team's` in
  // `command-organization.controller.db.test.ts` answer 200 instead of 404;
  // watched 2026-09-27.
  // Proof: skipping this check made `refuses a foreign directory id exactly as
  // an absent one, before anything is written` in
  // `command-organization.controller.db.test.ts` answer `unknown_tag` for a
  // foreign team beside an absent tag and `unknown_team` for an absent team
  // beside it, telling the two apart; watched 2026-09-27.
  for (const [catalog, ids, reason] of directoryReferencesOf(command, context)) {
    if (ids.length === 0) continue;
    const owned = new Set(
      (await graph.directory.listWithin(catalog, { kind: 'scoped', scope })).map(
        (entry) => entry.id,
      ),
    );
    if (ids.some((id) => !owned.has(id))) context.refuse({ reason });
  }
  if (command.kind === 'setCapacity') {
    const teamId = context.required(command.teamId, command.teamRef);
    const owned = await graph.directory.listWithin('teams', {
      kind: 'scoped',
      scope,
    });
    // `not_found`, the answer the capacity service gives a team nobody holds.
    if (!owned.some((team) => team.id === teamId)) context.refuse({ reason: 'not_found' });
  }
  // Proof: skipping this check made `refuses a foreign resource exactly as an
  // absent one` (resource-organization.controller.db.test.ts) answer 200 to a
  // clear naming B's resource from A's plan, where the closure check afterwards
  // has nothing to see; watched 2026-10-20.
  if (command.kind === 'setResourceCapacity' || command.kind === 'setDemand') {
    const resourceId = context.required(command.resourceId, command.resourceRef);
    const owned = await graph.directory.listWithin('resources', { kind: 'scoped', scope });
    if (!owned.some((resource) => resource.id === resourceId))
      context.refuse({ reason: 'unknown_resource' });
  }
  // Proof: skipping this check made `refuses a claim asking for a foreign
  // resource exactly as an absent one` (resource-organization.controller.db.test.ts)
  // tell B's resource from an absent one; watched 2026-10-20.
  if (command.kind === 'claimWorkItem' && command.resources !== undefined) {
    const owned = new Set(
      (await graph.directory.listWithin('resources', { kind: 'scoped', scope })).map(
        (resource) => resource.id,
      ),
    );
    if (command.resources.some(({ resourceId }) => !owned.has(resourceId)))
      context.refuse({ reason: 'unknown_resource' });
  }
  // Proof: skipping the step check alone made the same test answer 200 instead
  // of 404 `unknown_step` for the foreign-step `clearEstimate`; watched
  // 2026-09-27.
  if (
    (command.kind === 'claimWorkItem' || command.kind === 'releaseWorkItem') &&
    command.steps !== undefined
  ) {
    for (const stepId of command.steps) {
      if (!(await graph.workItems.hasStepInProject(projectId, stepId)))
        context.refuse({ reason: 'unknown_step' });
    }
  }
  if (
    'stepId' in command &&
    typeof command.stepId === 'string' &&
    !(await graph.workItems.hasStepInProject(projectId, command.stepId))
  ) {
    context.refuse({ reason: 'unknown_step' });
  }
}

/**
 * The directory entries a project command names, refs resolved, each with the
 * refusal an entry nobody holds already earns. Checked before the command runs:
 * the services validate these globally, so a foreign id would otherwise be
 * told apart from an absent one, and a label a patch sets and then drops (a
 * `serviceTeamId` beside `teamRefs: []`) would leave nothing for the closure.
 */
function directoryReferencesOf(
  command: PlanCommand,
  context: CommandContext,
): [DirectoryCatalog, readonly string[], PlainReason][] {
  // Proof: with `assignSubtree` dropped here and the batch's crossing check
  // also skipping `assignment_person`, the `assignSubtree` row of `refuses a
  // foreign service, team, tag, type, person and predecessor, all or none`
  // (command-organization.controller.db.test.ts) answered 200 instead of 404;
  // either guard alone keeps it 404 (two layers); watched 2026-10-20.
  if (command.kind === 'setAssignee' || command.kind === 'assignSubtree') {
    const person = context.id(command.personId, command.personRef);
    return [['people', person === null ? [] : [person], 'unknown_person']];
  }
  if (command.kind === 'claimWorkItem' || command.kind === 'releaseWorkItem') {
    // A defaulted claimant (`CommandContext.claimant`) is not checked here: it is the
    // credential's own agent, in the organization by issuance and the immutable-ownership trigger.
    const person = context.id(command.personId, command.personRef);
    return [['people', person === null ? [] : [person], 'unknown_person']];
  }
  if (command.kind === 'startAttempt') {
    const executor = command.executorPersonId;
    return [['people', executor === undefined ? [] : [executor], 'unknown_person']];
  }
  if (command.kind !== 'patchWorkItem') return [];
  const { patch } = command;
  const teams = context.ids(patch.teamIds, patch.teamRefs);
  if (patch.serviceTeamId !== undefined && patch.serviceTeamId !== null) {
    teams.push(patch.serviceTeamId);
  }
  return [
    ['teams', teams, 'unknown_team'],
    ['tags', context.ids(patch.tagIds, patch.tagRefs), 'unknown_tag'],
    ['services', context.ids(patch.serviceIds, patch.serviceRefs), 'unknown_service'],
    ['workItemTypes', context.ids(patch.typeIds, patch.typeRefs), 'unknown_type'],
    ['externalSystems', (patch.externalRefs ?? []).map((each) => each.systemId), 'unknown_system'],
  ];
}

/** The refusal a command earns for leaving the project referencing `kind` outside it. */
export function crossingRefusal(kind: ProjectCrossReferenceKind): PlainReason {
  switch (kind) {
    case 'estimate_step':
    case 'actual_step':
    case 'step_progress_step':
    case 'step_measure_step':
    case 'measure_estimate_step':
    case 'step_node_attempt_step':
    case 'assignment_step':
      return 'unknown_step';
    case 'assignment_person':
    case 'claim_person':
    case 'step_node_attempt_person':
      return 'unknown_person';
    case 'work_item_tag':
      return 'unknown_tag';
    case 'work_item_team':
    case 'work_item_service_team':
    case 'project_team_capacity':
      return 'unknown_team';
    case 'work_item_type':
      return 'unknown_type';
    case 'work_item_service_link':
    case 'work_item_service':
      return 'unknown_service';
    case 'work_item_external_ref':
      return 'unknown_system';
    case 'project_resource_capacity':
    case 'work_item_resource_demand':
    case 'claim_occupancy_resource':
      return 'unknown_resource';
    case 'work_item_parent':
    case 'dependency_endpoint':
    case 'incoming_step_row':
    case 'incoming_parent':
    case 'incoming_dependency':
      return 'not_found';
  }
}
