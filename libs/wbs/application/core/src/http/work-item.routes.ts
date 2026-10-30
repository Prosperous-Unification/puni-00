import {
  actingPersonOf,
  applyDirectoryCommands,
  applyProjectCommands,
  type AuthenticatedUser,
  commandParserRefusal,
  getStepReference,
  getWorkItem,
  getWorkItemRows,
  getWorkItems,
  measureDefinitionRow,
  PLAN_COMMAND_KINDS,
  type PlanCommandKind,
  readBudgetHeadroom,
  readClaimHistory,
  readPersonWork,
  readProjectClaims,
  readProjectResources,
  readStartableWork,
  redoProject,
  responseSchema,
  type SchemaShape,
  undoProject,
  validateSchema,
} from '@wbs/contracts';
import { type, ValidationError } from '@wbs/validation';

import type { ScopedUndoOutcome } from '../module/plan-commands/plan-commands.feature';
import type {
  AppliedCommand,
  BatchRefusal,
  PlanCommandRunner,
  WholeBatchRefusal,
} from '../module/plan-commands/plan-commands.feature';
import { runCommandBatch } from '../module/plan-commands/run-command-batch';
import { CLAIM_HISTORY_LIMIT } from '../module/work-item/claim-history';
import { readStepAddresses, resolveAddressedStep } from '../module/work-item/step-addresses';
import type { WorkItemService } from '../module/work-item/work-item.resource';
import type { Clock } from '../ports/clock';
import type { UndoStack } from '../ports/command-journal-store';
import type { CapacityReports } from '../ports/compute-providers';
import type { RefusedOrganizationAccess } from '../ports/organization-access';
import type { OrganizationAccess } from '../ports/organization-access';
import type { Digest } from '../ports/runtime';
import { CommandNormalizationError, normalizeCommand } from '../service/command-normalizers';
import { hasRepeatedKey, limitOf, pageQueryOf } from '../service/list-query';
import type { PlanCommand } from '../service/plan-command';
import { pageWorkItems, slicesByWorkItem, workItemPageQueryOf } from '../service/work-item-page';
import { BadCapacity } from './capacity-body';
import { withProviderReadings } from './compute-provider.routes';
import { bind, type HttpReply, type RequestFailure } from './endpoint';
import { organizationRefusal } from './organization-refusal';
import { BadLadder } from './priority-ladder-body';
import { isFieldBag } from './route';

export {
  MOST_CHARACTERS_IN_A_REF_NAME,
  MOST_REFS_ON_ONE_ITEM,
  MOST_SERVICES_ON_ONE_ITEM,
  MOST_TAGS_ON_ONE_ITEM,
  MOST_TEAMS_ON_ONE_ITEM,
  MOST_TYPES_ON_ONE_ITEM,
} from '../service/command-normalizers';

/**
 * Semantic interpretation preserves date/range/name refusals and command order.
 * The shared request declaration owns structural validation; this parser also
 * classifies rejected bodies without ever admitting them to a service call.
 */
class BadRequest extends Error {
  constructor(
    public readonly reason: string,
    /** Which command of a batch, where the body was one. */
    public readonly at?: number,
    /** That command's kind, where it named a known one. */
    public readonly kind?: string,
  ) {
    super(reason);
  }
}

/**
 * A JSON value this module may read named fields off, or a 400.
 *
 * Spelled with {@link isFieldBag} and **not** `typeof body !== 'object'`, which
 * is what it said until a probe measured the difference: `typeof [] ===
 * 'object'`, so the old spelling admitted an array where the `t.Object(...)`
 * schema it replaced refused one, and the cast to `Record<string, unknown>` it
 * needed was the tell.
 *
 * That was **not** only a comment. `{"kind":"patchWorkItem","workItemId":…,
 * "patch":[]}` answered **200** at this route: every field read `undefined` off
 * the array, `present()` dropped all of them, and an empty patch reached the
 * service as a no-op write and was journalled. The same spelling let a JSON
 * `[]` write a saved plan earlier on this branch. `a JSON array body on the
 * work-item routes` in `work-item.controller.test.ts` is the standing control.
 */
function asRecord(body: unknown): Record<string, unknown> {
  if (!isFieldBag(body)) throw new BadRequest('expected_object');
  return body;
}

