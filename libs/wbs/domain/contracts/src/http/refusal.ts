import type { PlanCommandKind } from '../commands/definitions';
import type { mixedBases } from './work-item-response';

/**
 * Modeled HTTP failures; status/code pairing is narrowed by each endpoint shape.
 * A classified OIDC defect is the one modeled 500; thrown failures still bypass
 * endpoint replies and reach the adapter error boundary.
 */
export type RefusalStatus = 400 | 401 | 403 | 404 | 405 | 409 | 422 | 429 | 500 | 501 | 503;

/** Portable command discriminants, shared with runtime command refusal context. */
export type { PlanCommandKind } from '../commands/definitions';

/**
 * Existing parser messages enumerate their field callers, never arbitrary templates.
 * Proof (type boundary only): adding `${string}_must_be_an_id` makes the invalid
 * password-field fixture fail with TS2578. Production endpoint proof is pending.
 */
export type ParserRefusalCode =
  | 'expected_object'
  | 'number_is_derived'
  | 'externalRefs_must_be_a_list'
  | 'too_many_externalRefs'
  | 'externalRefs_entry_needs_a_systemId'
  | 'externalRefs_entry_needs_a_url'
  | 'externalRefs_entry_name_is_not_text'
  | 'externalRefs_entry_name_is_too_long'
  | 'invalid_actual'
  | 'invalid_measure'
  /** A `setBudget` cap or hold that is not a number at or above 0, or a policy outside the two. */
  | 'invalid_budget'
  /** A `rateCardDigest` that is not text of 1 to 128 characters. */
  | 'rateCardDigest_must_be_1_to_128_characters'
  | 'invalid_progress'
  /** An `endAttempt` outcome outside `ATTEMPT_OUTCOMES`. */
  | 'invalid_outcome'
  /** An attempt's `at` that is not a whole epoch millisecond from 0. */
  | 'at_must_be_an_instant'
  | 'invalid_status'
  | 'invalid_estimate'
  | 'conflicting_step_address'
  | 'invalid_step_node_id'
  | 'unknown_step_node_encoding'
  | 'invalid_typed_endpoint'
  | 'type_must_be_text'
  | 'dependencyId_must_be_text'
  | 'cannot_send_both_teamIds_and_serviceTeamId'
  | 'unknown_kind'
  | 'unknown_strategy'
  | 'commands_must_be_a_list'
  | 'size_required'
  | 'bands_required'
  | 'bands_must_be_an_array'
  | 'bands_must_number_5'
  | 'bands_must_be_objects'
  | 'band_start_must_be_a_whole_number_from_1'
  | 'band_default_must_be_a_whole_number_from_1'
  | 'band_label_must_be_1_to_40_characters'
  | 'band_labels_must_differ'
  | 'first_band_must_start_at_1'
  | 'bands_must_start_in_increasing_order'
  | 'band_default_must_be_inside_its_own_band'
  | `${'parentId' | 'afterId' | 'personId' | 'serviceTeamId' | 'accountId' | 'providerId'}_must_be_id_or_null`
  | `${'name' | 'notes' | 'kind' | 'personKind' | 'startNoEarlierThanReason' | 'stepId' | 'metric' | 'reference' | 'note' | 'unitLabel'}_must_be_text`
  | `${'workItemId' | 'workItemRef' | 'ref' | 'parentRef' | 'afterRef' | 'personRef' | 'predecessorId' | 'predecessorRef' | 'teamId' | 'teamRef' | 'personId' | 'tagId' | 'tagRef' | 'typeId' | 'typeRef' | 'serviceId' | 'serviceRef' | 'executorPersonId' | 'resourceId' | 'resourceRef' | 'measureId' | 'measureRef'}_must_be_an_id`
  | `${'teamIds' | 'teamRefs' | 'tagIds' | 'tagRefs' | 'serviceIds' | 'serviceRefs' | 'typeIds' | 'typeRefs'}_must_be_a_list_of_ids`
  | `${'teamIds' | 'teamRefs' | 'serviceIds' | 'serviceRefs' | 'typeIds' | 'typeRefs'}_must_be_at_most_10`
  | `${'tagIds' | 'tagRefs'}_must_be_at_most_50`
  /**
   * More than one distinct type in one patch's `typeIds` or `typeRefs`
   * (WBS 010.4.10). The `typeIds_must_be_at_most_10` arms above are retired by it
   * and stay for an outgoing be-01 answering mid-swap.
   */
  | 'work_item_takes_one_type'
  | 'startNoEarlierThan_must_be_a_date'
  | 'deadline_must_be_a_date'
  | 'on_must_be_a_date'
  | `${'factStart' | 'factEnd'}_must_be_a_date`
  | `${'priority' | 'maxParallel' | 'size' | 'attemptNumber' | 'units'}_must_be_a_whole_number_from_1`
  | `${'maxParallel' | 'size'}_must_be_at_most_1000`
  | 'cascade_must_be_true_or_false'
  | 'startNoEarlierThanReason_must_be_at_most_200_characters'
  | 'allowancePercent_must_be_0_to_1000_with_two_decimals'
  /** A `claimWorkItem` run that is not text of 1 to 256 characters (`wbs-team-claims`). */
  | 'runId_must_be_1_to_256_characters'
  | 'parentClaim_must_be_an_id'
  | 'steps_must_be_a_list_of_ids'
  | 'steps_must_be_at_most_50'
  /** A `claimWorkItem` or `releaseWorkItem` whose `steps` is an empty list. */
  | 'steps_must_name_a_step'
  /** A `claimWorkItem` whose `resources` is not a list of `{ resourceId, units }` (`wbs-resources` R4). */
  | 'resources_must_be_a_list'
  | 'resources_must_name_a_resource'
  | 'resources_must_be_at_most_50'
  | 'resources_must_name_each_resource_once'
  // Resources (`wbs-resources`): a `patchResource` naming the kind, a capacity or
  // demand without its units, a capacity below 0, a figure above the product
  // bound, and a unit label too long to sit beside a number.
  | 'kind_is_immutable'
  | 'resourceKind_must_be_exclusive_or_divisible'
  | 'units_required'
  | 'units_must_be_a_whole_number_from_0'
  | 'units_must_be_at_most_1000000000'
  | 'unitLabel_must_be_at_most_40_characters'
  // Measure definitions (`wbs-measure-budgets` D1): a key that is not a
  // lowercase slug, a unit that is not short text, a kind or scale outside its
  // vocabulary, a flag that is not a boolean, an order outside its bound, and a
  // currency not shaped like an ISO 4217 code.
  | 'key_must_be_a_measure_key'
  | 'unit_must_be_text'
  | 'unit_must_be_at_most_40_characters'
  | 'measureKind_must_be_duration_count_or_money'
  | 'scale_must_be_integer_or_real'
  | `${'threePoint' | 'showByDefault' | 'schedulesWork'}_must_be_true_or_false`
  | 'order_must_be_a_whole_number_from_0_to_1000000'
  | 'currency_must_be_three_capital_letters';

