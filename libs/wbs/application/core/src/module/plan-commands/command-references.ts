import type { DirectoryCatalog } from '../../ports/directory-values';
import type { ResourceAccess } from '../../ports/organization-access';
import type { WorkPackageCrossReferenceKind } from '../../ports/work-package-values';
import type { PlanCommand } from '../../service/plan-command';
import type { DirectoryRefusal, MeasureRefusalReason } from '../directory/directory.resource';
import type { WorkItemRefusal } from '../work-item/work-item.resource';
import type { CommandContext } from './command-bindings';
import type { PlanCommandServices } from './plan-command-graph';

export type PlainReason =
  | Exclude<
      WorkItemRefusal,
      | 'deadline_before_work_package_start'
      | 'descendant_step_on_leaf'
      | 'node_on_parent'
      | 'referenced_by_external_dependency'
      | 'mixed_rate_cards'
    >
  | DirectoryRefusal
  | MeasureRefusalReason
  | 'calendar_range'
  | 'too_many_commands'
  | 'work_package_required'
  | 'unknown_ref'
  | 'missing_id'
  | 'person_required'
  | 'duplicate_ref'
  | 'last_super_admin';
/**
 * Checks references under an already admitted scoped command owner. Absent and
 * foreign identities stay opaque; owned leaf targets require current type/binding
 * applicability. Package allowance has no work-item target, and a subtree parent
 * remains an aggregate whose service admits the affected leaves.
 *
 * Cleared values, removed dependencies and old placements may leave no reference
 * for the post-command closure to inspect, so admission precedes mutation.
 *
 * @throws a modeled command refusal for invalid references or applicability;
 * unexpected Source/store failures propagate.
 */
export async function validateReferences(
  graph: PlanCommandServices,
  workPackageId: string,
  command: PlanCommand,
  context: CommandContext,
  access: Extract<ResourceAccess, { kind: 'scoped' }>,
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
    if (id !== null && !(await graph.workItems.hasWorkItemInWorkPackage(workPackageId, id))) {
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
      (await graph.directory.listWithin(catalog, access)).map((entry) => entry.id),
    );
    if (ids.some((id) => !owned.has(id))) context.refuse({ reason });
  }
  if (command.kind === 'setCapacity') {
    const teamId = context.required(command.teamId, command.teamRef);
    const owned = await graph.directory.listWithin('teams', access);
    // `not_found`, the answer the capacity service gives a team nobody holds.
    if (!owned.some((team) => team.id === teamId)) context.refuse({ reason: 'not_found' });
  }
  // Proof: skipping this check made `refuses a foreign resource exactly as an
  // absent one` (resource-organization.controller.db.test.ts) answer 200 to a
  // clear naming B's resource from A's plan, where the closure check afterwards
  // has nothing to see; watched 2026-10-20.
  if (command.kind === 'setResourceCapacity' || command.kind === 'setDemand') {
    const resourceId = context.required(command.resourceId, command.resourceRef);
    const owned = await graph.directory.listWithin('resources', access);
    if (!owned.some((resource) => resource.id === resourceId))
      context.refuse({ reason: 'unknown_resource' });
  }
  // Proof: skipping this check made `refuses a claim asking for a foreign
  // resource exactly as an absent one` (resource-organization.controller.db.test.ts)
  // tell B's resource from an absent one; watched 2026-10-20.
  if (command.kind === 'claimWorkItem' && command.resources !== undefined) {
    const owned = new Set(
      (await graph.directory.listWithin('resources', access)).map((resource) => resource.id),
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
      if (!(await graph.workItems.hasStepInWorkPackage(workPackageId, stepId)))
        context.refuse({ reason: 'unknown_step' });
    }
  }
  // Proof: omitting this dispatch accepted an inapplicable measure clear and
  // persisted the preceding rename/history. Restoring the seven-kind list
  // misclassified clearMeasure as404 instead of422. Removing the package-only
  // exemption refused lawful allowance400 instead of200. Current point command
  // and package controls, current-step-applicability.controller.db.test.ts, 2026-11-20.
  if ('stepId' in command && command.kind !== 'setStepAllowance') {
    const workItemId = context.required(command.workItemId, command.workItemRef);
    const target = await graph.workItems.stepTarget(workPackageId, workItemId, command.stepId);
    // Proof: identity-only refusal admitted the inapplicable clear and its
    // preceding rename; ignoring type_conflict admitted the authored-conflict
    // clear,200 instead of409. Actual frames/HTTP checked in the current pair
    // rollback and conflict cases (current-step-applicability.controller.db.test.ts, 2026-11-20).
    // Proof: refusing rolled_up blocked actual parent subtree assignment409
    // instead of200; the healthy command writes its two observed children and
    // leaf replacement preserves the sibling (current-step-applicability.controller.db.test.ts, 2026-11-20).
    if (target.kind !== 'resolved' && target.kind !== 'rolled_up')
      context.refuse({ reason: target.kind });
  }
  if (
    command.kind !== 'setEstimate' &&
    'stepId' in command &&
    typeof command.stepId === 'string' &&
    !(await graph.workItems.hasStepInWorkPackage(workPackageId, command.stepId))
  ) {
    context.refuse({ reason: 'unknown_step' });
  }
}

/**
 * The directory entries a work package command names, refs resolved, each with the
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

/** The refusal a command earns for leaving the work package referencing `kind` outside it. */
export function crossingRefusal(kind: WorkPackageCrossReferenceKind): PlainReason {
  switch (kind) {
    case 'estimate_step':
    case 'actual_step':
    case 'step_progress_step':
    case 'step_measure_step':
    case 'measure_estimate_step':
    case 'step_node_attempt_step':
    case 'assignment_step':
    case 'step_node_attempt_issued_step':
    case 'claim_step':
    case 'step_blockage_step':
    case 'step_parallel_step':
    case 'typed_dependency_step':
    case 'external_dependency_step':
      return 'unknown_step';
    case 'assignment_person':
    case 'claim_person':
    case 'step_node_attempt_person':
      return 'unknown_person';
    case 'work_item_tag':
      return 'unknown_tag';
    case 'work_item_team':
    case 'work_item_service_team':
    case 'work_package_team_capacity':
      return 'unknown_team';
    case 'work_item_type':
      return 'unknown_type';
    case 'work_item_service_link':
    case 'work_item_service':
      return 'unknown_service';
    case 'work_item_external_ref':
      return 'unknown_system';
    case 'work_package_resource_capacity':
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