/**
 * The caller's own undo stack on this project: the account, and the agent
 * person its machine or consent credential acts as. A consent principal acts as
 * its human's account, so the account alone would let the agent's undo pop the
 * human's browser edits.
 *
 * Proof: with `personId: null` here, four of the five cases of
 * `undo-acting-person.controller.db.test.ts` failed (1 pass, 4 fail), and
 * `undo and redo walk a consent agent's own stack` (work-item.routes.test.ts)
 * failed (1 pass, 1 fail); watched 2026-10-26.
 */
function undoStackOf(projectId: string, principal: AuthenticatedUser): UndoStack {
  return {
    projectId,
    userId: principal.id,
    personId: actingPersonOf(principal.authentication),
  };
}

/**
 * How an undo or a redo answers, in one place because the two routes must
 * answer identically.
 *
 * Both refusals are 409. Neither request is malformed and both would have
 * worked a moment earlier: an empty stack and a moved revision are states of
 * the plan, not faults in what was asked. `stale_undo` carries the `detail`
 * saying **which** row moved, because "that could not be undone" with no
 * reason is a dead end for the person reading it — the whole point of this
 * change is that a refusal says why out loud.
 */
// Proof: returning the whole value exposed private entryId in the direct undo/redo case.
function answerUndo(outcome: ScopedUndoOutcome): HttpReply<typeof undoProject> {
  if ('refusal' in outcome) return organizationRefusal(outcome);
  if ('error' in outcome) return { ok: false, status: 403, body: { error: outcome.error } };
  if (outcome.ok)
    return {
      ok: true,
      status: 200,
      body: { done: outcome.value.done, detail: outcome.value.detail },
    };
  switch (outcome.reason) {
    case 'forbidden':
      return { ok: false, status: 403, body: { error: outcome.reason } };
    case 'not_found':
      return { ok: false, status: 404, body: { error: outcome.reason } };
    case 'external_dependencies_inactive':
    case 'nothing_to_undo':
    case 'stale_undo':
      return { ok: false, status: 409, body: { error: outcome.reason, detail: outcome.detail } };
  }
}

/**
 * One command of a batch, validated exactly as the write it stands for was on
 * its own route — the same parsers, the same codes — with the batch's own
 * fields (`ref`, the `…Ref` names) checked beside them. This is the API's input
 * boundary for a batch; the services judge the rest, as they always did.
 *
 * @throws {BadRequest} carrying the command's index.
 */
function parseCommand(step: unknown, at: number): PlanCommand {
  if (typeof step !== 'object' || step === null) throw new BadRequest('expected_object', at);
  const raw = step as Record<string, unknown>;
  const kind = raw['kind'];
  if (typeof kind !== 'string' || !(PLAN_COMMAND_KINDS as readonly string[]).includes(kind)) {
    throw new BadRequest('unknown_kind', at);
  }
  try {
    return normalizeCommand(kind as PlanCommandKind, raw);
  } catch (cause) {
    // The parsers' own refusals, given the index; a schema refusal from the
    // estimate's arktype check is the code its route answered with.
    if (cause instanceof BadRequest) throw new BadRequest(cause.reason, at, kind);
    if (cause instanceof CommandNormalizationError) {
      throw new BadRequest(cause.reason, at, kind);
    }
    if (cause instanceof BadCapacity || cause instanceof BadLadder) {
      throw new BadRequest(cause.reason, at, kind);
    }
    if (cause instanceof ValidationError) throw new BadRequest('invalid_estimate', at, kind);
    throw cause;
  }
}

/**
 * A command batch as the wire carries it: an object with a `commands` list, each
 * command validated by {@link parseCommand}.
 *
 * @throws {BadRequest} with `at` set, so the answer names the command.
 */
function parseBatch(body: unknown): PlanCommand[] {
  const record = asRecord(body);
  const list = record['commands'];
  if (!Array.isArray(list)) throw new BadRequest('commands_must_be_a_list');
  return list.map((step, at) => parseCommand(step, at));
}

/** Unknown parser codes are malformed trusted translations, never invented wire refusals. */
async function requireShape<T>(schema: SchemaShape<T>, value: unknown): Promise<T> {
  const checked = await validateSchema(schema, value);
  if (checked.issues !== undefined)
    throw new Error(
      `Invalid command producer: ${checked.issues.map((issue) => issue.message).join('; ')}`,
    );
  return checked.value;
}