/** Service/runner refusals after a command kind has been recognized. */
export type CommandRefusalCode =
  // Proof: omission failed the closed command compiler fixture (mutation-closed-command-registry.txt).
  | 'referenced_by_step_parallel'
  | 'too_many_commands'
  | 'project_required'
  | 'unknown_ref'
  | 'missing_id'
  | 'duplicate_ref'
  | 'name_required'
  | 'not_found'
  | 'forbidden'
  | 'strategy_required'
  | 'cycle'
  | 'calendar_range'
  /**
   * **Retired at ADR 0023 and deliberately still here.** No release since
   * produces it: a frozen work item moves like any other, so `move` has no
   * frozen refusal left to answer with.
   *
   * It stays in the union because blue and green serve one deployment in turn
   * — a browser holding the new fe-01 can be answered by the outgoing be-01
   * for the length of a swap — and an arm missing from this union is a 409 the
   * client cannot parse at all, which reads to the user as a broken drag
   * rather than as a refusal with a reason.
   */
  | 'frozen'
  /**
   * `arrangeBySchedule` on a project whose selected engine is `optimized` and
   * whose displayed variant has not finished solving.
   *
   * A conflict rather than a fault: the same request is accepted the moment
   * the solve lands, and arranging by Fast instead would put the rows in an
   * order the reader did not pick (ADR 0022's reasoning about unmarked dates).
   */
  | 'arrangement_positions_unavailable'
  | 'dependency_calendar_missing'
  | 'schedule_not_ready'
  | 'minutes_not_integer'
  | 'minutes_above_max'
  | 'rolled_up'
  /** `setMeasure` or `clearMeasure` on a derived measure (`agent_minutes`). */
  | 'derived_measure'
  /** `setMeasure` or `clearMeasure` in the scheduling measure; its fact is `setActual`'s days. */
  | 'scheduling_measure_fact'
  /** A fraction in a measure whose scale is `integer`. */
  | 'scale_mismatch'
  /** `setMeasureEstimate` or `clearMeasureEstimate` in the scheduling measure; its trio is `setEstimate`'s. */
  | 'scheduling_measure_estimate'
  /** `setMeasureEstimate` on a definition whose `threePoint` is false (`hours`, `agent_minutes`). */
  | 'three_point_forbidden'
  /** `setBudget` or `clearBudget` in the scheduling measure (`wbs-measure-budgets` D35). */
  | 'scheduling_measure_budget'
  /** A money fact or trio written without a rate card digest. */
  | 'rate_card_required'
  /** A rate card digest on a measure that is not money. */
  | 'rate_card_forbidden'
  /** A sum that would add money figures priced under two bases; `bases` names both. */
  | 'mixed_rate_cards'
  | 'has_children'
  | 'ancestor'
  /** A typed dependency resolving a step node onto itself. */
  | 'self_node'
  | 'not_a_parent'
  | 'node_on_parent'
  | 'descendant_step_on_leaf'
  | 'referenced_by_external_dependency'
  | 'unknown_dependency'
  | 'external_dependencies_inactive'
  | 'project_deleting'
  | 'duplicate_dependency'
  | 'unsupported_relationship_type'
  | 'too_large'
  | 'unknown_step'
  /** Retired by `wbs-measure-budgets` slice 2; an outgoing be-01 still answers it mid-swap. */
  | 'unknown_metric'
  /** A metric naming no measure definition of the project's organization. */
  | 'unknown_measure'
  | 'unknown_person'
  /** `patchPerson.accountId` naming no account that is a member of the person's organization. */
  | 'unknown_account'
  | 'unknown_team'
  | 'unknown_tag'
  | 'unknown_service'
  | 'unknown_type'
  | 'unknown_system'
  /** A resource the directory does not hold, or one another organization owns (`wbs-resources`). */
  | 'unknown_resource'
  /** `patchResource.providerId` naming no provider instance (`compute-providers` P3). */
  | 'unknown_provider'
  /**
   * `patchResource.providerId` naming another organization's provider
   * instance: the caller already holds the id, so confirming it exists leaks
   * nothing (`compute-providers` P3).
   */
  | 'provider_not_in_organization'
  /** `setDemand` of other than 1 unit on an `exclusive` resource. */
  | 'exclusive_demand_is_one'
  /** A patch whose bound `typeIds` and `typeRefs` name more than one type. */
  | 'work_item_takes_one_type'
  | 'not_before_reason_needs_a_date'
  | 'deadline_before_project_start'
  /** `setStatus` `ready` or `draft` once a step has spoken (`add-work-item-statuses`). */
  | 'readiness_after_progress'
  /** `setStatus` `on_hold` or `blocked` on a row reading done. */
  | 'cannot_hold_done'
  /** `setStatus` `in_progress` or `done` in a project with no steps. */
  | 'no_steps'
  /** `startAttempt` on a node whose statement is `done` (`step-node-attempts` D2). */
  | 'node_done'
  /** `startAttempt` on a node with a running attempt. */
  | 'attempt_running'
  /** An attempt's `at` after the write stamp. */
  | 'attempt_in_future'
  /** `endAttempt` on a node with no running attempt. */
  | 'no_running_attempt'
  /** `endAttempt` whose `at` precedes the running attempt's start. */
  | 'attempt_ends_before_start'
  /** `removeAttempt` naming a number the node does not hold. */
  | 'unknown_attempt'
  | 'invalid_kind'
  | 'nothing_to_change'
  | 'taken'
  | 'in_use'
  // `claimWorkItem` and `releaseWorkItem` (`wbs-team-claims`), in the spec's order.
  /**
   * Naming no person from a request that acts as its account, which has no
   * agent person to stand for (`wbs-claim-own-person`).
   */
  | 'person_required'
  | 'person_not_bound'
  | 'credential_not_for_person'
  /**
   * A machine grant with an opted-in run (`wbs-mcp-agent-surface` M15) claims
   * for its own person under another `runId`, or releases its person's claims
   * held only under other runs.
   */
  | 'run_mismatch'
  | 'parent_claim_unknown'
  | 'parent_claim_foreign'
  | 'parent_claim_not_ancestor'
  | 'steps_on_subtree'
  | 'item_done'
  | 'not_startable'
  | 'prerequisites_unmet'
  | 'step_done'
  | 'already_claimed'
  // `claimWorkItem` occupancy (`wbs-resources` R3, R4), between already_claimed
  // and inside_subtree_claim in the claim's order.
  | 'resources_on_subtree'
  | 'below_declared_demand'
  | 'below_held_occupancy'
  | 'resources_exhausted'
  | 'inside_subtree_claim'
  | 'overlaps_subtree_claim'
  | 'not_claimed_by'
  /** `moveWorkItem` under a leaf whose steps are claimed; names the holders. */
  | 'destination_claimed'
  /**
   * `deleteWorkItem` promoting the parent while claims sit on more than one
   * deleted row, or on that parent as well; names the holders.
   */
  | 'children_claimed'
  /**
   * `patchPerson` making an agent, or an add of an agent, past the
   * organization's cap (`wbs-organization-limits` L9); names the numbers.
   */
  | 'agent_person_limit'
  /**
   * `claimWorkItem` adding one more bound claim than the organization's cap
   * allows (`wbs-organization-limits` L9), checked after every other claim
   * refusal; names the cap and the bound claims held.
   */
  | 'claim_limit'
  /**
   * `setResourceCapacity` raising a project's units of a resource past the
   * organization's cap on the sum over its projects (`wbs-organization-limits`
   * L2, L9); names the resource, cap, the other projects' units and the asked.
   */
  | 'capacity_limit'
  /**
   * `startAttempt` past a strict budget of the work item or an ancestor
   * (`wbs-measure-budgets` D69): nothing remains, this attempt's hold would
   * take it below zero, or a rate-card mix blocks it (`blocked`, `remaining`
   * null). Names the budget's work item, measure, remainder and hold.
   */
  | 'budget_exhausted'
  /**
   * A measure definition write under legacy access while no organization is
   * marked legacy: definitions belong to an organization (`wbs-measure-budgets`).
   */
  | 'organization_required'
  // Measure definitions (`wbs-measure-budgets` D1, D2), each a 409 naming what
  // the organization's own definitions refuse.
  | 'measure_key_taken'
  | 'measure_key_immutable'
  | 'measure_shape_immutable'
  | 'second_scheduling_measure'
  | 'scheduling_measure_fixed'
  | 'currency_required'
  | 'currency_forbidden'
  | 'unit_required'
  | 'measure_in_use';

/** What a refused capacity statement names: the resource, the cap, the others' units and the asked. */
export interface CapacityLimitRefusalDetail {
  resourceId: string;
  cap: number;
  declared: number;
  asked: number;
}

/**
 * What `budget_exhausted` names (`wbs-measure-budgets` D69): the work item
 * stating the strict budget, its measure key, what remained before the
 * refused start (null when `blocked`) and what the start would have held.
 */
export interface BudgetExhaustedRefusalDetail {
  workItemId: string;
  measure: string;
  remaining: number | null;
  hold: number;
  blocked: boolean;
}

/** What a refused claim names: the organization's cap on bound claims and how many it holds. */
export interface ClaimLimitRefusalDetail {
  cap: number;
  current: number;
}

/** What an organization limit refusal names: the cap, what was held and what the write would add. */
export interface LimitRefusalDetail {
  cap: number;
  current: number;
  added: number;
}

/** One claim a claim refusal names: the claim, its person by id and name, and its run. */
export interface ClaimRefusalHolder {
  claimId: string;
  personId: string;
  name: string;
  runId: string | null;
}

/** One holder `resources_exhausted` names: a claimant and run on one leaf. */
export interface OccupancyRefusalHolder {
  personId: string;
  name: string;
  runId: string | null;
  workItemId: string;
}