// Proof: omitting recognized kind returned500 instead of400 in the mounted classification case.
async function parserRefusal(
  error: unknown,
): Promise<Extract<HttpReply<typeof applyProjectCommands>, { ok: false }> | null> {
  if (error instanceof BadRequest) {
    const body =
      error.at === undefined
        ? { error: error.reason }
        : error.kind === undefined
          ? { error: error.reason, at: error.at }
          : { error: error.reason, at: error.at, kind: error.kind };
    return { ok: false, status: 400, body: await requireShape(commandParserRefusal, body) };
  }
  if (error instanceof ValidationError)
    return { ok: false, status: 400, body: { error: 'invalid_estimate' } };
  return null;
}

/**
 * Schema failure classification reuses semantic parsing but cannot admit a body.
 * Proof: bypassing classification returned invalid_body instead of the indexed
 * number_is_derived refusal in the mounted classification case.
 */
async function classifyCommand(
  failure: RequestFailure,
): Promise<Extract<HttpReply<typeof applyProjectCommands>, { ok: false }>> {
  if (failure.code === 'invalid_body') {
    try {
      parseBatch(failure.rejected);
    } catch (error) {
      const refusal = await parserRefusal(error);
      if (refusal !== null) return refusal;
      throw error;
    }
  }
  return { ok: false, status: 400, body: { error: failure.code } };
}

/**
 * Parsing stays before runner admission, so a later invalid command outranks the batch cap.
 * Proof: checking the cap in the mounted handler first made the index-200 case receive
 * `too_many_commands` instead of `invalid_actual`.
 */
async function parsedBatch(body: unknown) {
  try {
    return { ok: true, commands: parseBatch(body) } as const;
  } catch (error) {
    const refusal = await parserRefusal(error);
    if (refusal === null) throw error;
    return refusal;
  }
}

/** A batch refused whole under scoped access: the same 404 as an absent project, or 403. */
function answerWholeBatch(
  outcome: WholeBatchRefusal | RefusedOrganizationAccess,
): Extract<HttpReply<typeof applyProjectCommands>, { ok: false }> {
  if (outcome.refusal !== 'not_found' && outcome.refusal !== 'forbidden')
    return organizationRefusal(outcome);
  return outcome.refusal === 'not_found'
    ? { ok: false, status: 404, body: { error: 'not_found' } }
    : { ok: false, status: 403, body: { error: 'forbidden' } };
}