/**
 * One resource `resources_exhausted` names: the units asked, the units free
 * and who holds the rest. The refusal's own fields are its first short
 * resource; `resources` lists every one in resource-id order.
 */
export interface ResourceShortageDetail {
  resourceId: string;
  asked: number;
  free: number;
  holders: OccupancyRefusalHolder[];
}

/**
 * Proof (type boundary only): making kind optional produces TS2578 for both the
 * runtime and global incomplete-command fixtures. Production binding is pending.
 */
export interface CommandContext {
  at: number;
  kind: PlanCommandKind;
}

/** A parser can fail before an index or recognized kind exists; runtime commands cannot. */
type ParserContext = undefined | { at: number; kind?: never } | CommandContext;

export type DirectoryEffect =
  | { kind: 'assignment_dropped'; step: { id: string; name: string } }
  | { kind: 'claim_released'; step: { id: string; name: string } | null }
  | { kind: 'label_nulled' }
  | { kind: 'label_removed' }
  | { kind: 'capacity_released'; size: number; fromId: string }
  /** The row's demand on the resource being removed goes with it (`wbs-resources`). */
  | { kind: 'demand_removed'; units: number }
  | { kind: 'assumed_assignee_changed'; assumedNow: string | null; assumedAfter: string | null };

/** What a resource removal would take, counted (`wbs-resources` R8). */
export interface ResourceUsageCounts {
  demands: number;
  capacities: number;
  occupancies: number;
  outstandingUses?: number;
  /**
   * The provider instance the resource names, whose reference and report a
   * confirmed removal takes with it (`compute-providers` P3), or null.
   * Optional on the wire: an outgoing be-01 mid-swap names none.
   */
  providerId?: string | null;
}

/** Both affected-project and directory-member lists are present, including when empty. */
export interface DirectoryUsage {
  projects: {
    id: string;
    name: string;
    workItems: { id: string; number: string; name: string; effects: DirectoryEffect[] }[];
  }[];
  members: { id: string; name: string }[];
  /**
   * Linked credentials pinned to the person, revoked by a confirmed removal.
   * Optional on the wire: an outgoing be-01 mid-swap counts no pins.
   */
  pinnedCredentials?: number;
  /**
   * Unrevoked machine credentials of the person, revoked by a confirmed
   * removal and refusing an unbind or rebind. Optional on the wire: an
   * outgoing be-01 mid-swap counts none.
   */
  machineCredentials?: number;
}

/**
 * Mirrors libs/wbs/application/core/src/module/step/step.resource.ts::StepInUse, including explicit
 * assignments omitted by the initial HTTP inventory. Proof (type boundary only):
 * making assignments optional produces TS2578 for its missing-field fixture.
 */
export interface StepInUse {
  /** Absent only when an older server cannot report direct blockage facts. */
  blockages?: number;
  estimates: number;
  actuals: number;
  progress: number;
  measures: number;
  /** Optional on the wire: an outgoing be-01 mid-swap counts no attempts. */
  attempts?: number;
  /** Optional on the wire: an outgoing be-01 mid-swap counts no claims. */
  claims?: number;
  assignments: number;
  assumedAssignees: {
    workItemId: string;
    assumedNow: string | null;
    assumedAfter: string | null;
  }[];
}

export interface Quota {
  limit: 'body_bytes' | 'plan_count' | 'project_bytes';
  asked: number;
  allowed: number;
}

/**
 * Saved-body integrity failures preserve hash and reader-version evidence.
 * Proof (type boundary only): admitting input in schedule_input_mismatch makes
 * its incorrect-body fixture fail with TS2578. Production binding is pending.
 */
export type Integrity = { savedPlanId: string } & (
  | { reason: 'body_missing'; body: 'input' | 'schedule' }
  | { reason: 'body_invalid'; body: 'input' | 'schedule'; path: string; code: string }
  | { reason: 'body_hash_mismatch'; body: 'input' | 'schedule'; stored: string; recomputed: string }
  | {
      reason: 'schedule_input_mismatch';
      body: 'schedule';
      scheduleInputSha256: string;
      inputSha256: string;
    }
  | {
      reason: 'input_version_unreadable';
      body: 'input';
      storedVersion: number;
      readerVersion: number;
      versionReason: 'from-the-future' | 'no-upgrade-path' | 'not-a-version';
    }
);

/** Command-specific fields are finite; at/kind are required independently of the refusal code. */
export type CommandRefusalDetail = {
  [C in CommandRefusalCode]: CommandContext &
    // Proof: making projectDayZero optional caused TS2578 in the deadline refusal type fixture.
    (C extends 'deadline_before_project_start'
      ? { workItemId: string; projectDayZero: string }
      : // Proof: optional nodes made the missing-detail compiler negative unused (mutation-optional-command-nodes.txt).
        C extends 'referenced_by_step_parallel'
        ? { nodes: { workItemId: string; stepId: string }[] }
        : C extends
              'node_on_parent' | 'descendant_step_on_leaf' | 'referenced_by_external_dependency'
          ? { dependencyIds: string[] }
          : C extends 'in_use'
            ? { usage: DirectoryUsage; counts?: ResourceUsageCounts }
            : C extends 'taken'
              ? { name?: string }
              : C extends 'not_startable'
                ? { status: string }
                : C extends 'prerequisites_unmet'
                  ? {
                      stepIds: string[];
                      blockers: {
                        workItemId: string;
                        stepId: string | null;
                        type: 'FS' | 'SS' | 'FF';
                        provenance: 'workflow' | 'legacy' | 'authored';
                        relationshipId: string | null;
                      }[];
                    }
                  : C extends 'step_done'
                    ? { stepIds: string[] }
                    : C extends 'already_claimed' | 'destination_claimed' | 'children_claimed'
                      ? { holders: ClaimRefusalHolder[] }
                      : C extends 'inside_subtree_claim' | 'overlaps_subtree_claim'
                        ? { holder: ClaimRefusalHolder }
                        : C extends 'below_declared_demand'
                          ? { resourceId: string; asked: number; declared: number }
                          : C extends 'below_held_occupancy'
                            ? { resourceId: string; asked: number; held: number }
                            : C extends 'resources_exhausted'
                              ? ResourceShortageDetail & { resources: ResourceShortageDetail[] }
                              : C extends 'agent_person_limit'
                                ? LimitRefusalDetail
                                : C extends 'claim_limit'
                                  ? ClaimLimitRefusalDetail
                                  : C extends 'capacity_limit'
                                    ? CapacityLimitRefusalDetail
                                    : C extends 'budget_exhausted'
                                      ? BudgetExhaustedRefusalDetail
                                      : // Proof (type boundary only): omitting this arm produced TS2353 for bases
                                        // and TS2578 for missing-bases negatives in assertMixedRateCardRefusalTypes.
                                        C extends 'mixed_rate_cards'
                                        ? { bases: typeof mixedBases.infer }
                                        : Record<never, never>);
};