/** A finite status switch retains command detail; an unmodeled producer reason cannot acquire a default. */
function answerBatch(
  outcome: BatchRefusal,
): Extract<HttpReply<typeof applyProjectCommands>, { ok: false }> {
  const context = { at: outcome.at, kind: outcome.kind };
  switch (outcome.reason) {
    // Proof: dropping deadline detail returned500 instead of422 in the mounted runtime-refusal case.
    case 'deadline_before_project_start':
      return {
        ok: false,
        status: 422,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'calendar_range':
    case 'unsupported_relationship_type':
      return { ok: false, status: 422, body: { ...context, error: outcome.reason } };
    case 'taken':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'in_use':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    // Proof: grouping this nodes-detail case with dependencyIds cases produced
    // TS2322 in mounted scoped tsc; separation preserves exact mounted 409 nodes
    // without losing reason/detail correlation (watched 2026-10-17).
    case 'referenced_by_step_parallel':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'descendant_step_on_leaf':
    case 'node_on_parent':
    case 'referenced_by_external_dependency':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'forbidden':
      return { ok: false, status: 403, body: { ...context, error: outcome.reason } };
    case 'not_found':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    case 'unknown_step':
    case 'unknown_dependency':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    case 'unknown_measure':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    case 'unknown_person':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    case 'unknown_account':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    case 'unknown_team':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    case 'unknown_tag':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    case 'unknown_service':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    case 'unknown_type':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    case 'unknown_system':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    case 'unknown_resource':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    case 'unknown_provider':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    // The instance exists but is another organization's; naming it leaks
    // nothing the caller did not send (`compute-providers` P3).
    case 'provider_not_in_organization':
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    // The organization's own measure definitions stand in the way, or legacy
    // access has no legacy organization to own one (`wbs-measure-budgets`).
    // Proof (compile-time only): with these cases absent, wbs-core's typecheck
    // failed on TS2366 at this function, the switch no longer exhaustive;
    // watched 2026-10-23. No runtime observation exists: the code does not
    // build without them.
    case 'organization_required':
    case 'measure_key_taken':
    case 'measure_key_immutable':
    case 'measure_shape_immutable':
    case 'second_scheduling_measure':
    case 'scheduling_measure_fixed':
    case 'currency_required':
    case 'currency_forbidden':
    case 'unit_required':
    case 'measure_in_use':
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    // The resource's kind refuses the units whatever the plan holds.
    case 'exclusive_demand_is_one':
      return { ok: false, status: 422, body: { ...context, error: outcome.reason } };
    case 'cycle':
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    case 'arrangement_positions_unavailable':
    case 'dependency_calendar_missing':
    case 'schedule_not_ready':
      // A conflict, not a fault: the same request is accepted the moment the
      // solve lands. `refusal-status.ts` has the family's definition.
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    case 'engine_unavailable':
      // What the plan read answers for the same deployment, with the same code,
      // so a client meets one word for "this release has no optimizer".
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    case 'rolled_up':
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    case 'derived_measure':
    case 'scheduling_measure_fact':
    case 'scale_mismatch':
    case 'scheduling_measure_estimate':
    case 'three_point_forbidden':
    case 'scheduling_measure_budget':
    case 'rate_card_required':
    case 'rate_card_forbidden':
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    // Two rate cards a sum would add (`wbs-measure-budgets` D44), both named.
    case 'mixed_rate_cards':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'ancestor':
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    case 'self_node':
    case 'not_a_parent':
    case 'external_dependencies_inactive':
    case 'project_deleting':
    case 'duplicate_dependency':
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    case 'too_large':
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    case 'readiness_after_progress':
    case 'cannot_hold_done':
    case 'no_steps':
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    // A node's state stands in the way; the same command succeeds once it moves.
    case 'node_done':
    case 'attempt_running':
    case 'no_running_attempt':
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    // The instant itself is wrong against any plan state.
    case 'minutes_not_integer':
    case 'minutes_above_max':
    case 'invalid_estimate':
    case 'attempt_in_future':
    case 'attempt_ends_before_start':
      return { ok: false, status: 422, body: { ...context, error: outcome.reason } };
    case 'unknown_attempt':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    case 'too_many_commands':
      return { ok: false, status: 400, body: { ...context, error: outcome.reason } };
    case 'project_required':
      return { ok: false, status: 400, body: { ...context, error: outcome.reason } };
    case 'unknown_ref':
      return { ok: false, status: 400, body: { ...context, error: outcome.reason } };
    case 'missing_id':
      return { ok: false, status: 400, body: { ...context, error: outcome.reason } };
    case 'person_required':
      return { ok: false, status: 400, body: { ...context, error: outcome.reason } };
    case 'duplicate_ref':
      return { ok: false, status: 400, body: { ...context, error: outcome.reason } };
    case 'name_required':
      return { ok: false, status: 400, body: { ...context, error: outcome.reason } };
    case 'strategy_required':
      return { ok: false, status: 400, body: { ...context, error: outcome.reason } };
    case 'has_children':
      return { ok: false, status: 400, body: { ...context, error: outcome.reason } };
    case 'not_before_reason_needs_a_date':
      return { ok: false, status: 400, body: { ...context, error: outcome.reason } };
    case 'work_item_takes_one_type':
      return { ok: false, status: 400, body: { ...context, error: outcome.reason } };
    case 'invalid_kind':
      return { ok: false, status: 400, body: { ...context, error: outcome.reason } };
    case 'nothing_to_change':
      return { ok: false, status: 400, body: { ...context, error: outcome.reason } };
    // The caller may not act as the person, or under the parent claim, named.
    case 'person_not_bound':
    case 'credential_not_for_person':
    case 'run_mismatch':
    case 'parent_claim_foreign':
      return { ok: false, status: 403, body: { ...context, error: outcome.reason } };
    case 'parent_claim_unknown':
      return { ok: false, status: 404, body: { ...context, error: outcome.reason } };
    // The plan's state stands in the way; the same claim succeeds once it moves.
    case 'parent_claim_not_ancestor':
    case 'steps_on_subtree':
    case 'item_done':
    case 'not_claimed_by':
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    case 'not_startable':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'prerequisites_unmet':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'step_done':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'already_claimed':
    case 'destination_claimed':
    case 'children_claimed':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'inside_subtree_claim':
    case 'overlaps_subtree_claim':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    // The project's free units or the leaf's declared demand stand in the way
    // (`wbs-resources` R3, R4); a subtree claim acquires nothing to ask for.
    case 'resources_on_subtree':
      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };
    case 'below_declared_demand':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'below_held_occupancy':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'resources_exhausted':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    // The organization's cap stands in the way, like a claim's holder does;
    // the same command succeeds once an agent goes, a bound claim is released
    // or another project states less (`wbs-organization-limits` L9).
    case 'agent_person_limit':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'claim_limit':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'capacity_limit':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    // A strict budget stands in the way of the start; the same start is
    // admitted once a running attempt reports or ends, or the cap is raised
    // (`wbs-measure-budgets` D69).
    case 'budget_exhausted':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
  }
}
const namedEntity = responseSchema(type({ id: 'string', name: 'string' }));
/** A measure definition as `createMeasure` and `patchMeasure` answer it, every field required. */
const measureEntity = responseSchema(measureDefinitionRow);
// Proof: optional serviceIds admitted a patchTeam without memberships,200 instead of500 in the mounted results case.
const teamEntity = responseSchema(type({ id: 'string', name: 'string', serviceIds: 'string[]' }));
// Proof: optional person kind admitted its omission,200 instead of500 in the mounted results case.
const personEntity = responseSchema(
  type({ id: 'string', name: 'string', kind: "'person' | 'agent'" }),
);
// Proof: optional teamIds admitted a patchPerson without memberships,200 instead of500 in the mounted results case.
const personWithTeamsEntity = responseSchema(
  type({
    id: 'string',
    name: 'string',
    kind: "'person' | 'agent'",
    teamIds: 'string[]',
    accountId: 'string | null',
  }),
);

/**
 * Checks required fields while the producer kind exists, then returns the
 * unchanged untagged wire. Absent refs are omitted as JSON serialization did.
 * Proof: keeping kind added createTeam to the mounted result's exact wire
 * assertion. Keeping ref:undefined made the existing create/read case return500.
 */
async function appliedWire(applied: AppliedCommand) {
  const { kind, ref, ...wire } = applied;
  switch (kind) {
    case 'createWorkItem':
    case 'duplicateWorkItem':
    case 'addTypedDependency':
    case 'createTeam':
    case 'createPerson':
    case 'createTag':
    case 'createService':
    case 'createWorkItemType':
    case 'createMeasure':
      // Proof: removing this check admitted each missing minted id,200 instead of500 in the mounted minted-id case.
      if (typeof applied.id !== 'string')
        throw new Error('Created command producer requires its minted id');
  }
  switch (kind) {
    case 'patchTeam':
      await requireShape(teamEntity, applied.entity);
      break;
    case 'createPerson':
      await requireShape(personEntity, applied.entity);
      break;
    case 'patchPerson':
      await requireShape(personWithTeamsEntity, applied.entity);
      break;
    case 'createTeam':
    case 'createTag':
    case 'patchTag':
    case 'createService':
    case 'patchService':
    case 'createWorkItemType':
    case 'patchWorkItemType':
      await requireShape(namedEntity, applied.entity);
      break;
    case 'createMeasure':
    case 'patchMeasure':
      await requireShape(measureEntity, applied.entity);
      break;
  }
  return { ...wire, ...(ref === undefined ? {} : { ref }) };
}