type BareRefusalCode =
  | 'conflict'
  | 'resource_tracking_unavailable'
  // Proof: omission failed the closed-registry compiler case with TS2345 (mutation-registry.txt, 2026-10-17).
  | 'unsupported_step_parallelism'
  | 'step_blockage_inactive'
  | 'unauthenticated'
  | 'insufficient_scope'
  /** A browser operation names a different organization than its current authority. */
  | 'organization_context_changed'
  /** Authenticated, but the session is bound to no organization (after activation). */
  | 'no_active_organization'
  | 'onboarding_inactive'
  | 'context_inactive'
  | 'invalid_binding'
  /** mcp-01 asked for a delegation the deployment cannot issue: no key pair (after activation). */
  | 'delegation_inactive'
  /** An MCP session's upstream token now resolves to another account than it was bound to. */
  | 'binding_changed'
  /**
   * An MCP consent family's credential is revoked, names another family, or its
   * person is no longer bound to the account (`wbs-machine-credentials` A20).
   */
  | 'credential_revoked'
  /**
   * `POST /api/claims/renew` from a caller whose credential is pinned to no
   * person (a session, an upstream pair): it holds no lease (`wbs-claim-leases` L13).
   */
  | 'not_pinned'
  | 'email_verification_required'
  | 'password_account_required'
  | 'address_conflict'
  | 'challenge_invalid'
  | 'invitation_invalid'
  | 'recipient_mismatch'
  | 'delivery_failed'
  | 'already_member'
  | 'domain_matched'
  | 'invalid_domain'
  | 'unclaimable'
  | 'stale'
  | 'proof_mismatch'
  | 'domain_taken'
  | 'dns_unavailable'
  | 'join_request_pending'
  | 'request_resolved'
  | 'domain_changed'
  /** Authenticated, but the bound organization no longer lists the user. */
  | 'not_a_member'
  | 'invalid_origin'
  | 'unauthorized'
  /**
   * mcp-01's dedicated service secret was missing or wrong, on `/internal/mcp/*`
   * or beside a machine grant (`wbs-mcp-agent-surface` M3, M14): a deployment
   * fault mcp-01 reports, never a user's refusal.
   */
  | 'internal_unauthorized'
  /** A machine grant whose `kid` names no configured grant key (M3): mcp-01 re-fetches. */
  | 'unknown_grant_key'
  /** A workload assertion whose `typ` is neither absent nor `JWT` (M2). */
  | 'unsupported_assertion_type'
  /** Machine grants are issued only after organization activation (M5). */
  | 'not_activated'
  /**
   * A verified machine token (no groups claim) whose `(issuer, subject)` no
   * account is linked to (`wbs-team-claims` D6b): refused before any account
   * is minted. Also a `wbs_mk_` API key that is malformed or that no live
   * machine credential admits (`wbs-machine-credentials` A13, A22).
   */
  | 'unknown_identity'
  | 'invalid_body'
  | 'invalid_allowance'
  | 'invalid_estimate_unit'
  | 'invalid_query'
  | 'unsupported_format'
  | 'bad_start_date'
  | 'bad_pert_weights'
  /** A project budget factor that is not finite, above 0 and at most 1000. */
  | 'bad_budget_factor'
  | 'optimizer_unavailable'
  /** Another of the organization's projects holds the requested solution slug. */
  | 'solution_taken'
  | 'abbreviation_taken'
  | 'abbreviation_exhausted'
  | 'invalid_abbreviation'
  | 'engine_unavailable'
  | 'snapshot_busy'
  | 'invalid_client'
  | 'rate_limited'
  | 'invalid_credentials'
  | 'invalid_token'
  | 'invalid'
  | 'method_not_allowed'
  | 'duplicate_parameter'
  | 'invalid_json'
  | 'invalid_params'
  | 'unsupported_version'
  | 'invalid_oidc_callback'
  | 'invalid_oidc_session'
  | 'refresh_in_progress'
  | 'oidc_identity_conflict'
  // A step's chosen code (ADR 0031): breaks the grammar, lies in the ordinal
  // alias's namespace, or is already held in the project.
  | 'invalid_code'
  | 'reserved_code'
  | 'code_taken'
  // Why a step reference does not resolve to a step node now.
  | 'malformed_reference'
  | 'stale_reference'
  | 'unknown_work_item'
  | 'parent_work_item'
  | 'unknown_code'
  | 'alias_mismatch'
  // A membership change that would leave the organization without a
  // super-admin (task 3.7).
  | 'last_super_admin'
  // A project reach change or a step removal that would close a step-node
  // dependency cycle. Outside a batch, so it carries no command position.
  | 'dependency_cycle'
  // Spaces (`add-spaces`): a space name the organization already holds; a
  // project already in the space; a write addressed to the virtual All
  // projects. `organization_required` is a shared command code below.
  | 'name_taken'
  | 'already_in_space'
  | 'virtual_space'
  // Work-item pages (`list-search-and-paging`): a cursor whose work item has
  // left the project; a `parentId` naming no work item of the project.
  | 'stale_cursor'
  | 'unknown_parent'
  // Capacity mode (`share-people-across-projects` 8.1): a mode this release
  // does not list in `SUPPORTED_CAPACITY_MODES`.
  | 'capacity_mode_unsupported'
  | 'restore_approval_conflict'
  // A project PATCH naming a zone the server runtime does not support
  // (`step-node-attempts` D3).
  | 'invalid_timezone'
  // Enterprise SSO (`organization-sso`): connection administration refusals,
  // a domain release a connection still names, and an unknown login slug.
  | 'domain_not_verified'
  | 'sso_connection_exists'
  | 'login_slug_taken'
  | 'provisioning_active'
  | 'sso_connection_unproven'
  | 'enforcement_would_lock_out_actor'
  | 'sso_connection_not_found'
  // Provisioning tokens (`organization-scim`): two tokens already live
  // (`sso_connection_unproven` above also refuses a token).
  | 'token_limit'
  | 'runtime_scope_unavailable'
  | 'runtime_generation_conflict'
  | 'runtime_authority_stale'
  | 'runtime_revision_conflict'
  | 'runtime_claim_mismatch'
  | 'runtime_claim_unmanaged'
  | 'runtime_attempt_bound'
  | 'runtime_command_conflict'
  | 'runtime_ledger_mismatch'
  | 'runtime_receipt_not_found'
  | 'runtime_command_target_mismatch'
  | 'runtime_command_not_supported'
  // Machine credentials (`wbs-machine-credentials`): an agent person bound to
  // an account that is no member; a second rotation inside the window; a
  // rotation of a credential whose secret its issuer rotates.
  | 'account_not_member'
  | 'rotation_in_progress'
  | 'rotation_at_issuer'
  // OIDC credentials and trusted issuers (`wbs-machine-credentials` A16):
  // registration's discovery and gate refusals, a credential naming another
  // organization's issuer, and a pair another credential holds.
  | 'issuer_unreachable'
  | 'issuer_mismatch'
  | 'issuer_reserved'
  | 'issuer_not_oidc'
  | 'issuer_taken'
  | 'unknown_sso_connection'
  | 'unknown_trusted_issuer'
  | 'subject_taken'
  // A25: another organization registered the issuer with this audience; an
  // organization at its trusted issuer cap.
  | 'audience_taken'
  | 'trusted_issuer_limit'
  // `wbs-mcp-agent-surface` M2: an audience that is not WBS's authorization
  // server or under it after a `/`.
  | 'audience_not_wbs'
  // Agent pools (`wbs-mcp-agent-surface` M7): a pool person removed while a
  // re-key minted its keys; a re-key of a pool past its expiry with no new
  // one. `persons_not_removed` carries detail, below.
  | 'pool_changed'
  | 'pool_expired'
  // Delivery observation (`track-work-delivery`): every provider read slot
  // stayed taken for the bounded wait.
  | 'delivery_busy';