/** Typed work-item endpoints; services retain transactions, access, sequencing and announcements. */
export function workItemRoutes(
  workItems: WorkItemService,
  commands: PlanCommandRunner,
  digest: Digest,
  organizations: OrganizationAccess,
  providers: {
    readonly reports: Pick<CapacityReports, 'readingsOf'>;
    readonly clock: Pick<Clock, 'now'>;
  },
) {
  return [
    bind(
      getWorkItems,
      async ({ params, principal, request }): Promise<HttpReply<typeof getWorkItems>> => {
        // `full=true` is the same dump; the mount already refused any other value
        // or key, and only a repeated key reaches here collapsed.
        // Proof, observed 2026-10-11: without this check, `refuses any other query
        // with 400` in `work-item-rows.controller.db.test.ts` answered 200 for
        // `full=true&full=true`.
        if (hasRepeatedKey(request.url))
          return { ok: false, status: 400, body: { error: 'invalid_query' } };
        // Proof: reading the tree without resolving access made `refuses an
        // unbound session and a removed member before any lookup` in
        // `schedule-organization.controller.db.test.ts` answer 200; watched
        // 2026-09-27.
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const tree = await workItems.treeWithin(params.id, resolved.access);
        if (tree === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        // Proof: removing this branch made the mounted unavailable work-item read
        // receive 500 instead of the required 409.
        // Proof: removing this mapping failed mounted revocation: expected 403 became 500.
        if ('kind' in tree && tree.kind === 'access_refused')
          return organizationRefusal(tree.refusal);
        if ('kind' in tree)
          return {
            ok: false,
            status: 409,
            body: { error: tree.error, engine: tree.engine },
          };
        return {
          ok: true,
          status: 200,
          body: {
            ...tree,
            ...(await workItems.undoState(undoStackOf(params.id, principal))),
            ...(await readStepAddresses(params.id, tree, digest)),
            // Proof: left out, `carries UTC by default and the patched zone
            // after a PATCH` (`step-node-attempt.controller.db.test.ts`) read
            // `undefined`; watched 2026-10-12.
            timezone: await workItems.timezoneOf(params.id),
          },
        };
      },
    ),
    bind(
      applyProjectCommands,
      async ({ params, body, principal }): Promise<HttpReply<typeof applyProjectCommands>> => {
        const parsed = await parsedBatch(body);
        if (!parsed.ok) return parsed;
        // Proof: running the batch without resolving access made `refuses an
        // unbound session and a removed member before any batch` in
        // `command-organization.controller.db.test.ts` answer 200; watched
        // 2026-09-27.
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const outcome = await runCommandBatch(commands, {
          projectId: params.id,
          actor: principal,
          commands: parsed.commands,
          access: resolved.access,
        });
        if ('error' in outcome) {
          return { ok: false, status: 403, body: { error: outcome.error } };
        }
        if ('refusal' in outcome) return answerWholeBatch(outcome);
        if (!outcome.ok) return answerBatch(outcome);
        return {
          ok: true,
          status: 200,
          body: {
            results: await Promise.all(outcome.results.map(appliedWire)),
            undoable: outcome.undoable,
            redoable: outcome.redoable,
          },
        };
      },
      { classifyRequestFailure: classifyCommand },
    ),
    bind(
      applyDirectoryCommands,
      async ({ body, principal }): Promise<HttpReply<typeof applyDirectoryCommands>> => {
        const parsed = await parsedBatch(body);
        if (!parsed.ok) return parsed;
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const outcome = await runCommandBatch(commands, {
          projectId: null,
          actor: principal,
          commands: parsed.commands,
          access: resolved.access,
        });
        if ('error' in outcome) {
          return { ok: false, status: 403, body: { error: outcome.error } };
        }
        if ('refusal' in outcome) return answerWholeBatch(outcome);
        if (!outcome.ok) return answerBatch(outcome);
        return {
          ok: true,
          status: 200,
          body: { results: await Promise.all(outcome.results.map(appliedWire)) },
        };
      },
      { classifyRequestFailure: classifyCommand },
    ),
    bind(undoProject, async ({ params, principal }): Promise<HttpReply<typeof undoProject>> => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      return answerUndo(await commands.undoWithin(params.id, principal, resolved.access));
    }),
    bind(redoProject, async ({ params, principal }): Promise<HttpReply<typeof redoProject>> => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      return answerUndo(await commands.redoWithin(params.id, principal, resolved.access));
    }),
    bind(
      getStepReference,
      async ({ params, query, principal }): Promise<HttpReply<typeof getStepReference>> => {
        // Proof: reading the addresses without resolving access made `refuses
        // an unbound session and a removed member before any lookup` in
        // `schedule-organization.controller.db.test.ts` answer 409 instead of
        // 403; watched 2026-09-27.
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const addresses = await workItems.readAddressesWithin(params.id, resolved.access);
        if (addresses === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        const outcome = await resolveAddressedStep(params.id, query, addresses, digest);
        if (outcome.kind === 'stale') {
          return {
            ok: false,
            status: 409,
            body: { error: 'stale_address_revision', addressRevision: outcome.addressRevision },
          };
        }
        if (outcome.kind === 'unresolvable') {
          return {
            ok: false,
            status: 422,
            body: { error: 'unresolvable_reference', reason: outcome.reason },
          };
        }
        return {
          ok: true,
          status: 200,
          body: {
            stepNodeId: outcome.stepNodeId,
            workItemId: outcome.workItemId,
            stepId: outcome.stepId,
            reference: outcome.reference,
          },
        };
      },
    ),
    bind(
      getWorkItemRows,
      async ({ params, query, request, principal }): Promise<HttpReply<typeof getWorkItemRows>> => {
        const common = pageQueryOf(query, request.url);
        const paged = common === null ? null : workItemPageQueryOf(common, query);
        // Proof, observed 2026-09-29: answering 200 here made `refuses every
        // value outside the grammar with 400` in
        // `work-item-rows.controller.db.test.ts` receive 200 for `limit=0`.
        if (paged === null) return { ok: false, status: 400, body: { error: 'invalid_query' } };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        // The whole tree through the caller's access before anything is
        // filtered, cut or given a cursor: a foreign project is 404 alike.
        // Proof, observed 2026-09-29: reading both with legacy access made
        // `answers a foreign project as not found` in
        // `work-item-rows.controller.db.test.ts` answer the foreign rows.
        const tree = await workItems.treeWithin(params.id, resolved.access);
        if (tree === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        if ('kind' in tree && tree.kind === 'access_refused')
          return organizationRefusal(tree.refusal);
        if ('kind' in tree)
          return { ok: false, status: 409, body: { error: tree.error, engine: tree.engine } };
        const instants = await workItems.updateInstantsWithin(params.id, resolved.access);
        if (instants === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        const page = pageWorkItems(tree, instants, paged);
        if (!page.ok)
          return page.refusal === 'stale_cursor'
            ? { ok: false, status: 409, body: { error: 'stale_cursor' } }
            : { ok: false, status: 404, body: { error: 'unknown_parent' } };
        return {
          ok: true,
          status: 200,
          body: {
            rows: page.rows,
            nextCursor: page.nextCursor,
            projectRevision: tree.projectRevision,
          },
        };
      },
    ),
    bind(
      readStartableWork,
      async ({
        params,
        query,
        request,
        principal,
      }): Promise<HttpReply<typeof readStartableWork>> => {
        // Proof: with this check removed, `refuses a repeated team and an
        // undeclared key` (startable-organization.controller.db.test.ts)
        // failed; watched 2026-10-19.
        if (hasRepeatedKey(request.url))
          return { ok: false, status: 400, body: { error: 'invalid_query' } };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const startable = await workItems.startableWithin(
          params.id,
          resolved.access,
          query.team ?? null,
        );
        if (startable === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        if ('kind' in startable) return { ok: false, status: 404, body: { error: startable.kind } };
        return { ok: true, status: 200, body: startable };
      },
    ),
    bind(
      readBudgetHeadroom,
      async ({
        params,
        query,
        request,
        principal,
      }): Promise<HttpReply<typeof readBudgetHeadroom>> => {
        // Proof: with this check removed, `refuses a repeated team and an
        // undeclared key` (budget-headroom.controller.db.test.ts) failed on
        // the repeated team; watched 2026-10-23.
        if (hasRepeatedKey(request.url))
          return { ok: false, status: 400, body: { error: 'invalid_query' } };
        // Proof: with legacy access in place of the resolved one, `refuses a
        // stranger exactly as the startable read does` and the team case
        // (budget-headroom.controller.db.test.ts) failed; watched 2026-10-23.
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const headroom = await workItems.budgetHeadroomWithin(
          params.id,
          resolved.access,
          query.team ?? null,
        );
        if (headroom === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        // Proof: with `not_found` answered here, `narrows to a team, and
        // refuses one the caller's organization does not hold` failed; watched 2026-10-23.
        if ('kind' in headroom) return { ok: false, status: 404, body: { error: headroom.kind } };
        return { ok: true, status: 200, body: headroom };
      },
    ),
    bind(
      readPersonWork,
      async ({ params, principal }): Promise<HttpReply<typeof readPersonWork>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const work = await workItems.personWorkWithin(params.id, resolved.access, params.personId);
        if (work === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        if ('kind' in work) return { ok: false, status: 404, body: { error: work.kind } };
        return { ok: true, status: 200, body: work };
      },
    ),
    bind(
      readProjectClaims,
      async ({ params, principal }): Promise<HttpReply<typeof readProjectClaims>> => {
        // Proof: reading without resolving access made `refuses a stranger
        // exactly as the tree read does`
        // (project-claims-organization.controller.db.test.ts) answer 200;
        // watched 2026-10-23.
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const claims = await workItems.claimsWithin(params.id, resolved.access);
        if (claims === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        if ('kind' in claims) return organizationRefusal(claims.refusal);
        return { ok: true, status: 200, body: claims };
      },
    ),
    bind(
      readClaimHistory,
      async ({
        params,
        query,
        request,
        principal,
      }): Promise<HttpReply<typeof readClaimHistory>> => {
        // A repeated `limit` would otherwise be read as its last value.
        // Proof: with this check removed, `refuses a limit outside 1 to 100 and
        // a repeated one` (claim-history-organization.controller.db.test.ts)
        // answered 200 for `limit=5&limit=6`; watched 2026-10-24.
        if (hasRepeatedKey(request.url))
          return { ok: false, status: 400, body: { error: 'invalid_query' } };
        const limit = limitOf(query.limit, CLAIM_HISTORY_LIMIT);
        // Proof: with this refusal removed, the same case answered `limit=0`
        // with 200; watched 2026-10-24.
        if (limit === null) return { ok: false, status: 400, body: { error: 'invalid_query' } };
        // Proof: reading with legacy access, unresolved, failed `refuses a
        // stranger exactly as the tree read does` and `refuses a removed
        // member alike with the tree read`
        // (claim-history-organization.controller.db.test.ts, 3 pass, 3 fail);
        // watched 2026-10-24.
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const events = await workItems.claimHistoryWithin(params.id, resolved.access, limit);
        if (events === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        return { ok: true, status: 200, body: { events } };
      },
    ),
    bind(
      readProjectResources,
      async ({ params, principal }): Promise<HttpReply<typeof readProjectResources>> => {
        // Proof: reading without resolving access made `refuses an unbound session
        // and a stranger alike` (resource-organization.controller.db.test.ts)
        // answer 200; watched 2026-10-20.
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const read = await workItems.resourcesWithin(params.id, resolved.access);
        if (read === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        // The provider columns are added after the planned read and never
        // reach it (`compute-providers` P4).
        // Proof: with this call replaced by the planned read alone, `sets,
        // reads and clears the reference` in
        // `compute-provider.controller.db.test.ts` read no providerId; watched
        // 2026-10-22.
        return {
          ok: true,
          status: 200,
          body: await withProviderReadings(read, providers.reports, providers.clock.now()),
        };
      },
    ),
    bind(getWorkItem, async ({ params, principal }): Promise<HttpReply<typeof getWorkItem>> => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const tree = await workItems.treeWithin(params.id, resolved.access);
      if (tree === null) return { ok: false, status: 404, body: { error: 'not_found' } };
      if ('kind' in tree && tree.kind === 'access_refused')
        return organizationRefusal(tree.refusal);
      if ('kind' in tree)
        return { ok: false, status: 409, body: { error: tree.error, engine: tree.engine } };
      const workItem = tree.workItems.find((candidate) => candidate.id === params.workItemId);
      const instants = await workItems.updateInstantsWithin(params.id, resolved.access);
      const updatedAt = instants?.get(params.workItemId);
      // Absent, foreign-project and deleted-since-the-tree work items answer alike.
      // Proof, observed 2026-09-29: reading with legacy access made `answers an
      // absent and a foreign work item alike` in
      // `work-item-rows.controller.db.test.ts` answer the foreign project's work item.
      if (workItem === undefined || updatedAt === undefined)
        return { ok: false, status: 404, body: { error: 'not_found' } };
      return {
        ok: true,
        status: 200,
        body: {
          workItem: {
            ...workItem,
            updatedAt,
            // Proof, observed 2026-09-29: answering every slice of the tree
            // made `answers one work item as the whole-tree read does, with its
            // own slices` receive another work item's slice.
            slices: slicesByWorkItem(tree.slices).get(workItem.id) ?? [],
          },
          projectRevision: tree.projectRevision,
        },
      };
    }),
  ] as const;
}