type SharedCommandCode =
  | 'external_dependencies_inactive'
  | 'person_not_bound'
  | 'credential_not_for_person'
  | 'not_found'
  | 'forbidden'
  | 'name_required'
  | 'taken'
  | 'in_use'
  | 'calendar_range'
  | 'referenced_by_step_parallel'
  | 'already_claimed'
  | 'unknown_team'
  | 'unknown_person'
  | 'agent_person_limit'
  | 'capacity_limit'
  | 'organization_required'
  | 'unknown_provider';

/**
 * Details by finite code. Undefined means no detail, never an open object bag.
 * Per-endpoint response schemas narrow the applicable route variant and status.
 * The new OIDC/health/parser codes describe approved wire translations still
 * awaiting production endpoint binding; they do not classify thrown exceptions.
 * Approved translations preserve statuses: bodiless callback 400 becomes
 * invalid_oidc_callback; callback/refresh 401 becomes invalid_oidc_session;
 * unresolved OIDC account 409 becomes oidc_identity_conflict. Health 503 becomes
 * dependency_unavailable and retains status/commit/bootCommit. Malformed JSON 400 becomes
 * invalid_json; freeform smoke/internal validation 400 becomes invalid_body
 * (existing invalid_body 422 arms stay 422). Cookies, logs and timing stay local
 * to their endpoint; RefusalStatus does not infer a status from a code.
 */
export type RefusalDetail = Record<BareRefusalCode, undefined> &
  Record<ParserRefusalCode, ParserContext> & {
    [C in Exclude<CommandRefusalCode, SharedCommandCode>]: CommandRefusalDetail[C];
  } & {
    not_found: { savedPlanId?: string } | { field?: 'markerId' } | CommandContext;
    forbidden: undefined | CommandContext;
    name_required: undefined | CommandContext;
    /** Bare from a step PATCH's allowance; with its command context from a batch. */
    calendar_range: undefined | CommandContext;
    taken: undefined | { field?: 'markerId' } | CommandRefusalDetail['taken'];
    /** Bare from a domain claim; with its holders from a `claimWorkItem` batch. */
    already_claimed: undefined | CommandRefusalDetail['already_claimed'];
    /** Bare from the startable read's `team` filter; with its command context from a batch. */
    unknown_team: undefined | CommandRefusalDetail['unknown_team'];
    /** Bare from the by-person read; with its command context from a batch. */
    unknown_person: undefined | CommandRefusalDetail['unknown_person'];
    /** Without a command position from the plan import; with one from a batch. */
    agent_person_limit: LimitRefusalDetail | CommandRefusalDetail['agent_person_limit'];
    /** Without a command position from the plan import; with one from a batch. */
    capacity_limit: CapacityLimitRefusalDetail | CommandRefusalDetail['capacity_limit'];
    /**
     * Legacy access with no legacy organization: bare from a space, rank or
     * capacity-mode route; with its command context from a measure batch.
     */
    organization_required: undefined | CommandContext;
    /** Naming the person from a machine credential create; with its command context from a batch. */
    person_not_bound: undefined | { personId: string } | CommandRefusalDetail['person_not_bound'];
    credential_not_for_person: undefined | CommandRefusalDetail['credential_not_for_person'];
    /**
     * Also a trusted issuer that unrevoked machine credentials name
     * (`wbs-machine-credentials` A16), and a provider instance resources name
     * (`compute-providers` P2).
     */
    in_use:
      | { inUse: StepInUse }
      | { machineCredentials: number }
      | { resources: { id: string; name: string }[] }
      | CommandRefusalDetail['in_use'];
    /** Bare from the compute provider routes; with its command context from a `patchResource` batch. */
    unknown_provider: undefined | CommandRefusalDetail['unknown_provider'];
    /**
     * A capacity report from a principal that is no machine credential of an
     * agent person (`compute-providers` P6): which carrier it was, or the
     * pinned person's kind.
     */
    not_an_agent_principal: { authentication: 'session' | 'delegation' } | { personKind: 'person' };
    /** The organization spent its delivery provider reads; whole seconds until the next one. */
    delivery_rate_limited: { retryAfterSeconds: number };
    /** A capacity report observed further ahead of WBS's clock than the tolerance, by this much. */
    observedAt_in_future: { skewMs: number };
    /** A capacity report for a resource that names another instance, or none. */
    provider_mismatch: { providerId: string | null };
    /** A capacity report not newer than the stored one, naming the stored instant. */
    report_superseded: { storedObservedAt: number };
    /**
     * A revoked agent pool whose persons' removal the directory batch refused
     * (`wbs-mcp-agent-surface` M7): the pool, and how many keys the revocation
     * ended before the refusal.
     */
    persons_not_removed: { poolId: string; revokedCredentials: number };
    /** The typed dependencies naming a step that a removal would take away. */
    referenced_by_dependency: { dependencyIds: string[] };
    // Proof: omitted registry entry made removeStep fail TS2345 in the smallest step-module typecheck, 2026-10-17.
    referenced_by_step_parallel:
      | { nodes: { workItemId: string; stepId: string }[] }
      | CommandRefusalDetail['referenced_by_step_parallel'];
    estimates_present: { count: number };
    external_dependencies_inactive:
      { detail: string | null } | CommandRefusalDetail['external_dependencies_inactive'];
    nothing_to_undo: { detail: string | null };
    stale_undo: { detail: string | null };
    stale_address_revision: { addressRevision: string };
    /**
     * A plan export of a project holding steps an older writer left uncoded:
     * each such step, and the be-01 backfill command that codes them.
     */
    uncoded_steps: { steps: { id: string; name: string }[]; command: string };
    unresolvable_reference: {
      reason:
        | 'malformed'
        | 'unknown_work_item'
        | 'ambiguous_work_item'
        | 'parent'
        | 'unknown_code'
        | 'alias_mismatch';
    };
    malformed: { field: 'body' | 'markerId' | 'date' | 'name' | 'color' };
    contrast: { field: 'color' };
    quota: { refusal: Quota };
    corrupt: { refusal: Integrity; savedPlanId?: string };
    unsupported_body_version: {
      savedPlanId: string;
      body: 'input' | 'schedule';
      version: number;
      supported: readonly number[];
    };
    client_dependency_incompatible: { required: 'cross-project-dependencies-v1' };
    dependency_unavailable: {
      status: 'migrating' | 'database_unreachable' | 'schema_missing';
      commit: string | null;
      bootCommit: string | null;
    };
    /** Enforced SSO refused this credential in this organization only (`organization-sso`). */
    sso_required: { organizationId: string; login: string; link: true };
    /** A session policy bound is exceeded or unknown (`organization-session-policy`). */
    reauthentication_required: {
      organizationId: string;
      reason: 'max_session' | 'reauthenticate_after';
      login: string;
    };
  };

export type RefusalCode = keyof RefusalDetail;

/** Archival imports retain the first document path and optional offending reference. */
export interface ImportRefusal {
  error:
    | 'invalid_body'
    | 'invalid_typed_dependency'
    | 'unsupported_version'
    | 'unknown_ref'
    | 'cycle'
    | 'ancestor'
    | 'deadline_before_project_start'
    | 'engine_unavailable'
    | 'source_refused'
    | 'abbreviation_taken'
    | 'abbreviation_exhausted'
    /** A row with several types; `detail` lists every such row's file id. */
    | 'work_item_takes_one_type';
  path: string;
  detail: string | null;
}

type UnionKeys<T> = T extends T ? keyof T : never;
/** Prevents mixing route-specific fields merely because their error codes coincide. */
type ClosedVariants<T, Whole = T> = T extends T
  ? T & Partial<Record<Exclude<UnionKeys<Whole>, keyof T>, never>>
  : never;
type Envelope<C, D> = D extends undefined ? { error: C } : { error: C } & D;

/**
 * One discriminated envelope, without batch metadata on non-command routes.
 * Proof (type boundary only): replacing this with an open unknown-valued record
 * produces eleven TS2578 diagnostics for invalid detail/context fixtures.
 * Endpoint response validation and wire status correlation remain pending.
 */
type ErrorRefusal<C extends RefusalCode = RefusalCode> = {
  [K in C]: ClosedVariants<Envelope<K, RefusalDetail[K]>>;
}[C];

/** Retry retains the coordinator decision as `code`; clients branch on this established envelope. */
export type OptimizerRetryRefusal =
  | { code: 'stale-input-hash'; currentInputHash: string }
  | {
      code: 'not-retryable';
      state:
        | 'ready'
        | 'pending'
        | 'retrying'
        | 'failed'
        | 'corrupt'
        | 'plan-infeasible'
        | 'boundary-infeasible'
        | 'idle';
    }
  | { code: 'already-running' }
  | {
      code: 'schedule-input-unavailable';
      reason: 'engine_unavailable' | 'cycle' | 'calendar_range';
      projectId: string;
    }
  | {
      code: 'schedule-input-unavailable';
      reason: 'dependency_calendar_missing';
      projectId: string;
      projects: readonly {
        readonly projectId: string;
        readonly abbreviation: string;
        readonly name: string;
      }[];
    };

export type Refusal<C extends RefusalCode = RefusalCode> = ErrorRefusal<C> | OptimizerRetryRefusal;

/** Runtime command failures always retain their command index and recognized kind. */
export type CommandRefusal<C extends CommandRefusalCode = CommandRefusalCode> = {
  [K in C]: { error: K } & CommandRefusalDetail[K];
}[C];
